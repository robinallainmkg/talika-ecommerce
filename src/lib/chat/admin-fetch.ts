export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "x-admin-secret": process.env.NEXT_PUBLIC_CHAT_ADMIN_SECRET || "",
    ...extra,
  }
}

export async function adminFetch(path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: { ...adminHeaders(), "Content-Type": "application/json", ...(init?.headers || {}) },
  })
}
