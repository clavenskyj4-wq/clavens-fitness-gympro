import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const RELAY_STATE_FILE = path.resolve(
  process.env.GYMPRO_RELAY_STATE_FILE || path.join(__dirname, '.gympro-relay-state.json')
);

interface RelayForfaitSummary {
  id: string;
  nom: string;
  prix: number;
  devise: string;
  duree_jours: number;
}

interface RelayPendingMember {
  id: string;
  code_membre: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F' | 'Autre';
  date_naissance: string;
  telephone: string;
  email: string;
  adresse: string;
  photo: string;
  contact_urgence_nom: string;
  contact_urgence_tel: string;
  objectif: string;
  notes_sante: string;
  date_inscription: string;
  statut: 'en_attente';
  coach_id: string;
  tarif_coach: number;
  created_at: string;
  updated_at: string;
  deleted: 0 | 1;
}

interface RelayState {
  nom_gym: string;
  adresse: string;
  telephone: string;
  apps_script_url: string;
  apps_script_key: string;
  forfaits: RelayForfaitSummary[];
  pendingMembers: RelayPendingMember[];
  approvedMembers: RelayPendingMember[];
}

function loadRelayState(): RelayState {
  const defaults: RelayState = {
    nom_gym: 'TET DLO FITNESS',
    adresse: '',
    telephone: '',
    apps_script_url: '',
    apps_script_key: '',
    forfaits: [],
    pendingMembers: [],
    approvedMembers: [],
  };
  try {
    if (fs.existsSync(RELAY_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RELAY_STATE_FILE, 'utf-8')) as Partial<RelayState>;
      return {
        ...defaults,
        ...parsed,
        forfaits: Array.isArray(parsed.forfaits) ? parsed.forfaits : [],
        pendingMembers: Array.isArray(parsed.pendingMembers) ? parsed.pendingMembers : [],
        approvedMembers: Array.isArray(parsed.approvedMembers) ? parsed.approvedMembers : [],
      };
    }
  } catch {
    // ignore corrupt cache file
  }
  return defaults;
}

let relayState: RelayState = loadRelayState();

function persistRelayState(): void {
  fs.writeFileSync(RELAY_STATE_FILE, JSON.stringify(relayState, null, 2), 'utf-8');
}

async function pushRelayMemberToSheets(
  payload: RelayPendingMember
): Promise<boolean> {
  if (!relayState.apps_script_url || !relayState.apps_script_key) return false;
  try {
    const upstream = await fetch(relayState.apps_script_url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        key: relayState.apps_script_key,
        table: 'Membres',
        action: 'upsert',
        payload,
      }),
    });
    const result = (await upstream.json()) as {
      ok?: boolean;
      results?: Array<{ ok?: boolean }>;
    };
    const results = result.results || [];
    return upstream.ok && result.ok === true && results.length > 0 && results.every((item) => item.ok);
  } catch {
    return false;
  }
}

const SUPER_ADMIN_SESSION_SECRET =
  process.env.GYMPRO_SUPER_ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SUPER_ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function safeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSuperAdminPayload(payload: string): string {
  return crypto.createHmac('sha256', SUPER_ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

function createSuperAdminToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      expiresAt: Math.floor(Date.now() / 1000) + SUPER_ADMIN_SESSION_TTL_SECONDS,
    })
  ).toString('base64url');
  return `${payload}.${signSuperAdminPayload(payload)}`;
}

function isSuperAdminRequest(authorization: string | undefined): boolean {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  if (!safeStringEquals(signature, signSuperAdminPayload(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      username?: string;
      expiresAt?: number;
    };
    return (
      parsed.username === process.env.GYMPRO_SUPER_ADMIN_USER?.trim() &&
      Number.isFinite(parsed.expiresAt) &&
      Number(parsed.expiresAt) > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function getBuildVersionToken(): string {
  if (!isProduction) return 'dev';
  try {
    const indexHtml = path.resolve(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexHtml)) {
      const content = fs.readFileSync(indexHtml);
      return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
  } catch {
    // ignore read error
  }
  return 'prod';
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/app-version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true, version: getBuildVersionToken() });
  });

  /**
   * Synchronise les infos publiques du gym et le pont Google Sheets côté serveur
   * pour permettre aux inscriptions à distance par QR Code de fonctionner sans exposer la clé secrète.
   */
  app.post('/api/public-registration/config', (req, res) => {
    if (!isSuperAdminRequest(req.header('authorization'))) {
      res.status(401).json({ ok: false, error: 'Authentification super admin requise.' });
      return;
    }
    const body = (req.body || {}) as {
      nom_gym?: unknown;
      adresse?: unknown;
      telephone?: unknown;
      apps_script_url?: unknown;
      apps_script_key?: unknown;
      forfaits?: unknown;
    };
    const previousState = { ...relayState };
    try {
      if (typeof body.nom_gym === 'string' && body.nom_gym.trim()) {
        relayState.nom_gym = body.nom_gym.trim();
      }
      if (typeof body.adresse === 'string') {
        relayState.adresse = body.adresse.trim();
      }
      if (typeof body.telephone === 'string') {
        relayState.telephone = body.telephone.trim();
      }
      if (typeof body.apps_script_url === 'string' && body.apps_script_url.trim()) {
        relayState.apps_script_url = body.apps_script_url.trim();
      }
      if (typeof body.apps_script_key === 'string' && body.apps_script_key.trim()) {
        relayState.apps_script_key = body.apps_script_key.trim();
      }
      if (Array.isArray(body.forfaits)) {
        relayState.forfaits = body.forfaits.slice(0, 30);
      }
      persistRelayState();
      res.json({ ok: true });
    } catch (error) {
      relayState = previousState;
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Impossible d’enregistrer la configuration.',
      });
    }
  });

  app.get('/api/public-registration/info', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      nom_gym: relayState.nom_gym,
      adresse: relayState.adresse,
      telephone: relayState.telephone,
      forfaits: relayState.forfaits,
      hasSheetsBridge: Boolean(relayState.apps_script_url && relayState.apps_script_key),
    });
  });

  app.post('/api/super-admin/login', (req, res) => {
      const now = Date.now();
      const address = req.ip || 'unknown';
      const attempt = failedLoginAttempts.get(address);
      if (attempt && attempt.resetAt > now && attempt.count >= 10) {
        res.status(429).json({ ok: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
        return;
      }

      const configuredUsername = process.env.GYMPRO_SUPER_ADMIN_USER?.trim();
      const configuredPassword = process.env.GYMPRO_SUPER_ADMIN_PASSWORD;
      if (!configuredUsername || !configuredPassword) {
        res.status(503).json({
          ok: false,
          error: 'Accès super admin non configuré sur le serveur.',
        });
        return;
      }

      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      if (
        !safeStringEquals(username.toLowerCase(), configuredUsername.toLowerCase()) ||
        !safeStringEquals(password, configuredPassword)
      ) {
        const current =
          attempt && attempt.resetAt > now
            ? attempt
            : { count: 0, resetAt: now + 15 * 60 * 1000 };
        current.count += 1;
        if (failedLoginAttempts.size > 1000) {
          for (const [key, value] of failedLoginAttempts) {
            if (value.resetAt <= now) failedLoginAttempts.delete(key);
          }
        }
        failedLoginAttempts.set(address, current);
        res.status(401).json({ ok: false, error: 'Identifiants super admin invalides.' });
        return;
      }

      failedLoginAttempts.delete(address);
      res.json({
        ok: true,
        token: createSuperAdminToken(configuredUsername),
        expiresIn: SUPER_ADMIN_SESSION_TTL_SECONDS,
      });
  });

  app.get('/api/super-admin/requests', (req, res) => {
      if (!isSuperAdminRequest(req.header('authorization'))) {
        res.status(401).json({ ok: false, error: 'Authentification super admin requise.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        pending: relayState.pendingMembers,
        approved: relayState.approvedMembers,
      });
  });

  app.post('/api/super-admin/requests/:id/:decision', async (req, res) => {
    if (!isSuperAdminRequest(req.header('authorization'))) {
      res.status(401).json({ ok: false, error: 'Authentification super admin requise.' });
      return;
    }

    const { id, decision } = req.params;
    const previousPending = relayState.pendingMembers;
    const previousApproved = relayState.approvedMembers;
    try {
      const pendingIndex = relayState.pendingMembers.findIndex((member) => member.id === id);
      const approvedIndex = relayState.approvedMembers.findIndex((member) => member.id === id);

      if (decision === 'approve') {
        if (pendingIndex >= 0) {
          const member = relayState.pendingMembers[pendingIndex];
          relayState.pendingMembers = relayState.pendingMembers.filter((item) => item.id !== id);
          if (!relayState.approvedMembers.some((item) => item.id === member.id)) {
            relayState.approvedMembers = [member, ...relayState.approvedMembers];
          }
          persistRelayState();
          res.json({ ok: true, member });
          return;
        }
        if (approvedIndex >= 0) {
          res.json({ ok: true, member: relayState.approvedMembers[approvedIndex] });
          return;
        }
        res.status(404).json({ ok: false, error: 'Demande introuvable ou déjà traitée.' });
        return;
      }

      if (decision === 'reject') {
        if (pendingIndex < 0) {
          res.status(404).json({ ok: false, error: 'Demande introuvable ou déjà traitée.' });
          return;
        }
        const member = relayState.pendingMembers[pendingIndex];
        if (relayState.apps_script_url && relayState.apps_script_key) {
          const removedFromSheets = await pushRelayMemberToSheets({
            ...member,
            deleted: 1,
            updated_at: new Date().toISOString(),
          });
          if (!removedFromSheets) {
            res.status(502).json({
              ok: false,
              error: 'Refus non terminé : impossible de mettre à jour Google Sheets. Réessayez.',
            });
            return;
          }
        }
        relayState.pendingMembers = relayState.pendingMembers.filter((item) => item.id !== id);
        persistRelayState();
        res.json({ ok: true });
        return;
      }

      if (decision === 'complete') {
        if (approvedIndex < 0) {
          res.json({ ok: true });
          return;
        }
        relayState.approvedMembers = relayState.approvedMembers.filter((item) => item.id !== id);
        persistRelayState();
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ ok: false, error: 'Décision inconnue.' });
    } catch (error) {
      relayState.pendingMembers = previousPending;
      relayState.approvedMembers = previousApproved;
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Impossible d’enregistrer la décision.',
      });
    }
  });

  app.post('/api/public-registration/submit', async (req, res) => {
    let previousPending: RelayPendingMember[] | undefined;
    try {
      const b = (req.body || {}) as Record<string, unknown>;
      const prenom = String(b.prenom || '').trim();
      const nom = String(b.nom || '').trim();
      const telephone = String(b.telephone || '').trim();
      if (!prenom || !nom || !telephone) {
        res.status(400).json({
          ok: false,
          error: 'Le prénom, le nom et le téléphone sont obligatoires.',
        });
        return;
      }

      const sexeRaw = String(b.sexe || 'M');
      const sexe: 'M' | 'F' | 'Autre' =
        sexeRaw === 'F' || sexeRaw === 'Autre' ? sexeRaw : 'M';
      const nowIso = new Date().toISOString();
      const todayIso = nowIso.slice(0, 10);
      const codeMembre = `DEM-${Math.floor(1000 + Math.random() * 9000)}`;
      const forfaitSouhaite = String(b.forfait_souhaite || '').trim();
      const notesBase = String(b.notes_sante || '').trim();
      const notesFinal = forfaitSouhaite
        ? `[Forfait souhaité : ${forfaitSouhaite}]${notesBase ? ` ${notesBase}` : ''}`
        : notesBase;

      const member: RelayPendingMember = {
        id: crypto.randomUUID(),
        code_membre: codeMembre,
        nom,
        prenom,
        sexe,
        date_naissance: String(b.date_naissance || '').trim(),
        telephone,
        email: String(b.email || '').trim(),
        adresse: String(b.adresse || '').trim(),
        photo: String(b.photo || ''),
        contact_urgence_nom: String(b.contact_urgence_nom || '').trim(),
        contact_urgence_tel: String(b.contact_urgence_tel || '').trim(),
        objectif: String(b.objectif || '').trim(),
        notes_sante: notesFinal,
        date_inscription: todayIso,
        statut: 'en_attente',
        coach_id: '',
        tarif_coach: 0,
        created_at: nowIso,
        updated_at: nowIso,
        deleted: 0,
      };

      previousPending = relayState.pendingMembers;
      relayState.pendingMembers = [member, ...previousPending].slice(0, 200);
      persistRelayState();

      let syncedToSheets = false;
      if (relayState.apps_script_url && relayState.apps_script_key) {
        syncedToSheets = await pushRelayMemberToSheets(member);
      }

      res.json({
        ok: true,
        member,
        syncedToSheets,
      });
    } catch (err) {
      if (previousPending) relayState.pendingMembers = previousPending;
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer la demande d’inscription.',
      });
    }
  });

  /**
   * Proxy serveur pour Google Apps Script Web App.
   * Permet d'éviter les blocages CORS / redirections 302 cross-origin dans les navigateurs et iframes,
   * et de diagnostiquer précisément si Google renvoie une page de connexion HTML ("Qui a accès" != "Tout le monde").
   */
  app.post('/api/sheets-proxy', async (req, res) => {
    try {
      const targetUrl = String(req.body?.targetUrl || '').trim();
      const method = req.body?.method === 'POST' ? 'POST' : 'GET';
      const payloadBody = req.body?.body;

      if (
        !targetUrl ||
        (!/^https:\/\/script\.google\.com\//i.test(targetUrl) &&
          !/^https:\/\/script\.googleusercontent\.com\//i.test(targetUrl))
      ) {
        res.status(400).json({
          ok: false,
          error: 'URL Google Apps Script invalide (doit commencer par https://script.google.com/).',
        });
        return;
      }

      const fetchInit: RequestInit = {
        method,
        redirect: 'follow',
      };

      if (method === 'POST') {
        fetchInit.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        fetchInit.body =
          typeof payloadBody === 'string'
            ? payloadBody
            : JSON.stringify(payloadBody ?? {});
      }

      const upstream = await fetch(targetUrl, fetchInit);
      const rawText = await upstream.text();
      const contentType = upstream.headers.get('content-type') || '';
      const isHtml =
        /^\s*</.test(rawText) ||
        contentType.includes('text/html') ||
        upstream.url.includes('accounts.google.com');

      res.json({
        ok: true,
        status: upstream.status,
        finalUrl: upstream.url,
        isHtml,
        body: rawText,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? `Erreur proxy vers Google Apps Script : ${err.message}`
            : 'Erreur proxy vers Google Apps Script.',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build introuvable.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GymPro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
