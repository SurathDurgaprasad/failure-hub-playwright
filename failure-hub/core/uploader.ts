// failure-hub/core/uploader.ts
import * as zlib from "node:zlib";

const GZIP_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

export type ForensicPayload = Record<string, unknown>;

type UploadInput = {
  endpoint: string;
  payload: ForensicPayload;
};

/**
 * Safely serializes any object to JSON, handling circular references gracefully.
 */
function safeJsonStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

/**
 * Compresses the payload and enforces the 50 MB Gzip size limit.
 * If the limit is exceeded, domHtml is truncated and the payload is re-compressed.
 */
function buildCompressedPayload(payload: ForensicPayload): Buffer {
  let compressed = zlib.gzipSync(safeJsonStringify(payload));

  if (compressed.byteLength > GZIP_SIZE_LIMIT_BYTES) {
    console.warn(
      `[Failure-Hub] ⚠️  Payload exceeded 50 MB Gzip limit (${(compressed.byteLength / 1024 / 1024).toFixed(1)} MB). Truncating domHtml.`
    );
    const trimmed: ForensicPayload = {
      ...payload,
      domHtml: "[TRUNCATED — payload exceeded 50 MB Gzip limit]",
    };
    compressed = zlib.gzipSync(safeJsonStringify(trimmed));
  }

  return compressed;
}

/**
 * Uploads a forensic failure payload to the orchestrator endpoint.
 *
 * - Gzip-compresses the payload before sending.
 * - Enforces a strict 10-second non-blocking timeout via Promise.race.
 * - Is completely inert (returns immediately) if no endpoint is configured.
 * - Never throws — all errors are caught and logged to console.error.
 */
export async function uploadFailureReport({ endpoint, payload }: UploadInput): Promise<void> {
  // Silent Operator: if no endpoint is configured, occupy 0ms.
  if (!endpoint) return;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const compressed = buildCompressedPayload(payload);

    const uploadPromise = fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "gzip",
        "Content-Type": "application/json",
      },
      body: compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`[Failure-Hub] Upload rejected: ${res.status} ${text}`);
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("[Failure-Hub] Upload timed out after 10s — moving on.")),
        10_000
      );
    });

    await Promise.race([uploadPromise, timeoutPromise]);
  } catch (err) {
    console.error("[Failure-Hub] Non-blocking upload error:", err);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}