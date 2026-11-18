import React, { useEffect, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';
import { Modal } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="Installer GymPro sur votre appareil pour l’utiliser hors ligne"
        className={
          variant === 'full'
            ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0'
        }
      >
        <MaterialIcon name="install_mobile" className="w-4 h-4" />
        Installer l’app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Afficher les étapes pour installer l’application sur iPhone ou iPad"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <MaterialIcon name="install_mobile" className="w-4 h-4" />
          Installer sur iOS
        </button>
        <Modal
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Installer GymPro sur iPhone / iPad"
          maxWidth="max-w-md"
        >
          <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
            <li>
              Appuyez sur le bouton <strong>Partager</strong> dans la barre de Safari.
            </li>
            <li>
              Faites défiler vers le bas puis touchez <strong>Sur l’écran d’accueil</strong>.
            </li>
            <li>
              Confirmez en appuyant sur <strong>Ajouter</strong> pour utiliser GymPro hors ligne.
            </li>
          </ol>
        </Modal>
      </>
    );
  }

  return null;
};
