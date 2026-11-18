import { Devise, GymConfig, PaletteId } from '../types/gym';

/**
 * Génère un identifiant unique UUID v4 compatible hors ligne.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Échappe les caractères HTML dangereux pour prévenir les failles XSS
 * (notamment lors des impressions ou exports HTML).
 */
export function escapeHtml(input: string | number | null | undefined): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Retourne la date locale du jour au format ISO YYYY-MM-DD.
 */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retourne l'heure actuelle au format HH:mm.
 */
export function nowTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Ajoute N jours à une date YYYY-MM-DD et retourne YYYY-MM-DD.
 */
export function addDaysISO(dateStr: string, days: number): string {
  const base = parseISODate(dateStr) || new Date();
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + days);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const dt = new Date(y, m, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Formate une date au format haïtien/français JJ/MM/AAAA.
 */
export function formatDateFR(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const dt = parseISODate(dateStr);
  if (!dt) return String(dateStr);
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formate une date et heure en JJ/MM/AAAA HH:mm.
 */
export function formatDateTimeFR(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return String(isoStr);
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/**
 * Calcule le nombre de jours restants entre aujourd'hui et dateFin (positif = futur).
 */
export function daysUntil(dateStr: string): number {
  const target = parseISODate(dateStr);
  const today = parseISODate(todayISO());
  if (!target || !today) return -999;
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export interface SubscriptionProgressInfo {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  percent: number;
  status: 'active' | 'warning' | 'expired' | 'upcoming';
  label: string;
}

/**
 * Calcule la progression d'un abonnement entre dateDebut et dateFin par rapport à aujourd'hui.
 */
export function getSubscriptionProgress(
  dateDebut: string,
  dateFin: string,
  alertDays = 7
): SubscriptionProgressInfo {
  const start = parseISODate(dateDebut);
  const end = parseISODate(dateFin);
  const today = parseISODate(todayISO());

  if (!start || !end || !today) {
    return {
      totalDays: 1,
      elapsedDays: 0,
      remainingDays: -999,
      percent: 100,
      status: 'expired',
      label: 'Dates invalides',
    };
  }

  const dayMs = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const remainingDays = Math.round((end.getTime() - today.getTime()) / dayMs);

  if (today.getTime() < start.getTime()) {
    const startsIn = Math.round((start.getTime() - today.getTime()) / dayMs);
    return {
      totalDays,
      elapsedDays: 0,
      remainingDays,
      percent: 0,
      status: 'upcoming',
      label: `Démarre dans ${startsIn} j (${totalDays} j)`,
    };
  }

  const rawElapsed = Math.round((today.getTime() - start.getTime()) / dayMs) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, rawElapsed));
  const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  if (remainingDays < 0) {
    return {
      totalDays,
      elapsedDays: totalDays,
      remainingDays,
      percent: 100,
      status: 'expired',
      label: `Expiré depuis ${Math.abs(remainingDays)} j`,
    };
  }

  if (remainingDays === 0) {
    return {
      totalDays,
      elapsedDays,
      remainingDays: 0,
      percent,
      status: 'warning',
      label: `Expire aujourd’hui (${elapsedDays}/${totalDays} j)`,
    };
  }

  if (remainingDays <= alertDays) {
    return {
      totalDays,
      elapsedDays,
      remainingDays,
      percent,
      status: 'warning',
      label: `Reste ${remainingDays} j (${elapsedDays}/${totalDays} j)`,
    };
  }

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    percent,
    status: 'active',
    label: `Reste ${remainingDays} j (${elapsedDays}/${totalDays} j)`,
  };
}

/**
 * Formate un montant dans la devise demandée (HTG par défaut).
 */
export function formatMoney(amount: number, devise: Devise = 'HTG'): string {
  const num = Number(amount || 0);
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: devise === 'USD' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
  return devise === 'USD' ? `$${formatted} USD` : `${formatted} HTG`;
}

/**
 * Convertit un montant vers la devise cible selon le taux de change (1 USD = X HTG).
 */
export function convertCurrency(
  amount: number,
  from: Devise,
  to: Devise,
  tauxChange: number
): number {
  const val = Number(amount || 0);
  const rate = Number(tauxChange || 132);
  if (from === to) return val;
  if (from === 'USD' && to === 'HTG') return val * rate;
  if (from === 'HTG' && to === 'USD') return rate > 0 ? val / rate : val;
  return val;
}

/**
 * Calcule l'IMC à partir du poids (kg) et de la taille (cm).
 */
export function calculateBMI(poidsKg: number, tailleCm: number): number {
  if (!poidsKg || !tailleCm || tailleCm <= 0) return 0;
  const m = tailleCm / 100;
  return Math.round((poidsKg / (m * m)) * 10) / 10;
}

/**
 * Redimensionne et compresse une image (fichier ou flux vidéo) en base64 légère
 * pour garder IndexedDB et Google Sheets rapides.
 */
export function compressImageFile(
  file: File,
  maxSize = 320,
  quality = 0.72,
  outputFormat: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format d’image non valide.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSize) {
          h = Math.round((h * maxSize) / w);
          w = maxSize;
        } else if (h >= w && h > maxSize) {
          w = Math.round((w * maxSize) / h);
          h = maxSize;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponible.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(outputFormat, quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Exporte un tableau d'objets en fichier CSV UTF-8 avec BOM (compatible Excel).
 */
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (cell: string | number) => {
    const s = String(cell ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const csvLines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((r) => r.map(escapeCell).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const COLOR_PALETTES: {
  id: PaletteId;
  label: string;
  swatch: string;
  description: string;
}[] = [
  { id: 'orange', label: 'Orange Énergie', swatch: '#ea580c', description: 'Dynamique et sportif' },
  { id: 'emerald', label: 'Émeraude Sport', swatch: '#059669', description: 'Vitalité et endurance' },
  { id: 'cobalt', label: 'Bleu Cobalt', swatch: '#2563eb', description: 'Précision et clarté' },
  { id: 'crimson', label: 'Rouge Performance', swatch: '#dc2626', description: 'Force et intensité' },
  { id: 'gold', label: 'Or Athlétique', swatch: '#d97706', description: 'Premium et chaleureux' },
];

export const DEFAULT_REGLEMENTS_TITRE = 'Règlement Intérieur & Charte des Membres';

export const DEFAULT_REGLEMENTS_CONTENU = `1. Accès et identification : Chaque membre doit présenter sa carte officielle (QR Code ou code membre) à la réception avant chaque séance.
2. Abonnement à jour : L’accès aux installations est strictement réservé aux membres disposant d’un abonnement actif et réglé.
3. Tenue sportive obligatoire : Le port de vêtements de sport propres et de chaussures fermées réservées à la salle est exigé dans toutes les zones d’entraînement.
4. Hygiène et serviette : L’utilisation d’une serviette personnelle sur les bancs et appareils ainsi que le nettoyage des machines après usage sont obligatoires.
5. Rangement du matériel : Les haltères, disques, barres et accessoires doivent être remis à leur place initiale immédiatement après chaque exercice.
6. Sécurité et respect : Tout comportement agressif, harcèlement ou utilisation dangereuse des équipements entraînera une suspension immédiate sans remboursement.
7. Effets personnels : La direction décline toute responsabilité en cas de perte, d’oubli ou de vol d’objets de valeur non déposés à l’accueil.
8. Non-remboursement : Les frais d’inscription et abonnements encaissés ne sont ni remboursables ni transférables à une autre personne.`;

/**
 * Configuration par défaut du gym (Haïti).
 */
export const DEFAULT_GYM_CONFIG: GymConfig = {
  nom_gym: 'GymPro Fitness',
  logo: '',
  adresse: 'Port-au-Prince, Haïti',
  telephone: '+509 0000-0000',
  email_gym: 'contact@gympro.ht',
  horaires_ouverture: 'Lun–Sam : 06h00 – 21h00 · Dim : 08h00 – 14h00',
  devise_defaut: 'HTG',
  taux_change: 132,
  frais_inscription: 1000,
  tarif_coach_defaut: 2500,
  palette_couleur: 'orange',
  alerte_expiration_jours: 7,
  message_recu: 'Mèsi paske ou chwazi nou! Kenbe fòm ou chak jou.',
  reglements_titre: DEFAULT_REGLEMENTS_TITRE,
  reglements_contenu: DEFAULT_REGLEMENTS_CONTENU,
  auto_logout_minutes: 30,
  apps_script_url: '',
  apps_script_key: '',
  auto_backup_enabled: 0,
  auto_backup_mode: 'interval',
  auto_backup_hours: 1,
  auto_backup_minutes: 0,
  auto_backup_time: '20:00',
  auto_backup_download_json: 0,
  auto_backup_sync_sheets: 0,
  auto_backup_keep_count: 10,
  auto_backup_last_at: '',
};

/**
 * Formate une taille en octets de façon lisible (o, Ko, Mo).
 */
export function formatBytesFR(bytes: number): string {
  if (!bytes || bytes < 1024) return `${Math.max(0, bytes || 0)} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

/**
 * Déclenche le téléchargement local d'un contenu JSON.
 */
export function triggerJsonFileDownload(filename: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Calcule la prochaine date d'exécution prévue pour la sauvegarde automatique.
 * Retourne null si la sauvegarde automatique est désactivée.
 */
export function computeNextAutoBackupDate(
  cfg: Pick<
    GymConfig,
    | 'auto_backup_enabled'
    | 'auto_backup_mode'
    | 'auto_backup_hours'
    | 'auto_backup_minutes'
    | 'auto_backup_time'
    | 'auto_backup_last_at'
  >,
  now = new Date()
): Date | null {
  if (cfg.auto_backup_enabled !== 1) return null;

  const lastTime = cfg.auto_backup_last_at ? new Date(cfg.auto_backup_last_at).getTime() : NaN;

  if (cfg.auto_backup_mode === 'daily_time') {
    const parts = String(cfg.auto_backup_time || '20:00').split(':');
    const hh = Math.min(23, Math.max(0, Number(parts[0]) || 0));
    const mm = Math.min(59, Math.max(0, Number(parts[1]) || 0));

    const todayTarget = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hh,
      mm,
      0,
      0
    );

    if (Number.isNaN(lastTime) || lastTime < todayTarget.getTime()) {
      return todayTarget;
    }

    const tomorrowTarget = new Date(todayTarget.getTime());
    tomorrowTarget.setDate(tomorrowTarget.getDate() + 1);
    return tomorrowTarget;
  }

  const totalMinutes = Math.max(
    1,
    Number(cfg.auto_backup_hours || 0) * 60 + Number(cfg.auto_backup_minutes || 0)
  );
  const intervalMs = totalMinutes * 60 * 1000;

  if (Number.isNaN(lastTime)) {
    return new Date(now.getTime() + intervalMs);
  }
  return new Date(lastTime + intervalMs);
}
