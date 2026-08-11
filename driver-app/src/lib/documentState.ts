import type { DocumentRowState } from '../components/ui/DocumentRow';
import { type DocumentOwner, type DriverDocumentType } from '../constants/documents';

// Turning what the server stores into what the captain reads.
//
// The server keeps TWO independent verdicts on every document — `scanStatus`,
// which is the file check, and `status`, which is the admin's review — and it
// keeps them apart on purpose: a document can be scan-clean and rejected, or
// scan-failed and never reviewed. Both of those are real and neither implies
// anything about the other.
//
// A captain does not need two verdicts. He needs one answer to "is there
// anything for me to do about this", so the collapse happens here, in one
// function, rather than in the JSX of whatever screen renders it next.

/** One document as GET /driver/me/documents returns it. */
export type ServerDocument = {
  id: string;
  type: DriverDocumentType;
  label: string;
  required: boolean;
  status: 'pending' | 'approved' | 'rejected';
  scanStatus: 'pending' | 'scanning' | 'clean' | 'failed';
  rejectionReason: string | null;
  scanMessage: string | null;
  number: string | null;
  expiresAt: string | null;
  uploadedAt: string;
};

export type DocumentTypeInfo = {
  type: DriverDocumentType;
  label: string;
  required: boolean;
  expires: boolean;
  needsNumber: boolean;
  /** 'driver' follows the man from car to car; 'vehicle' belongs to one car. */
  owner: DocumentOwner;
};

/** One of the captain's cars, as the vehicle endpoints return it. */
export type Vehicle = {
  id: string;
  class: string;
  number: string;
  model: string | null;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  seats?: number | null;
  /** Required car documents this car still owes. */
  missing?: DriverDocumentType[];
};

export type VehiclesResponse = {
  activeVehicleId: string | null;
  vehicles: Vehicle[];
};

export type VerificationStatus =
  | 'notUploaded' | 'uploading' | 'scanning' | 'pending' | 'approved' | 'rejected';

export type DocumentsResponse = {
  /** The car this checklist is about. Null for a captain who has not added one. */
  vehicle: Vehicle | null;
  documents: ServerDocument[];
  replacements: ServerDocument[];
  allTypes: DocumentTypeInfo[];
  missing: DriverDocumentType[];
  warningDays: number;
};

/**
 * The one line a captain reads to know where a car stands.
 *
 * Shared by the vehicle list and the checklist header so the two cannot describe
 * the same car differently — which they would, the first time one of them was
 * updated and the other was not.
 */
export function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case 'approved': return 'Ready to drive';
    case 'rejected': return 'Needs your attention';
    case 'scanning': return 'Checking documents';
    case 'pending': return 'With the office';
    case 'uploading': return 'Documents incomplete';
    default: return 'No documents yet';
  }
}

/**
 * The single state a row shows.
 *
 * ORDER MATTERS AND IS THE WHOLE POINT. The file check is asked about first,
 * because until it has passed, the review has not happened and cannot: the admin
 * cannot open a document the server refuses to give him a URL for. Reading
 * `status` first would show "Waiting for review" against a file that no admin
 * will ever be shown, and the captain would wait for a review that is not queued.
 */
export function rowStateFor(document: ServerDocument | undefined): DocumentRowState {
  if (!document) return 'missing';

  if (document.scanStatus === 'failed') return 'unverified';
  if (document.scanStatus !== 'clean') return 'scanning';

  if (document.status === 'rejected') return 'rejected';
  if (document.status === 'approved') return 'approved';
  return 'pending';
}

/** The line under a row: the admin's words, or the one generic scan sentence. */
export function reasonFor(document: ServerDocument | undefined): string | null {
  if (!document) return null;
  if (document.scanStatus === 'failed') return document.scanMessage;
  if (document.status === 'rejected') return document.rejectionReason;
  return null;
}

const DAY_MS = 86_400_000;

/**
 * "Expires in 24 days", "Expires tomorrow", "Expired 3 days ago".
 *
 * Counted in whole days from midnight rather than from the exact instant: an
 * expiry is a date printed on a certificate, and a captain who reads "expires in
 * 1 day" at 11pm and "expired" ninety minutes later has been told two different
 * things about a document nothing happened to.
 */
export function expiryLabel(expiresAt: string | null, warningDays: number): {
  text: string | null;
  warn: boolean;
} {
  if (!expiresAt) return { text: null, warn: false };

  const midnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((midnight(new Date(expiresAt)) - midnight(new Date())) / DAY_MS);

  if (days < 0) {
    const ago = Math.abs(days);
    return { text: ago === 1 ? 'Expired yesterday' : `Expired ${ago} days ago`, warn: true };
  }
  if (days === 0) return { text: 'Expires today', warn: true };
  if (days === 1) return { text: 'Expires tomorrow', warn: true };

  return { text: `Expires in ${days} days`, warn: days <= warningDays };
}
