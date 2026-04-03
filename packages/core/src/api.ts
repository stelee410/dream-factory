interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

/**
 * Wrapper around global fetch that surfaces the underlying cause on network errors.
 * Node's fetch throws `TypeError: fetch failed` with a `cause` property —
 * this helper unpacks it into a readable message.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: any) {
    const cause = err?.cause;
    const detail = cause
      ? `${cause.code ?? cause.name ?? ""} ${cause.message ?? cause}`.trim()
      : "";
    const urlLabel = truncateUrl(url);
    throw new Error(
      `网络请求失败 [${urlLabel}]: ${err.message}${detail ? ` (${detail})` : ""}`
    );
  }
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40
      ? u.pathname.slice(0, 40) + "..."
      : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url.slice(0, 60);
  }
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await safeFetch(url, init);
  const body = await res.json();

  // Handle envelope format: { success, data, error }
  if (typeof body === "object" && body !== null && "success" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.success || !res.ok) {
      throw new Error(envelope.error?.message ?? `Request failed (${res.status})`);
    }
    return envelope.data as T;
  }

  // Direct response (no envelope)
  if (!res.ok) {
    const msg =
      (body as { error?: { message?: string } }).error?.message ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}
