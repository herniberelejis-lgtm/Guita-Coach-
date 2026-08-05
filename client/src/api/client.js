/** Cliente HTTP fino sobre fetch — cookies de sesión, JSON in/out, manejo de errores. */

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: options.body && !(options.body instanceof FormData) ? {
      "content-type": "application/json",
      ...options.headers
    } : options.headers,
    ...options
  });
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      detail = data?.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  return JSON.parse(text);
}
export const api = {
  get: path => request(path),
  post: (path, body) => request(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined
  }),
  patch: (path, body) => request(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined
  }),
  delete: path => request(path, {
    method: "DELETE"
  }),
  upload: (path, file, fieldName = "file") => {
    const form = new FormData();
    form.append(fieldName, file);
    return request(path, {
      method: "POST",
      body: form
    });
  }
};
