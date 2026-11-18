import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { ConfirmModal, Modal, ToastItem } from '../components/ui';
import {
  AccessRequestItem,
  getOrCreateDeviceId,
  getSuperAdminToken,
  setCachedDeviceApproved,
  setSuperAdminToken,
} from '../lib/accessControl';
import { getGymConfig } from '../lib/db';

interface SuperAdminPageProps {
  gymName: string;
  onBackHome: () => void;
  onNotify: (type: ToastItem['type'], message: string) => void;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'blocked';

interface EmailNotificationLogItem {
  id: string;
  to: string;
  subject: string;
  channel: 'smtp' | 'apps_script' | 'resend' | 'none';
  status: 'sent' | 'failed' | 'unconfigured';
  detail: string;
  createdAt: string;
}

function formatDateTimeFR(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeUserAgent(ua?: string): string {
  if (!ua) return 'Navigateur inconnu';
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
    ? 'iOS'
    : /Windows/i.test(ua)
    ? 'Windows'
    : /Mac OS/i.test(ua)
    ? 'macOS'
    : /Linux/i.test(ua)
    ? 'Linux'
    : 'Appareil';
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome/i.test(ua)
    ? 'Chrome'
    : /Firefox/i.test(ua)
    ? 'Firefox'
    : /Safari/i.test(ua)
    ? 'Safari'
    : 'Web';
  return `${os} · ${browser}`;
}

export const SuperAdminPage: React.FC<SuperAdminPageProps> = ({
  gymName,
  onBackHome,
  onNotify,
}) => {
  const [token, setToken] = useState<string>(() => getSuperAdminToken());
  const [adminUsername, setAdminUsername] = useState<string>('superadmin');

  // Formulaire de connexion Super Admin
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Données de la console
  const [loading, setLoading] = useState(false);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingGate, setTogglingGate] = useState(false);

  // Notifications email d'approbation
  const [notificationEmail, setNotificationEmail] = useState('manofthetech22@gmail.com');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [appsScriptConfigured, setAppsScriptConfigured] = useState(false);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [isRenderHost, setIsRenderHost] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailNotificationLogItem[]>([]);
  const [savingNotif, setSavingNotif] = useState(false);
  const [testingNotif, setTestingNotif] = useState(false);
  const [copyingScript, setCopyingScript] = useState(false);
  const [manualDeviceCode, setManualDeviceCode] = useState('');

  // Modale de modification des identifiants Super Admin
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  // Confirmation suppression
  const [deleteTarget, setDeleteTarget] = useState<AccessRequestItem | null>(null);

  const currentDeviceId = useMemo(() => getOrCreateDeviceId(), []);

  const loadOverview = useCallback(
    async (activeToken?: string) => {
      const authToken = activeToken ?? token;
      if (!authToken) return;
      setLoading(true);
      try {
        const res = await fetch('/api/super-admin/overview', {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          gateEnabled?: boolean;
          username?: string;
          updatedAt?: string;
          requests?: AccessRequestItem[];
          notificationEmail?: string;
          emailNotificationsEnabled?: boolean;
          smtpConfigured?: boolean;
          appsScriptConfigured?: boolean;
          resendConfigured?: boolean;
          isRenderHost?: boolean;
          emailLogs?: EmailNotificationLogItem[];
        };
        if (res.status === 401) {
          setSuperAdminToken('');
          setToken('');
          onNotify('error', 'Session Super Admin expirée. Veuillez vous reconnecter.');
          return;
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Chargement impossible.');
        }
        setGateEnabled(Boolean(data.gateEnabled));
        setAdminUsername(data.username || 'superadmin');
        setUpdatedAt(data.updatedAt || '');
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        if (data.notificationEmail) setNotificationEmail(data.notificationEmail);
        if (typeof data.emailNotificationsEnabled === 'boolean') {
          setEmailNotificationsEnabled(data.emailNotificationsEnabled);
        }
        setSmtpConfigured(Boolean(data.smtpConfigured));
        setAppsScriptConfigured(Boolean(data.appsScriptConfigured));
        setResendConfigured(Boolean(data.resendConfigured));
        setIsRenderHost(Boolean(data.isRenderHost));
        setEmailLogs(Array.isArray(data.emailLogs) ? data.emailLogs : []);

        if (!data.appsScriptConfigured) {
          getGymConfig()
            .then(async (localCfg) => {
              if (localCfg.apps_script_url.trim() && localCfg.apps_script_key.trim()) {
                const syncRes = await fetch('/api/public-registration/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nom_gym: localCfg.nom_gym,
                    adresse: localCfg.adresse,
                    telephone: localCfg.telephone,
                    apps_script_url: localCfg.apps_script_url,
                    apps_script_key: localCfg.apps_script_key,
                  }),
                });
                if (syncRes.ok) {
                  setAppsScriptConfigured(true);
                }
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        onNotify(
          'error',
          err instanceof Error ? err.message : 'Erreur de communication avec le serveur.'
        );
      } finally {
        setLoading(false);
      }
    },
    [token, onNotify]
  );

  const handleSaveNotifConfig = async (nextEnabled?: boolean) => {
    const enabledVal = typeof nextEnabled === 'boolean' ? nextEnabled : emailNotificationsEnabled;
    setSavingNotif(true);
    try {
      const res = await fetch('/api/super-admin/notifications/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notificationEmail: notificationEmail.trim(),
          emailNotificationsEnabled: enabledVal,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        notificationEmail?: string;
        emailNotificationsEnabled?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Enregistrement impossible.');
      }
      if (data.notificationEmail) setNotificationEmail(data.notificationEmail);
      if (typeof data.emailNotificationsEnabled === 'boolean') {
        setEmailNotificationsEnabled(data.emailNotificationsEnabled);
      }
      onNotify(
        'success',
        `Notifications email ${
          data.emailNotificationsEnabled ? 'activées' : 'désactivées'
        } pour ${data.notificationEmail}.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setSavingNotif(false);
    }
  };

  const handleTestNotifEmail = async () => {
    setTestingNotif(true);
    try {
      const res = await fetch('/api/super-admin/notifications/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        log?: EmailNotificationLogItem;
        emailLogs?: EmailNotificationLogItem[];
      };
      if (Array.isArray(data.emailLogs)) {
        setEmailLogs(data.emailLogs);
      }
      if (data.ok) {
        onNotify('success', data.log?.detail || `Email de test envoyé à ${notificationEmail}.`);
      } else {
        onNotify(
          'error',
          data.log?.detail || 'Envoi impossible. Vérifiez la configuration SMTP ou Apps Script.'
        );
      }
    } catch {
      onNotify('error', 'Erreur lors du test d’envoi email.');
    } finally {
      setTestingNotif(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadOverview(token);
    }
  }, [token, loadOverview]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/super-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPassword,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        username?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        setLoginError(data.error || 'Identifiants invalides.');
        return;
      }
      setSuperAdminToken(data.token);
      setToken(data.token);
      setAdminUsername(data.username || loginUser.trim());
      setLoginPassword('');
      onNotify('success', 'Connexion à l’espace Super Admin réussie.');
    } catch {
      setLoginError('Impossible de joindre le serveur Super Admin.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogoutSuperAdmin = () => {
    setSuperAdminToken('');
    setToken('');
    setRequests([]);
    onNotify('info', 'Session Super Admin fermée.');
  };

  const handleToggleGate = async () => {
    setTogglingGate(true);
    try {
      const next = !gateEnabled;
      const res = await fetch('/api/super-admin/gate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as { ok?: boolean; gateEnabled?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Mise à jour impossible.');
      }
      setGateEnabled(Boolean(data.gateEnabled));
      onNotify(
        'success',
        data.gateEnabled
          ? 'Contrôle d’accès activé : toute nouvelle personne devra obtenir votre approbation avant connexion.'
          : 'Contrôle d’accès désactivé : la connexion standard est ouverte sans approbation préalable.'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setTogglingGate(false);
    }
  };

  const handleAuthorizeCurrentDevice = async () => {
    setBusyId('current-device');
    try {
      const res = await fetch('/api/super-admin/authorize-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          nomComplet: `Super Admin (${adminUsername})`,
          telephone: 'Poste de direction',
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        requests?: AccessRequestItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Autorisation impossible.');
      }
      setCachedDeviceApproved(true);
      if (Array.isArray(data.requests)) setRequests(data.requests);
      onNotify('success', 'Cet appareil a été autorisé immédiatement pour la connexion.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAuthorizeManualCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualDeviceCode.trim().toUpperCase();
    if (cleaned.length < 6) {
      onNotify('error', 'Saisissez le code appareil complet affiché à l’écran (ex. GP-D4EF60D0-32).');
      return;
    }
    setBusyId('manual-device');
    try {
      const res = await fetch('/api/super-admin/authorize-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: cleaned,
          nomComplet: `Appareil pré-autorisé (${cleaned})`,
          telephone: 'Validation manuelle',
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        requests?: AccessRequestItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Autorisation impossible.');
      }
      if (Array.isArray(data.requests)) setRequests(data.requests);
      setManualDeviceCode('');
      onNotify('success', `Appareil ${cleaned} autorisé. Actualisez l’autre fenêtre pour vous connecter.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecision = async (
    id: string,
    action: 'approve' | 'reject' | 'revoke' | 'pending' | 'delete'
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/requests/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        requests?: AccessRequestItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Action impossible.');
      }
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
      const labels: Record<typeof action, string> = {
        approve: 'Accès approuvé : la personne peut maintenant se connecter.',
        reject: 'Demande refusée.',
        revoke: 'Accès révoqué : cet appareil ne pourra plus se connecter.',
        pending: 'Demande remise en attente.',
        delete: 'Demande supprimée de la liste.',
      };
      onNotify('success', labels[action]);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd && newPwd !== confirmPwd) {
      onNotify('error', 'La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    setSavingCreds(true);
    try {
      const res = await fetch('/api/super-admin/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: currentPwd,
          newUsername: newUsername.trim(),
          newPassword: newPwd,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        username?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Mise à jour impossible.');
      }
      if (data.token) {
        setSuperAdminToken(data.token);
        setToken(data.token);
      }
      if (data.username) {
        setAdminUsername(data.username);
      }
      setCredsModalOpen(false);
      setCurrentPwd('');
      setNewUsername('');
      setNewPwd('');
      setConfirmPwd('');
      onNotify('success', 'Identifiants Super Admin mis à jour.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleCopyPrivateUrl = async () => {
    const privateUrl = `${window.location.origin}/?superadmin=1`;
    try {
      await navigator.clipboard.writeText(privateUrl);
      onNotify('success', 'Lien privé Super Admin copié. Gardez-le confidentiel.');
    } catch {
      onNotify('info', `Lien privé : ${privateUrl}`);
    }
  };

  const getCustomizedCodeGs = async (): Promise<{ scriptText: string; hasKey: boolean }> => {
    const res = await fetch('/apps-script/Code.gs', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error('Impossible de charger le modèle Code.gs local.');
    }
    let scriptText = await res.text();
    let hasKey = false;
    try {
      const localCfg = await getGymConfig();
      const cleanKey = localCfg.apps_script_key.trim();
      if (cleanKey) {
        const escapedKey = cleanKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        scriptText = scriptText.replace(
          "const DEFAULT_SECRET_KEY = 'GYMPRO-CLE-SECRETE-A-CHANGER';",
          `const DEFAULT_SECRET_KEY = '${escapedKey}';`
        );
        hasKey = true;
      }
    } catch {
      // ignore IndexedDB unavailability
    }
    return { scriptText, hasKey };
  };

  const handleCopyCodeGs = async () => {
    setCopyingScript(true);
    try {
      const { scriptText, hasKey } = await getCustomizedCodeGs();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(scriptText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = scriptText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onNotify(
        'success',
        hasKey
          ? 'Code.gs copié avec votre clé secrète intégrée.'
          : 'Code.gs copié dans le presse-papiers. Pensez à garder votre clé secrète.'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Impossible de copier Code.gs.');
    } finally {
      setCopyingScript(false);
    }
  };

  const handleDownloadCodeGs = async () => {
    try {
      const { scriptText, hasKey } = await getCustomizedCodeGs();
      const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Code.gs';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(
        'success',
        hasKey ? 'Code.gs téléchargé avec votre clé secrète.' : 'Fichier Code.gs téléchargé.'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Impossible de télécharger Code.gs.');
    }
  };

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === 'pending').length;
    const approved = requests.filter((r) => r.status === 'approved').length;
    const blocked = requests.filter(
      (r) => r.status === 'rejected' || r.status === 'revoked'
    ).length;
    return { total, pending, approved, blocked };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter === 'pending' && r.status !== 'pending') return false;
      if (statusFilter === 'approved' && r.status !== 'approved') return false;
      if (
        statusFilter === 'blocked' &&
        r.status !== 'rejected' &&
        r.status !== 'revoked'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.nomComplet.toLowerCase().includes(q) ||
        (r.nomGym || '').toLowerCase().includes(q) ||
        r.telephone.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.posteSouhaite.toLowerCase().includes(q) ||
        r.deviceId.toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter]);

  const isCurrentDeviceApproved = useMemo(
    () => requests.some((r) => r.deviceId === currentDeviceId && r.status === 'approved'),
    [requests, currentDeviceId]
  );

  // ============================================================================
  // ÉCRAN D'AUTHENTIFICATION PRIVÉ SUPER ADMIN
  // ============================================================================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3.5 mb-6">
            <span className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-orange-600 text-white flex items-center justify-center shrink-0">
              <MaterialIcon name="admin_panel_settings" className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Accès Réservé · {gymName}
              </p>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate">
                Espace Super Admin
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            Console privée de gouvernance et d’approbation des utilisateurs qui accèdent à l’application via le lien partagé.
          </p>

          {loginError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2"
            >
              <MaterialIcon name="warning" className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="sa-username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Identifiant Super Admin
              </label>
              <input
                id="sa-username"
                type="text"
                autoComplete="username"
                required
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Identifiant confidentiel"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label
                htmlFor="sa-password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Mot de passe Super Admin
              </label>
              <input
                id="sa-password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              title="Ouvrir la console privée Super Admin"
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-orange-600 dark:hover:bg-orange-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {loginLoading ? 'Vérification...' : 'Accéder à la console'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#262b38] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Lien non public</span>
            <button
              type="button"
              onClick={onBackHome}
              title="Quitter l’espace Super Admin et revenir à l’accueil"
              className="font-medium text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // CONSOLE PROFESSIONNELLE SUPER ADMIN
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14] text-slate-900 dark:text-slate-100">
      {/* Barre supérieure professionnelle */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-[#262b38]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-orange-600 text-white flex items-center justify-center shrink-0">
              <MaterialIcon name="admin_panel_settings" className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{gymName}</span>
                <span>/</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Super Admin
                </span>
              </div>
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                Approbation & Contrôle d’Accès
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadOverview()}
              disabled={loading}
              title="Actualiser la liste des demandes d’accès"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-[#262b38] bg-white dark:bg-[#151821] hover:bg-slate-50 dark:hover:bg-[#1b202c] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <MaterialIcon name="refresh" className="w-4 h-4" />
              <span className="hidden sm:inline">Actualiser</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewUsername(adminUsername);
                setCredsModalOpen(true);
              }}
              title="Modifier l’identifiant ou le mot de passe Super Admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-[#262b38] bg-white dark:bg-[#151821] hover:bg-slate-50 dark:hover:bg-[#1b202c] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <MaterialIcon name="key" className="w-4 h-4" />
              <span className="hidden sm:inline">Identifiants</span>
            </button>

            <button
              type="button"
              onClick={onBackHome}
              title="Aller directement vers l’application GymPro (accueil / connexion)"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <MaterialIcon name="arrow_forward" className="w-4 h-4" />
              <span className="hidden sm:inline">Ouvrir l’app</span>
            </button>

            <button
              type="button"
              onClick={handleLogoutSuperAdmin}
              title="Fermer la session Super Admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-red-600 dark:hover:bg-red-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <MaterialIcon name="logout" className="w-4 h-4" />
              <span>Quitter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Bandeau de gouvernance + activation de la barrière avant connexion */}
        <section className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-slate-900 dark:text-white">
                <MaterialIcon
                  name={gateEnabled ? 'verified_user' : 'warning'}
                  className={`w-5 h-5 ${
                    gateEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
                  }`}
                />
                <span>
                  Approbation obligatoire avant connexion :{' '}
                  <span
                    className={
                      gateEnabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {gateEnabled ? 'Activée' : 'Désactivée'}
                  </span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {gateEnabled
                  ? 'Toute personne qui reçoit le lien partagé doit soumettre une demande et obtenir votre validation ici avant d’accéder à l’écran de connexion.'
                  : 'Attention : les personnes disposant du lien peuvent accéder directement à l’écran de connexion sans approbation préalable.'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                Connecté en tant que {adminUsername} · ID de ce navigateur : {currentDeviceId.slice(0, 14).toUpperCase()}
                {updatedAt ? ` · MàJ identifiants : ${formatDateTimeFR(updatedAt)}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {!isCurrentDeviceApproved && (
                <button
                  type="button"
                  onClick={handleAuthorizeCurrentDevice}
                  disabled={busyId === 'current-device'}
                  title="Autoriser immédiatement votre propre navigateur pour accéder à l’application"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <MaterialIcon name="devices" className="w-4 h-4" />
                  <span>Autoriser cet appareil</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyPrivateUrl}
                title="Copier le lien confidentiel d’accès à votre espace Super Admin"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-[#262b38] bg-slate-50 dark:bg-[#0d0f14] hover:bg-slate-100 dark:hover:bg-[#1b202c] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <MaterialIcon name="content_copy" className="w-4 h-4" />
                <span>Copier lien privé</span>
              </button>

              <button
                type="button"
                onClick={handleToggleGate}
                disabled={togglingGate}
                title={
                  gateEnabled
                    ? 'Désactiver temporairement le contrôle avant connexion'
                    : 'Activer l’approbation obligatoire avant connexion'
                }
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                  gateEnabled
                    ? 'border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <MaterialIcon name={gateEnabled ? 'lock' : 'verified_user'} className="w-4 h-4" />
                <span>{gateEnabled ? 'Désactiver le filtre' : 'Activer le filtre'}</span>
              </button>
            </div>
          </div>

          <form
            onSubmit={handleAuthorizeManualCode}
            className="pt-3 border-t border-slate-200 dark:border-[#262b38] flex flex-col sm:flex-row sm:items-center gap-2.5"
          >
            <span className="text-xs text-slate-600 dark:text-slate-400 shrink-0">
              Autoriser un autre navigateur / téléphone par son code :
            </span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={manualDeviceCode}
                onChange={(e) => setManualDeviceCode(e.target.value)}
                placeholder="ex. GP-D4EF60D0-32"
                aria-label="Code appareil à autoriser"
                className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-xs font-mono-num uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="submit"
                disabled={busyId === 'manual-device'}
                title="Autoriser immédiatement cet appareil à partir de son code affiché"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <MaterialIcon name="check_circle" className="w-3.5 h-3.5" />
                <span>Autoriser ce code</span>
              </button>
            </div>
          </form>
        </section>

        {/* Grille des 4 indicateurs clés (style SaaS flat 1px border, tabular-nums) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total demandes reçues
            </p>
            <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
              {stats.total}
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              En attente de décision
            </p>
            <p className="mt-2 font-mono-num text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.pending}
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Accès approuvés
            </p>
            <p className="mt-2 font-mono-num text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.approved}
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Refusés / Révoqués
            </p>
            <p className="mt-2 font-mono-num text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.blocked}
            </p>
          </div>
        </section>

        {/* Notifications Email pour les approbations */}
        <section className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <MaterialIcon name="notifications" className="w-5 h-5 text-orange-500" />
                <span>Notifications Email d’Approbation</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ·{' '}
                  {appsScriptConfigured
                    ? 'Relais Google Apps Script (HTTPS) prêt'
                    : resendConfigured
                    ? 'Relais Resend API (HTTPS) prêt'
                    : smtpConfigured && isRenderHost
                    ? 'SMTP configuré (bloqué sur Render gratuit sans relais HTTPS)'
                    : smtpConfigured
                    ? 'Canal SMTP Gmail prêt'
                    : 'En attente de relais (Apps Script ou Resend)'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Envoie une alerte automatique dès qu’une personne demande l’autorisation de se connecter ou soumet une inscription QR en attente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="manofthetech22@gmail.com"
                aria-label="Adresse email de notification"
                className="w-60 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-xs font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => handleSaveNotifConfig()}
                disabled={savingNotif}
                title="Enregistrer l’adresse email de notification"
                className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-orange-600 dark:hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {savingNotif ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveNotifConfig(!emailNotificationsEnabled)}
                disabled={savingNotif}
                title={
                  emailNotificationsEnabled
                    ? 'Désactiver les alertes par email'
                    : 'Activer les alertes par email'
                }
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                  emailNotificationsEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-300 dark:border-[#262b38] text-slate-600 dark:text-slate-400'
                }`}
              >
                {emailNotificationsEnabled ? 'Alertes : ON' : 'Alertes : OFF'}
              </button>
              <button
                type="button"
                onClick={handleTestNotifEmail}
                disabled={testingNotif}
                title="Envoyer un email de test maintenant pour vérifier la réception"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-[#262b38] bg-slate-50 dark:bg-[#0d0f14] hover:bg-slate-100 dark:hover:bg-[#1b202c] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <MaterialIcon name="refresh" className="w-3.5 h-3.5" />
                <span>{testingNotif ? 'Envoi...' : 'Tester l’envoi'}</span>
              </button>
            </div>
          </div>

          {(!appsScriptConfigured &&
            !resendConfigured &&
            (!smtpConfigured ||
              isRenderHost ||
              emailLogs.some((l) => l.status === 'failed' && /timeout/i.test(l.detail)))) && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold">
                {emailLogs.some((l) => l.status === 'failed' && /timeout/i.test(l.detail)) ||
                isRenderHost
                  ? 'Render gratuit bloque les ports SMTP (465/587) — activez le relais HTTPS gratuit'
                  : 'Relais d’envoi email non encore activé sur le serveur'}
              </p>
              <p className="opacity-90">
                Pour envoyer les alertes vers {notificationEmail} par HTTPS (port 443, jamais bloqué par Render) :{' '}
                1) mettez à jour votre projet Google Apps Script avec{' '}
                <code className="font-mono-num font-semibold">public/apps-script/Code.gs</code>{' '}
                puis redéployez une nouvelle version ;{' '}
                2) ajoutez <code className="font-mono-num font-semibold">APPS_SCRIPT_URL</code> +{' '}
                <code className="font-mono-num font-semibold">APPS_SCRIPT_KEY</code> (ou{' '}
                <code className="font-mono-num font-semibold">RESEND_API_KEY</code>) dans Render Environment Variables.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCodeGs}
                  disabled={copyingScript}
                  title="Copier le script Code.gs directement depuis l’espace Super Admin"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-orange-600 dark:hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  <MaterialIcon name="content_copy" className="w-3.5 h-3.5" />
                  <span>{copyingScript ? 'Copie...' : 'Copier Code.gs'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodeGs}
                  title="Télécharger le fichier Code.gs sur votre appareil"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-white/80 dark:bg-[#0d0f14] hover:bg-white text-amber-900 dark:text-amber-200 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <MaterialIcon name="download" className="w-3.5 h-3.5" />
                  <span>Télécharger Code.gs</span>
                </button>
              </div>
            </div>
          )}

          {emailLogs.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-[#262b38] space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Derniers envois de notification
              </p>
              <div className="space-y-1">
                {emailLogs.slice(0, 3).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs py-1 text-slate-600 dark:text-slate-300"
                  >
                    <span className="truncate">
                      <span
                        className={`font-semibold mr-2 ${
                          log.status === 'sent'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : log.status === 'failed'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {log.status === 'sent'
                          ? 'Envoyé'
                          : log.status === 'failed'
                          ? 'Échec'
                          : 'Config requise'}
                      </span>
                      {log.subject} — <span className="opacity-80">{log.detail}</span>
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-400 shrink-0">
                      {formatDateTimeFR(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Barre de recherche + filtres + liste des demandes */}
        <section className="rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-[#262b38] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <MaterialIcon
                name="search"
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, téléphone, email, poste ou ID appareil..."
                className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] overflow-x-auto">
              {(
                [
                  { id: 'all', label: `Tous (${stats.total})` },
                  { id: 'pending', label: `En attente (${stats.pending})` },
                  { id: 'approved', label: `Approuvés (${stats.approved})` },
                  { id: 'blocked', label: `Bloqués (${stats.blocked})` },
                ] as { id: StatusFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  title={`Filtrer les demandes : ${tab.label}`}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-[#1c212e] text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading && requests.length === 0 ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="h-12 rounded-lg bg-slate-100 dark:bg-[#1a1f2b] animate-pulse"
                />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-14 px-4 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 dark:bg-[#1a1f2b] text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <MaterialIcon name="verified_user" className="w-6 h-6" />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {requests.length === 0
                  ? 'Aucune demande d’accès enregistrée pour le moment'
                  : 'Aucun résultat pour ce filtre'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {requests.length === 0
                  ? 'Dès qu’une personne ouvrira le lien partagé et tentera de se connecter, sa demande apparaîtra ici pour validation.'
                  : 'Modifiez votre recherche ou changez de filtre de statut pour afficher d’autres demandes.'}
              </p>
              {requests.length === 0 && !isCurrentDeviceApproved && (
                <button
                  type="button"
                  onClick={handleAuthorizeCurrentDevice}
                  title="Autoriser immédiatement cet appareil pour se connecter"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <MaterialIcon name="devices" className="w-4 h-4" />
                  <span>Autoriser cet appareil</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262b38] bg-slate-50/70 dark:bg-[#11141c] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Demandeur</th>
                    <th className="py-3 px-4">Coordonnées</th>
                    <th className="py-3 px-4">Appareil</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Date demande</th>
                    <th className="py-3 px-4 text-right">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#262b38] text-sm">
                  {filteredRequests.map((item) => {
                    const isSelf = item.deviceId === currentDeviceId;
                    const isBusy = busyId === item.id;
                    const statusLabel =
                      item.status === 'approved'
                        ? 'Approuvé'
                        : item.status === 'pending'
                        ? 'En attente'
                        : item.status === 'rejected'
                        ? 'Refusé'
                        : 'Révoqué';
                    const statusColor =
                      item.status === 'approved'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.status === 'pending'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-[#191e29] transition-colors"
                      >
                        <td className="py-3 px-4 align-top">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.nomComplet}
                            {isSelf && (
                              <span className="ml-2 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                (Cet appareil)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.nomGym ? (
                              <span className="font-semibold text-orange-600 dark:text-orange-400 mr-1.5">
                                {item.nomGym} ·
                              </span>
                            ) : null}
                            {item.posteSouhaite}
                            {item.note ? ` · « ${item.note} »` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <div className="font-mono-num text-xs font-medium text-slate-800 dark:text-slate-200">
                            {item.telephone}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.email || 'Aucun email'}
                          </div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <div className="font-mono-num text-xs text-slate-700 dark:text-slate-300">
                            {item.deviceId.slice(0, 14).toUpperCase()}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {summarizeUserAgent(item.userAgent)}
                          </div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
                            <MaterialIcon
                              name={
                                item.status === 'approved'
                                  ? 'check_circle'
                                  : item.status === 'pending'
                                  ? 'schedule'
                                  : 'block'
                              }
                              className="w-4 h-4"
                            />
                            <span>{statusLabel}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 align-top text-right font-mono-num text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDateTimeFR(item.createdAt)}
                        </td>

                        <td className="py-3 px-4 align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status !== 'approved' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDecision(item.id, 'approve')}
                                title="Approuver cet utilisateur pour qu’il puisse se connecter"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                <MaterialIcon name="check_circle" className="w-3.5 h-3.5" />
                                <span>Approuver</span>
                              </button>
                            )}

                            {item.status === 'pending' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDecision(item.id, 'reject')}
                                title="Refuser cette demande d’accès"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                <MaterialIcon name="cancel" className="w-3.5 h-3.5" />
                                <span>Refuser</span>
                              </button>
                            )}

                            {item.status === 'approved' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDecision(item.id, 'revoke')}
                                title="Révoquer immédiatement l’accès de cet appareil"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                <MaterialIcon name="block" className="w-3.5 h-3.5" />
                                <span>Révoquer</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDeleteTarget(item)}
                              title="Supprimer définitivement cette entrée"
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#262b38] text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-[#1f2533] transition-colors disabled:opacity-50"
                            >
                              <MaterialIcon name="delete" className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2">
          <span>ID de cet appareil : {currentDeviceId.slice(0, 14).toUpperCase()}</span>
          <button
            type="button"
            onClick={onBackHome}
            title="Ouvrir l’application principale"
            className="font-medium text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap"
          >
            Ouvrir l’application principale
          </button>
        </div>
      </main>

      {/* Modale mise à jour des identifiants Super Admin */}
      <Modal
        open={credsModalOpen}
        onClose={() => setCredsModalOpen(false)}
        title="Identifiants de l’espace Super Admin"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Modifiez votre identifiant ou votre mot de passe privé. Laissez le nouveau mot de passe vide pour conserver l’actuel.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mot de passe actuel *
            </label>
            <input
              type="password"
              required
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Identifiant Super Admin
            </label>
            <input
              type="text"
              minLength={3}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nouveau mot de passe (min. 8 caractères)
            </label>
            <input
              type="password"
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Laisser vide pour ne pas changer"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>

          {newPwd && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCredsModalOpen(false)}
              title="Annuler la modification des identifiants"
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1f2b]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={savingCreds}
              title="Enregistrer les nouveaux identifiants Super Admin"
              className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-60"
            >
              {savingCreds ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            handleDecision(deleteTarget.id, 'delete');
          }
        }}
        title="Supprimer cette demande d’accès ?"
        message={
          deleteTarget
            ? `L’entrée de ${deleteTarget.nomComplet} (${deleteTarget.telephone}) sera supprimée de la console Super Admin.`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};
