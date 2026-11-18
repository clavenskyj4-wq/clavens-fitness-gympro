import React, { useEffect, useState } from 'react';
import { applyPWAUpdate, subscribePWAUpdate } from '../lib/pwaUpdate';
import { MaterialIcon } from './MaterialIcon';

export const AppUpdateBanner: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    return subscribePWAUpdate((available) => {
      setUpdateAvailable(available);
      if (available) {
        setDismissed(false);
      }
    });
  }, []);

  if (!updateAvailable || dismissed) return null;

  const handleRefresh = async () => {
    setReloading(true);
    await applyPWAUpdate();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-20 lg:bottom-5 right-4 left-4 sm:left-auto sm:w-[400px] z-50 rounded-2xl bg-white dark:bg-[#151821] border border-orange-500/40 shadow-2xl p-4 flex items-start gap-3"
    >
      <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
        <MaterialIcon
          name="cloud_sync"
          className={`w-5 h-5 ${reloading ? 'animate-spin' : ''}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-sm text-slate-900 dark:text-white">
          Nouvelle mise à jour disponible
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
          Une version plus récente de GymPro vient d’être publiée. Actualisez pour charger les nouveautés sans perdre vos données.
        </p>

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={reloading}
            title="Actualiser l’application pour appliquer la nouvelle version"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
          >
            <MaterialIcon
              name="refresh"
              className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`}
            />
            {reloading ? 'Actualisation...' : 'Actualiser maintenant'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title="Masquer temporairement ce message et actualiser plus tard"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="Fermer la notification de mise à jour"
        aria-label="Fermer"
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
      >
        <MaterialIcon name="close" className="w-4 h-4" />
      </button>
    </div>
  );
};
