import { getSupabaseAdmin, type StorageBucket } from "@/lib/supabase/admin";

async function listPaths(bucket: StorageBucket, prefix: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  const paths: string[] = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.metadata) {
      paths.push(path);
    } else {
      paths.push(...(await listPaths(bucket, path)));
    }
  }
  return paths;
}

async function removePaths(bucket: StorageBucket, paths: string[]): Promise<number> {
  if (!paths.length) return 0;
  const supabase = getSupabaseAdmin();
  const batchSize = 100;
  let removed = 0;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += batch.length;
  }
  return removed;
}

export async function emptyStorageBucket(bucket: StorageBucket): Promise<number> {
  return removePaths(bucket, await listPaths(bucket, ""));
}

/** Empty a folder prefix inside a bucket (e.g. attendance photos). */
export async function emptyStoragePrefix(bucket: StorageBucket, prefix: string): Promise<number> {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  return removePaths(bucket, await listPaths(bucket, normalized));
}

export async function emptyAllDemoStorage(): Promise<Record<string, number>> {
  const buckets = ["order-files", "inventory-images", "users"] as StorageBucket[];
  const result: Record<string, number> = {};
  for (const bucket of buckets) {
    result[bucket] = await emptyStorageBucket(bucket);
  }
  return result;
}

/** Client-handover cleanup: order files + attendance photos only (keeps inventory images). */
export async function emptyOperationalStorage(): Promise<Record<string, number>> {
  return {
    "order-files": await emptyStorageBucket("order-files"),
    attendance: await emptyStoragePrefix("users", "attendance"),
  };
}
