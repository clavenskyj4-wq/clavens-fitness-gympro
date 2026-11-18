import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import {
  AccessRequestItem,
  AccessRequestStatus,
  applyApprovedGymNameIfNeeded,
  fetchAccessStatus,
  getCachedDeviceApproved,
  getOrCreateDeviceId,
  submitAccessRequest,
} from '../lib/accessControl';
import { authenticateUser, SessionUser } from '../lib/auth';

interface LoginPageProps {
  gymName: string;
  isFirstRunAdmin: boolean;
  onSuccess: (user: SessionUser) => void;
  onBackHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  gymName,
  isFirstRunAdmin,
  onSuccess,
  onBackHome,
}) => {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  // États du contrôle d'accès avant connexion
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessRequestStatus>(() =>
    getCachedDeviceApproved() ? 'approved' : 'none'
  );
  const [accessRequest, setAccessRequest] = useState<AccessRequestItem | null>(null);
  const [accessOfflineBlocked, setAccessOfflineBlocked] = useState(false);
  const [editingRequest, setEditingRequest] = useState(false);

  // Formulaire de demande d'accès
  const [reqNom, setReqNom] = useState('');
  const [reqNomGym, setReqNomGym] = useState('');
  const [reqTel, setReqTel] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqPoste, setReqPoste] = useState('Caissier / Réception');
  const [reqNote, setReqNote] = useState('');
  const [reqError, setReqError] = useState('');
  const [reqLoading, setReqLoading] = useState(false);

  // Formulaire de connexion classique
  const [username, setUsername] = useState(isFirstRunAdmin ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checkAccess = useCallback(
    async (silent = false) => {
      if (!silent) setCheckingAccess(true);
      setAccessOfflineBlocked(false);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (getCachedDeviceApproved()) {
          setGateEnabled(false);
          setAccessStatus('approved');
        } else {
          setAccessOfflineBlocked(true);
        }
        setCheckingAccess(false);
        return;
      }

      try {
        const res = await fetchAccessStatus(deviceId);
        setGateEnabled(res.gateEnabled);
        setAccessStatus(res.status);
        setAccessRequest(res.request);
        if (res.status === 'approved' && res.request) {
          await applyApprovedGymNameIfNeeded(res.request);
        }
        if (res.request) {
          setReqNom((prev) => prev || res.request?.nomComplet || '');
          setReqNomGym((prev) => prev || res.request?.nomGym || '');
          setReqTel((prev) => prev || res.request?.telephone || '');
          setReqEmail((prev) => prev || res.request?.email || '');
          setReqPoste((prev) => prev || res.request?.posteSouhaite || 'Caissier / Réception');
        }
      } catch {
        if (getCachedDeviceApproved()) {
          setAccessStatus('approved');
        } else {
          setAccessOfflineBlocked(true);
        }
      } finally {
        setCheckingAccess(false);
      }
    },
    [deviceId]
  );

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Vérifie automatiquement toutes les 10 secondes si la demande en attente vient d'être approuvée
  useEffect(() => {
    if (!gateEnabled || accessStatus !== 'pending') return;
    const timer = window.setInterval(() => {
      checkAccess(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [gateEnabled, accessStatus, checkAccess]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError('');
    setReqLoading(true);
    try {
      const res = await submitAccessRequest({
        deviceId,
        nomComplet: reqNom.trim(),
        nomGym: reqNomGym.trim(),
        telephone: reqTel.trim(),
        email: reqEmail.trim(),
        posteSouhaite: reqPoste,
        note: reqNote.trim(),
      });
      setGateEnabled(res.gateEnabled);
      setAccessStatus(res.status);
      setAccessRequest(res.request);
      if (res.status === 'approved' && res.request) {
        await applyApprovedGymNameIfNeeded(res.request);
      }
      setEditingRequest(false);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Envoi de la demande impossible.');
    } finally {
      setReqLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authenticateUser(username, password);
      if (!res.ok || !res.user) {
        setError(res.error || 'Connexion impossible.');
      } else {
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d’authentification.');
    } finally {
      setLoading(false);
    }
  };

  const canLogin = !gateEnabled || accessStatus === 'approved';

  // 1. Chargement initial de vérification d'autorisation
  if (checkingAccess) {
    return (
      <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center bg-slate-50 dark:bg-[#0d0f14]">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-8 shadow-xl text-center space-y-3">
          <span className="w-11 h-11 mx-auto rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <MaterialIcon name="verified_user" className="w-6 h-6" />
          </span>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Vérification de l’autorisation...
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Contrôle de l’accès pour cet appareil auprès de {gymName}.
          </p>
        </div>
      </div>
    );
  }

  // 2. Hors ligne sans approbation préalable en cache
  if (accessOfflineBlocked && !canLogin) {
    return (
      <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center bg-slate-50 dark:bg-[#0d0f14]">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-6 sm:p-8 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <MaterialIcon name="wifi_off" className="w-6 h-6" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Approbation initiale requise
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ID appareil : <span className="font-mono-num">{deviceId.slice(0, 14).toUpperCase()}</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Pour votre première connexion sur cet appareil, une connexion internet est nécessaire afin de soumettre ou vérifier votre approbation auprès du Super Admin.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => checkAccess()}
              title="Réessayer la vérification d’autorisation"
              className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={onBackHome}
              title="Revenir à la page d’accueil publique"
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#262b38] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1f2b]"
            >
              Accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Barrière d'approbation active (utilisateur non encore approuvé)
  if (!canLogin) {
    const showPendingView = accessStatus === 'pending' && !editingRequest;
    const showBlockedView =
      (accessStatus === 'rejected' || accessStatus === 'revoked') && !editingRequest;

    return (
      <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center bg-slate-50 dark:bg-[#0d0f14]">
        <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shrink-0">
              <MaterialIcon name="verified_user" className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate">
                Autorisation d’accès — {gymName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                Appareil : {deviceId.slice(0, 14).toUpperCase()}
              </p>
            </div>
          </div>

          {showPendingView && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <MaterialIcon name="schedule" className="w-4 h-4 shrink-0" />
                  <span>Demande en attente d’approbation</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  Votre demande a bien été transmise. Un Super Admin doit valider votre accès avant que vous puissiez vous connecter à l’espace de gestion.
                </p>
                {accessRequest && (
                  <p className="text-xs font-mono-num pt-1 border-t border-amber-500/20">
                    {accessRequest.nomComplet}
                    {accessRequest.nomGym ? ` · ${accessRequest.nomGym}` : ''} ·{' '}
                    {accessRequest.telephone} · {accessRequest.posteSouhaite}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => checkAccess()}
                  title="Vérifier immédiatement si le Super Admin a approuvé votre accès"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  <MaterialIcon name="refresh" className="w-4 h-4" />
                  <span>Vérifier mon statut</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRequest(true)}
                  title="Modifier les informations de votre demande d’accès"
                  className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1f2b] whitespace-nowrap"
                >
                  Modifier ma demande
                </button>
              </div>
            </div>
          )}

          {showBlockedView && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-800 dark:text-red-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <MaterialIcon name="block" className="w-4 h-4 shrink-0" />
                  <span>
                    {accessStatus === 'revoked'
                      ? 'Accès révoqué par le Super Admin'
                      : 'Demande d’accès refusée'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  L’administrateur principal n’a pas autorisé cet appareil à se connecter. Si vous pensez qu’il s’agit d’une erreur, vous pouvez soumettre une nouvelle demande ou contacter la direction.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingRequest(true)}
                  title="Envoyer une nouvelle demande d’autorisation"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  Soumettre une nouvelle demande
                </button>
                <button
                  type="button"
                  onClick={() => checkAccess()}
                  title="Vérifier à nouveau le statut de cet appareil"
                  className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1f2b] whitespace-nowrap"
                >
                  Actualiser
                </button>
              </div>
            </div>
          )}

          {(!showPendingView && !showBlockedView) && (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                L’accès à la connexion est protégé. Veuillez vous identifier ci-dessous afin d’obtenir l’approbation du Super Admin.
              </p>

              {reqError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2"
                >
                  <MaterialIcon name="warning" className="w-4 h-4 shrink-0" />
                  <span>{reqError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    required
                    value={reqNom}
                    onChange={(e) => setReqNom(e.target.value)}
                    placeholder="ex. Jean Baptiste"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nom du gym / de la salle *
                  </label>
                  <input
                    type="text"
                    required
                    value={reqNomGym}
                    onChange={(e) => setReqNomGym(e.target.value)}
                    placeholder="ex. Tet Dlo Fitness"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone *
                </label>
                <input
                  type="tel"
                  required
                  value={reqTel}
                  onChange={(e) => setReqTel(e.target.value)}
                  placeholder="ex. +509 3700 0000"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email (optionnel)
                  </label>
                  <input
                    type="email"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    placeholder="nom@exemple.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Poste demandé
                  </label>
                  <select
                    value={reqPoste}
                    onChange={(e) => setReqPoste(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="Caissier / Réception">Caissier / Réception</option>
                    <option value="Administrateur">Administrateur</option>
                    <option value="Coach">Coach</option>
                    <option value="Autre collaborateur">Autre collaborateur</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Message pour le Super Admin (optionnel)
                </label>
                <input
                  type="text"
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                  placeholder="Précisez votre rôle ou votre poste"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                {editingRequest && (
                  <button
                    type="button"
                    onClick={() => setEditingRequest(false)}
                    title="Annuler la modification"
                    className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1f2b]"
                  >
                    Annuler
                  </button>
                )}
                <button
                  type="submit"
                  disabled={reqLoading}
                  title="Envoyer la demande d’approbation au Super Admin"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {reqLoading ? 'Envoi en cours...' : 'Demander l’approbation d’accès'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#262b38] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Validation Super Admin requise</span>
            <button
              type="button"
              onClick={onBackHome}
              title="Revenir à la page d’accueil publique"
              className="font-medium text-orange-600 dark:text-orange-400 hover:underline"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Appareil approuvé (ou contrôle désactivé) -> formulaire de connexion standard
  return (
    <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center bg-slate-50 dark:bg-[#0d0f14]">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center">
            <MaterialIcon name="lock" className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Connexion à {gymName}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authentification locale hors ligne (SHA-256)
            </p>
          </div>
        </div>

        {isFirstRunAdmin && (
          <div className="mb-5 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-800 dark:text-orange-200 space-y-1">
            <p className="font-semibold">Premier démarrage — Compte administrateur initial :</p>
            <p>
              Identifiant : <code className="font-mono-num font-semibold">admin</code> · Mot de
              passe : <code className="font-mono-num font-semibold">GymPro2026!</code>
            </p>
            <p className="opacity-80">Pensez à modifier ce mot de passe dans Paramètres.</p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2"
          >
            <MaterialIcon name="warning" className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-user"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nom d’utilisateur
            </label>
            <input
              id="login-user"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex. admin"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label
              htmlFor="login-pass"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            title="Vérifier vos identifiants et ouvrir l’application"
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Vérification...' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#262b38] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Rôles : Admin · Caissier · Coach</span>
          <button
            type="button"
            onClick={onBackHome}
            title="Revenir à la page d’accueil publique"
            className="font-medium text-orange-600 dark:text-orange-400 hover:underline"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    </div>
  );
};

