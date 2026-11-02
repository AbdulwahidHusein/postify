/** Browser JSON client for our API routes. Throws Error(message) on failure. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch {
    throw new ApiError("Can't reach Goods. Check your connection and try again.", 0, "network");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(d.error ?? `Request failed (${res.status})`, res.status, d.code);
  }
  return data as T;
}

/** Upload a file through a presigned URL our API hands out. */
export async function uploadImage(presignEndpoint: string, file: File): Promise<string> {
  const { key, url, headers } = await api<{ key: string; url: string; headers: Record<string, string> }>(
    presignEndpoint,
    { body: { contentType: file.type, size: file.size } },
  );
  const res = await fetch(url, { method: "PUT", headers, body: file, credentials: url.startsWith("/") ? "include" : "omit" });
  if (!res.ok) throw new ApiError("Upload failed. Try again.", res.status, "upload_failed");
  return key;
}
