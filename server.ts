import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const RELAY_STATE_FILE = path.resolve(__dirname, '.gympro-relay-state.json');

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
  deleted: 0;
}

interface RelayState {
  nom_gym: string;
  adresse: string;
  telephone: string;
  apps_script_url: string;
  apps_script_key: string;
  forfaits: RelayForfaitSummary[];
  pendingMembers: RelayPendingMember[];
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
  };
  try {
    if (fs.existsSync(RELAY_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RELAY_STATE_FILE, 'utf-8')) as Partial<RelayState>;
      return {
        ...defaults,
        ...parsed,
        forfaits: Array.isArray(parsed.forfaits) ? parsed.forfaits : [],
        pendingMembers: Array.isArray(parsed.pendingMembers) ? parsed.pendingMembers : [],
      };
    }
  } catch {
    // ignore corrupt cache file
  }
  return defaults;
}

let relayState: RelayState = loadRelayState();

function persistRelayState(): void {
  try {
    fs.writeFileSync(RELAY_STATE_FILE, JSON.stringify(relayState, null, 2), 'utf-8');
  } catch {
    // ignore read-only disk environments
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
    const body = (req.body || {}) as Partial<RelayState>;
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

  app.post('/api/public-registration/submit', async (req, res) => {
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

      relayState.pendingMembers.unshift(member);
      if (relayState.pendingMembers.length > 200) {
        relayState.pendingMembers = relayState.pendingMembers.slice(0, 200);
      }
      persistRelayState();

      let syncedToSheets = false;
      if (relayState.apps_script_url && relayState.apps_script_key) {
        try {
          const upstream = await fetch(relayState.apps_script_url, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              key: relayState.apps_script_key,
              action: 'push',
              table: 'Membres',
              op: 'upsert',
              record: member,
            }),
          });
          const txt = await upstream.text();
          if (upstream.ok && !/^\s*</.test(txt)) {
            const parsed = JSON.parse(txt) as { ok?: boolean };
            if (parsed.ok) syncedToSheets = true;
          }
        } catch {
          // Conservé en file locale serveur pour récupération par l'administrateur
        }
      }

      res.json({
        ok: true,
        member,
        syncedToSheets,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer la demande d’inscription.',
      });
    }
  });

  app.get('/api/public-registration/pending', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      items: relayState.pendingMembers,
    });
  });

  app.post('/api/public-registration/resolve', (req, res) => {
    const id = String((req.body as { id?: string })?.id || '').trim();
    if (id) {
      relayState.pendingMembers = relayState.pendingMembers.filter((m) => m.id !== id);
      persistRelayState();
    }
    res.json({ ok: true });
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
