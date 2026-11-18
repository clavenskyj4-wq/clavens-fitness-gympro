import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import {
  clearSuperAdminToken,
  decideSuperAdminRequest,
  getSuperAdminRequests,
  getSuperAdminToken,
  loginSuperAdmin,
} from '../lib/superAdmin';
import { saveRecord } from '../lib/db';
import { Membre } from '../types/gym';
import { formatDateFR } from '../lib/utils';

interface SuperAdminPageProps {
  gymName: string;
  onAuthenticated: () => void;
  onBack: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const SuperAdminPage: React.FC<SuperAdminPageProps> = ({
  gymName,
  onAuthenticated,
  onBack,
  onNotify,
}) => {
  const [token, setToken] = useState(getSuperAdminToken);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [pending, setPending] = useState<Membre[]>([]);
  const [approved, setApproved] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [processingId, setProcessingId] = useState('');

  const refreshRequests = useCallback(async (activeToken: string) => {
    const data = await getSuperAdminRequests(activeToken);
    setPending(data.pending);
    setApproved(data.approved);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getSuperAdminRequests(token)
      .then((data) => {
        if (active) {
          setPending(data.pending);
          setApproved(data.approved);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        clearSuperAdminToken();
        setToken('');
        setLoginError(error instanceof Error ? error.message : 'Session super admin expirée.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const newToken = await loginSuperAdmin(username, password);
      setToken(newToken);
      setPassword('');
      onAuthenticated();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Connexion super admin impossible.');
      setLoading(false);
    }
  };

  const importApprovedMember = async (member: Membre) => {
    if (!token) return;
    setProcessingId(member.id);
    try {
      await saveRecord<Membre>('Membres', {
        ...member,
        statut: 'en_attente',
      });
      await decideSuperAdminRequest(token, member.id, 'complete');
      await refreshRequests(token);
      onNotify(
        'success',
        `${member.prenom} ${member.nom} est approuvé. Terminez son inscription dans Membres.`
      );
    } catch (error) {
      onNotify(
        'error',
        error instanceof Error ? error.message : 'Impossible d’importer cette demande approuvée.'
      );
      if (token) await refreshRequests(token).catch(() => undefined);
    } finally {
      setProcessingId('');
    }
  };

  const handleApprove = async (member: Membre) => {
    if (!token) return;
    setProcessingId(member.id);
    try {
      const result = await decideSuperAdminRequest(token, member.id, 'approve');
      const approvedMember = result.member || member;
      await saveRecord<Membre>('Membres', {
        ...approvedMember,
        statut: 'en_attente',
      });
      await decideSuperAdminRequest(token, member.id, 'complete');
      await refreshRequests(token);
      onNotify(
        'success',
        `Demande approuvée pour ${member.prenom} ${member.nom}. Finalisez son forfait dans Membres.`
      );
    } catch (error) {
      onNotify(
        'error',
        error instanceof Error ? error.message : 'Impossible de traiter cette demande.'
      );
      await refreshRequests(token).catch(() => undefined);
    } finally {
      setProcessingId('');
    }
  };

  const handleReject = async (member: Membre) => {
    if (!token) return;
    setProcessingId(member.id);
    try {
      await decideSuperAdminRequest(token, member.id, 'reject');
      await refreshRequests(token);
      onNotify('info', `Demande de ${member.prenom} ${member.nom} refusée.`);
    } catch (error) {
      onNotify(
        'error',
        error instanceof Error ? error.message : 'Impossible de refuser cette demande.'
      );
    } finally {
      setProcessingId('');
    }
  };

  const handleLogout = () => {
    clearSuperAdminToken();
    setToken('');
    setPending([]);
    setApproved([]);
    setLoginError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14]">
      <header className="border-b border-slate-200 bg-white/90 dark:border-[#262b38] dark:bg-[#11141c]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
              <MaterialIcon name="verified" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">
                Espace privé
              </p>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Super administration
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {token && (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-[#262b38] dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Verrouiller
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <MaterialIcon name="chevron_left" className="h-4 w-4" />
              Retour à l’application
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
        {!token ? (
          <section className="mx-auto mt-8 max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-[#262b38] dark:bg-[#151821] sm:p-8">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <MaterialIcon name="lock" className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Accès propriétaire
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Connectez-vous pour consulter et approuver les demandes reçues par votre lien
              d’inscription. Cette page ne fait pas partie du lien partagé aux membres.
            </p>
            {loginError && (
              <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                {loginError}
              </p>
            )}
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Identifiant super admin
                <input
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm dark:border-[#303646] dark:bg-[#0d0f14] dark:text-white"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Mot de passe
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm dark:border-[#303646] dark:bg-[#0d0f14] dark:text-white"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
              >
                {loading ? 'Vérification…' : 'Ouvrir mon espace sécurisé'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-6 text-white shadow-xl sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
                    {gymName}
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
                    Centre de contrôle des inscriptions
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    Examinez chaque dossier avant de l’autoriser. Les demandes approuvées sont
                    ajoutées à la liste Membres pour finaliser le forfait et l’adhésion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    refreshRequests(token)
                      .catch((error: unknown) =>
                        onNotify('error', error instanceof Error ? error.message : 'Actualisation impossible.')
                      )
                      .finally(() => setLoading(false));
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
                >
                  <MaterialIcon name="refresh" className="h-4 w-4" />
                  Actualiser
                </button>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs text-slate-300">À examiner</p>
                  <p className="mt-1 font-mono-num text-3xl font-extrabold">{pending.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs text-slate-300">À importer</p>
                  <p className="mt-1 font-mono-num text-3xl font-extrabold">{approved.length}</p>
                </div>
              </div>
            </section>

            {loading && (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-[#262b38] dark:bg-[#151821]">
                Chargement des demandes…
              </p>
            )}

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Demandes en attente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Aucune inscription issue du lien public n’est activée sans votre décision.
                  </p>
                </div>
              </div>
              {pending.length === 0 && !loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-9 text-center dark:border-[#303646] dark:bg-[#151821]">
                  <MaterialIcon name="group" className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tout est à jour
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Les nouvelles demandes apparaîtront ici.</p>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {pending.map((member) => (
                    <article
                      key={member.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#262b38] dark:bg-[#151821]"
                    >
                      <div className="flex gap-4">
                        {member.photo ? (
                          <img
                            src={member.photo}
                            alt={`${member.prenom} ${member.nom}`}
                            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                          />
                        ) : (
                          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                            <MaterialIcon name="person" className="h-8 w-8" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h4 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                              {member.prenom} {member.nom}
                            </h4>
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                              À examiner
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Demande {member.code_membre} · {formatDateFR(member.date_inscription)}
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                            {member.telephone || 'Téléphone non renseigné'}
                          </p>
                          {member.email && (
                            <p className="mt-0.5 truncate text-xs text-slate-500">{member.email}</p>
                          )}
                        </div>
                      </div>
                      {(member.objectif || member.notes_sante) && (
                        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-[#0d0f14] dark:text-slate-300">
                          {member.objectif && <p><strong>Objectif :</strong> {member.objectif}</p>}
                          {member.notes_sante && <p><strong>Notes :</strong> {member.notes_sante}</p>}
                        </div>
                      )}
                      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#262b38]">
                        <button
                          type="button"
                          disabled={processingId === member.id}
                          onClick={() => handleReject(member)}
                          className="rounded-xl border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          Refuser
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(processingId)}
                          onClick={() => handleApprove(member)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <MaterialIcon name="check_circle" className="h-4 w-4" />
                          {processingId === member.id ? 'Traitement…' : 'Approuver'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {approved.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Approbations à finaliser
                </h3>
                <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-[#262b38] dark:border-[#262b38] dark:bg-[#151821]">
                  {approved.map((member) => (
                    <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {member.prenom} {member.nom}
                        </p>
                        <p className="text-xs text-slate-500">
                          Déjà approuvé · {member.telephone || 'Téléphone non renseigné'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(processingId)}
                        onClick={() => importApprovedMember(member)}
                        className="rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        Réessayer l’import
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
