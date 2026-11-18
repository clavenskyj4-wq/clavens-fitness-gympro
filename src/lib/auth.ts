import { AppRoute, UserRole, Utilisateur } from '../types/gym';
import { getAllRecords, logAction, saveRecord } from './db';
import { generateUUID } from './utils';

const SESSION_STORAGE_KEY = 'gympro_session_user';

export interface SessionUser {
  id: string;
  nom_utilisateur: string;
  role: UserRole;
  loginAt: string;
}

/**
 * Calcule un condensat SHA-256 + sel en hexadécimal via Web Crypto API (100 % local).
 */
export async function hashPassword(password: string, existingSalt?: string): Promise<string> {
  const salt = existingSalt || generateUUID().replace(/-/g, '').slice(0, 16);
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt] = parts;
  const computed = await hashPassword(password, salt);
  return computed === storedHash;
}

/**
 * Initialise un compte administrateur initial uniquement si aucun utilisateur n'existe encore en local.
 */
export async function ensureInitialAdmin(): Promise<boolean> {
  const users = await getAllRecords<Utilisateur>('Utilisateurs');
  if (users.length > 0) return false;
  const hash = await hashPassword('GymPro2026!');
  await saveRecord<Utilisateur>(
    'Utilisateurs',
    {
      nom_utilisateur: 'admin',
      mot_de_passe_hash: hash,
      role: 'admin',
      actif: 1,
    },
    { skipQueue: true }
  );
  return true;
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<{ ok: boolean; user?: SessionUser; error?: string }> {
  const cleanUser = username.trim().toLowerCase();
  if (!cleanUser || !password) {
    return { ok: false, error: 'Veuillez saisir votre nom d’utilisateur et mot de passe.' };
  }
  const users = await getAllRecords<Utilisateur>('Utilisateurs');
  const found = users.find(
    (u) => u.nom_utilisateur.trim().toLowerCase() === cleanUser && u.actif === 1
  );
  if (!found) {
    return { ok: false, error: 'Identifiants invalides ou compte désactivé.' };
  }
  const valid = await verifyPassword(password, found.mot_de_passe_hash);
  if (!valid) {
    return { ok: false, error: 'Mot de passe incorrect.' };
  }
  const session: SessionUser = {
    id: found.id,
    nom_utilisateur: found.nom_utilisateur,
    role: found.role,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  await logAction(found.nom_utilisateur, 'Connexion', `Rôle : ${found.role}`);
  return { ok: true, user: session };
}

export function getSavedSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Matrice des permissions par rôle :
 * - admin : accès complet
 * - caissier : accueil, dashboard, membres, paiements, présences, boutique
 * - coach : accueil, dashboard, membres (lecture), présences (lecture), cours, mesures
 */
const ROLE_ROUTES: Record<UserRole, AppRoute[]> = {
  admin: [
    'accueil',
    'dashboard',
    'membres',
    'paiements',
    'presences',
    'cours',
    'coachs',
    'equipements',
    'boutique',
    'depenses',
    'mesures',
    'rapports',
    'parametres',
  ],
  caissier: ['accueil', 'dashboard', 'membres', 'paiements', 'presences', 'boutique'],
  coach: ['accueil', 'dashboard', 'membres', 'presences', 'cours', 'mesures'],
};

export function canAccessRoute(role: UserRole | undefined, route: AppRoute): boolean {
  if (route === 'accueil') return true;
  if (!role) return false;
  return ROLE_ROUTES[role]?.includes(route) ?? false;
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrateur';
    case 'caissier':
      return 'Réception / Caissier';
    case 'coach':
      return 'Coach';
  }
}
