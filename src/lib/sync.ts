import { TableName } from '../types/gym';
import {
  getGymConfig,
  getSyncQueue,
  mergeRemoteData,
  removeSyncQueueItems,
  updateSyncQueueItem,
} from './db';

export interface SyncResult {
  ok: boolean;
  syncedCount: number;
  remainingCount: number;
  message: string;
}

let isSyncing = false;

function validateAppsScriptUrl(url: string): string | null {
  const clean = url.trim();
  if (!clean) return 'Veuillez saisir l’URL du Web App Google Apps Script.';
  if (!/^https:\/\/script\.google\.com\//i.test(clean) && !/^https:\/\//i.test(clean)) {
    return 'L’URL doit commencer par https://script.google.com/...';
  }
  if (/\/dev(\?|$)/i.test(clean)) {
    return 'Cette URL se termine par /dev (mode test). Utilisez l’URL de déploiement se terminant par /exec.';
  }
  if (/^https:\/\/script\.google\.com\//i.test(clean) && !/\/exec(\?|$)/i.test(clean)) {
    return 'URL Apps Script incomplète ou invalide : vérifiez qu’elle se termine bien par /exec.';
  }
  return null;
}

function parseRawAppsScriptJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const looksHtml = /^\s*</.test(raw);
    if (looksHtml) {
      throw new Error(
        'Google Apps Script a renvoyé une page HTML (connexion requise) au lieu de JSON. Dans Apps Script : Déployer > Gérer les déploiements > Modifier > « Qui a accès » : sélectionnez « Tout le monde » puis cliquez sur Déployer.'
      );
    }
    throw new Error('Réponse invalide reçue depuis Google Apps Script.');
  }
}

async function appsScriptRequest(
  targetUrl: string,
  options: { method: 'GET' | 'POST'; body?: string }
): Promise<Record<string, unknown>> {
  const fetchInit: RequestInit =
    options.method === 'POST'
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: options.body,
          redirect: 'follow',
        }
      : {
          method: 'GET',
          redirect: 'follow',
        };

  try {
    const directRes = await fetch(targetUrl, fetchInit);
    const raw = await directRes.text();
    return parseRawAppsScriptJson(raw);
  } catch (directErr) {
    // Si le navigateur bloque le fetch cross-origin (CORS / redirection 302 dans iframe / blocage cookies),
    // on passe par le proxy local /api/sheets-proxy (si disponible).
    const isNetworkCorsFailure =
      directErr instanceof TypeError ||
      (directErr instanceof Error && /failed to fetch|networkerror|load failed/i.test(directErr.message));

    if (!isNetworkCorsFailure) {
      throw directErr;
    }

    let proxyRes: Response;
    try {
      proxyRes = await fetch('/api/sheets-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          method: options.method,
          body: options.body,
        }),
      });
    } catch {
      throw new Error(
        'Connexion bloquée vers Google Apps Script (Failed to fetch). Vérifiez dans Apps Script que « Qui a accès » est bien réglé sur « Tout le monde » et que l’URL se termine par /exec.'
      );
    }

    const proxyContentType = proxyRes.headers.get('content-type') || '';
    if (!proxyContentType.includes('application/json')) {
      throw new Error(
        'Connexion bloquée vers Google Apps Script (Failed to fetch). Vérifiez dans Apps Script : Déployer > Gérer les déploiements > Qui a accès : « Tout le monde ».'
      );
    }

    const proxyJson = (await proxyRes.json()) as {
      ok?: boolean;
      error?: string;
      isHtml?: boolean;
      finalUrl?: string;
      body?: string;
    };

    if (!proxyJson.ok) {
      throw new Error(proxyJson.error || 'Erreur de communication avec Google Apps Script.');
    }

    if (proxyJson.isHtml || (proxyJson.finalUrl && proxyJson.finalUrl.includes('accounts.google.com'))) {
      throw new Error(
        'Google demande une authentification (page HTML reçue). Dans Apps Script : Déployer > Gérer les déploiements > Modifier > « Qui a accès » doit être sur « Tout le monde », puis cliquez sur Déployer.'
      );
    }

    return parseRawAppsScriptJson(String(proxyJson.body || ''));
  }
}

/**
 * Teste la connexion avec le Web App Google Apps Script.
 */
export async function testGoogleSheetsConnection(
  url: string,
  key: string
): Promise<{ ok: boolean; message: string; spreadsheetName?: string }> {
  const urlError = validateAppsScriptUrl(url);
  if (urlError) {
    return { ok: false, message: urlError };
  }
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { ok: false, message: 'Veuillez saisir la clé secrète.' };
  }
  try {
    const pingUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=ping&key=${encodeURIComponent(cleanKey)}`;
    const data = await appsScriptRequest(pingUrl, { method: 'GET' });
    if (!data.ok) {
      return {
        ok: false,
        message: String(data.error || 'Connexion refusée par Apps Script.'),
      };
    }
    const spreadsheetName = String(data.spreadsheetName || 'Google Sheets');
    return {
      ok: true,
      message: `Connecté au classeur « ${spreadsheetName} » (16 feuilles vérifiées).`,
      spreadsheetName,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Impossible de joindre le Web App.',
    };
  }
}

/**
 * Envoie la file d'attente (sync_queue) vers Google Sheets dans l'ordre chronologique.
 * Utilise Content-Type: text/plain;charset=utf-8 pour éviter le preflight CORS sur Apps Script.
 */
export async function syncNow(): Promise<SyncResult> {
  if (isSyncing) {
    return {
      ok: false,
      syncedCount: 0,
      remainingCount: (await getSyncQueue()).length,
      message: 'Une synchronisation est déjà en cours.',
    };
  }
  if (!navigator.onLine) {
    return {
      ok: false,
      syncedCount: 0,
      remainingCount: (await getSyncQueue()).length,
      message: 'Appareil hors ligne. Les modifications restent enregistrées en local.',
    };
  }

  const config = await getGymConfig();
  const url = config.apps_script_url.trim();
  const key = config.apps_script_key.trim();

  if (!url || !key) {
    return {
      ok: false,
      syncedCount: 0,
      remainingCount: (await getSyncQueue()).length,
      message: 'Google Sheets non configuré dans Paramètres.',
    };
  }

  const urlError = validateAppsScriptUrl(url);
  if (urlError) {
    return {
      ok: false,
      syncedCount: 0,
      remainingCount: (await getSyncQueue()).length,
      message: urlError,
    };
  }

  const queue = await getSyncQueue();
  if (queue.length === 0) {
    return {
      ok: true,
      syncedCount: 0,
      remainingCount: 0,
      message: 'Toutes les données sont déjà synchronisées.',
    };
  }

  isSyncing = true;
  try {
    // Envoi par paquets de 40 opérations pour rester sous les limites d'exécution Apps Script
    const batchSize = 40;
    let totalApplied = 0;

    for (let i = 0; i < queue.length; i += batchSize) {
      const batch = queue.slice(i, i + batchSize);
      const json = await appsScriptRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          key,
          operations: batch.map((item) => ({
            id: item.id,
            table: item.table,
            action: item.action,
            payload: item.payload,
          })),
        }),
      });
      if (!json.ok) {
        for (const item of batch) {
          await updateSyncQueueItem({
            ...item,
            statut: 'error',
            erreur: String(json.error || 'Erreur serveur Apps Script'),
          });
        }
        return {
          ok: false,
          syncedCount: totalApplied,
          remainingCount: (await getSyncQueue()).length,
          message: String(json.error || 'Erreur lors de la synchronisation.'),
        };
      }

      const okIds: string[] = [];
      const results = Array.isArray(json.results)
        ? (json.results as { id: string; ok: boolean; error?: string }[])
        : [];
      for (const item of batch) {
        const match = results.find((r) => r.id === item.id);
        if (!match || match.ok) {
          okIds.push(item.id);
          totalApplied++;
        } else {
          await updateSyncQueueItem({
            ...item,
            statut: 'error',
            erreur: match.error || 'Opération rejetée',
          });
        }
      }
      await removeSyncQueueItems(okIds);
    }

    const remaining = (await getSyncQueue()).length;
    return {
      ok: remaining === 0,
      syncedCount: totalApplied,
      remainingCount: remaining,
      message: `${totalApplied} élément(s) synchronisé(s) avec Google Sheets.`,
    };
  } catch (err) {
    return {
      ok: false,
      syncedCount: 0,
      remainingCount: (await getSyncQueue()).length,
      message:
        err instanceof Error
          ? err.message
          : 'Erreur réseau lors de la synchronisation.',
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Télécharge les données distantes depuis Google Sheets et applique la résolution par updated_at.
 */
export async function pullFromGoogleSheets(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!navigator.onLine) {
    return { ok: false, message: 'Connexion internet requise pour importer depuis Google Sheets.' };
  }
  const config = await getGymConfig();
  const url = config.apps_script_url.trim();
  const key = config.apps_script_key.trim();

  if (!url || !key) {
    return { ok: false, message: 'Configurez d’abord l’URL et la clé secrète dans Paramètres.' };
  }

  const urlError = validateAppsScriptUrl(url);
  if (urlError) {
    return { ok: false, message: urlError };
  }

  try {
    const pullUrl = `${url}${url.includes('?') ? '&' : '?'}action=pull&key=${encodeURIComponent(key)}`;
    const json = await appsScriptRequest(pullUrl, { method: 'GET' });
    if (!json.ok) {
      return { ok: false, message: String(json.error || 'Erreur lors de la lecture Google Sheets.') };
    }
    const stats = await mergeRemoteData(
      (json.data || {}) as Partial<Record<TableName, Record<string, unknown>[]>>
    );
    return {
      ok: true,
      message: `Import réussi : ${stats.inserted} ajout(s), ${stats.updated} mise(s) à jour, ${stats.skipped} conservé(s) en local.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erreur réseau lors de l’import.',
    };
  }
}
