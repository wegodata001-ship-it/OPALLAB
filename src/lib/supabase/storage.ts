import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdmin, STORAGE_BUCKETS, type StorageBucket } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function uploadFile(
  bucket: StorageBucket,
  storagePath: string,
  file: Buffer | ArrayBuffer,
  mimeType: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new AppError("STORAGE_ERROR", `העלאת הקובץ נכשלה: ${error.message}`, 500, error);
  }
}

export async function getSignedUrl(
  bucket: StorageBucket,
  storagePath: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!storagePath) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    console.error("[storage] signed URL error:", error.message);
    return null;
  }

  return data.signedUrl;
}

export async function downloadStorageFile(
  bucket: StorageBucket,
  storagePath: string,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new AppError("STORAGE_ERROR", `הורדת הקובץ נכשלה: ${error?.message ?? "unknown"}`, 500, error);
  }
  const arrayBuffer = await data.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: data.type || null };
}

export async function listStorageFolder(
  bucket: StorageBucket,
  prefix: string,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).list(prefix);
  if (error) {
    throw new AppError("STORAGE_ERROR", `רשימת קבצים נכשלה: ${error.message}`, 500, error);
  }
  return (data ?? []).map((item) => item.name);
}

export async function deleteFile(bucket: StorageBucket, storagePath: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    throw new AppError("STORAGE_ERROR", `מחיקת הקובץ נכשלה: ${error.message}`, 500, error);
  }
}

export function buildOrderFilePath(orderId: string, fileId: string, fileName: string): string {
  return `${orderId}/${fileId}/${fileName}`;
}

export function buildInventoryImagePath(itemId: string, fileName: string): string {
  return `${itemId}/${fileName}`;
}

export { STORAGE_BUCKETS };
