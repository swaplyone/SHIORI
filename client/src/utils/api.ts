// Central API configuration and safe fetch utilities for SHIORI

export const API_BASE_URL = (
  (import.meta as any).env?.VITE_API_URL || 
  (typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.startsWith('192.168.') || 
    window.location.hostname.startsWith('10.') || 
    window.location.hostname.endsWith('.local') ||
    window.location.port === '5173' ||
    window.location.port === '3000' ||
    window.location.port === '4000'
  ) ? '' : 'https://shiori-backend.onrender.com')
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
