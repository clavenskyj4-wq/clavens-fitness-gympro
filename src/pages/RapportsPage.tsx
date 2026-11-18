import React, { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { getAllRecords } from '../lib/db';
import {
  addDaysISO,
  convertCurrency,
  daysUntil,
  exportToCSV,
  formatDateFR,
  formatMoney,
  todayISO,
} from '../lib/utils';
import {
  Abonnement,
  Depense,
  Forfait,
  GymConfig,
  Membre,
  ModePaiement,
  Paiement,
  Presence,
  Vente,
} from '../types/gym';

interface RapportsPageProps {
  config: GymConfig;
  refreshTick: number;
}

type Period = 'jour' | 'semaine' | 'mois' | 'annee';

export const RapportsPage: React.FC<RapportsPageProps> = ({ config, refreshTick }) => {
  const [period, setPeriod] = useState<Period>('mois');
  const [reportTab, setReportTab] = useState<'financier' | 'presences' | 'expires'>('financier');

  const [membres, setMembres] = useState<Membre[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [presences, setPresences] = useState<Presence[]>([]);

  useEffect(() => {
    Promise.all([
      getAllRecords<Membre>('Membres'),
      getAllRecords<Forfait>('Forfaits'),
      getAllRecords<Abonnement>('Abonnements'),
      getAllRecords<Paiement>('Paiements'),
      getAllRecords<Vente>('Ventes'),
      getAllRecords<Depense>('Depenses'),
      getAllRecords<Presence>('Presences'),
    ]).then(([m, f, a, p, v, d, pr]) => {
      setMembres(m);
      setForfaits(f);
      setAbonnements(a);
      setPaiements(p);
      setVentes(v);
      setDepenses(d);
      setPresences(pr);
    });
  }, [refreshTick]);

  const startDate = useMemo(() => {
    const today = todayISO();
    if (period === 'jour') return today;
    if (period === 'semaine') return addDaysISO(today, -6);
    if (period === 'mois') return today.slice(0, 7) + '-01';
    return today.slice(0, 4) + '-01-01';
  }, [period]);

  const stats = useMemo(() => {
    const devise = config.devise_defaut;
    const rate = config.taux_change;
    const inPeriod = (d: string) => d >= startDate && d <= todayISO();

    const payList = paiements.filter((p) => inPeriod(p.date));
    const saleList = ventes.filter((v) => inPeriod(v.date));
    const depList = depenses.filter((d) => inPeriod(d.date));
    const presList = presences.filter((pr) => inPeriod(pr.date));

    const totalAbonnements = payList.reduce(
      (acc, p) => acc + convertCurrency(p.montant, p.devise, devise, rate),
      0
    );
    const totalBoutique = saleList.reduce(
      (acc, v) => acc + convertCurrency(v.total, 'HTG', devise, rate),
      0
    );
    const totalDepenses = depList.reduce(
      (acc, d) => acc + convertCurrency(d.montant, d.devise, devise, rate),
      0
    );
    const totalRevenus = totalAbonnements + totalBoutique;
    const benefice = totalRevenus - totalDepenses;

    const byMode: Record<ModePaiement, number> = {
      espèces: 0,
      MonCash: 0,
      NatCash: 0,
      virement: 0,
      carte: 0,
    };
    payList.forEach((p) => {
      byMode[p.mode] =
        (byMode[p.mode] || 0) + convertCurrency(p.montant, p.devise, devise, rate);
    });
    saleList.forEach((v) => {
      byMode[v.mode_paiement] =
        (byMode[v.mode_paiement] || 0) + convertCurrency(v.total, 'HTG', devise, rate);
    });

    const expiredAbos = abonnements.filter(
      (a) => a.statut !== 'annulé' && (a.statut === 'expiré' || daysUntil(a.date_fin) < 0)
    );

    return {
      payList,
      saleList,
      depList,
      presList,
      totalAbonnements,
      totalBoutique,
      totalRevenus,
      totalDepenses,
      benefice,
      byMode,
      expiredAbos,
    };
  }, [paiements, ventes, depenses, presences, abonnements, startDate, config]);

  const handleExportCSV = () => {
    if (reportTab === 'financier') {
      exportToCSV(
        `rapport-financier-${period}-${todayISO()}.csv`,
        ['Type', 'Date', 'Libellé', 'Mode', 'Montant', 'Devise'],
        [
          ...stats.payList.map((p) => {
            const m = membres.find((x) => x.id === p.membre_id);
            return [
              'Paiement abonnement',
              formatDateFR(p.date),
              m ? `${m.prenom} ${m.nom}` : p.recu_numero,
              p.mode,
              p.montant,
              p.devise,
            ];
          }),
          ...stats.saleList.map((v) => [
            'Vente boutique',
            formatDateFR(v.date),
            `Qté ${v.quantite}`,
            v.mode_paiement,
            v.total,
            'HTG',
          ]),
          ...stats.depList.map((d) => [
            'Dépense',
            formatDateFR(d.date),
            `${d.categorie} - ${d.description}`,
            '—',
            -d.montant,
            d.devise,
          ]),
        ]
      );
    } else if (reportTab === 'presences') {
      exportToCSV(
        `rapport-presences-${period}-${todayISO()}.csv`,
        ['Date', 'Code', 'Membre', 'Entrée', 'Sortie', 'Méthode'],
        stats.presList.map((pr) => {
          const m = membres.find((x) => x.id === pr.membre_id);
          return [
            formatDateFR(pr.date),
            m?.code_membre || '',
            m ? `${m.prenom} ${m.nom}` : '',
            pr.heure_entree,
            pr.heure_sortie || '',
            pr.methode,
          ];
        })
      );
    } else {
      exportToCSV(
        `abonnements-expires-${todayISO()}.csv`,
        ['Code', 'Membre', 'Téléphone', 'Forfait', 'Date fin'],
        stats.expiredAbos.map((a) => {
          const m = membres.find((x) => x.id === a.membre_id);
          const f = forfaits.find((x) => x.id === a.forfait_id);
          return [
            m?.code_membre || '',
            m ? `${m.prenom} ${m.nom}` : '',
            m?.telephone || '',
            f?.nom || '',
            formatDateFR(a.date_fin),
          ];
        })
      );
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Rapports & Exports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bilans financiers, fréquentation et relances d’abonnements expirés
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            title="Télécharger le rapport affiché au format CSV compatible Excel"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-[#262b38] bg-white dark:bg-[#151821] text-sm font-medium"
          >
            <MaterialIcon name="download" className="w-4 h-4" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Imprimer le rapport ou l’enregistrer en PDF"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
          >
            <MaterialIcon name="print" className="w-4 h-4" />
            Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Filtres période & type */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] self-start">
          {(
            [
              ['financier', 'Financier'],
              ['presences', 'Présences'],
              ['expires', 'Abonnements expirés'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setReportTab(k)}
              title={`Afficher le rapport ${label}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                reportTab === k
                  ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {reportTab !== 'expires' && (
          <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] self-start">
            {(
              [
                ['jour', 'Jour'],
                ['semaine', '7 jours'],
                ['mois', 'Mois'],
                ['annee', 'Année'],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                title={`Filtrer sur la période : ${label}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  period === p
                    ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zone imprimable A4 */}
      <div className="print-area-a4 space-y-6">
        <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
          <h2 className="font-display text-xl font-bold">{config.nom_gym} — Rapport</h2>
          <p className="text-xs">
            Période : depuis {formatDateFR(startDate)} jusqu’au {formatDateFR(todayISO())}
          </p>
        </div>

        {reportTab === 'financier' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
                <p className="text-xs text-slate-500">Abonnements encaissés</p>
                <p className="mt-1 font-mono-num text-xl font-bold">
                  {formatMoney(stats.totalAbonnements, config.devise_defaut)}
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
                <p className="text-xs text-slate-500">Ventes Boutique</p>
                <p className="mt-1 font-mono-num text-xl font-bold">
                  {formatMoney(stats.totalBoutique, config.devise_defaut)}
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
                <p className="text-xs text-slate-500">Total Dépenses</p>
                <p className="mt-1 font-mono-num text-xl font-bold text-red-600 dark:text-red-400">
                  {formatMoney(stats.totalDepenses, config.devise_defaut)}
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
                <p className="text-xs text-slate-500">Bénéfice Net</p>
                <p
                  className={`mt-1 font-mono-num text-xl font-bold ${
                    stats.benefice >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatMoney(stats.benefice, config.devise_defaut)}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
              <h3 className="font-display font-semibold text-base mb-3">
                Ventilation des recettes par mode de paiement
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {(Object.entries(stats.byMode) as [ModePaiement, number][]).map(([mode, val]) => (
                  <div
                    key={mode}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]"
                  >
                    <p className="text-xs text-slate-500 capitalize">{mode}</p>
                    <p className="font-mono-num font-bold text-sm mt-1">
                      {formatMoney(val, config.devise_defaut)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {reportTab === 'presences' && (
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] font-semibold text-sm">
              {stats.presList.length} présence(s) depuis le {formatDateFR(startDate)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Membre</th>
                    <th className="py-2.5 px-4">Entrée</th>
                    <th className="py-2.5 px-4">Sortie</th>
                    <th className="py-2.5 px-4">Méthode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                  {stats.presList.map((pr) => {
                    const m = membres.find((x) => x.id === pr.membre_id);
                    return (
                      <tr key={pr.id}>
                        <td className="py-2.5 px-4 font-mono-num text-xs">
                          {formatDateFR(pr.date)}
                        </td>
                        <td className="py-2.5 px-4">
                          {m ? `${m.prenom} ${m.nom} (${m.code_membre})` : 'Membre'}
                        </td>
                        <td className="py-2.5 px-4 font-mono-num text-xs">{pr.heure_entree}</td>
                        <td className="py-2.5 px-4 font-mono-num text-xs">
                          {pr.heure_sortie || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-xs capitalize">{pr.methode}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportTab === 'expires' && (
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] font-semibold text-sm">
              {stats.expiredAbos.length} abonnement(s) expiré(s) à relancer
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Membre</th>
                    <th className="py-2.5 px-4">Téléphone</th>
                    <th className="py-2.5 px-4">Forfait</th>
                    <th className="py-2.5 px-4">Expiré le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                  {stats.expiredAbos.map((a) => {
                    const m = membres.find((x) => x.id === a.membre_id);
                    const f = forfaits.find((x) => x.id === a.forfait_id);
                    return (
                      <tr key={a.id}>
                        <td className="py-2.5 px-4 font-mono-num text-xs">
                          {m?.code_membre || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-medium">
                          {m ? `${m.prenom} ${m.nom}` : 'Membre'}
                        </td>
                        <td className="py-2.5 px-4 font-mono-num text-xs">
                          {m?.telephone || '—'}
                        </td>
                        <td className="py-2.5 px-4">{f?.nom || 'Forfait'}</td>
                        <td className="py-2.5 px-4 font-mono-num text-xs text-red-600 dark:text-red-400">
                          {formatDateFR(a.date_fin)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
