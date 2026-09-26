// Central API configuration and safe fetch utilities for SHIORI

// In browser environments, always use relative paths so Vercel rewrites proxy without CORS issues
export const API_BASE_URL = (
  typeof window !== 'undefined'
    ? ''
    : ((import.meta as any).env?.VITE_API_URL || 'https://shiori-vw8w.onrender.com')
).replace(/\/+$/, '');

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE_URL) return cleanPath;
  return `${API_BASE_URL}${cleanPath}`;
}

export async function fetchJson(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const url = getApiUrl(path);
  const token = localStorage.getItem('shiori_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Server returned an invalid response' };
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: { error: err.message || 'Network connection failed' },
    };
  }
}
