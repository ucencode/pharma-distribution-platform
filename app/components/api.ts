type ApiError = {
  error: string;
  detail?: string;
  issues?: { path: PropertyKey[]; message: string }[];
};

// Calls a route handler and throws the error message returned by `errorResponse()`.
export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) {
    const err = data as ApiError;
    const extra =
      err.detail ?? err.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(extra ? `${err.error}. ${extra}` : err.error);
  }
  return data as T;
}
