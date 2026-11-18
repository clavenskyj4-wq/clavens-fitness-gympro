import React from 'react';
import { formatDateFR, todayISO } from '../lib/utils';
import { GymConfig } from '../types/gym';
import { MaterialIcon } from './MaterialIcon';

interface RegulationsDocumentProps {
  config: GymConfig;
  titre: string;
  contenu: string;
}

const PALETTE_ACCENTS: Record<string, { primary: string; secondary: string }> = {
  orange: { primary: '#ea580c', secondary: '#fb923c' },
  emerald: { primary: '#059669', secondary: '#34d399' },
  cobalt: { primary: '#2563eb', secondary: '#60a5fa' },
  crimson: { primary: '#dc2626', secondary: '#f87171' },
  gold: { primary: '#d97706', secondary: '#fbbf24' },
};

export interface ParsedRuleItem {
  type: 'heading' | 'rule';
  index?: number;
  title?: string;
  body: string;
}

/**
 * Découpe le texte brut des règlements en articles structurés (ou titres de section).
 */
export function parseRegulationLines(raw: string): ParsedRuleItem[] {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ParsedRuleItem[] = [];
  let counter = 1;

  for (const line of lines) {
    if (line.startsWith('#')) {
      items.push({
        type: 'heading',
        body: line.replace(/^#+\s*/, ''),
      });
      continue;
    }

    // Supprime une éventuelle numérotation existante (ex: "1. ", "2) ", "- ")
    const clean = line.replace(/^(\d+[.)]\s*|[-•]\s*)/, '').trim();
    const colonIdx = clean.indexOf(':');
    if (colonIdx > 1 && colonIdx < 48) {
      items.push({
        type: 'rule',
        index: counter++,
        title: clean.slice(0, colonIdx).trim(),
        body: clean.slice(colonIdx + 1).trim(),
      });
    } else {
      items.push({
        type: 'rule',
        index: counter++,
        body: clean,
      });
    }
  }

  return items;
}

/**
 * Document officiel des règlements du gym avec en-tête complet de l'entreprise (aperçu & impression A4).
 */
export const RegulationsDocument: React.FC<RegulationsDocumentProps> = ({
  config,
  titre,
  contenu,
}) => {
  const accent = PALETTE_ACCENTS[config.palette_couleur] || PALETTE_ACCENTS.orange;
  const items = parseRegulationLines(contenu);
  const docTitle = titre.trim() || 'Règlement Intérieur du Gym';

  return (
    <div className="print-area-a4 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* En-tête officiel de l'entreprise */}
      <div
        className="relative px-6 py-5 text-white"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
      >
        <div
          className="absolute bottom-0 inset-x-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, ${accent.primary}, ${accent.secondary})`,
          }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {config.logo ? (
              <img
                src={config.logo}
                alt={config.nom_gym}
                className="w-14 h-14 rounded-xl object-cover bg-white border border-white/25 shrink-0"
              />
            ) : (
              <span
                className="w-14 h-14 rounded-xl text-white flex items-center justify-center shrink-0"
                style={{ backgroundColor: accent.primary }}
              >
                <MaterialIcon name="fitness_center" className="w-7 h-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-brand font-extrabold text-lg sm:text-xl tracking-tight uppercase truncate">
                {config.nom_gym || 'GymPro Fitness'}
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-slate-300">
                {config.adresse && <p className="truncate">{config.adresse}</p>}
                <p className="font-mono-num truncate">
                  {[config.telephone, config.email_gym].filter(Boolean).join(' · ')}
                </p>
                {config.horaires_ouverture && (
                  <p className="text-[11px] text-slate-300/90 truncate">
                    Horaires : {config.horaires_ouverture}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/15">
            <span
              className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: accent.primary }}
            >
              Document Officiel
            </span>
            <p className="mt-1.5 text-[11px] font-mono-num text-slate-300">
              Mise à jour : {formatDateFR(todayISO())}
            </p>
          </div>
        </div>
      </div>

      {/* Titre du règlement */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 text-center">
        <h2 className="font-brand font-extrabold text-lg sm:text-xl text-slate-900 uppercase tracking-wide">
          {docTitle}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Applicable à l’ensemble des membres, visiteurs et usagers de {config.nom_gym}
        </p>
      </div>

      {/* Articles du règlement */}
      <div className="px-6 py-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            Aucun article défini pour le moment. Saisissez vos règlements dans l’éditeur.
          </p>
        ) : (
          items.map((item, idx) =>
            item.type === 'heading' ? (
              <div
                key={idx}
                className="pt-2 pb-1 border-b border-slate-200 font-brand font-bold text-xs uppercase tracking-wider"
                style={{ color: accent.primary }}
              >
                {item.body}
              </div>
            ) : (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80"
              >
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-mono-num font-bold flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: accent.primary }}
                >
                  {item.index}
                </span>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  {item.title && (
                    <span className="font-bold text-slate-900">{item.title} : </span>
                  )}
                  <span>{item.body}</span>
                </p>
              </div>
            )
          )
        )}
      </div>

      {/* Pied de document officiel */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px] text-slate-600">
        <div>
          <p className="font-semibold text-slate-800">
            La Direction — {config.nom_gym}
          </p>
          <p>
            Tout abonnement ou accès à la salle vaut acceptation pleine et entière du présent règlement.
          </p>
        </div>
        <div className="sm:text-right shrink-0">
          <p className="font-medium text-slate-700">Signature / Visa du membre :</p>
          <p className="mt-3 border-b border-dashed border-slate-400 w-44 sm:ml-auto" />
        </div>
      </div>
    </div>
  );
};

/**
 * Construit le texte formaté complet prêt au partage (WhatsApp, SMS, Email, Presse-papiers).
 */
export function buildRegulationsShareText(
  config: GymConfig,
  titre: string,
  contenu: string
): string {
  const items = parseRegulationLines(contenu);
  const headerLines = [
    `=== ${(config.nom_gym || 'GymPro Fitness').toUpperCase()} ===`,
    config.adresse ? `Adresse : ${config.adresse}` : '',
    config.telephone ? `Téléphone : ${config.telephone}` : '',
    config.email_gym ? `Email : ${config.email_gym}` : '',
    config.horaires_ouverture ? `Horaires : ${config.horaires_ouverture}` : '',
    '',
    (titre.trim() || 'Règlement Intérieur du Gym').toUpperCase(),
    `Mis à jour le ${formatDateFR(todayISO())}`,
    '----------------------------------------',
  ].filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''));

  const bodyLines = items.map((item) => {
    if (item.type === 'heading') return `\n[ ${item.body.toUpperCase()} ]`;
    return item.title ? `${item.index}. ${item.title} : ${item.body}` : `${item.index}. ${item.body}`;
  });

  const footer = `\n----------------------------------------\nLa Direction — ${config.nom_gym}`;
  return `${headerLines.join('\n')}\n\n${bodyLines.join('\n')}${footer}`;
}

/**
 * Télécharge les règlements en fichier texte (.txt) prêt à partager hors ligne.
 */
export function downloadRegulationsTXT(config: GymConfig, titre: string, contenu: string): void {
  const text = buildRegulationsShareText(config, titre, contenu);
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = (config.nom_gym || 'gympro')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = url;
  link.download = `reglements-${slug || 'gym'}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Exporte une affiche PNG haute résolution des règlements du gym avec en-tête complet de l'entreprise.
 */
export async function downloadRegulationsPNG(
  config: GymConfig,
  titre: string,
  contenu: string
): Promise<void> {
  const W = 1240;
  const accent = PALETTE_ACCENTS[config.palette_couleur] || PALETTE_ACCENTS.orange;
  const items = parseRegulationLines(contenu);

  // Pré-calcul de la hauteur dynamique selon le nombre de lignes
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return;
  mctx.font = '500 24px Inter, sans-serif';

  const wrappedEntries = items.map((item) => {
    if (item.type === 'heading') {
      return { item, lines: [item.body.toUpperCase()], height: 54 };
    }
    const full = item.title ? `${item.title} : ${item.body}` : item.body;
    const lines = wrapCanvasText(mctx, full, W - 210);
    return { item, lines, height: Math.max(66, lines.length * 34 + 30) };
  });

  const bodyHeight = wrappedEntries.reduce((acc, e) => acc + e.height + 16, 0);
  const H = Math.max(1050, 390 + bodyHeight + 130);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fond blanc
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // En-tête entreprise sombre
  const grad = ctx.createLinearGradient(0, 0, W, 220);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 220);

  const accentGrad = ctx.createLinearGradient(0, 210, W, 220);
  accentGrad.addColorStop(0, accent.primary);
  accentGrad.addColorStop(1, accent.secondary);
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 210, W, 10);

  // Logo
  const logoImg = await loadImage(config.logo);
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(56, 46, 118, 118, 18);
    ctx.clip();
    ctx.drawImage(logoImg, 56, 46, 118, 118);
    ctx.restore();
  } else {
    ctx.fillStyle = accent.primary;
    ctx.beginPath();
    ctx.roundRect(56, 46, 118, 118, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((config.nom_gym || 'G').charAt(0).toUpperCase(), 115, 123);
  }

  // Coordonnées de l'entreprise
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px Montserrat, Poppins, sans-serif';
  ctx.fillText((config.nom_gym || 'GYMPRO FITNESS').toUpperCase(), 198, 86, W - 470);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 22px Inter, sans-serif';
  if (config.adresse) ctx.fillText(config.adresse, 198, 124, W - 470);
  const contactLine = [config.telephone, config.email_gym].filter(Boolean).join(' · ');
  if (contactLine) ctx.fillText(contactLine, 198, 156, W - 470);
  if (config.horaires_ouverture) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 19px Inter, sans-serif';
    ctx.fillText(`Horaires : ${config.horaires_ouverture}`, 198, 188, W - 470);
  }

  // Badge Document Officiel
  ctx.fillStyle = accent.primary;
  ctx.beginPath();
  ctx.roundRect(W - 260, 48, 204, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('DOCUMENT OFFICIEL', W - 158, 76);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 19px monospace';
  ctx.fillText(`MÀJ : ${formatDateFR(todayISO())}`, W - 56, 126);

  // Titre du règlement
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 32px Montserrat, Poppins, sans-serif';
  ctx.fillText((titre.trim() || 'Règlement Intérieur du Gym').toUpperCase(), W / 2, 290, W - 112);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillText(
    `Applicable à l’ensemble des membres et usagers de ${config.nom_gym}`,
    W / 2,
    326,
    W - 112
  );

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, 352);
  ctx.lineTo(W - 56, 352);
  ctx.stroke();

  // Articles
  let y = 382;
  for (const entry of wrappedEntries) {
    if (entry.item.type === 'heading') {
      ctx.textAlign = 'left';
      ctx.fillStyle = accent.primary;
      ctx.font = 'bold 22px Montserrat, sans-serif';
      ctx.fillText(entry.lines[0], 56, y + 32);
      y += entry.height + 16;
      continue;
    }

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(56, y, W - 112, entry.height, 14);
    ctx.fill();
    ctx.stroke();

    // Numéro
    ctx.fillStyle = accent.primary;
    ctx.beginPath();
    ctx.roundRect(76, y + 16, 38, 38, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(String(entry.item.index || ''), 95, y + 42);

    // Texte
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1e293b';
    ctx.font = '500 23px Inter, sans-serif';
    entry.lines.forEach((line, lIdx) => {
      ctx.fillText(line, 134, y + 42 + lIdx * 34);
    });

    y += entry.height + 16;
  }

  // Pied de page
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, H - 104, W, 104);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText(`La Direction — ${config.nom_gym}`, 56, H - 58);
  ctx.fillStyle = '#475569';
  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillText(
    'Tout abonnement ou accès à la salle vaut acceptation pleine et entière du présent règlement.',
    56,
    H - 28
  );

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const slug = (config.nom_gym || 'gympro')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = dataUrl;
  link.download = `reglements-${slug || 'gym'}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
