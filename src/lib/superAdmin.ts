const SUPER_ADMIN_TOKEN_KEY = 'gympro_super_admin_token';

export interface SuperAdminRequests {
  pendingGyms: GymAccessRequest[];
  approvedGyms: GymAccessRequest[];
}

export interface GymAccessRequest {
  id: string;
  gymName: string;
  username: string;
  createdAt: string;
}

async function request<T>(
  path: string,
  token?: string,
  body?: Record<string, unknown>,
  apiRoot = '/api/super-admin'
): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const result = (await response.json()) as { ok?: boolean; error?: string } & T;
  if (!response.ok || !result.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
    }
    throw new Error(result.error || 'Erreur de communication avec l’espace super admin.');
  }
  return result;
}

export async function loginSuperAdmin(
  username: string,
  password: string
): Promise<string> {
  const result = await request<{ token: string }>('/login', undefined, { username, password });
  sessionStorage.setItem(SUPER_ADMIN_TOKEN_KEY, result.token);
  return result.token;
}

export function getSuperAdminToken(): string {
  return sessionStorage.getItem(SUPER_ADMIN_TOKEN_KEY) || '';
}

export function clearSuperAdminToken(): void {
  sessionStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
}

export async function getSuperAdminRequests(token: string): Promise<SuperAdminRequests> {
  return request<SuperAdminRequests>('/gym-requests', token);
}

export async function decideGymAccessRequest(
  token: string,
  id: string,
  decision: 'approve' | 'reject'
): Promise<void> {
  await request(`/gym-requests/${encodeURIComponent(id)}/${decision}`, token, {});
}

export async function changeSuperAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await request('/password', token, { currentPassword, newPassword });
}
