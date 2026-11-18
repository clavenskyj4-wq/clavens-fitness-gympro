import React, { useEffect, useMemo, useState } from 'react';
import {
  MonthlyRevenueChart,
  PlanDistributionChart,
  WeeklyAttendanceChart,
} from '../components/Charts';
import { MaterialIcon } from '../components/MaterialIcon';
import { getAllRecords } from '../lib/db';
import { convertCurrency, daysUntil, formatDateFR, formatMoney, todayISO } from '../lib/utils';
import {
  Abonnement,
  AppRoute,
  Depense,
  Forfait,
  GymConfig,
  Membre,
  Paiement,
  Presence,
  Produit,
  Vente,
} from '../types/gym';

interface DashboardPageProps {
  config: GymConfig;
  refreshTick: number;
  onNavigate: (route: AppRoute) => void;
}

const CHART_COLORS = ['#f97316', '#10b981', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6'];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  config,
  refreshTick,
  onNavigate,
}) => {
  const [loading, setLoading] = useState(true);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [m, f, a, p, pr, d, prod, v] = await Promise.all([
        getAllRecords<Membre>('Membres'),
        getAllRecords<Forfait>('Forfaits'),
        getAllRecords<Abonnement>('Abonnements'),
        getAllRecords<Paiement>('Paiements'),
        getAllRecords<Presence>('Presences'),
        getAllRecords<Depense>('Depenses'),
        getAllRecords<Produit>('Produits'),
        getAllRecords<Vente>('Ventes'),
      ]);
      if (!mounted) return;
      setMembres(m);
      setForfaits(f);
      setAbonnements(a);
      setPaiements(p);
      setPresences(pr);
      setDepenses(d);
      setProduits(prod);
      setVentes(v);
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [refreshTick]);

  const metrics = useMemo(() => {
    const today = todayISO();
    const monthPrefix = today.slice(0, 7);
    const devise = config.devise_defaut;
    const rate = config.taux_change;

    const membresActifs = membres.filter((m) => m.statut === 'actif').length;
    const nouveauxMois = membres.filter((m) =>
      String(m.date_inscription || '').startsWith(monthPrefix)
    ).length;

    const expiringList = abonnements
      .filter((a) => {
        if (a.statut !== 'actif') return false;
        const d = daysUntil(a.date_fin);
        return d >= 0 && d <= (config.alerte_expiration_jours || 7);
      })
      .map((a) => ({
        abo: a,
        membre: membres.find((m) => m.id === a.membre_id),
        forfait: forfaits.find((f) => f.id === a.forfait_id),
        joursRestants: daysUntil(a.date_fin),
      }))
      .sort((x, y) => x.joursRestants - y.joursRestants);

    const presencesJour = presences.filter((p) => p.date === today).length;

    const payToday = paiements
      .filter((p) => p.date === today)
      .reduce((acc, p) => acc + convertCurrency(p.montant, p.devise, devise, rate), 0);
    const salesToday = ventes
      .filter((v) => v.date === today)
      .reduce((acc, v) => acc + convertCurrency(v.total, 'HTG', devise, rate), 0);
    const revenusJour = payToday + salesToday;

    const payMonth = paiements
      .filter((p) => String(p.date || '').startsWith(monthPrefix))
      .reduce((acc, p) => acc + convertCurrency(p.montant, p.devise, devise, rate), 0);
    const salesMonth = ventes
      .filter((v) => String(v.date || '').startsWith(monthPrefix))
      .reduce((acc, v) => acc + convertCurrency(v.total, 'HTG', devise, rate), 0);
    const revenusMois = payMonth + salesMonth;

    const depensesMois = depenses
      .filter((d) => String(d.date || '').startsWith(monthPrefix))
      .reduce((acc, d) => acc + convertCurrency(d.montant, d.devise, devise, rate), 0);

    const beneficeMois = revenusMois - depensesMois;
    const produitsAlerte = produits.filter((p) => p.stock <= p.seuil_alerte);

    // Série 12 derniers mois
    const now = new Date();
    const monthlySeries = [];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const revP = paiements
        .filter((p) => String(p.date || '').startsWith(ym))
        .reduce((acc, p) => acc + convertCurrency(p.montant, p.devise, devise, rate), 0);
      const revV = ventes
        .filter((v) => String(v.date || '').startsWith(ym))
        .reduce((acc, v) => acc + convertCurrency(v.total, 'HTG', devise, rate), 0);
      const dep = depenses
        .filter((d) => String(d.date || '').startsWith(ym))
        .reduce((acc, d) => acc + convertCurrency(d.montant, d.devise, devise, rate), 0);
      monthlySeries.push({
        label: monthNames[dt.getMonth()],
        revenus: Math.round(revP + revV),
        depenses: Math.round(dep),
      });
    }

    // Présences par jour de la semaine (Lun -> Dim)
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const pr of presences) {
      if (!pr.date) continue;
      const dt = new Date(pr.date + 'T12:00:00');
      if (Number.isNaN(dt.getTime())) continue;
      const jsDay = dt.getDay(); // 0=Dim..6=Sam
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      dayCounts[idx]++;
    }
    const weeklyAttendance = dayLabels.map((day, idx) => ({ day, count: dayCounts[idx] }));

    // Répartition des forfaits actifs
    const planCountMap = new Map<string, number>();
    for (const a of abonnements) {
      if (a.statut !== 'actif') continue;
      const f = forfaits.find((x) => x.id === a.forfait_id);
      const name = f?.nom || 'Autre';
      planCountMap.set(name, (planCountMap.get(name) || 0) + 1);
    }
    const planSlices = Array.from(planCountMap.entries()).map(([name, count], idx) => ({
      name,
      count,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));

    return {
      membresActifs,
      nouveauxMois,
      expiringList,
      presencesJour,
      revenusJour,
      revenusMois,
      depensesMois,
      beneficeMois,
      produitsAlerte,
      monthlySeries,
      weeklyAttendance,
      planSlices,
    };
  }, [membres, forfaits, abonnements, paiements, presences, depenses, produits, ventes, config]);

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-slate-200/70 dark:bg-[#151821] animate-pulse border border-slate-200 dark:border-[#262b38]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Tableau de bord
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vue consolidée locale · Aujourd’hui ({formatDateFR(todayISO())}) · Devise :{' '}
            {config.devise_defaut}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('presences')}
            title="Ouvrir le pointage rapide des entrées"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-[#262b38] bg-white dark:bg-[#151821] hover:border-orange-500 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors"
          >
            <MaterialIcon name="qr_code_2" className="w-4 h-4 text-orange-500" />
            Check-in rapide
          </button>
          <button
            type="button"
            onClick={() => onNavigate('paiements')}
            title="Créer un abonnement ou encaisser un paiement"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors"
          >
            <MaterialIcon name="add" className="w-4 h-4" />
            Nouvel abonnement
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Membres actifs</span>
            <MaterialIcon name="group" className="w-4 h-4 text-orange-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.membresActifs}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            +{metrics.nouveauxMois} nouveau(x) ce mois
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expirations sous {config.alerte_expiration_jours} j</span>
            <MaterialIcon name="schedule" className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.expiringList.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Abonnements à renouveler bientôt
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Présences du jour</span>
            <MaterialIcon name="event_available" className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.presencesJour}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Entrées pointées aujourd’hui
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Revenus du jour</span>
            <MaterialIcon name="payments" className="w-4 h-4 text-orange-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(metrics.revenusJour, config.devise_defaut)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Abonnements + Boutique POS
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Revenus du mois</span>
            <MaterialIcon name="trending_up" className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(metrics.revenusMois, config.devise_defaut)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mois en cours</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Dépenses du mois</span>
            <MaterialIcon name="receipt_long" className="w-4 h-4 text-red-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(metrics.depensesMois, config.devise_defaut)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Charges enregistrées</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Bénéfice net du mois</span>
            <MaterialIcon name="bar_chart" className="w-4 h-4 text-emerald-500" />
          </div>
          <p
            className={`mt-2 font-mono-num text-2xl font-bold ${
              metrics.beneficeMois >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatMoney(metrics.beneficeMois, config.devise_defaut)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Revenus − Dépenses</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Produits en alerte stock</span>
            <MaterialIcon name="inventory_2" className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.produitsAlerte.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sous le seuil d’alerte
          </p>
        </div>
      </div>

      {/* Graphiques locaux SVG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Revenus et dépenses sur 12 mois
          </h2>
          <MonthlyRevenueChart data={metrics.monthlySeries} devise={config.devise_defaut} />
        </div>

        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Répartition des forfaits actifs
          </h2>
          <PlanDistributionChart slices={metrics.planSlices} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Présences par jour de la semaine
          </h2>
          <WeeklyAttendanceChart data={metrics.weeklyAttendance} />
        </div>

        {/* Alertes opérationnelles */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Alertes à traiter
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('paiements')}
                title="Voir tous les abonnements et paiements"
                className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
              >
                Gérer les abonnements
              </button>
            </div>

            {metrics.expiringList.length === 0 && metrics.produitsAlerte.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune alerte critique pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#262b38]">
                {metrics.expiringList.slice(0, 4).map(({ abo, membre, forfait, joursRestants }) => (
                  <div key={abo.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {membre ? `${membre.prenom} ${membre.nom}` : 'Membre'} ·{' '}
                        <span className="font-mono-num text-xs text-slate-500">
                          {membre?.code_membre}
                        </span>
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {forfait?.nom || 'Abonnement'} expire dans {joursRestants} jour(s) (
                        {formatDateFR(abo.date_fin)})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('paiements')}
                      title="Ouvrir les paiements pour renouveler cet abonnement"
                      className="px-3 py-1.5 rounded-lg bg-orange-600/10 text-orange-600 dark:text-orange-400 text-xs font-semibold hover:bg-orange-600/20 shrink-0"
                    >
                      Renouveler
                    </button>
                  </div>
                ))}

                {metrics.produitsAlerte.slice(0, 3).map((prod) => (
                  <div key={prod.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        Stock faible : {prod.nom}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Reste {prod.stock} unité(s) (seuil : {prod.seuil_alerte})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('boutique')}
                      title="Ouvrir la boutique pour ajuster le stock"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      Réapprovisionner
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
