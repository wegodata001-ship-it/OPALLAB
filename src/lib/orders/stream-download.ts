/**
 * Stream a remote body into an ArrayBuffer with progress.
 * Three.js loaders still need the full buffer — but we avoid Base64 and
 * report first-byte / download separately from parse.
 */
export async function streamToArrayBuffer(
  url: string,
  opts?: {
    onProgress?: (loaded: number, total: number | null) => void;
    signal?: AbortSignal;
  },
): Promise<{ buffer: ArrayBuffer; firstByteMs: number; downloadMs: number; bytes: number }> {
  const t0 = performance.now();
  const res = await fetch(url, {
    signal: opts?.signal,
    cache: "force-cache",
  });
  if (!res.ok) throw new Error(`הורדה נכשלה (${res.status})`);

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  const body = res.body;

  if (!body || typeof body.getReader !== "function") {
    const buffer = await res.arrayBuffer();
    const downloadMs = Math.round(performance.now() - t0);
    opts?.onProgress?.(buffer.byteLength, buffer.byteLength);
    return {
      buffer,
      firstByteMs: downloadMs,
      downloadMs,
      bytes: buffer.byteLength,
    };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let firstByteMs = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      if (!firstByteMs) firstByteMs = Math.round(performance.now() - t0);
      chunks.push(value);
      loaded += value.byteLength;
      opts?.onProgress?.(loaded, total);
    }
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.byteLength;
  }

  return {
    buffer: buffer.buffer,
    firstByteMs: firstByteMs || Math.round(performance.now() - t0),
    downloadMs: Math.round(performance.now() - t0),
    bytes: loaded,
  };
}
