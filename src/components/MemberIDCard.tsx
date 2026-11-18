import React from 'react';
import { generateBarcodeBars, generateQRMatrix } from '../lib/qr';
import { formatDateFR } from '../lib/utils';
import { GymConfig, Membre } from '../types/gym';
import { MaterialIcon } from './MaterialIcon';
import { BarcodeSVG, QRCodeSVG } from './ui';

const ATHLETE_PLACEHOLDER = new URL('../assets/images/athlete-card.svg', import.meta.url).href;

interface MemberIDCardProps {
  member: Membre;
  config: GymConfig;
  forfaitNom: string;
  dateExpiration?: string;
}

const PALETTE_ACCENTS: Record<string, { primary: string; secondary: string }> = {
  orange: { primary: '#ea580c', secondary: '#fb923c' },
  emerald: { primary: '#059669', secondary: '#34d399' },
  cobalt: { primary: '#2563eb', secondary: '#60a5fa' },
  crimson: { primary: '#dc2626', secondary: '#f87171' },
  gold: { primary: '#d97706', secondary: '#fbbf24' },
};

/**
 * Carte d'identité officielle de membre au format carte étudiant professionnelle (CR80).
 */
export const MemberIDCard: React.FC<MemberIDCardProps> = ({
  member,
  config,
  forfaitNom,
  dateExpiration,
}) => {
  const accent = PALETTE_ACCENTS[config.palette_couleur] || PALETTE_ACCENTS.orange;
  const statusColor =
    member.statut === 'actif'
      ? '#16a34a'
      : member.statut === 'suspendu'
      ? '#d97706'
      : member.statut === 'en_attente'
      ? '#0284c7'
      : '#dc2626';

  return (
    <div
      className="print-area-card relative mx-auto w-full max-w-[420px] rounded-2xl overflow-hidden bg-white text-slate-900 border border-slate-300 shadow-lg select-none"
      style={{ aspectRatio: '86 / 54' }}
    >
      {/* Bandeau institutionnel supérieur (style carte étudiant / badge officiel) */}
      <div
        className="relative px-4 py-2.5 text-white flex items-center justify-between gap-3"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        }}
      >
        <div
          className="absolute bottom-0 inset-x-0 h-1"
          style={{
            background: `linear-gradient(90deg, ${accent.primary}, ${accent.secondary})`,
          }}
        />
        <div className="flex items-center gap-2.5 min-w-0">
          {config.logo ? (
            <img
              src={config.logo}
              alt={config.nom_gym}
              className="w-8 h-8 rounded-lg object-contain bg-transparent p-0.5 border border-white/25 shrink-0"
            />
          ) : (
            <span
              className="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0"
              style={{ backgroundColor: accent.primary }}
            >
              <MaterialIcon name="fitness_center" className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-brand font-extrabold text-xs tracking-wide uppercase truncate">
              {config.nom_gym || 'GymPro Fitness'}
            </p>
            <p className="text-[9px] tracking-widest uppercase text-slate-300">
              Carte Officielle de Membre
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase text-white"
            style={{ backgroundColor: statusColor }}
          >
            {member.statut}
          </span>
          <p className="font-mono-num text-[10px] font-bold text-slate-200 mt-0.5">
            {member.code_membre}
          </p>
        </div>
      </div>

      {/* Corps central de la carte : Photo d'identité + Coordonnées + QR Code */}
      <div className="relative px-4 py-3 flex items-stretch justify-between gap-3 bg-gradient-to-br from-white via-slate-50 to-slate-100">
        {/* Photo d'identité format passeport/étudiant */}
        <div className="flex flex-col items-center justify-between shrink-0">
          <div
            className="w-[70px] h-[84px] rounded-xl overflow-hidden border-2 bg-slate-200 flex items-center justify-center shadow-xs"
            style={{ borderColor: accent.primary }}
          >
            <img
              src={member.photo || ATHLETE_PLACEHOLDER}
              alt={member.photo ? `${member.prenom} ${member.nom}` : 'Illustration athlète'}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">
            Sexe : {member.sexe}
          </span>
        </div>

        {/* Informations du titulaire */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
              Titulaire
            </p>
            <p className="font-brand font-extrabold text-[15px] text-slate-900 leading-tight uppercase truncate">
              {member.prenom} {member.nom}
            </p>
            <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-700">
              <p className="truncate">
                <span className="text-slate-500 font-medium">Forfait : </span>
                <span className="font-bold" style={{ color: accent.primary }}>
                  {forfaitNom}
                </span>
              </p>
              <p className="font-mono-num truncate">
                <span className="text-slate-500 font-sans font-medium">Tél : </span>
                {member.telephone || '—'}
              </p>
              <p className="font-mono-num">
                <span className="text-slate-500 font-sans font-medium">Inscrit : </span>
                {formatDateFR(member.date_inscription)}
              </p>
              <p className="font-mono-num">
                <span className="text-slate-500 font-sans font-medium">Expire : </span>
                <span className="font-bold text-slate-900">
                  {dateExpiration ? formatDateFR(dateExpiration) : 'Non défini'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Colonne droite : QR Code local de contrôle */}
        <div className="shrink-0 flex flex-col items-center justify-center bg-white rounded-xl p-1.5 border border-slate-200 shadow-2xs">
          <QRCodeSVG value={member.code_membre} size={74} className="p-0!" />
          <span className="text-[7px] font-mono-num font-bold tracking-wider text-slate-500 mt-0.5">
            SCAN ACCÈS
          </span>
        </div>
      </div>

      {/* Pied de carte avec code-barres + mentions */}
      <div className="px-4 py-1.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <div className="max-w-[140px]">
          <BarcodeSVG value={member.code_membre} height={16} />
        </div>
        <div className="text-right min-w-0">
          <p className="text-[8px] font-semibold text-slate-600 truncate">
            {config.adresse || 'Haïti'} · {config.telephone}
          </p>
          <p className="text-[7px] text-slate-400">
            Carte personnelle — Présenter à l’accueil
          </p>
        </div>
      </div>
    </div>
  );
};

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Exporte la carte de membre professionnelle en image PNG haute résolution (100 % hors ligne).
 */
export async function downloadMemberCardPNG(
  member: Membre,
  config: GymConfig,
  forfaitNom: string,
  dateExpiration?: string
): Promise<void> {
  const W = 1032;
  const H = 648;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const accent = PALETTE_ACCENTS[config.palette_couleur] || PALETTE_ACCENTS.orange;

  // Fond blanc carte
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // En-tête sombre style carte étudiant
  const grad = ctx.createLinearGradient(0, 0, W, 130);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 132);

  // Liseré accent
  const accentGrad = ctx.createLinearGradient(0, 124, W, 132);
  accentGrad.addColorStop(0, accent.primary);
  accentGrad.addColorStop(1, accent.secondary);
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 122, W, 10);

  // Logo du gym
  const logoImg = await loadImage(config.logo);
  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, 36, 26, 72, 72, 14);
    ctx.clip();
    ctx.drawImage(logoImg, 36, 26, 72, 72);
    ctx.restore();
  } else {
    ctx.fillStyle = accent.primary;
    drawRoundedRect(ctx, 36, 26, 72, 72, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('G', 72, 74);
  }

  // Titre du gym
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Montserrat, Poppins, sans-serif';
  ctx.fillText((config.nom_gym || 'GYMPRO FITNESS').toUpperCase(), 126, 62);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText('CARTE OFFICIELLE DE MEMBRE', 126, 94);

  // Badge statut + code
  const statusColor =
    member.statut === 'actif'
      ? '#16a34a'
      : member.statut === 'suspendu'
      ? '#d97706'
      : member.statut === 'en_attente'
      ? '#0284c7'
      : '#dc2626';
  ctx.fillStyle = statusColor;
  drawRoundedRect(ctx, W - 210, 26, 174, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText(
    member.statut === 'en_attente' ? 'EN ATTENTE' : member.statut.toUpperCase(),
    W - 123,
    50
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(member.code_membre, W - 36, 96);

  // Zone photo identité
  const photoX = 38;
  const photoY = 174;
  const photoW = 196;
  const photoH = 240;
  ctx.fillStyle = '#e2e8f0';
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.fill();

  const photoImg = await loadImage(member.photo || ATHLETE_PLACEHOLDER);
  if (photoImg) {
    ctx.save();
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 20);
    ctx.clip();
    ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px Montserrat, sans-serif';
    ctx.fillText(
      `${member.prenom.charAt(0)}${member.nom.charAt(0)}`.toUpperCase(),
      photoX + photoW / 2,
      photoY + photoH / 2 + 20
    );
  }
  ctx.strokeStyle = accent.primary;
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText(`SEXE : ${member.sexe}`, photoX + photoW / 2, photoY + photoH + 34);

  // Coordonnées centrales
  const infoX = 264;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 17px Inter, sans-serif';
  ctx.fillText('TITULAIRE', infoX, 198);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 34px Montserrat, Poppins, sans-serif';
  ctx.fillText(`${member.prenom} ${member.nom}`.toUpperCase(), infoX, 240, 480);

  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Forfait :', infoX, 294);
  ctx.fillStyle = accent.primary;
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(forfaitNom, infoX + 95, 294, 385);

  ctx.fillStyle = '#64748b';
  ctx.font = '600 21px Inter, sans-serif';
  ctx.fillText('Téléphone :', infoX, 338);
  ctx.fillStyle = '#1e293b';
  ctx.fillText(member.telephone || '—', infoX + 130, 338);

  ctx.fillStyle = '#64748b';
  ctx.fillText('Inscrit le :', infoX, 382);
  ctx.fillStyle = '#1e293b';
  ctx.fillText(formatDateFR(member.date_inscription), infoX + 120, 382);

  ctx.fillStyle = '#64748b';
  ctx.fillText('Expire le :', infoX, 426);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(dateExpiration ? formatDateFR(dateExpiration) : 'Non défini', infoX + 120, 426);

  // QR Code à droite
  const qrBoxX = W - 246;
  const qrBoxY = 178;
  const qrBoxSize = 210;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize + 34, 18);
  ctx.fill();
  ctx.stroke();

  const matrix = generateQRMatrix(member.code_membre || 'GYM-0001');
  const n = matrix.length;
  const cell = 180 / n;
  const qrStartX = qrBoxX + 15;
  const qrStartY = qrBoxY + 14;
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(qrStartX + c * cell, qrStartY + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('SCAN ACCÈS', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize + 20);

  // Bande inférieure code-barres
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 526, W, 122);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 526);
  ctx.lineTo(W, 526);
  ctx.stroke();

  const bars = generateBarcodeBars(member.code_membre);
  let bx = 38;
  ctx.fillStyle = '#0f172a';
  bars.forEach((w, idx) => {
    if (idx % 2 === 0) {
      ctx.fillRect(bx, 550, w * 3.5, 48);
    }
    bx += w * 3.5;
  });

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText(`${config.adresse || 'Haïti'} · ${config.telephone}`, W - 36, 574);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 15px Inter, sans-serif';
  ctx.fillText('Carte personnelle et incessible — Présenter à la réception', W - 36, 604);

  // Export PNG
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `carte-${member.code_membre}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
