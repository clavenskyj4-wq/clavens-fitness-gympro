import React from 'react';
import { formatMoney } from '../lib/utils';
import { Devise } from '../types/gym';

export interface MonthlySeriesPoint {
  label: string;
  revenus: number;
  depenses: number;
}

/**
 * Graphique SVG local : Revenus vs Dépenses sur 12 mois (aucune librairie externe).
 */
export const MonthlyRevenueChart: React.FC<{
  data: MonthlySeriesPoint[];
  devise: Devise;
}> = ({ data, devise }) => {
  const maxVal = Math.max(100, ...data.map((d) => Math.max(d.revenus, d.depenses)));
  const width = 680;
  const height = 220;
  const padLeft = 10;
  const padRight = 10;
  const padTop = 18;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const step = chartW / Math.max(1, data.length);

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-5 mb-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-orange-500" />
          Revenus
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 dark:bg-slate-600" />
          Dépenses
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
              strokeDasharray="3 3"
            />
          );
        })}
        {data.map((pt, idx) => {
          const xCenter = padLeft + step * idx + step / 2;
          const barW = Math.min(18, step * 0.32);
          const revH = Math.max(2, (pt.revenus / maxVal) * chartH);
          const depH = Math.max(2, (pt.depenses / maxVal) * chartH);
          return (
            <g key={pt.label}>
              <rect
                x={xCenter - barW - 1.5}
                y={padTop + chartH - revH}
                width={barW}
                height={revH}
                rx={3}
                className="fill-orange-500 hover:fill-orange-400 transition-colors"
              >
                <title>{`${pt.label} — Revenus : ${formatMoney(pt.revenus, devise)}`}</title>
              </rect>
              <rect
                x={xCenter + 1.5}
                y={padTop + chartH - depH}
                width={barW}
                height={depH}
                rx={3}
                className="fill-slate-400 dark:fill-slate-600 hover:fill-slate-500 transition-colors"
              >
                <title>{`${pt.label} — Dépenses : ${formatMoney(pt.depenses, devise)}`}</title>
              </rect>
              <text
                x={xCenter}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px]"
              >
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export interface DayAttendancePoint {
  day: string;
  count: number;
}

/**
 * Graphique SVG local : Présences par jour de la semaine.
 */
export const WeeklyAttendanceChart: React.FC<{ data: DayAttendancePoint[] }> = ({ data }) => {
  const maxVal = Math.max(4, ...data.map((d) => d.count));
  const width = 420;
  const height = 200;
  const padTop = 20;
  const padBottom = 30;
  const chartH = height - padTop - padBottom;
  const step = width / Math.max(1, data.length);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52">
      {data.map((pt, idx) => {
        const xCenter = step * idx + step / 2;
        const barW = Math.min(28, step * 0.52);
        const h = Math.max(4, (pt.count / maxVal) * chartH);
        const y = padTop + chartH - h;
        return (
          <g key={pt.day}>
            <rect
              x={xCenter - barW / 2}
              y={y}
              width={barW}
              height={h}
              rx={5}
              className="fill-emerald-500/85 hover:fill-emerald-400 transition-colors"
            >
              <title>{`${pt.day} : ${pt.count} présence(s)`}</title>
            </rect>
            <text
              x={xCenter}
              y={y - 5}
              textAnchor="middle"
              className="fill-slate-700 dark:fill-slate-300 text-[11px] font-semibold"
            >
              {pt.count}
            </text>
            <text
              x={xCenter}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 text-[11px]"
            >
              {pt.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export interface PlanSlice {
  name: string;
  count: number;
  color: string;
}

/**
 * Graphique SVG local : Répartition des forfaits actifs.
 */
export const PlanDistributionChart: React.FC<{ slices: PlanSlice[] }> = ({ slices }) => {
  const total = slices.reduce((acc, s) => acc + s.count, 0);
  if (total === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Aucun abonnement actif pour calculer la répartition.
      </div>
    );
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          className="text-slate-100 dark:text-slate-800"
        />
        {slices.map((s) => {
          const frac = s.count / total;
          const dash = frac * circumference;
          const offset = -cumulative * circumference;
          cumulative += frac;
          return (
            <circle
              key={s.name}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
            >
              <title>{`${s.name} : ${s.count}`}</title>
            </circle>
          );
        })}
        <text
          x="70"
          y="67"
          textAnchor="middle"
          className="fill-slate-900 dark:fill-slate-100 text-lg font-bold"
        >
          {total}
        </text>
        <text
          x="70"
          y="84"
          textAnchor="middle"
          className="fill-slate-500 dark:fill-slate-400 text-[10px]"
        >
          actifs
        </text>
      </svg>

      <div className="flex-1 w-full space-y-2">
        {slices.map((s) => {
          const pct = Math.round((s.count / total) * 100);
          return (
            <div key={s.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-xs shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate text-slate-700 dark:text-slate-200">{s.name}</span>
              </div>
              <span className="font-mono-num text-xs text-slate-600 dark:text-slate-400 shrink-0">
                {s.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Courbe SVG locale : Évolution du poids et de l'IMC d'un membre.
 */
export const WeightProgressChart: React.FC<{
  points: { dateLabel: string; poids: number; imc: number }[];
}> = ({ points }) => {
  if (points.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Enregistrez au moins une mesure pour afficher la courbe d’évolution.
      </div>
    );
  }

  const width = 560;
  const height = 190;
  const padL = 38;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const weights = points.map((p) => p.poids);
  const minW = Math.floor(Math.min(...weights) - 2);
  const maxW = Math.ceil(Math.max(...weights) + 2);
  const span = Math.max(2, maxW - minW);

  const coords = points.map((p, idx) => {
    const x =
      points.length === 1 ? padL + chartW / 2 : padL + (idx / (points.length - 1)) * chartW;
    const y = padT + chartH - ((p.poids - minW) / span) * chartH;
    return { ...p, x, y };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {[0, 0.5, 1].map((r) => {
        const y = padT + chartH * (1 - r);
        const val = (minW + span * r).toFixed(0);
        return (
          <g key={r}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 6}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-500 dark:fill-slate-400 text-[10px]"
            >
              {val}kg
            </text>
          </g>
        );
      })}
      {coords.length > 1 && (
        <polyline
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyline}
        />
      )}
      {coords.map((c) => (
        <g key={c.dateLabel + c.x}>
          <circle cx={c.x} cy={c.y} r="5" className="fill-orange-500 stroke-white dark:stroke-[#151821]" strokeWidth="2">
            <title>{`${c.dateLabel} — ${c.poids} kg (IMC ${c.imc})`}</title>
          </circle>
          <text
            x={c.x}
            y={c.y - 10}
            textAnchor="middle"
            className="fill-slate-800 dark:fill-slate-200 text-[10px] font-semibold"
          >
            {c.poids} kg
          </text>
          <text
            x={c.x}
            y={height - 8}
            textAnchor="middle"
            className="fill-slate-500 dark:fill-slate-400 text-[10px]"
          >
            {c.dateLabel}
          </text>
        </g>
      ))}
    </svg>
  );
};
