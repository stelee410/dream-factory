interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
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
