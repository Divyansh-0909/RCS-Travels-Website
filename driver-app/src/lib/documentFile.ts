import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Linking } from 'react-native';
import { showPermissionPrompt } from '../components/ui/PermissionPrompt';

import {
  IMAGE_QUALITY_LADDER,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_PDF_BYTES,
  TARGET_IMAGE_BYTES,
  type DocumentContentType,
} from '../constants/documents';


/** What the flow hands to the upload step: a local file, already legal to send. */
export type PreparedDocument = {
  /** file:// URI in the cache directory. */
  uri: string;
  contentType: DocumentContentType;
  /** Bytes as they will actually be uploaded — post-compression for images. */
  size: number;
  /** The original name where there was one (PDFs); photos have no name. */
  name: string | null;
};

export type PrepareFailure = { error: string };

export type PrepareResult = PreparedDocument | PrepareFailure | null;

export const isFailure = (result: PrepareResult): result is PrepareFailure =>
  result !== null && 'error' in result;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// The dimensions to ask for, given what the camera produced. Only ever shrinks:
// a document photographed at 900px is a bad photo, and upscaling it to 1600
// would add nothing but bytes.
//
// One axis is passed and the other left null — expo-image-manipulator derives it
// and preserves the ratio, which is safer than computing it here and rounding a
// portrait licence into a very slightly squashed one.
function resizeTargetFor(width: number, height: number): { width: number | null; height: number | null } | null {
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE) return null;

  return width >= height
    ? { width: MAX_IMAGE_EDGE, height: null }
    : { width: null, height: MAX_IMAGE_EDGE };
}

// Resize, then walk the quality ladder until the file is under target.
//
// The ladder re-saves rather than re-renders: the resize happens once, and each
// rung is a fresh JPEG encode of the same in-memory image. That matters on a
// mid-range Android, where the resize is the expensive half.
//
// The last rung is accepted whatever it weighs. An oversized but readable
// document is a document; refusing it here would strand a captain whose
// insurance certificate is simply a dense page, with no action he could take.
async function compressImage(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedDocument | PrepareFailure> {
  const context = ImageManipulator.manipulate(uri);

  const target = resizeTargetFor(width, height);
  if (target) context.resize(target);

  const rendered = await context.renderAsync();

  let best: { uri: string; size: number } | null = null;

  for (const compress of IMAGE_QUALITY_LADDER) {
    // JPEG regardless of what came in. A photo of a document has no flat colour
    // and no transparency, which is everything PNG is good at — a PNG of a
    // licence is routinely five times the size of the JPEG for no visible gain.
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress });
    const file = new File(saved.uri);
    const size = file.size;

    // The rung before this one is now dead weight in the cache directory. Not
    // fatal if it fails — this is a best-effort tidy of a directory the OS
    // reclaims on its own.
    if (best) {
      try {
        new File(best.uri).delete();
      } catch {
        // Already gone, or never written. Nothing to do and nothing to report.
      }
    }
    best = { uri: saved.uri, size };

    if (size <= TARGET_IMAGE_BYTES) break;
  }

  if (!best) return { error: 'Could not process that photo. Try taking it again.' };

  // Only reachable if the last rung is still over the image ceiling, which for a
  // 1600px JPEG would take something pathological. Caught anyway: discovering it
  // as a 413 after the upload is the worst place to find out.
  if (best.size > MAX_IMAGE_BYTES) {
    return { error: `That photo is still ${mb(best.size)} after compressing. Try a clearer, closer shot.` };
  }

  return { uri: best.uri, contentType: 'image/jpeg', size: best.size, name: null };
}

/**
 * Photograph a document with the camera.
 *
 * Returns null when the captain backs out, a { error } when the shot cannot be
 * used, and a PreparedDocument when it can.
 */
export async function captureDocumentPhoto(): Promise<PrepareResult> {
  const existing = await ImagePicker.getCameraPermissionsAsync();
  if (!existing.granted) {
    const canRequest = existing.canAskAgain;
    const accepted = await showPermissionPrompt({
      kind: 'camera',
      title: canRequest ? 'Use your camera' : 'Turn on camera access',
      message: canRequest
        ? 'RCS Captains uses the camera only when you choose to photograph a document.'
        : 'Camera access is off. Turn it on in app settings to photograph this document.',
      actionLabel: canRequest ? 'Continue' : 'Open app settings',
    });

    if (!accepted) return null;
    if (!canRequest) {
      await Linking.openSettings();
      return null;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    // Full quality out of the camera, on purpose. This is the ONE copy the
    // compression ladder below gets to work from, and the picker's own quality
    // knob is a blunt re-encode applied before the resize — compressing a
    // 4000px image and then throwing 60% of those pixels away is strictly worse
    // than resizing first and compressing once.
    quality: 1,
    // No crop step. A captain holding a licence at arm's length in a car park is
    // not going to enjoy a pinch-to-crop UI, and the admin can zoom.
    allowsEditing: false,
    exif: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return compressImage(asset.uri, asset.width, asset.height);
}

/**
 * Pick a document photo already in the gallery — the common case for anyone who
 * photographed his papers before opening the app.
 */
export async function pickDocumentPhoto(): Promise<PrepareResult> {
  const existing = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!existing.granted) {
    const canRequest = existing.canAskAgain;
    const accepted = await showPermissionPrompt({
      kind: 'photos',
      title: canRequest ? 'Choose from your photos' : 'Turn on photo access',
      message: canRequest
        ? 'RCS Captains needs access only so you can select a document photo to upload.'
        : 'Photo access is off. Turn it on in app settings to choose this document.',
      actionLabel: canRequest ? 'Continue' : 'Open app settings',
    });

    if (!accepted) return null;
    if (!canRequest) {
      await Linking.openSettings();
      return null;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    exif: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return compressImage(asset.uri, asset.width, asset.height);
}

/**
 * Pick a PDF — an insurance policy or a permit emailed as a scan, which is how
 * most of them arrive.
 */
export async function pickDocumentPdf(): Promise<PrepareResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    // Into the app's cache, so the URI stays readable after the picker's
    // temporary grant expires. Without this, Android hands back a content://
    // URI that is dead by the time the upload starts.
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  // `asset.size` is what the picker was told; the file on disk is what will
  // actually be uploaded, and on Android those can differ for a document that
  // came from a cloud provider. Read the copy.
  const file = new File(asset.uri);
  if (!file.exists) {
    return { error: 'That file could not be opened. Try picking it again.' };
  }

  // The picker's `type` filter is a hint the system file browser is free to
  // ignore, and on Android some providers honour it loosely. Checked rather
  // than assumed — the bucket rejects anything that is not a PDF, and finding
  // out here costs nothing.
  if (asset.mimeType && asset.mimeType !== 'application/pdf') {
    return { error: 'That file is not a PDF. Pick a PDF, or photograph the document instead.' };
  }

  if (file.size > MAX_PDF_BYTES) {
    return {
      error:
        `That PDF is ${mb(file.size)} — the limit is ${mb(MAX_PDF_BYTES)}. ` +
        `Re-scan it at a lower quality, or just photograph the document.`,
    };
  }

  return {
    uri: asset.uri,
    contentType: 'application/pdf',
    size: file.size,
    name: asset.name ?? null,
  };
}
