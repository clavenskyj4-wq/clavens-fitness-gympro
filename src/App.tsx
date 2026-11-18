import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { MaterialIconSprite } from './components/MaterialIcon';
import { Navbar } from './components/Navbar';
import { ConfirmModal, ToastContainer, ToastItem } from './components/ui';
import {
  canAccessRoute,
  clearSession,
  ensureInitialAdmin,
  getSavedSession,
  SessionUser,
} from './lib/auth';
import {
  createAutoBackupSnapshot,
  getAllRecords,
  getGymConfig,
  getSyncQueue,
  subscribeDBChange,
} from './lib/db';
import { syncNow } from './lib/sync';
import {
  computeNextAutoBackupDate,
  daysUntil,
  DEFAULT_GYM_CONFIG,
  generateUUID,
  triggerJsonFileDownload,
} from './lib/utils';
import { BoutiquePage } from './pages/BoutiquePage';
import { CoursPage } from './pages/CoursPage';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { MembresPage } from './pages/MembresPage';
import { PaiementsPage, RenewRequest } from './pages/PaiementsPage';
import { ParametresPage } from './pages/ParametresPage';
import { PresencesPage } from './pages/PresencesPage';
import { PublicJoinPage } from './pages/PublicJoinPage';
import { RapportsPage } from './pages/RapportsPage';
import {
  CoachsPage,
  DepensesPage,
  EquipementsPage,
  MesuresPage,
} from './pages/RessourcesPages';
import {
  Abonnement,
  AppRoute,
  Forfait,
  GymConfig,
  Membre,
  SubscriptionAlertItem,
} from './types/gym';

export default function App() {
  const [route, setRoute] = useState<AppRoute>('accueil');
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(() => getSavedSession());
  const [isFirstRunAdmin, setIsFirstRunAdmin] = useState(false);

  const [config, setConfig] = useState<GymConfig>(DEFAULT_GYM_CONFIG);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('gympro_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [subscriptionAlerts, setSubscriptionAlerts] = useState<SubscriptionAlertItem[]>([]);
  const [renewRequest, setRenewRequest] = useState<RenewRequest | null>(null);
  const [publicJoinMode, setPublicJoinMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('join') === '1';
  });

  // Applique le thème clair/sombre et la palette de couleurs sur <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('gympro_theme', theme);
  }, [theme]);

  useEffect(() => {
    const initialPalette = localStorage.getItem('gympro_palette') || 'orange';
    document.documentElement.setAttribute('data-palette', initialPalette);
  }, []);

  useEffect(() => {
    const palette = config.palette_couleur || localStorage.getItem('gympro_palette') || 'orange';
    document.documentElement.setAttribute('data-palette', palette);
    localStorage.setItem('gympro_palette', palette);
  }, [config.palette_couleur]);

  const notify = useCallback((type: ToastItem['type'], message: string) => {
    const id = generateUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const [cfg, q, membres, abonnements, forfaits] = await Promise.all([
        getGymConfig(),
        getSyncQueue(),
        getAllRecords<Membre>('Membres'),
        getAllRecords<Abonnement>('Abonnements'),
        getAllRecords<Forfait>('Forfaits'),
      ]);
      setConfig(cfg);
      setPendingCount(q.length);

      const alertWindow = Math.max(1, Number(cfg.alerte_expiration_jours) || 7);
      const forfaitMap = new Map(forfaits.map((f) => [f.id, f]));
      const abosByMembre = new Map<string, Abonnement[]>();
      for (const abo of abonnements) {
        if (abo.statut === 'annulé') continue;
        const list = abosByMembre.get(abo.membre_id) || [];
        list.push(abo);
        abosByMembre.set(abo.membre_id, list);
      }

      const alerts: SubscriptionAlertItem[] = [];
      for (const m of membres) {
        if (m.statut === 'suspendu' || m.statut === 'en_attente') continue;
        const memberAbos = (abosByMembre.get(m.id) || []).sort((a, b) => {
          const cmp = String(b.date_fin || '').localeCompare(String(a.date_fin || ''));
          return cmp !== 0 ? cmp : String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });
        const latest = memberAbos[0];

        if (latest) {
          const remaining = daysUntil(latest.date_fin);
          const isExpired = remaining < 0 || latest.statut === 'expiré' || m.statut === 'expiré';
          const isExpiring = !isExpired && remaining >= 0 && remaining <= alertWindow;
          if (isExpired || isExpiring) {
            const f = forfaitMap.get(latest.forfait_id);
            alerts.push({
              membreId: m.id,
              codeMembre: m.code_membre,
              nomComplet: `${m.prenom} ${m.nom}`.trim(),
              telephone: m.telephone || '',
              photo: m.photo || '',
              forfaitId: latest.forfait_id,
              forfaitNom: f?.nom || 'Forfait',
              dateFin: latest.date_fin,
              daysRemaining: isExpired && remaining >= 0 ? -1 : remaining,
              kind: isExpired ? 'expired' : 'expiring',
            });
          }
        } else if (m.statut === 'expiré') {
          alerts.push({
            membreId: m.id,
            codeMembre: m.code_membre,
            nomComplet: `${m.prenom} ${m.nom}`.trim(),
            telephone: m.telephone || '',
            photo: m.photo || '',
            forfaitId: '',
            forfaitNom: 'Aucun forfait actif',
            dateFin: '',
            daysRemaining: -1,
            kind: 'expired',
          });
        }
      }

      alerts.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'expired' ? -1 : 1;
        if (a.kind === 'expired') return b.daysRemaining - a.daysRemaining;
        return a.daysRemaining - b.daysRemaining;
      });
      setSubscriptionAlerts(alerts);
    } catch {
      // Ignore init race
    }
  }, []);

  // Bootstrap initial : admin par défaut si base vide + abonnement IndexedDB
  useEffect(() => {
    ensureInitialAdmin().then((created) => {
      if (created) setIsFirstRunAdmin(true);
      refreshMeta();
    });
    const unsub = subscribeDBChange(() => {
      setRefreshTick((t) => t + 1);
      refreshMeta();
    });
    return () => {
      unsub();
    };
  }, [refreshMeta]);

  // Garde le relais serveur QR à jour dès qu'un administrateur ouvre l'application
  useEffect(() => {
    if (!user || user.role !== 'admin' || !navigator.onLine) return;
    getAllRecords<Forfait>('Forfaits')
      .then((forfaits) => {
        const activeList = forfaits
          .filter((f) => f.actif === 1)
          .map((f) => ({
            id: f.id,
            nom: f.nom,
            prix: Number(f.prix),
            devise: f.devise,
            duree_jours: Number(f.duree_jours),
          }));
        return fetch('/api/public-registration/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nom_gym: config.nom_gym,
            adresse: config.adresse,
            telephone: config.telephone,
            apps_script_url: config.apps_script_url,
            apps_script_key: config.apps_script_key,
            forfaits: activeList,
          }),
        });
      })
      .catch(() => {});
  }, [
    user,
    config.nom_gym,
    config.adresse,
    config.telephone,
    config.apps_script_url,
    config.apps_script_key,
  ]);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await syncNow();
      await refreshMeta();
      notify(res.ok ? 'success' : 'info', res.message);
    } finally {
      setIsSyncing(false);
    }
  }, [notify, refreshMeta]);

  // Détection réseau en ligne / hors ligne + synchronisation automatique au retour du réseau
  useEffect(() => {
    const onOnline = async () => {
      setIsOnline(true);
      const q = await getSyncQueue();
      const cfg = await getGymConfig();
      if (q.length > 0 && cfg.apps_script_url && cfg.apps_script_key) {
        notify('info', 'Connexion rétablie — Synchronisation automatique en cours...');
        handleSyncNow();
      } else {
        notify('success', 'Connexion internet rétablie.');
      }
    };
    const onOffline = () => {
      setIsOnline(false);
      notify('info', 'Mode hors ligne actif : toutes vos opérations sont sauvegardées en local.');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [handleSyncNow, notify]);

  // Déconnexion automatique configurable après inactivité
  useEffect(() => {
    if (!user) return;
    const minutes = Math.max(5, config.auto_logout_minutes || 30);
    let timer: number | undefined;
    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        clearSession();
        setUser(null);
        setRoute('accueil');
        notify('info', 'Session fermée automatiquement suite à une période d’inactivité.');
      }, minutes * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [user, config.auto_logout_minutes, notify]);

  // Planificateur de sauvegarde automatique (intervalle heures/minutes ou heure fixe HH:mm)
  const autoBackupRunningRef = useRef(false);
  const autoBackupAnchorRef = useRef<string>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('gympro_auto_backup_anchor') || ''
      : ''
  );

  useEffect(() => {
    if (!user || config.auto_backup_enabled !== 1) return;

    const runBackupCheck = async () => {
      if (autoBackupRunningRef.current) return;

      const now = new Date();
      let effectiveLast = config.auto_backup_last_at;

      if (config.auto_backup_mode === 'interval' && !effectiveLast) {
        if (!autoBackupAnchorRef.current) {
          autoBackupAnchorRef.current = now.toISOString();
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('gympro_auto_backup_anchor', autoBackupAnchorRef.current);
          }
        }
        effectiveLast = autoBackupAnchorRef.current;
      }

      const nextDate = computeNextAutoBackupDate(
        { ...config, auto_backup_last_at: effectiveLast },
        now
      );
      if (!nextDate || now.getTime() < nextDate.getTime()) return;

      autoBackupRunningRef.current = true;
      try {
        const snapshot = await createAutoBackupSnapshot('auto', config.auto_backup_keep_count);
        autoBackupAnchorRef.current = snapshot.created_at;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('gympro_auto_backup_anchor', snapshot.created_at);
        }

        if (config.auto_backup_download_json === 1) {
          const stamp = snapshot.created_at.slice(0, 16).replace('T', '_').replace(':', '-');
          triggerJsonFileDownload(`gympro-auto-${stamp}.json`, snapshot.json);
        }

        if (
          config.auto_backup_sync_sheets === 1 &&
          navigator.onLine &&
          config.apps_script_url.trim() &&
          config.apps_script_key.trim()
        ) {
          await syncNow();
        }

        await refreshMeta();
        notify(
          'success',
          `Sauvegarde automatique effectuée (${snapshot.record_count} enregistrements).`
        );
      } catch {
        // Ne jamais bloquer l'utilisateur en cas d'erreur d'arrière-plan
      } finally {
        autoBackupRunningRef.current = false;
      }
    };

    runBackupCheck();
    const intervalId = window.setInterval(runBackupCheck, 15000);
    return () => window.clearInterval(intervalId);
  }, [
    user,
    config.auto_backup_enabled,
    config.auto_backup_mode,
    config.auto_backup_hours,
    config.auto_backup_minutes,
    config.auto_backup_time,
    config.auto_backup_last_at,
    config.auto_backup_keep_count,
    config.auto_backup_download_json,
    config.auto_backup_sync_sheets,
    config.apps_script_url,
    config.apps_script_key,
    notify,
    refreshMeta,
  ]);

  const navigate = (target: AppRoute) => {
    setShowLogin(false);
    if (target === 'accueil') {
      setRoute('accueil');
      return;
    }
    if (!user) {
      setShowLogin(true);
      return;
    }
    if (!canAccessRoute(user.role, target)) {
      notify('error', 'Accès non autorisé pour votre rôle.');
      return;
    }
    setRoute(target);
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setRoute('accueil');
    setShowLogin(false);
    notify('info', 'Vous êtes déconnecté.');
  };

  const handleRegularizeMember = (memberId: string, forfaitId?: string) => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    if (canAccessRoute(user.role, 'paiements')) {
      setRenewRequest({ memberId, forfaitId, nonce: Date.now() });
      setRoute('paiements');
    } else if (canAccessRoute(user.role, 'membres')) {
      setRoute('membres');
      notify('info', 'Redirection vers la liste des membres.');
    }
  };

  const renderPage = () => {
    if (showLogin && !user) {
      return (
        <LoginPage
          gymName={config.nom_gym}
          isFirstRunAdmin={isFirstRunAdmin}
          onSuccess={(u) => {
            setUser(u);
            setIsFirstRunAdmin(false);
            setShowLogin(false);
            setRoute('dashboard');
            notify('success', `Bienvenue ${u.nom_utilisateur} !`);
          }}
          onBackHome={() => setShowLogin(false)}
        />
      );
    }

    if (route === 'accueil' || !user) {
      return (
        <LandingPage
          isAuthenticated={Boolean(user)}
          onOpenLogin={() => setShowLogin(true)}
          onNavigate={navigate}
          pendingCount={pendingCount}
          hasGoogleConfig={Boolean(config.apps_script_url && config.apps_script_key)}
        />
      );
    }

    switch (route) {
      case 'dashboard':
        return <DashboardPage config={config} refreshTick={refreshTick} onNavigate={navigate} />;
      case 'membres':
        return (
          <MembresPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
            onOpenPublicJoin={() => setPublicJoinMode(true)}
          />
        );
      case 'paiements':
        return (
          <PaiementsPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            renewRequest={renewRequest}
            onRenewHandled={() => setRenewRequest(null)}
            onNotify={notify}
          />
        );
      case 'presences':
        return (
          <PresencesPage
            user={user}
            refreshTick={refreshTick}
            onNavigate={navigate}
            onNotify={notify}
          />
        );
      case 'cours':
        return <CoursPage user={user} refreshTick={refreshTick} onNotify={notify} />;
      case 'boutique':
        return (
          <BoutiquePage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
          />
        );
      case 'coachs':
        return (
          <CoachsPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
          />
        );
      case 'equipements':
        return (
          <EquipementsPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
          />
        );
      case 'depenses':
        return (
          <DepensesPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
          />
        );
      case 'mesures':
        return (
          <MesuresPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onNotify={notify}
          />
        );
      case 'rapports':
        return <RapportsPage config={config} refreshTick={refreshTick} />;
      case 'parametres':
        return (
          <ParametresPage
            user={user}
            config={config}
            refreshTick={refreshTick}
            onConfigUpdated={setConfig}
            onSyncNow={handleSyncNow}
            onNotify={notify}
          />
        );
      default:
        return <DashboardPage config={config} refreshTick={refreshTick} onNavigate={navigate} />;
    }
  };

  if (publicJoinMode) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0d0f14] dark:text-slate-100">
        <MaterialIconSprite />
        <PublicJoinPage
          config={config}
          onBackHome={() => {
            setPublicJoinMode(false);
            if (typeof window !== 'undefined' && window.location.search.includes('join=1')) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }}
          onNotify={notify}
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0d0f14] dark:text-slate-100">
      <MaterialIconSprite />
      <Navbar
        currentRoute={route}
        onNavigate={navigate}
        user={user}
        onOpenLogin={() => setShowLogin(true)}
        onLogout={() => setLogoutConfirmOpen(true)}
        config={config}
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSyncNow={handleSyncNow}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        subscriptionAlerts={subscriptionAlerts}
        onRegularizeMember={handleRegularizeMember}
      />

      <main className={route === 'accueil' && !showLogin ? '' : 'pt-16 pb-20 lg:pb-8'}>
        {renderPage()}
      </main>

      <ConfirmModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        title="Confirmer la déconnexion"
        message="Voulez-vous vraiment fermer votre session en cours ?"
        confirmLabel="Se déconnecter"
        danger
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
      <AppUpdateBanner />
    </div>
  );
}
