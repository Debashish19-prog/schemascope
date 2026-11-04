export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the Schemascope server.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.");
  return data;
}

export const api = {
  session: () => request("GET", "/session"),
  connect: (details) => request("POST", "/connect", details),
  disconnect: () => request("POST", "/disconnect"),
  overview: () => request("GET", "/overview"),
  rows: (table, params) => request("GET", `/tables/${encodeURIComponent(table)}/rows?${new URLSearchParams(params)}`),
};

export const formatBytes = (n) => {
  if (!n) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i < 2 ? 0 : 1)} ${units[i]}`;
};

export const formatCount = (n) => new Intl.NumberFormat("en-US").format(n);
