// ---- One way to call the API: same origin (/api rewrite), JSON in, AppError-shaped errors out ----

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, { body, headers } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', "Can't reach Seat Ase? right now. Check your connection.");
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = data?.error ?? {};
    throw new ApiError(res.status, error.code ?? 'UNKNOWN', error.message ?? 'Something went wrong. Try again.', error.details);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, headers) => request('POST', path, { body, headers }),
};
