import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.replace(/\/rest\/v1\/?$/, "");
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

export const STORAGE_BUCKETS = {
  ORDER_FILES: "order-files",
  INVENTORY_IMAGES: "inventory-images",
  USERS: "users",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
