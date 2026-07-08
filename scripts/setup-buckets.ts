import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["order-files", "inventory-images", "users"];

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing } = await supabase.storage.listBuckets();
  const names = new Set((existing ?? []).map((b) => b.name));

  for (const bucket of BUCKETS) {
    if (names.has(bucket)) {
      console.log(`[SKIP] "${bucket}" already exists`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: "50MB",
    });
    if (error) console.log(`[FAIL] "${bucket}": ${error.message}`);
    else console.log(`[OK]   created "${bucket}"`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
