import { saveGymConfig } from './db';
import { generateUUID } from './utils';

export type AccessRequestStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';

export interface AccessRequestItem {
  id: string;
  deviceId: string;
  nomComplet: string;
  nomGym?: string;
  telephone: string;
  email: string;
  posteSouhaite: string;
  note?: string;
  userAgent?: string;
  status: Exclude<AccessRequestStatus, 'none'>;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

export interface AccessStatusResponse {
  ok: boolean;
  gateEnabled: boolean;
  status: AccessRequestStatus;
  request: AccessRequestItem | null;
}

const DEVICE_ID_KEY = 'gympro_device_id';
const DEVICE_APPROVED_KEY = 'gympro_device_approved';
const SUPER_ADMIN_TOKEN_KEY = 'gympro_sa_token';
const APPLIED_GYM_NAME_KEY = 'gympro_applied_gym_name_req';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim().length >= 8) {
      return existing.trim();
    }
    const created = `GP-${generateUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `GP-${generateUUID()}`;
  }
}

export function getCachedDeviceApproved(): boolean {
  try {
    return localStorage.getItem(DEVICE_APPROVED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCachedDeviceApproved(approved: boolean): void {
  try {
    if (approved) {
      localStorage.setItem(DEVICE_APPROVED_KEY, '1');
    } else {
      localStorage.removeItem(DEVICE_APPROVED_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

export function getSuperAdminToken(): string {
  try {
    return sessionStorage.getItem(SUPER_ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setSuperAdminToken(token: string): void {
  try {
    if (token) {
      sessionStorage.setItem(SUPER_ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (res.status >= 502 && res.status <= 504 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      window.clearTimeout(timeoutId);
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : '';
  if (/abort/i.test(msg)) {
    throw new Error('Le serveur met du temps à répondre (démarrage en cours). Veuillez réessayer.');
  }
  throw new Error(
    'Connexion au serveur momentanément indisponible. Vérifiez votre connexion internet ou réessayez dans quelques secondes.'
  );
}

export async function fetchAccessStatus(deviceId: string): Promise<AccessStatusResponse> {
  const res = await fetchWithRetry(
    `/api/access/status?deviceId=${encodeURIComponent(deviceId)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error('Impossible de vérifier le statut d’autorisation.');
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Réponse serveur inattendue (redémarrage en cours). Réessayez dans quelques secondes.');
  }
  const data = (await res.json()) as AccessStatusResponse;
  if (!data.gateEnabled || data.status === 'approved') {
    setCachedDeviceApproved(true);
  } else if (
    data.status === 'rejected' ||
    data.status === 'revoked' ||
    data.status === 'pending' ||
    data.status === 'none'
  ) {
    setCachedDeviceApproved(false);
  }
  return data;
}

export async function applyApprovedGymNameIfNeeded(
  request?: AccessRequestItem | null
): Promise<boolean> {
  if (!request || request.status !== 'approved') return false;
  const gymName = String(request.nomGym || '').trim();
  if (!gymName) return false;
  const stamp = `${request.id}:${gymName}`;
  try {
    if (localStorage.getItem(APPLIED_GYM_NAME_KEY) === stamp) {
      return false;
    }
    await saveGymConfig({ nom_gym: gymName });
    localStorage.setItem(APPLIED_GYM_NAME_KEY, stamp);
    return true;
  } catch {
    return false;
  }
}

export async function submitAccessRequest(payload: {
  deviceId: string;
  nomComplet: string;
  nomGym: string;
  telephone: string;
  email: string;
  posteSouhaite: string;
  note: string;
}): Promise<AccessStatusResponse> {
  const res = await fetchWithRetry('/api/access/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Le serveur redémarre ou est en veille. Veuillez réessayer dans 5 secondes.');
  }
  const data = (await res.json()) as AccessStatusResponse & { error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Impossible d’envoyer la demande.');
  }
  if (data.status === 'approved' || !data.gateEnabled) {
    setCachedDeviceApproved(true);
  } else {
    setCachedDeviceApproved(false);
  }
  return data;
}
