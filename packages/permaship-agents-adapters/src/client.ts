const getApiUrl = (): string => process.env.PERMASHIP_API_URL ?? 'http://127.0.0.1:3100';
const getApiKey = (): string => process.env.PERMASHIP_API_KEY ?? '';

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Paperclip API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as T;
}

export async function apiRequestSafe<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string }> {
  try {
    const data = await apiRequest<T>(method, path, body);
    return { data };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
