import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { getDocumentUploadUrls, confirmDocuments } from '../api/api';
import { documentLabelOf, type DriverDocumentType } from '../constants/documents';
import type { PreparedDocument } from './documentFile';

// The bottom half of the upload flow: signed URL -> direct upload -> confirm.
//
// The file never passes through the RCS backend. The app asks the backend where
// to put each document, PUTs the bytes at Supabase Storage itself, and then
// tells the backend they landed — which is the only step that creates the
// DriverDocument row. The server does not take that last message on trust: it
// re-reads each stored object's first bytes before writing anything, and scans
// the whole file afterwards.
//
// EVERY DOCUMENT SUCCEEDS OR FAILS ON ITS OWN. A captain uploading six papers
// over 4G at a taxi stand will routinely have one of them time out, and failing
// the other five with it means he does the whole screen again. Signed URLs come
// back in one request (six round trips would be six seconds of nothing
// happening), the uploads run in parallel because they are independent, and the
// confirm at the end registers exactly the ones that made it.

/** One document, ready to send: what the picker produced plus what it is for. */
export type PendingUpload = PreparedDocument & {
  type: DriverDocumentType;
  /** Required for every type that can lapse. 'YYYY-MM-DD', as printed. */
  expiresAt?: string;
  /** As printed on the document. Absent on the two car photos. */
  number?: string;
};

/** Per-document outcome, in the order they were handed in. */
export type UploadReport = {
  type: DriverDocumentType;
  ok: boolean;
  /** Set when ok is false, and written to be shown to the captain. */
  error?: string;
};

export type UploadOutcome = {
  /** True only if every document in the batch was registered. */
  ok: boolean;
  results: UploadReport[];
  /** The types that failed, so the screen can offer Retry against those rows. */
  failed: DriverDocumentType[];
  /** Required documents still not on file, straight from the server. */
  missing: DriverDocumentType[];
  /** Set only when the batch failed as a whole — no URLs, or the confirm call. */
  error?: string;
};

export type UploadProgress = (
  type: DriverDocumentType,
  phase: 'signing' | 'uploading' | 'uploaded' | 'registering' | 'done' | 'failed',
) => void;

type SignedTarget = {
  type: DriverDocumentType;
  path: string;
  uploadUrl: string;
  /**
   * Exactly what the PUT must carry, decided and returned by the server.
   *
   * These are not advisory. The content type and an allowed size range are baked
   * into the signature on the URL, so altering or dropping either one makes the
   * signature invalid and storage refuses the upload outright. That is the point:
   * it is the one size check a holder of the URL cannot argue with, and the only
   * one that refuses a 2 GB file before it has been transferred rather than after.
   *
   * Sent verbatim and never rebuilt here. The app does hold its own ceilings in
   * constants/documents.ts, and should — they are what the compression ladder
   * aims at and what lets it refuse a file BEFORE spending an upload on it. But
   * that is a local pre-check, not the enforcement, and the header the server
   * signed is the enforcement. Reconstructing it on the phone from those local
   * numbers would mean two copies that must agree, and a signature that silently
   * stops matching the day one of them moves.
   */
  headers: Record<string, string>;
};

// Annotated rather than inferred: without it TS collapses the two arms into one
// object with both keys optional, and `error` stops being a string.
type UploadAttempt =
  | { type: DriverDocumentType; path: string }
  | { type: DriverDocumentType; error: string };

const failedBatch = (documents: PendingUpload[], error: string): UploadOutcome => ({
  ok: false,
  error,
  results: documents.map(({ type }) => ({ type, ok: false, error })),
  failed: documents.map(({ type }) => type),
  missing: [],
});

/**
 * Send a set of prepared documents and register them for review.
 *
 * `getToken` is Clerk's, passed the same way every other call in api.js takes
 * it. `onProgress` is called as each document moves through the flow, so the
 * screen can show a per-row state without this function knowing anything about
 * rendering.
 */
export async function uploadDriverDocuments(
  documents: PendingUpload[],
  getToken: () => Promise<string | null>,
  onProgress: UploadProgress = () => { },
  vehicleId?: string | null,
): Promise<UploadOutcome> {
  if (!documents.length) {
    return { ok: true, results: [], failed: [], missing: [] };
  }

  documents.forEach(({ type }) => onProgress(type, 'signing'));

  const signed = await getDocumentUploadUrls(
    documents.map(({ type, contentType }) => ({ type, contentType })),
    vehicleId,
    getToken,
  );

  // No URLs means nothing can be attempted. This is the one failure that really
  // is the whole batch's — everything below is per document.
  if (signed.error) {
    documents.forEach(({ type }) => onProgress(type, 'failed'));
    return failedBatch(documents, signed.error);
  }

  // Keyed by type because the response is an array and the request was one too;
  // matching by index would silently pair the wrong file with the wrong slot the
  // first time the server reordered anything. The server guarantees one entry
  // per type — the request schema refuses duplicates — so type is a safe key.
  const targets = new Map<DriverDocumentType, SignedTarget>(
    (signed.documents as SignedTarget[]).map((t) => [t.type, t]),
  );

  const uploads: UploadAttempt[] = await Promise.all(
    documents.map(async (document): Promise<UploadAttempt> => {
      const target = targets.get(document.type);
      if (!target) {
        onProgress(document.type, 'failed');
        return {
          type: document.type,
          error: `The server had nowhere to put your ${documentLabelOf(document.type)}.`,
        };
      }

      onProgress(document.type, 'uploading');

      try {
        // expo/fetch, not the global one. A React Native Blob or FormData does
        // not survive this trip intact — the documented Expo path is to pass the
        // File itself, which streams off disk rather than loading a 6 MB scan
        // into JS memory on a phone that may not have it to spare.
        const response = await fetch(target.uploadUrl, {
          method: 'PUT',
          // Straight from the server, unmodified. They carry the content type
          // and the permitted size range, both of which are part of what was
          // signed — so this is not the app asserting anything, it is the app
          // repeating terms storage will check the bytes against itself.
          //
          // The content type is still a CLAIM about the file, and the server
          // re-reads the actual first bytes and refuses anything that disagrees.
          // The size range is not a claim: Google measures the body.
          headers: target.headers,
          body: new File(document.uri),
        });

        if (!response.ok) {
          // 400 here is very often an expired token: a signed URL is good for
          // two hours, and a captain who opens the screen then drives a ride can
          // come back past it. Retrying re-requests the URL, which fixes it.
          onProgress(document.type, 'failed');
          return {
            type: document.type,
            error: `Could not upload your ${documentLabelOf(document.type)}. Please try again.`,
          };
        }

        onProgress(document.type, 'uploaded');
        return { type: document.type, path: target.path };
      } catch {
        onProgress(document.type, 'failed');
        return {
          type: document.type,
          error: `Could not upload your ${documentLabelOf(document.type)}. Check your connection.`,
        };
      }
    }),
  );

  const landed = documents.filter((d) =>
    uploads.some((u) => u.type === d.type && 'path' in u));

  const results: UploadReport[] = uploads.map((u) =>
    'error' in u ? { type: u.type, ok: false, error: u.error } : { type: u.type, ok: true });

  // Nothing landed — every upload failed, so there is nothing to register.
  if (!landed.length) {
    return {
      ok: false,
      results,
      failed: results.map((r) => r.type),
      missing: [],
    };
  }

  landed.forEach(({ type }) => onProgress(type, 'registering'));

  const confirmed = await confirmDocuments(
    landed.map((document) => {
      const uploaded = uploads.find((u) => u.type === document.type) as { path: string };
      return {
        type: document.type,
        path: uploaded.path,
        ...(document.number ? { number: document.number } : {}),
        ...(document.expiresAt ? { expiresAt: document.expiresAt } : {}),
      };
    }),
    // The car the URLs were SIGNED for, echoed back by upload-url, rather than
    // whatever is active now. A captain can switch cars while six photos are
    // uploading, and confirming against the new one would fail the path check on
    // every vehicle document in the batch.
    signed.vehicleId ?? vehicleId,
    getToken,
  );

  // The confirm call validates the whole batch before writing any of it, so a
  // rejection here means none of `landed` was registered. Its `type` field says
  // which document tripped it, which is what makes the message actionable.
  if (confirmed.error) {
    landed.forEach(({ type }) => onProgress(type, 'failed'));
    const blamed = confirmed.type as DriverDocumentType | undefined;

    return {
      ok: false,
      error: confirmed.error,
      results: results.map((r) =>
        r.ok ? { type: r.type, ok: false, error: blamed && r.type !== blamed ? undefined : confirmed.error } : r),
      failed: results.map((r) => r.type),
      missing: [],
    };
  }

  landed.forEach(({ type }) => onProgress(type, 'done'));

  return {
    ok: results.every((r) => r.ok),
    results,
    failed: results.filter((r) => !r.ok).map((r) => r.type),
    // Which REQUIRED documents are still owed, straight from the server so the
    // screen never keeps its own copy of that list.
    missing: (confirmed.missing ?? []) as DriverDocumentType[],
  };
}
