import { generateUUID } from './utils';

export type AccessRequestStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';

export interface AccessRequestItem {
  id: string;
  deviceId: string;
  nomComplet: string;
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

export async function fetchAccessStatus(deviceId: string): Promise<AccessStatusResponse> {
  const res = await fetch(
    `/api/access/status?deviceId=${encodeURIComponent(deviceId)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error('Impossible de vérifier le statut d’autorisation.');
  }
  const data = (await res.json()) as AccessStatusResponse;
  if (!data.gateEnabled || data.status === 'approved') {
    setCachedDeviceApproved(true);
  } else if (data.status === 'rejected' || data.status === 'revoked' || data.status === 'pending' || data.status === 'none') {
    setCachedDeviceApproved(false);
  }
  return data;
}

export async function submitAccessRequest(payload: {
  deviceId: string;
  nomComplet: string;
  telephone: string;
  email: string;
  posteSouhaite: string;
  note: string;
}): Promise<AccessStatusResponse> {
  const res = await fetch('/api/access/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
