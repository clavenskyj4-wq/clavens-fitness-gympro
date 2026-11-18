import React, { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { EmptyState } from '../components/ui';
import { SessionUser } from '../lib/auth';
import { getAllRecords, logAction, saveRecord } from '../lib/db';
import { daysUntil, formatDateFR, nowTimeHHMM, todayISO } from '../lib/utils';
import { Abonnement, AppRoute, Forfait, Membre, Presence } from '../types/gym';

interface PresencesPageProps {
  user: SessionUser;
  refreshTick: number;
  onNavigate: (route: AppRoute) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface CheckinBanner {
  allowed: boolean;
  membre: Membre;
  title: string;
  detail: string;
}

export const PresencesPage: React.FC<PresencesPageProps> = ({
  user,
  refreshTick,
  onNavigate,
  onNotify,
}) => {
  const isReadOnly = user.role === 'coach';
  const [membres, setMembres] = useState<Membre[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [presences, setPresences] = useState<Presence[]>([]);

  const [query, setQuery] = useState('');
  const [banner, setBanner] = useState<CheckinBanner | null>(null);

  const loadData = async () => {
    const [m, a, f, pr] = await Promise.all([
      getAllRecords<Membre>('Membres'),
      getAllRecords<Abonnement>('Abonnements'),
      getAllRecords<Forfait>('Forfaits'),
      getAllRecords<Presence>('Presences'),
    ]);
    setMembres(m);
    setAbonnements(a);
    setForfaits(f);
    setPresences(pr.sort((x, y) => (y.date + y.heure_entree).localeCompare(x.date + x.heure_entree)));
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  const performCheckIn = async (membre: Membre, methode: 'code' | 'manuel') => {
    if (isReadOnly) return;

    if (membre.statut === 'suspendu') {
      setBanner({
        allowed: false,
        membre,
        title: 'ACCÈS REFUSÉ — Membre suspendu',
        detail: 'Contactez l’administration pour réactiver ce dossier.',
      });
      return;
    }

    if (membre.statut === 'en_attente') {
      setBanner({
        allowed: false,
        membre,
        title: 'ACCÈS REFUSÉ — Inscription en attente',
        detail: 'Ce dossier doit être vérifié et validé par l’administrateur avant activation.',
      });
      return;
    }

    // Cherche le dernier abonnement
    const memberAbos = abonnements
      .filter((a) => a.membre_id === membre.id && a.statut !== 'annulé')
      .sort((a, b) => b.date_fin.localeCompare(a.date_fin));

    const latestAbo = memberAbos[0];
    if (!latestAbo) {
      setBanner({
        allowed: false,
        membre,
        title: 'ACCÈS REFUSÉ — Aucun abonnement',
        detail: 'Ce membre n’a pas d’abonnement actif enregistré.',
      });
      return;
    }

    const remainingDays = daysUntil(latestAbo.date_fin);
    if (remainingDays < 0 || latestAbo.statut === 'expiré') {
      setBanner({
        allowed: false,
        membre,
        title: 'ACCÈS REFUSÉ — Abonnement expiré',
        detail: `Expiré depuis le ${formatDateFR(latestAbo.date_fin)}. Renouvellement requis.`,
      });
      return;
    }

    const forfait = forfaits.find((f) => f.id === latestAbo.forfait_id);
    if (forfait && typeof forfait.nb_seances_max === 'number' && forfait.nb_seances_max > 0) {
      const usedCount = presences.filter(
        (pr) =>
          pr.membre_id === membre.id &&
          pr.date >= latestAbo.date_debut &&
          pr.date <= latestAbo.date_fin
      ).length;
      if (usedCount >= forfait.nb_seances_max) {
        setBanner({
          allowed: false,
          membre,
          title: 'ACCÈS REFUSÉ — Séances épuisées',
          detail: `${usedCount} / ${forfait.nb_seances_max} séances utilisées sur ce pass.`,
        });
        return;
      }
    }

    await saveRecord<Presence>('Presences', {
      membre_id: membre.id,
      date: todayISO(),
      heure_entree: nowTimeHHMM(),
      heure_sortie: '',
      methode,
    });
    await logAction(
      user.nom_utilisateur,
      'Check-in',
      `${membre.code_membre} — ${membre.prenom} ${membre.nom}`
    );

    setBanner({
      allowed: true,
      membre,
      title: 'ACCÈS ACCEPTÉ',
      detail: `${forfait?.nom || 'Abonnement actif'} · Expire le ${formatDateFR(
        latestAbo.date_fin
      )} (${remainingDays} j restant(s))`,
    });
    setQuery('');
    await loadData();
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = membres.find((m) => m.code_membre.toLowerCase() === q);
    const match =
      exact ||
      membres.find(
        (m) =>
          `${m.prenom} ${m.nom}`.toLowerCase().includes(q) ||
          m.code_membre.toLowerCase().includes(q)
      );
    if (!match) {
      onNotify('error', `Aucun membre trouvé pour "${query}".`);
      return;
    }
    performCheckIn(match, exact ? 'code' : 'manuel');
  };

  const handleCheckOut = async (pr: Presence) => {
    if (isReadOnly) return;
    await saveRecord<Presence>('Presences', {
      ...pr,
      heure_sortie: nowTimeHHMM(),
    });
    await loadData();
    onNotify('info', 'Heure de sortie enregistrée.');
  };

  const today = todayISO();
  const todayPresences = presences.filter((p) => p.date === today);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return membres
      .filter(
        (m) =>
          m.code_membre.toLowerCase().includes(q) ||
          `${m.prenom} ${m.nom}`.toLowerCase().includes(q) ||
          m.telephone.includes(q)
      )
      .slice(0, 6);
  }, [membres, query]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Présences & Check-in
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aujourd’hui ({formatDateFR(today)}) : {todayPresences.length} entrée(s) · Total :{' '}
            {presences.length}
          </p>
        </div>
      </div>

      {/* Zone de saisie rapide par code ou nom */}
      {!isReadOnly && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-4">
          <form onSubmit={handleCodeSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MaterialIcon
                name="qr_code_2"
                className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Saisissez ou scannez le code membre (ex. GYM-0001) ou le nom..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              type="submit"
              title="Vérifier l’abonnement et enregistrer l’entrée du membre"
              className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Valider l’entrée
            </button>
          </form>

          {suggestions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {suggestions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => performCheckIn(m, 'manuel')}
                  title={`Pointer l’entrée de ${m.prenom} ${m.nom}`}
                  className="p-3 rounded-xl border border-slate-200 dark:border-[#262b38] hover:border-orange-500 flex items-center justify-between text-left transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {m.prenom} {m.nom}
                    </p>
                    <p className="font-mono-num text-xs text-slate-500">{m.code_membre}</p>
                  </div>
                  <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                    Pointer
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerte visuelle ACCÈS ACCEPTÉ / REFUSÉ */}
      {banner && (
        <div
          role="status"
          className={`p-5 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            banner.allowed
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-100'
              : 'bg-red-500/15 border-red-500 text-red-900 dark:text-red-100'
          }`}
        >
          <div className="flex items-center gap-4">
            <MaterialIcon
              name={banner.allowed ? 'check_circle' : 'cancel'}
              className={`w-10 h-10 shrink-0 ${
                banner.allowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            />
            <div>
              <p className="font-display font-bold text-lg">{banner.title}</p>
              <p className="text-sm font-medium">
                {banner.membre.prenom} {banner.membre.nom} ({banner.membre.code_membre}) —{' '}
                {banner.detail}
              </p>
            </div>
          </div>
          {!banner.allowed && (
            <button
              type="button"
              onClick={() => onNavigate('paiements')}
              title="Ouvrir la caisse pour encaisser ou renouveler l’abonnement"
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-center"
            >
              Encaisser / Renouveler
            </button>
          )}
        </div>
      )}

      {/* Historique des présences */}
      {presences.length === 0 ? (
        <EmptyState
          icon="event_available"
          title="Aucune présence enregistrée"
          description="Pointez l’arrivée d’un membre ci-dessus pour démarrer l’historique."
        />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Membre</th>
                  <th className="py-3.5 px-4">Entrée</th>
                  <th className="py-3.5 px-4">Sortie</th>
                  <th className="py-3.5 px-4">Méthode</th>
                  {!isReadOnly && <th className="py-3.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38] text-sm">
                {presences.slice(0, 60).map((pr) => {
                  const m = membres.find((x) => x.id === pr.membre_id);
                  return (
                    <tr key={pr.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                      <td className="py-3 px-4 font-mono-num text-xs">
                        {formatDateFR(pr.date)}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {m ? `${m.prenom} ${m.nom}` : 'Membre'}{' '}
                        <span className="font-mono-num text-xs text-slate-500">
                          {m?.code_membre}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        {pr.heure_entree}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600 dark:text-slate-400">
                        {pr.heure_sortie || 'En salle'}
                      </td>
                      <td className="py-3 px-4 text-xs capitalize text-slate-500">
                        {pr.methode}
                      </td>
                      {!isReadOnly && (
                        <td className="py-3 px-4 text-right">
                          {!pr.heure_sortie && (
                            <button
                              type="button"
                              onClick={() => handleCheckOut(pr)}
                              title="Enregistrer l’heure de départ actuelle"
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#262b38] text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Noter sortie
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
