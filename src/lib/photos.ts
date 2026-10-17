import { supabase } from './supabase';

export const PHOTO_BUCKET = 'job-photos';
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

/**
 * Shrinks a camera photo to at most 1600px on its long edge as a JPEG, so a
 * 5MB phone photo uploads as a few hundred KB over a job-site signal.
 * createImageBitmap honours EXIF rotation in current browsers.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone could not process the photo.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', QUALITY),
  );
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
}

/** Uploads photos into the job's folder and records them against a daily log. */
export async function uploadPhotos(jobId: string, eventId: string, photos: PreparedPhoto[]): Promise<void> {
  for (const photo of photos) {
    const path = `${jobId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase
      .from('job_photos')
      .insert({ job_id: jobId, event_id: eventId, storage_path: path, width: photo.width, height: photo.height });
    if (error) throw error;
  }
}

/** Short-lived links for showing private photos. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  return urls;
}

export const CHANGE_PHOTO_BUCKET = 'change-photos';

/**
 * Uploads a change's "photo of the spot". This bucket is public under
 * unguessable names so the client's approval page can show it.
 */
export async function uploadChangePhoto(jobId: string, photo: PreparedPhoto): Promise<string> {
  const path = `${jobId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CHANGE_PHOTO_BUCKET)
    .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export function changePhotoUrl(path: string): string {
  return supabase.storage.from(CHANGE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
