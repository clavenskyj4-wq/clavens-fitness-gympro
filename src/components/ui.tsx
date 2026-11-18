import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { generateBarcodeBars, generateQRMatrix } from '../lib/qr';
import { formatDateFR, getSubscriptionProgress } from '../lib/utils';
import { MaterialIcon, MaterialIconName } from './MaterialIcon';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div
      className="no-print fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const iconName: MaterialIconName =
          t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'warning' : 'cloud_sync';
        const colorClass =
          t.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : t.type === 'error'
            ? 'bg-red-600 text-white border-red-500'
            : 'bg-slate-900 text-white border-slate-700 dark:bg-slate-800';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${colorClass}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <MaterialIcon name={iconName} className="w-5 h-5 shrink-0" />
              <span className="break-words">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              title="Fermer la notification"
              className="p-1 rounded-lg hover:bg-white/15 transition-colors shrink-0"
              aria-label="Fermer la notification"
            >
              <MaterialIcon name="close" className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, maxWidth = 'max-w-2xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] shadow-2xl my-auto max-h-[92vh] flex flex-col`}
      >
        <div className="no-print flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-[#262b38]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title="Fermer la fenêtre"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Fermer"
          >
            <MaterialIcon name="close" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger = true,
}) => (
  <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            danger
              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
              : 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
          }`}
        >
          <MaterialIcon name="warning" className="w-5 h-5" />
        </span>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          title="Annuler l’action et fermer"
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={async () => {
            await onConfirm();
            onClose();
          }}
          title={confirmLabel}
          className={`px-5 py-2 rounded-xl text-white text-sm font-semibold transition-colors ${
            danger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-orange-600 hover:bg-orange-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);

export const EmptyState: React.FC<{
  icon: MaterialIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-slate-300 dark:border-[#262b38] bg-white/60 dark:bg-[#151821]/60">
    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4">
      <MaterialIcon name={icon} className="w-7 h-7" />
    </div>
    <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        title={actionLabel}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors whitespace-nowrap"
      >
        <MaterialIcon name="add" className="w-4 h-4" />
        {actionLabel}
      </button>
    )}
  </div>
);

export const QRCodeSVG: React.FC<{ value: string; size?: number; className?: string }> = ({
  value,
  size = 112,
  className = '',
}) => {
  const matrix = useMemo(() => generateQRMatrix(value || 'GYM-0001'), [value]);
  const n = matrix.length;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n + 4} ${n + 4}`}
      className={`bg-white p-1 rounded ${className}`}
      role="img"
      aria-label={`QR Code ${value}`}
    >
      <rect width={n + 4} height={n + 4} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? <rect key={`${r}-${c}`} x={c + 2} y={r + 2} width={1} height={1} fill="#000000" /> : null
        )
      )}
    </svg>
  );
};

export const BarcodeSVG: React.FC<{ value: string; height?: number }> = ({
  value,
  height = 28,
}) => {
  const bars = useMemo(() => generateBarcodeBars(value), [value]);
  let x = 0;
  const rects = bars.map((w, idx) => {
    const el =
      idx % 2 === 0 ? (
        <rect key={idx} x={x} y={0} width={w * 2} height={height} fill="#0f172a" />
      ) : null;
    x += w * 2;
    return el;
  });
  return (
    <svg
      viewBox={`0 0 ${x} ${height}`}
      className="w-full max-w-[160px] h-7 bg-white px-1 py-0.5 rounded"
      aria-label={`Code-barres ${value}`}
    >
      {rects}
    </svg>
  );
};

/**
 * Portail d'impression dédié : isole la zone imprimable du reste de la page et des modales.
 */
export const PrintPortal: React.FC<{ active: boolean; children: React.ReactNode }> = ({
  active,
  children,
}) => {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('gp-print-active');
    return () => {
      document.body.classList.remove('gp-print-active');
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;
  return createPortal(<div className="gp-print-portal">{children}</div>, document.body);
};

/**
 * Barre de progression contrôlant la durée écoulée d'un forfait jusqu'à sa date d'expiration.
 */
export const SubscriptionProgressBar: React.FC<{
  dateDebut: string;
  dateFin: string;
  forfaitNom?: string;
  alertDays?: number;
  compact?: boolean;
}> = ({ dateDebut, dateFin, forfaitNom, alertDays = 7, compact = false }) => {
  const info = useMemo(
    () => getSubscriptionProgress(dateDebut, dateFin, alertDays),
    [dateDebut, dateFin, alertDays]
  );

  const barColor =
    info.status === 'expired'
      ? 'bg-red-500'
      : info.status === 'warning'
      ? 'bg-amber-500'
      : info.status === 'upcoming'
      ? 'bg-blue-500'
      : 'bg-emerald-500';

  const textColor =
    info.status === 'expired'
      ? 'text-red-600 dark:text-red-400'
      : info.status === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : info.status === 'upcoming'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div
      className={compact ? 'space-y-1 min-w-[160px]' : 'space-y-1.5'}
      title={`Du ${formatDateFR(dateDebut)} au ${formatDateFR(dateFin)} — ${info.label}`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
          {forfaitNom || `${formatDateFR(dateDebut)} → ${formatDateFR(dateFin)}`}
        </span>
        <span className={`font-mono-num font-semibold whitespace-nowrap ${textColor}`}>
          {info.label}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${info.percent}%` }}
        />
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
          <span>Début : {formatDateFR(dateDebut)}</span>
          <span>Exp. : {formatDateFR(dateFin)}</span>
        </div>
      )}
    </div>
  );
};
