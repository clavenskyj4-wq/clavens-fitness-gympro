import { Membre } from '../types/gym';

const SUPER_ADMIN_TOKEN_KEY = 'gympro_super_admin_token';

export interface SuperAdminRequests {
  pending: Membre[];
  approved: Membre[];
  members: Membre[];
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
  return request<SuperAdminRequests>('/requests', token);
}

export async function updateLinkedMemberStatus(
  token: string,
  memberId: string,
  statut: 'actif' | 'suspendu'
): Promise<Membre> {
  const result = await request<{ member: Membre }>(
    `/members/${encodeURIComponent(memberId)}/status`,
    token,
    { statut }
  );
  return result.member;
}

export async function changeSuperAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await request('/password', token, { currentPassword, newPassword });
}

export async function decideSuperAdminRequest(
  token: string,
  id: string,
  decision: 'approve' | 'reject' | 'complete'
): Promise<{ member?: Membre }> {
  return request<{ member?: Membre }>(
    `/requests/${encodeURIComponent(id)}/${decision}`,
    token,
    {}
  );
}

export async function publishPublicRegistrationConfig(
  token: string,
  config: {
    nom_gym: string;
    adresse: string;
    telephone: string;
    apps_script_url: string;
    apps_script_key: string;
    forfaits: Array<{
      id: string;
      nom: string;
      prix: number;
      devise: string;
      duree_jours: number;
    }>;
  }
): Promise<void> {
  await request('/public-registration/config', token, config, '/api');
}
