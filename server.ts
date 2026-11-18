import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import nodemailer from 'nodemailer';
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

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface AccessRequestRecord {
  id: string;
  deviceId: string;
  nomComplet: string;
  telephone: string;
  email: string;
  posteSouhaite: string;
  note: string;
  userAgent: string;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

interface SuperAdminConfig {
  username: string;
  passwordHash: string;
  secret: string;
  updatedAt: string;
}

export interface EmailNotificationLog {
  id: string;
  to: string;
  subject: string;
  channel: 'smtp' | 'apps_script' | 'resend' | 'none';
  status: 'sent' | 'failed' | 'unconfigured';
  detail: string;
  createdAt: string;
}

interface RelayState {
  nom_gym: string;
  adresse: string;
  telephone: string;
  apps_script_url: string;
  apps_script_key: string;
  forfaits: RelayForfaitSummary[];
  pendingMembers: RelayPendingMember[];
  accessGateEnabled: boolean;
  superAdmin: SuperAdminConfig;
  accessRequests: AccessRequestRecord[];
  notificationEmail: string;
  emailNotificationsEnabled: boolean;
  emailLogs: EmailNotificationLog[];
}

function hashSuperAdminPassword(password: string, salt?: string): string {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${usedSalt}:${password}`)
    .digest('hex');
  return `${usedSalt}:${digest}`;
}

function verifySuperAdminPassword(password: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualHex = crypto
    .createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('hex');
  const a = Buffer.from(actualHex, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createDefaultSuperAdmin(): SuperAdminConfig {
  const defaultUsername = (process.env.SUPER_ADMIN_USER || 'superadmin').trim() || 'superadmin';
  const defaultPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2026!';
  return {
    username: defaultUsername,
    passwordHash: hashSuperAdminPassword(defaultPassword),
    secret: crypto.randomBytes(32).toString('hex'),
    updatedAt: new Date().toISOString(),
  };
}

function loadRelayState(): RelayState {
  const defaultSuperAdmin = createDefaultSuperAdmin();
  const defaultNotifEmail =
    (process.env.NOTIFICATION_EMAIL || 'manofthetech22@gmail.com').trim() ||
    'manofthetech22@gmail.com';
  const defaults: RelayState = {
    nom_gym: 'TET DLO FITNESS',
    adresse: '',
    telephone: '',
    apps_script_url: (process.env.APPS_SCRIPT_URL || '').trim(),
    apps_script_key: (process.env.APPS_SCRIPT_KEY || '').trim(),
    forfaits: [],
    pendingMembers: [],
    accessGateEnabled: true,
    superAdmin: defaultSuperAdmin,
    accessRequests: [],
    notificationEmail: defaultNotifEmail,
    emailNotificationsEnabled: true,
    emailLogs: [],
  };
  try {
    if (fs.existsSync(RELAY_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RELAY_STATE_FILE, 'utf-8')) as Partial<RelayState>;
      return {
        ...defaults,
        ...parsed,
        forfaits: Array.isArray(parsed.forfaits) ? parsed.forfaits : [],
        pendingMembers: Array.isArray(parsed.pendingMembers) ? parsed.pendingMembers : [],
        accessGateEnabled:
          typeof parsed.accessGateEnabled === 'boolean' ? parsed.accessGateEnabled : true,
        superAdmin:
          parsed.superAdmin &&
          typeof parsed.superAdmin.username === 'string' &&
          typeof parsed.superAdmin.passwordHash === 'string' &&
          typeof parsed.superAdmin.secret === 'string'
            ? parsed.superAdmin
            : defaultSuperAdmin,
        accessRequests: Array.isArray(parsed.accessRequests) ? parsed.accessRequests : [],
        notificationEmail:
          typeof parsed.notificationEmail === 'string' && parsed.notificationEmail.trim()
            ? parsed.notificationEmail.trim()
            : defaultNotifEmail,
        emailNotificationsEnabled:
          typeof parsed.emailNotificationsEnabled === 'boolean'
            ? parsed.emailNotificationsEnabled
            : true,
        emailLogs: Array.isArray(parsed.emailLogs) ? parsed.emailLogs.slice(0, 20) : [],
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

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequestOrigin(req: express.Request): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  if (host) {
    const proto = forwardedProto || req.protocol || 'https';
    return `${proto}://${host}`;
  }
  return (process.env.APP_URL || '').replace(/\/+$/, '');
}

function isSmtpConfigured(): boolean {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  return Boolean(user && pass);
}

function recordEmailLog(entry: Omit<EmailNotificationLog, 'id' | 'createdAt'>): EmailNotificationLog {
  const full: EmailNotificationLog = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  relayState.emailLogs.unshift(full);
  if (relayState.emailLogs.length > 20) {
    relayState.emailLogs = relayState.emailLogs.slice(0, 20);
  }
  persistRelayState();
  return full;
}

async function sendApprovalNotificationEmail(params: {
  subject: string;
  textBody: string;
  htmlBody: string;
  force?: boolean;
}): Promise<EmailNotificationLog> {
  const to = (
    relayState.notificationEmail ||
    process.env.NOTIFICATION_EMAIL ||
    'manofthetech22@gmail.com'
  ).trim();

  if (!params.force && !relayState.emailNotificationsEnabled) {
    return recordEmailLog({
      to,
      subject: params.subject,
      channel: 'none',
      status: 'unconfigured',
      detail: 'Notifications email désactivées dans la console Super Admin.',
    });
  }

  const smtpUser = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const rawSmtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const smtpPass =
    smtpHost.includes('gmail') && rawSmtpPass.replace(/\s+/g, '').length === 16
      ? rawSmtpPass.replace(/\s+/g, '')
      : rawSmtpPass;
  const parsedPort = Number(process.env.SMTP_PORT || 465);
  const smtpPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;

  if (smtpUser && smtpPass) {
    const portsToTry = smtpHost.includes('gmail')
      ? Array.from(new Set([smtpPort, smtpPort === 465 ? 587 : 465]))
      : [smtpPort];
    let lastSmtpErr = '';

    for (const port of portsToTry) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port,
          secure: port === 465,
          requireTLS: port === 587,
          auth: { user: smtpUser, pass: smtpPass },
          connectionTimeout: 7000,
          greetingTimeout: 7000,
          socketTimeout: 10000,
          tls: { minVersion: 'TLSv1.2' },
        });
        await transporter.sendMail({
          from: `"${relayState.nom_gym || 'GymPro'}" <${smtpUser}>`,
          to,
          subject: params.subject,
          text: params.textBody,
          html: params.htmlBody,
        });
        return recordEmailLog({
          to,
          subject: params.subject,
          channel: 'smtp',
          status: 'sent',
          detail: `Envoyé via SMTP (${smtpHost}:${port}) à ${to}.`,
        });
      } catch (err) {
        lastSmtpErr = err instanceof Error ? err.message : 'Erreur SMTP inconnue.';
      }
    }

    if (!relayState.apps_script_url || !relayState.apps_script_key) {
      return recordEmailLog({
        to,
        subject: params.subject,
        channel: 'smtp',
        status: 'failed',
        detail: `Échec SMTP : ${lastSmtpErr}`,
      });
    }
  }

  if (relayState.apps_script_url && relayState.apps_script_key) {
    try {
      const upstream = await fetch(relayState.apps_script_url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          key: relayState.apps_script_key,
          action: 'send_email',
          to,
          subject: params.subject,
          textBody: params.textBody,
          htmlBody: params.htmlBody,
        }),
      });
      const raw = await upstream.text();
      if (upstream.ok && !/^\s*</.test(raw)) {
        const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
        if (parsed.ok) {
          return recordEmailLog({
            to,
            subject: params.subject,
            channel: 'apps_script',
            status: 'sent',
            detail: `Envoyé via Google Apps Script (MailApp) à ${to}.`,
          });
        }
        return recordEmailLog({
          to,
          subject: params.subject,
          channel: 'apps_script',
          status: 'failed',
          detail:
            parsed.error ||
            'Mettez à jour votre script Google Apps Script avec la dernière version de Code.gs (action send_email).',
        });
      }
      return recordEmailLog({
        to,
        subject: params.subject,
        channel: 'apps_script',
        status: 'failed',
        detail: `Réponse inattendue de Google Apps Script (HTTP ${upstream.status}).`,
      });
    } catch (err) {
      return recordEmailLog({
        to,
        subject: params.subject,
        channel: 'apps_script',
        status: 'failed',
        detail: err instanceof Error ? err.message : 'Erreur relais Google Apps Script.',
      });
    }
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'GymPro <onboarding@resend.dev>',
          to: [to],
          subject: params.subject,
          text: params.textBody,
          html: params.htmlBody,
        }),
      });
      if (res.ok) {
        return recordEmailLog({
          to,
          subject: params.subject,
          channel: 'resend',
          status: 'sent',
          detail: `Envoyé via Resend API à ${to}.`,
        });
      }
      const errTxt = await res.text();
      return recordEmailLog({
        to,
        subject: params.subject,
        channel: 'resend',
        status: 'failed',
        detail: `Échec Resend : ${errTxt.slice(0, 160)}`,
      });
    } catch (err) {
      return recordEmailLog({
        to,
        subject: params.subject,
        channel: 'resend',
        status: 'failed',
        detail: err instanceof Error ? err.message : 'Erreur Resend API.',
      });
    }
  }

  return recordEmailLog({
    to,
    subject: params.subject,
    channel: 'none',
    status: 'unconfigured',
    detail:
      'Aucun transport email configuré sur le serveur (ajoutez SMTP_USER + SMTP_PASS sur Render, ou connectez Google Apps Script avec le nouveau Code.gs).',
  });
}

function buildAccessRequestEmailContent(
  record: AccessRequestRecord,
  superAdminUrl: string,
  isUpdate: boolean
): { subject: string; textBody: string; htmlBody: string } {
  const gym = relayState.nom_gym || 'GymPro';
  const subject = `[${gym}] ${
    isUpdate ? 'Demande d’approbation mise à jour' : 'Nouvelle demande d’approbation d’accès'
  } — ${record.nomComplet}`;

  const textBody = [
    `${gym} — Notification d'approbation d'accès`,
    '',
    `Demandeur : ${record.nomComplet}`,
    `Téléphone : ${record.telephone}`,
    `Email : ${record.email || 'Non renseigné'}`,
    `Poste demandé : ${record.posteSouhaite}`,
    `Note : ${record.note || 'Aucune'}`,
    `ID appareil : ${record.deviceId}`,
    `Date : ${new Date(record.updatedAt).toLocaleString('fr-FR')}`,
    '',
    superAdminUrl
      ? `Ouvrir l'espace Super Admin pour approuver ou refuser : ${superAdminUrl}`
      : 'Ouvrez votre espace Super Admin (?superadmin=1) pour approuver ou refuser.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#0f172a;color:#ffffff;padding:18px 24px;border-bottom:4px solid #ea580c;">
        <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#fb923c;font-weight:bold;">${escapeHtml(gym)} · Espace Super Admin</p>
        <h2 style="margin:6px 0 0;font-size:18px;">Demande d'approbation avant connexion</h2>
      </div>
      <div style="padding:22px 24px;color:#1e293b;font-size:14px;line-height:1.5;">
        <p style="margin-top:0;">Une personne ayant reçu le lien de l'application demande votre approbation pour se connecter :</p>
        <table style="width:100%;border-collapse:collapse;margin:14px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
          <tr><td style="padding:8px 12px;color:#64748b;width:140px;">Nom complet</td><td style="padding:8px 12px;font-weight:bold;">${escapeHtml(record.nomComplet)}</td></tr>
          <tr><td style="padding:8px 12px;color:#64748b;">Téléphone</td><td style="padding:8px 12px;font-weight:bold;">${escapeHtml(record.telephone)}</td></tr>
          <tr><td style="padding:8px 12px;color:#64748b;">Email</td><td style="padding:8px 12px;">${escapeHtml(record.email || '—')}</td></tr>
          <tr><td style="padding:8px 12px;color:#64748b;">Poste demandé</td><td style="padding:8px 12px;">${escapeHtml(record.posteSouhaite)}</td></tr>
          <tr><td style="padding:8px 12px;color:#64748b;">Message</td><td style="padding:8px 12px;">${escapeHtml(record.note || '—')}</td></tr>
          <tr><td style="padding:8px 12px;color:#64748b;">ID appareil</td><td style="padding:8px 12px;font-family:monospace;">${escapeHtml(record.deviceId)}</td></tr>
        </table>
        ${
          superAdminUrl
            ? `<p style="margin:20px 0 6px;"><a href="${escapeHtml(superAdminUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;">Ouvrir l'espace Super Admin</a></p>`
            : ''
        }
        <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Notification automatique envoyée vers ${escapeHtml(relayState.notificationEmail)}.</p>
      </div>
    </div>
  `;

  return { subject, textBody, htmlBody };
}

function signSuperAdminToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', relayState.superAdmin.secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySuperAdminToken(token: string): { valid: boolean; username?: string } {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { valid: false };
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', relayState.superAdmin.secret)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      sub?: string;
      exp?: number;
    };
    if (!decoded.exp || Date.now() > decoded.exp || !decoded.sub) {
      return { valid: false };
    }
    return { valid: true, username: decoded.sub };
  } catch {
    return { valid: false };
  }
}

function requireSuperAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const check = verifySuperAdminToken(token);
  if (!check.valid) {
    res.status(401).json({
      ok: false,
      error: 'Session Super Admin expirée ou non autorisée.',
    });
    return;
  }
  next();
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

  // ============================================================================
  // CONTRÔLE D'ACCÈS AVANT CONNEXION & ESPACE SUPER ADMIN PRIVÉ
  // ============================================================================
  app.get('/api/access/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const deviceId = String(req.query.deviceId || '').trim().slice(0, 128);
    const existing = deviceId
      ? relayState.accessRequests.find((r) => r.deviceId === deviceId) || null
      : null;

    res.json({
      ok: true,
      gateEnabled: relayState.accessGateEnabled,
      status: existing ? existing.status : 'none',
      request: existing
        ? {
            id: existing.id,
            deviceId: existing.deviceId,
            nomComplet: existing.nomComplet,
            telephone: existing.telephone,
            email: existing.email,
            posteSouhaite: existing.posteSouhaite,
            status: existing.status,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            reviewedAt: existing.reviewedAt,
          }
        : null,
    });
  });

  app.post('/api/access/request', async (req, res) => {
    try {
      const b = (req.body || {}) as Record<string, unknown>;
      const deviceId = String(b.deviceId || '').trim().slice(0, 128);
      const nomComplet = String(b.nomComplet || '').trim().slice(0, 120);
      const telephone = String(b.telephone || '').trim().slice(0, 40);
      const email = String(b.email || '').trim().slice(0, 120);
      const posteSouhaite = String(b.posteSouhaite || 'Caissier / Réception').trim().slice(0, 80);
      const note = String(b.note || '').trim().slice(0, 300);

      if (!deviceId || !nomComplet || !telephone) {
        res.status(400).json({
          ok: false,
          error: 'Identifiant appareil, nom complet et téléphone sont obligatoires.',
        });
        return;
      }

      const now = new Date().toISOString();
      const userAgent = String(req.headers['user-agent'] || '').slice(0, 180);
      const existing = relayState.accessRequests.find((r) => r.deviceId === deviceId);

      if (existing) {
        if (existing.status === 'approved') {
          res.json({
            ok: true,
            gateEnabled: relayState.accessGateEnabled,
            status: existing.status,
            request: existing,
          });
          return;
        }
        existing.nomComplet = nomComplet;
        existing.telephone = telephone;
        existing.email = email;
        existing.posteSouhaite = posteSouhaite;
        existing.note = note;
        existing.userAgent = userAgent || existing.userAgent;
        existing.status = 'pending';
        existing.updatedAt = now;
        persistRelayState();

        const origin = getRequestOrigin(req);
        const superAdminUrl = origin ? `${origin}/?superadmin=1` : '';
        const mail = buildAccessRequestEmailContent(existing, superAdminUrl, true);
        await Promise.race([
          sendApprovalNotificationEmail(mail),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);

        res.json({
          ok: true,
          gateEnabled: relayState.accessGateEnabled,
          status: existing.status,
          request: existing,
        });
        return;
      }

      const record: AccessRequestRecord = {
        id: crypto.randomUUID(),
        deviceId,
        nomComplet,
        telephone,
        email,
        posteSouhaite,
        note,
        userAgent,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      relayState.accessRequests.unshift(record);
      if (relayState.accessRequests.length > 500) {
        relayState.accessRequests = relayState.accessRequests.slice(0, 500);
      }
      persistRelayState();

      const origin = getRequestOrigin(req);
      const superAdminUrl = origin ? `${origin}/?superadmin=1` : '';
      const mail = buildAccessRequestEmailContent(record, superAdminUrl, false);
      await Promise.race([
        sendApprovalNotificationEmail(mail),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      res.json({
        ok: true,
        gateEnabled: relayState.accessGateEnabled,
        status: record.status,
        request: record,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Erreur serveur lors de l’envoi de la demande d’approbation.',
      });
    }
  });

  app.post('/api/super-admin/login', (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const username = String(b.username || '').trim();
    const password = String(b.password || '');

    if (
      !username ||
      !password ||
      username.toLowerCase() !== relayState.superAdmin.username.toLowerCase() ||
      !verifySuperAdminPassword(password, relayState.superAdmin.passwordHash)
    ) {
      res.status(401).json({
        ok: false,
        error: 'Identifiant ou mot de passe Super Admin invalide.',
      });
      return;
    }

    const token = signSuperAdminToken(relayState.superAdmin.username);
    res.json({
      ok: true,
      token,
      username: relayState.superAdmin.username,
    });
  });

  app.get('/api/super-admin/overview', requireSuperAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      gateEnabled: relayState.accessGateEnabled,
      username: relayState.superAdmin.username,
      updatedAt: relayState.superAdmin.updatedAt,
      requests: relayState.accessRequests,
      notificationEmail: relayState.notificationEmail,
      emailNotificationsEnabled: relayState.emailNotificationsEnabled,
      smtpConfigured: isSmtpConfigured(),
      appsScriptConfigured: Boolean(relayState.apps_script_url && relayState.apps_script_key),
      emailLogs: relayState.emailLogs,
    });
  });

  app.post('/api/super-admin/notifications/config', requireSuperAdmin, (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const email = String(b.notificationEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, error: 'Adresse email de notification invalide.' });
      return;
    }
    if (email) {
      relayState.notificationEmail = email;
    }
    if (typeof b.emailNotificationsEnabled === 'boolean') {
      relayState.emailNotificationsEnabled = b.emailNotificationsEnabled;
    }
    persistRelayState();
    res.json({
      ok: true,
      notificationEmail: relayState.notificationEmail,
      emailNotificationsEnabled: relayState.emailNotificationsEnabled,
    });
  });

  app.post('/api/super-admin/notifications/test', requireSuperAdmin, async (req, res) => {
    const gym = relayState.nom_gym || 'GymPro';
    const origin = getRequestOrigin(req);
    const superAdminUrl = origin ? `${origin}/?superadmin=1` : '';
    const log = await sendApprovalNotificationEmail({
      force: true,
      subject: `[${gym}] Test de notification email Super Admin`,
      textBody: [
        `Ceci est un email de test envoyé depuis l'espace Super Admin de ${gym}.`,
        `Destinataire configuré : ${relayState.notificationEmail}`,
        superAdminUrl ? `Console Super Admin : ${superAdminUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      htmlBody: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:16px 22px;border-bottom:4px solid #ea580c;">
            <h2 style="margin:0;font-size:17px;">${escapeHtml(gym)} — Test de notification réussi</h2>
          </div>
          <div style="padding:20px 22px;color:#1e293b;font-size:14px;">
            <p>Les alertes d'approbation seront envoyées automatiquement vers <strong>${escapeHtml(relayState.notificationEmail)}</strong>.</p>
            ${
              superAdminUrl
                ? `<p><a href="${escapeHtml(superAdminUrl)}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Ouvrir l'espace Super Admin</a></p>`
                : ''
            }
          </div>
        </div>
      `,
    });

    res.json({
      ok: log.status === 'sent',
      log,
      emailLogs: relayState.emailLogs,
    });
  });

  app.post('/api/super-admin/gate', requireSuperAdmin, (req, res) => {
    const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
    relayState.accessGateEnabled = enabled;
    persistRelayState();
    res.json({ ok: true, gateEnabled: relayState.accessGateEnabled });
  });

  app.post('/api/super-admin/authorize-device', requireSuperAdmin, (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const deviceId = String(b.deviceId || '').trim().slice(0, 128);
    if (!deviceId) {
      res.status(400).json({ ok: false, error: 'Identifiant appareil manquant.' });
      return;
    }
    const now = new Date().toISOString();
    const existing = relayState.accessRequests.find((r) => r.deviceId === deviceId);
    if (existing) {
      existing.status = 'approved';
      existing.updatedAt = now;
      existing.reviewedAt = now;
    } else {
      relayState.accessRequests.unshift({
        id: crypto.randomUUID(),
        deviceId,
        nomComplet: String(b.nomComplet || 'Super Admin — Poste principal').trim(),
        telephone: String(b.telephone || 'Poste autorisé').trim(),
        email: '',
        posteSouhaite: 'Direction / Super Admin',
        note: 'Appareil autorisé directement depuis l’espace Super Admin',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 180),
        status: 'approved',
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
      });
    }
    persistRelayState();
    res.json({ ok: true, requests: relayState.accessRequests });
  });

  app.post('/api/super-admin/requests/:id/decision', requireSuperAdmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    const action = String((req.body as { action?: string })?.action || '').trim();
    const now = new Date().toISOString();

    if (action === 'delete') {
      relayState.accessRequests = relayState.accessRequests.filter((r) => r.id !== id);
      persistRelayState();
      res.json({ ok: true, requests: relayState.accessRequests });
      return;
    }

    const target = relayState.accessRequests.find((r) => r.id === id);
    if (!target) {
      res.status(404).json({ ok: false, error: 'Demande introuvable.' });
      return;
    }

    const nextStatusMap: Record<string, AccessRequestStatus> = {
      approve: 'approved',
      reject: 'rejected',
      revoke: 'revoked',
      pending: 'pending',
    };
    const nextStatus = nextStatusMap[action];
    if (!nextStatus) {
      res.status(400).json({ ok: false, error: 'Action invalide.' });
      return;
    }

    target.status = nextStatus;
    target.updatedAt = now;
    target.reviewedAt = now;
    persistRelayState();

    if (nextStatus === 'approved' || nextStatus === 'rejected' || nextStatus === 'revoked') {
      const gym = relayState.nom_gym || 'GymPro';
      const actionLabel =
        nextStatus === 'approved'
          ? 'Accès approuvé'
          : nextStatus === 'rejected'
          ? 'Demande refusée'
          : 'Accès révoqué';
      void sendApprovalNotificationEmail({
        subject: `[${gym}] ${actionLabel} — ${target.nomComplet}`,
        textBody: `${actionLabel} pour ${target.nomComplet} (${target.telephone}) · Appareil : ${target.deviceId}`,
        htmlBody: `<p><strong>${escapeHtml(actionLabel)}</strong> pour <strong>${escapeHtml(target.nomComplet)}</strong> (${escapeHtml(target.telephone)}) · Poste : ${escapeHtml(target.posteSouhaite)} · Appareil : <code>${escapeHtml(target.deviceId)}</code></p>`,
      });
    }

    res.json({ ok: true, requests: relayState.accessRequests });
  });

  app.post('/api/super-admin/credentials', requireSuperAdmin, (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const currentPassword = String(b.currentPassword || '');
    const newUsername = String(b.newUsername || '').trim();
    const newPassword = String(b.newPassword || '');

    if (!verifySuperAdminPassword(currentPassword, relayState.superAdmin.passwordHash)) {
      res.status(400).json({ ok: false, error: 'Mot de passe actuel incorrect.' });
      return;
    }

    if (newUsername) {
      if (newUsername.length < 3) {
        res.status(400).json({
          ok: false,
          error: 'L’identifiant doit contenir au moins 3 caractères.',
        });
        return;
      }
      relayState.superAdmin.username = newUsername;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({
          ok: false,
          error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
        });
        return;
      }
      relayState.superAdmin.passwordHash = hashSuperAdminPassword(newPassword);
      relayState.superAdmin.secret = crypto.randomBytes(32).toString('hex');
    }

    relayState.superAdmin.updatedAt = new Date().toISOString();
    persistRelayState();
    const token = signSuperAdminToken(relayState.superAdmin.username);
    res.json({
      ok: true,
      token,
      username: relayState.superAdmin.username,
    });
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

      const origin = getRequestOrigin(req);
      const gym = relayState.nom_gym || 'GymPro';
      void sendApprovalNotificationEmail({
        subject: `[${gym}] Nouvelle inscription membre QR en attente — ${member.prenom} ${member.nom}`,
        textBody: [
          `Un nouveau membre s'est inscrit via le lien/QR Code et attend la validation administrateur :`,
          `Nom : ${member.prenom} ${member.nom}`,
          `Code : ${member.code_membre}`,
          `Téléphone : ${member.telephone}`,
          `Email : ${member.email || '—'}`,
          origin ? `Application : ${origin}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        htmlBody: `<p>Nouvelle inscription membre par QR Code en attente de validation :</p><ul><li><strong>Nom :</strong> ${escapeHtml(member.prenom)} ${escapeHtml(member.nom)}</li><li><strong>Code :</strong> ${escapeHtml(member.code_membre)}</li><li><strong>Téléphone :</strong> ${escapeHtml(member.telephone)}</li><li><strong>Email :</strong> ${escapeHtml(member.email || '—')}</li></ul>`,
      });

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

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GymPro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
