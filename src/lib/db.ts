import {
  AutoBackupMode,
  AutoBackupSnapshot,
  BaseRecord,
  GymConfig,
  JournalEntry,
  Parametre,
  SyncQueueItem,
  TableName,
} from '../types/gym';
import { DEFAULT_GYM_CONFIG, generateUUID } from './utils';

const DB_NAME = 'GymProLocalDB';
const DB_VERSION = 2;

export const ALL_TABLES: TableName[] = [
  'Membres',
  'Forfaits',
  'Abonnements',
  'Paiements',
  'Presences',
  'Coachs',
  'Cours',
  'Reservations',
  'Equipements',
  'Produits',
  'Ventes',
  'Depenses',
  'Mesures',
  'Utilisateurs',
  'Parametres',
  'Journal',
];

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export function subscribeDBChange(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyDBChange(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore listener errors
    }
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const table of ALL_TABLES) {
        if (!db.objectStoreNames.contains(table)) {
          const keyPath = table === 'Parametres' ? 'cle' : 'id';
          db.createObjectStore(table, { keyPath });
        }
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id' });
        sq.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('auto_backups')) {
        db.createObjectStore('auto_backups', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erreur ouverture IndexedDB'));
  });
  return dbPromise;
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erreur IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaction IndexedDB échouée'));
    tx.onabort = () => reject(tx.error || new Error('Transaction IndexedDB annulée'));
  });
}

/**
 * Lit tous les enregistrements actifs (deleted !== 1) d'une table.
 */
export async function getAllRecords<T extends BaseRecord>(
  table: TableName,
  includeDeleted = false
): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(table, 'readonly');
  const store = tx.objectStore(table);
  const all = (await idbReq(store.getAll())) as T[];
  return includeDeleted ? all : all.filter((item) => item.deleted !== 1);
}

/**
 * Récupère un enregistrement par clé primaire (id ou cle).
 */
export async function getRecordByKey<T extends BaseRecord>(
  table: TableName,
  key: string
): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(table, 'readonly');
  const store = tx.objectStore(table);
  return (await idbReq(store.get(key))) as T | undefined;
}

/**
 * Crée ou met à jour un enregistrement localement ET ajoute l'opération dans sync_queue.
 */
export async function saveRecord<T extends BaseRecord>(
  table: TableName,
  data: Partial<T> & Record<string, unknown>,
  options?: { skipQueue?: boolean }
): Promise<T> {
  const db = await openDB();
  const now = new Date().toISOString();
  const keyField = table === 'Parametres' ? 'cle' : 'id';
  const existingKey = String(data[keyField] || '');

  let existing: T | undefined;
  if (existingKey) {
    existing = await getRecordByKey<T>(table, existingKey);
  }

  const record = {
    ...(existing || {}),
    ...data,
    id: (data.id as string) || existing?.id || generateUUID(),
    created_at: existing?.created_at || (data.created_at as string) || now,
    updated_at: now,
    deleted: (data.deleted ?? existing?.deleted ?? 0) as 0 | 1,
  } as unknown as T;

  const storesToOpen = options?.skipQueue ? [table] : [table, 'sync_queue'];
  const tx = db.transaction(storesToOpen, 'readwrite');
  tx.objectStore(table).put(record);

  if (!options?.skipQueue) {
    const queueItem: SyncQueueItem = {
      id: generateUUID(),
      table,
      action: record.deleted === 1 ? 'delete' : 'upsert',
      payload: record as unknown as Record<string, unknown>,
      timestamp: now,
      statut: 'pending',
    };
    tx.objectStore('sync_queue').put(queueItem);
  }

  await txDone(tx);
  notifyDBChange();
  return record;
}

/**
 * Suppression logique (deleted = 1) + mise en file sync_queue.
 */
export async function softDeleteRecord(table: TableName, key: string): Promise<void> {
  const existing = await getRecordByKey<BaseRecord>(table, key);
  if (!existing) return;
  await saveRecord(table, {
    ...existing,
    deleted: 1,
  });
}

/**
 * Ajoute une entrée dans le journal de traçabilité local.
 */
export async function logAction(
  utilisateur: string,
  action: string,
  details: string
): Promise<void> {
  const now = new Date().toISOString();
  await saveRecord<JournalEntry>('Journal', {
    id: generateUUID(),
    date_heure: now,
    utilisateur: utilisateur || 'système',
    action,
    details,
  });
}

/**
 * Lit toute la file de synchronisation triée par timestamp croissant.
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const items = (await idbReq(tx.objectStore('sync_queue').getAll())) as SyncQueueItem[];
  return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function removeSyncQueueItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  for (const id of ids) {
    store.delete(id);
  }
  await txDone(tx);
  notifyDBChange();
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  tx.objectStore('sync_queue').put(item);
  await txDone(tx);
  notifyDBChange();
}

export async function clearSyncQueue(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  tx.objectStore('sync_queue').clear();
  await txDone(tx);
  notifyDBChange();
}

/**
 * Place tous les enregistrements locaux dans la file de synchronisation
 * (utile lors de la première connexion à un classeur Google Sheets).
 */
export async function enqueueAllForSync(): Promise<number> {
  const db = await openDB();
  const existingQueue = await getSyncQueue();
  const queuedKeys = new Set(
    existingQueue.map((item) => {
      const kf = item.table === 'Parametres' ? 'cle' : 'id';
      return `${item.table}:${String(item.payload[kf] || item.payload.id || '')}`;
    })
  );

  const toAdd: SyncQueueItem[] = [];
  const now = new Date().toISOString();

  for (const table of ALL_TABLES) {
    const rows = await getAllRecords<BaseRecord>(table, true);
    const keyField = table === 'Parametres' ? 'cle' : 'id';
    for (const row of rows) {
      const rowKey = String((row as unknown as Record<string, unknown>)[keyField] || row.id || '');
      if (!rowKey) continue;
      const sig = `${table}:${rowKey}`;
      if (queuedKeys.has(sig)) continue;
      queuedKeys.add(sig);
      toAdd.push({
        id: generateUUID(),
        table,
        action: row.deleted === 1 ? 'delete' : 'upsert',
        payload: row as unknown as Record<string, unknown>,
        timestamp: row.updated_at || now,
        statut: 'pending',
      });
    }
  }

  if (toAdd.length > 0) {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    for (const item of toAdd) {
      store.put(item);
    }
    await txDone(tx);
    notifyDBChange();
  }

  return toAdd.length;
}

/**
 * Charge la configuration du gym depuis la table Parametres.
 */
export async function getGymConfig(): Promise<GymConfig> {
  const rows = await getAllRecords<Parametre>('Parametres');
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.cle] = r.valeur;
  }
  return {
    nom_gym: map.nom_gym || DEFAULT_GYM_CONFIG.nom_gym,
    logo: map.logo || DEFAULT_GYM_CONFIG.logo,
    adresse: map.adresse || DEFAULT_GYM_CONFIG.adresse,
    telephone: map.telephone || DEFAULT_GYM_CONFIG.telephone,
    email_gym: map.email_gym ?? DEFAULT_GYM_CONFIG.email_gym,
    horaires_ouverture: map.horaires_ouverture ?? DEFAULT_GYM_CONFIG.horaires_ouverture,
    devise_defaut: (map.devise_defaut as 'HTG' | 'USD') || DEFAULT_GYM_CONFIG.devise_defaut,
    taux_change: Number(map.taux_change) || DEFAULT_GYM_CONFIG.taux_change,
    frais_inscription:
      map.frais_inscription !== undefined
        ? Number(map.frais_inscription)
        : DEFAULT_GYM_CONFIG.frais_inscription,
    tarif_coach_defaut:
      map.tarif_coach_defaut !== undefined
        ? Number(map.tarif_coach_defaut)
        : DEFAULT_GYM_CONFIG.tarif_coach_defaut,
    palette_couleur:
      (map.palette_couleur as GymConfig['palette_couleur']) ||
      DEFAULT_GYM_CONFIG.palette_couleur,
    alerte_expiration_jours:
      Number(map.alerte_expiration_jours) || DEFAULT_GYM_CONFIG.alerte_expiration_jours,
    message_recu: map.message_recu ?? DEFAULT_GYM_CONFIG.message_recu,
    reglements_titre: map.reglements_titre ?? DEFAULT_GYM_CONFIG.reglements_titre,
    reglements_contenu: map.reglements_contenu ?? DEFAULT_GYM_CONFIG.reglements_contenu,
    auto_logout_minutes:
      Number(map.auto_logout_minutes) || DEFAULT_GYM_CONFIG.auto_logout_minutes,
    apps_script_url: map.apps_script_url ?? DEFAULT_GYM_CONFIG.apps_script_url,
    apps_script_key: map.apps_script_key ?? DEFAULT_GYM_CONFIG.apps_script_key,
    auto_backup_enabled:
      map.auto_backup_enabled !== undefined
        ? (Number(map.auto_backup_enabled) === 1 ? 1 : 0)
        : DEFAULT_GYM_CONFIG.auto_backup_enabled,
    auto_backup_mode:
      map.auto_backup_mode === 'daily_time'
        ? ('daily_time' as AutoBackupMode)
        : DEFAULT_GYM_CONFIG.auto_backup_mode,
    auto_backup_hours:
      map.auto_backup_hours !== undefined
        ? Math.max(0, Math.min(24, Number(map.auto_backup_hours) || 0))
        : DEFAULT_GYM_CONFIG.auto_backup_hours,
    auto_backup_minutes:
      map.auto_backup_minutes !== undefined
        ? Math.max(0, Math.min(59, Number(map.auto_backup_minutes) || 0))
        : DEFAULT_GYM_CONFIG.auto_backup_minutes,
    auto_backup_time: map.auto_backup_time || DEFAULT_GYM_CONFIG.auto_backup_time,
    auto_backup_download_json:
      map.auto_backup_download_json !== undefined
        ? (Number(map.auto_backup_download_json) === 1 ? 1 : 0)
        : DEFAULT_GYM_CONFIG.auto_backup_download_json,
    auto_backup_sync_sheets:
      map.auto_backup_sync_sheets !== undefined
        ? (Number(map.auto_backup_sync_sheets) === 1 ? 1 : 0)
        : DEFAULT_GYM_CONFIG.auto_backup_sync_sheets,
    auto_backup_keep_count:
      map.auto_backup_keep_count !== undefined
        ? Math.max(1, Math.min(50, Number(map.auto_backup_keep_count) || 10))
        : DEFAULT_GYM_CONFIG.auto_backup_keep_count,
    auto_backup_last_at:
      map.auto_backup_last_at ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('gympro_last_auto_backup_at') || ''
        : '') ||
      DEFAULT_GYM_CONFIG.auto_backup_last_at,
  };
}

/**
 * Sauvegarde plusieurs clés de configuration dans Parametres.
 */
export async function saveGymConfig(partial: Partial<GymConfig>): Promise<GymConfig> {
  for (const [cle, valeur] of Object.entries(partial)) {
    if (valeur === undefined) continue;
    await saveRecord<Parametre>('Parametres', {
      cle,
      valeur: String(valeur),
    });
  }
  return getGymConfig();
}

/**
 * Applique les données distantes issues d'un pull Google Sheets avec résolution "dernière modification gagne".
 */
export async function mergeRemoteData(
  remoteData: Partial<Record<TableName, Record<string, unknown>[]>>
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const db = await openDB();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const table of ALL_TABLES) {
    const rows = remoteData[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const keyField = table === 'Parametres' ? 'cle' : 'id';
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    const localRows = (await idbReq(store.getAll())) as BaseRecord[];
    const localMap = new Map<string, BaseRecord>();
    for (const lr of localRows) {
      const k = String((lr as unknown as Record<string, unknown>)[keyField] || '');
      if (k) localMap.set(k, lr);
    }

    for (const row of rows) {
      const key = String(row[keyField] || '');
      if (!key) continue;
      const incomingUpdated = String(row.updated_at || '');
      const local = localMap.get(key);
      const normalized = {
        ...row,
        deleted: Number(row.deleted) === 1 ? 1 : 0,
      };
      if (!local) {
        store.put(normalized);
        inserted++;
      } else if (!local.updated_at || incomingUpdated > local.updated_at) {
        store.put(normalized);
        updated++;
      } else {
        skipped++;
      }
    }

    await txDone(tx);
  }

  notifyDBChange();
  return { inserted, updated, skipped };
}

/**
 * Exporte toute la base IndexedDB au format JSON complet pour sauvegarde locale.
 */
export async function exportAllJSON(): Promise<string> {
  const dump: Record<string, unknown> = {
    app: 'GymPro',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {},
  };
  const tablesObj: Record<string, unknown[]> = {};
  for (const table of ALL_TABLES) {
    tablesObj[table] = await getAllRecords(table, true);
  }
  dump.tables = tablesObj;
  dump.sync_queue = await getSyncQueue();
  return JSON.stringify(dump, null, 2);
}

/**
 * Importe une sauvegarde JSON dans IndexedDB (sans dupliquer par clé).
 */
export async function importAllJSON(rawJson: string): Promise<number> {
  const parsed = JSON.parse(rawJson);
  const tables = parsed?.tables;
  if (!tables || typeof tables !== 'object') {
    throw new Error('Format de sauvegarde JSON invalide.');
  }
  const db = await openDB();
  let totalImported = 0;

  for (const table of ALL_TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) continue;
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    for (const row of rows) {
      if (row && typeof row === 'object') {
        store.put(row);
        totalImported++;
      }
    }
    await txDone(tx);
  }

  notifyDBChange();
  return totalImported;
}

/**
 * Génère le prochain code membre séquentiel (ex. GYM-0001).
 */
export async function getNextMemberCode(): Promise<string> {
  const members = await getAllRecords<{ code_membre: string } & BaseRecord>('Membres', true);
  let maxNum = 0;
  for (const m of members) {
    const match = String(m.code_membre || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `GYM-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Génère le prochain numéro de reçu séquentiel (ex. REC-2026-0001).
 */
export async function getNextReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const payments = await getAllRecords<{ recu_numero: string } & BaseRecord>('Paiements', true);
  let maxNum = 0;
  for (const p of payments) {
    const match = String(p.recu_numero || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `REC-${year}-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Lit les instantanés de sauvegarde locale (triés du plus récent au plus ancien).
 */
export async function getAutoBackupSnapshots(): Promise<AutoBackupSnapshot[]> {
  const db = await openDB();
  const tx = db.transaction('auto_backups', 'readonly');
  const items = (await idbReq(tx.objectStore('auto_backups').getAll())) as AutoBackupSnapshot[];
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Crée un instantané complet de la base IndexedDB dans le coffre local auto_backups
 * et applique la rétention maximale (keepCount).
 */
export async function createAutoBackupSnapshot(
  trigger: 'auto' | 'manual',
  keepCount = 10
): Promise<AutoBackupSnapshot> {
  const json = await exportAllJSON();
  const parsed = JSON.parse(json) as { tables?: Record<string, unknown[]> };
  let recordCount = 0;
  if (parsed.tables) {
    for (const rows of Object.values(parsed.tables)) {
      if (Array.isArray(rows)) recordCount += rows.length;
    }
  }
  const now = new Date().toISOString();
  const snapshot: AutoBackupSnapshot = {
    id: generateUUID(),
    created_at: now,
    trigger,
    record_count: recordCount,
    size_bytes: new Blob([json]).size,
    json,
  };

  const db = await openDB();
  const existing = await getAutoBackupSnapshots();
  const maxKeep = Math.max(1, Math.min(50, Number(keepCount) || 10));
  const toDelete = existing.slice(Math.max(0, maxKeep - 1));

  const tx = db.transaction('auto_backups', 'readwrite');
  const store = tx.objectStore('auto_backups');
  store.put(snapshot);
  for (const oldItem of toDelete) {
    store.delete(oldItem.id);
  }
  await txDone(tx);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('gympro_last_auto_backup_at', now);
  }
  await saveRecord<Parametre>(
    'Parametres',
    { cle: 'auto_backup_last_at', valeur: now },
    { skipQueue: true }
  );

  return snapshot;
}

export async function deleteAutoBackupSnapshot(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('auto_backups', 'readwrite');
  tx.objectStore('auto_backups').delete(id);
  await txDone(tx);
  notifyDBChange();
}

export async function clearAutoBackupSnapshots(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('auto_backups', 'readwrite');
  tx.objectStore('auto_backups').clear();
  await txDone(tx);
  notifyDBChange();
}
