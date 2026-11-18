import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { EmptyState, Modal, PrintPortal, SubscriptionProgressBar } from '../components/ui';
import { SessionUser } from '../lib/auth';
import {
  getAllRecords,
  getNextReceiptNumber,
  logAction,
  saveRecord,
} from '../lib/db';
import {
  addDaysISO,
  convertCurrency,
  daysUntil,
  formatDateFR,
  formatMoney,
  todayISO,
} from '../lib/utils';
import {
  Abonnement,
  Coach,
  Devise,
  Forfait,
  GymConfig,
  Membre,
  ModePaiement,
  Paiement,
} from '../types/gym';

export interface RenewRequest {
  memberId: string;
  forfaitId?: string;
  nonce: number;
}

interface PaiementsPageProps {
  user: SessionUser;
  config: GymConfig;
  refreshTick: number;
  renewRequest?: RenewRequest | null;
  onRenewHandled?: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const MODES: ModePaiement[] = ['espèces', 'MonCash', 'NatCash', 'virement', 'carte'];

export const PaiementsPage: React.FC<PaiementsPageProps> = ({
  user,
  config,
  refreshTick,
  renewRequest,
  onRenewHandled,
  onNotify,
}) => {
  const [membres, setMembres] = useState<Membre[]>([]);
  const [coachs, setCoachs] = useState<Coach[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [tab, setTab] = useState<'abonnements' | 'paiements'>('abonnements');

  // Assistant 3 étapes (Membre -> Forfait -> Paiement)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedForfaitId, setSelectedForfaitId] = useState('');
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [prixApplique, setPrixApplique] = useState(0);
  const [includeCoachFee, setIncludeCoachFee] = useState(false);
  const [montantPaye, setMontantPaye] = useState(0);
  const [devisePay, setDevisePay] = useState<Devise>(config.devise_defaut);
  const [modePay, setModePay] = useState<ModePaiement>('espèces');
  const [refPay, setRefPay] = useState('');
  const [notePay, setNotePay] = useState('');

  // Règlement de solde restant
  const [balanceTarget, setBalanceTarget] = useState<{
    abo: Abonnement;
    membre?: Membre;
    solde: number;
    devise: Devise;
  } | null>(null);
  const [balanceAmount, setBalanceAmount] = useState(0);
  const [balanceMode, setBalanceMode] = useState<ModePaiement>('espèces');
  const [balanceRef, setBalanceRef] = useState('');

  // Reçu imprimable (80 mm ou A4)
  const [receipt, setReceipt] = useState<Paiement | null>(null);
  const [receiptFormat, setReceiptFormat] = useState<'80mm' | 'a4'>('80mm');

  const loadData = async () => {
    const [m, c, f, a, p] = await Promise.all([
      getAllRecords<Membre>('Membres'),
      getAllRecords<Coach>('Coachs'),
      getAllRecords<Forfait>('Forfaits'),
      getAllRecords<Abonnement>('Abonnements'),
      getAllRecords<Paiement>('Paiements'),
    ]);
    setMembres(m);
    setCoachs(c);
    setForfaits(f.filter((x) => x.actif === 1));
    setAbonnements(a.sort((x, y) => y.created_at.localeCompare(x.created_at)));
    setPaiements(p.sort((x, y) => y.created_at.localeCompare(x.created_at)));
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  const paidByAbo = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of paiements) {
      const abo = abonnements.find((a) => a.id === p.abonnement_id);
      const forfait = forfaits.find((f) => f.id === abo?.forfait_id);
      const targetDevise = forfait?.devise || config.devise_defaut;
      const converted = convertCurrency(p.montant, p.devise, targetDevise, config.taux_change);
      map.set(p.abonnement_id, (map.get(p.abonnement_id) || 0) + converted);
    }
    return map;
  }, [paiements, abonnements, forfaits, config]);

  const openWizard = (presetMemberId?: string, presetForfaitId?: string) => {
    const defaultForfait =
      forfaits.find((f) => f.id === presetForfaitId) || forfaits[0];
    setStep(presetMemberId ? 2 : 1);
    setSelectedMemberId(presetMemberId || membres[0]?.id || '');
    setMemberQuery('');
    setSelectedForfaitId(defaultForfait?.id || '');
    setDateDebut(todayISO());
    setIncludeCoachFee(false);
    setPrixApplique(defaultForfait?.prix || 0);
    setMontantPaye(defaultForfait?.prix || 0);
    setDevisePay(defaultForfait?.devise || config.devise_defaut);
    setModePay('espèces');
    setRefPay('');
    setNotePay('');
    setWizardOpen(true);
  };

  const handledRenewNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!renewRequest || membres.length === 0) return;
    if (handledRenewNonceRef.current === renewRequest.nonce) return;
    const exists = membres.some((m) => m.id === renewRequest.memberId);
    if (exists) {
      handledRenewNonceRef.current = renewRequest.nonce;
      openWizard(renewRequest.memberId, renewRequest.forfaitId);
      onRenewHandled?.();
    }
  }, [renewRequest, membres, forfaits]);

  const handleSelectForfait = (fid: string) => {
    setSelectedForfaitId(fid);
    const f = forfaits.find((x) => x.id === fid);
    if (f) {
      const m = membres.find((x) => x.id === selectedMemberId);
      const memberCoachFee = Number(m?.tarif_coach || 0);
      const convertedCoach = includeCoachFee
        ? convertCurrency(memberCoachFee, config.devise_defaut, f.devise, config.taux_change)
        : 0;
      const total = Math.round((f.prix + convertedCoach) * 100) / 100;
      setPrixApplique(total);
      setMontantPaye(total);
      setDevisePay(f.devise);
    }
  };

  const handleCompleteWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    const membre = membres.find((m) => m.id === selectedMemberId);
    const forfait = forfaits.find((f) => f.id === selectedForfaitId);
    if (!membre || !forfait) {
      onNotify('error', 'Veuillez sélectionner un membre et un forfait.');
      return;
    }

    const dateFin = addDaysISO(dateDebut, Math.max(0, Number(forfait.duree_jours) - 1));
    const abo = await saveRecord<Abonnement>('Abonnements', {
      membre_id: membre.id,
      forfait_id: forfait.id,
      date_debut: dateDebut,
      date_fin: dateFin,
      prix_applique: Number(prixApplique),
      statut: 'actif',
    });

    // Mettre le membre en statut actif
    if (membre.statut !== 'actif') {
      await saveRecord<Membre>('Membres', { ...membre, statut: 'actif' });
    }

    let createdPayment: Paiement | null = null;
    if (Number(montantPaye) > 0) {
      const recuNum = await getNextReceiptNumber();
      createdPayment = await saveRecord<Paiement>('Paiements', {
        membre_id: membre.id,
        abonnement_id: abo.id,
        date: todayISO(),
        montant: Number(montantPaye),
        devise: devisePay,
        mode: modePay,
        reference: refPay.trim(),
        note: notePay.trim(),
        recu_numero: recuNum,
      });
    }

    await logAction(
      user.nom_utilisateur,
      'Nouvel abonnement',
      `${membre.code_membre} · ${forfait.nom} · Payé ${montantPaye} ${devisePay}`
    );

    setWizardOpen(false);
    await loadData();
    onNotify('success', 'Abonnement et paiement enregistrés localement.');
    if (createdPayment) {
      setReceipt(createdPayment);
    }
  };

  const handlePayBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceTarget || balanceAmount <= 0) return;
    const recuNum = await getNextReceiptNumber();
    const p = await saveRecord<Paiement>('Paiements', {
      membre_id: balanceTarget.abo.membre_id,
      abonnement_id: balanceTarget.abo.id,
      date: todayISO(),
      montant: Number(balanceAmount),
      devise: balanceTarget.devise,
      mode: balanceMode,
      reference: balanceRef.trim(),
      note: 'Règlement de solde',
      recu_numero: recuNum,
    });
    await logAction(
      user.nom_utilisateur,
      'Règlement solde',
      `Reçu ${recuNum} — ${balanceAmount} ${balanceTarget.devise}`
    );
    setBalanceTarget(null);
    await loadData();
    onNotify('success', `Paiement de solde enregistré (${recuNum}).`);
    setReceipt(p);
  };

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return membres;
    return membres.filter(
      (m) =>
        m.code_membre.toLowerCase().includes(q) ||
        m.nom.toLowerCase().includes(q) ||
        m.prenom.toLowerCase().includes(q)
    );
  }, [membres, memberQuery]);

  const selectedForfait = forfaits.find((f) => f.id === selectedForfaitId);
  const selectedMember = membres.find((m) => m.id === selectedMemberId);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Abonnements & Paiements
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inscription en 3 étapes, paiements partiels, MonCash/NatCash et reçus 80 mm / A4
          </p>
        </div>
        <button
          type="button"
          onClick={() => openWizard()}
          disabled={membres.length === 0 || forfaits.length === 0}
          title="Démarrer l’assistant d’abonnement et d’encaissement en 3 étapes"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Inscrire / Encaisser (3 étapes)
        </button>
      </div>

      {(membres.length === 0 || forfaits.length === 0) && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800 dark:text-amber-200">
          {membres.length === 0
            ? 'Ajoutez d’abord au moins un membre dans le module Membres.'
            : 'Créez au moins un forfait dans Paramètres avant d’encaisser un abonnement.'}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] self-start inline-flex">
        <button
          type="button"
          onClick={() => setTab('abonnements')}
          title="Afficher la liste des abonnements actifs et expirés"
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'abonnements'
              ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Abonnements ({abonnements.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('paiements')}
          title="Afficher l’historique de tous les paiements encaissés"
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'paiements'
              ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Historique des paiements ({paiements.length})
        </button>
      </div>

      {tab === 'abonnements' ? (
        abonnements.length === 0 ? (
          <EmptyState
            icon="payments"
            title="Aucun abonnement enregistré"
            description="Lancez l’assistant en 3 étapes pour abonner un membre et imprimer son reçu."
            actionLabel={membres.length > 0 && forfaits.length > 0 ? 'Nouvel abonnement' : undefined}
            onAction={() => openWizard()}
          />
        ) : (
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 px-4">Membre</th>
                    <th className="py-3.5 px-4">Forfait</th>
                    <th className="py-3.5 px-4">Période</th>
                    <th className="py-3.5 px-4 text-right">Prix</th>
                    <th className="py-3.5 px-4 text-right">Solde restant</th>
                    <th className="py-3.5 px-4">Statut</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#262b38] text-sm">
                  {abonnements.map((a) => {
                    const m = membres.find((x) => x.id === a.membre_id);
                    const f = forfaits.find((x) => x.id === a.forfait_id);
                    const dev = f?.devise || config.devise_defaut;
                    const paid = paidByAbo.get(a.id) || 0;
                    const solde = Math.max(0, Math.round((a.prix_applique - paid) * 100) / 100);
                    const daysLeft = daysUntil(a.date_fin);
                    const effectiveStatus =
                      a.statut === 'annulé'
                        ? 'annulé'
                        : daysLeft < 0
                        ? 'expiré'
                        : 'actif';
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {m ? `${m.prenom} ${m.nom}` : 'Membre supprimé'}
                          </p>
                          <p className="font-mono-num text-xs text-slate-500">{m?.code_membre}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {f?.nom || 'Forfait'}
                        </td>
                        <td className="py-3 px-4">
                          <SubscriptionProgressBar
                            dateDebut={a.date_debut}
                            dateFin={a.date_fin}
                            alertDays={config.alerte_expiration_jours}
                            compact
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num">
                          {formatMoney(a.prix_applique, dev)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num">
                          {solde > 0 ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {formatMoney(solde, dev)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Soldé</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-semibold capitalize ${
                              effectiveStatus === 'actif'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {effectiveStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {solde > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBalanceTarget({ abo: a, membre: m, solde, devise: dev });
                                  setBalanceAmount(solde);
                                  setBalanceMode('espèces');
                                  setBalanceRef('');
                                }}
                                title="Encaisser tout ou partie du solde restant sur cet abonnement"
                                className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-500/25"
                              >
                                Régler solde
                              </button>
                            )}
                            {m && (
                              <button
                                type="button"
                                onClick={() => openWizard(m.id, a.forfait_id)}
                                title="Renouveler rapidement l’abonnement de ce membre"
                                className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-semibold hover:bg-orange-500/25"
                              >
                                Renouveler
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : paiements.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Aucun paiement enregistré"
          description="Les encaissements et reçus apparaîtront ici."
        />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4">Reçu</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Membre</th>
                  <th className="py-3.5 px-4">Mode</th>
                  <th className="py-3.5 px-4 text-right">Montant</th>
                  <th className="py-3.5 px-4 text-right">Imprimer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38] text-sm">
                {paiements.map((p) => {
                  const m = membres.find((x) => x.id === p.membre_id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                      <td className="py-3 px-4 font-mono-num text-xs font-semibold">
                        {p.recu_numero}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs">{formatDateFR(p.date)}</td>
                      <td className="py-3 px-4">
                        {m ? `${m.prenom} ${m.nom}` : 'Membre'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {p.mode} {p.reference ? `· ${p.reference}` : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(p.montant, p.devise)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setReceipt(p)}
                          title={`Afficher et imprimer le reçu ${p.recu_numero}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#262b38] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                        >
                          <MaterialIcon name="print" className="w-3.5 h-3.5" />
                          Reçu
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assistant 3 étapes */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={`Nouvel abonnement — Étape ${step} / 3`}
        maxWidth="max-w-xl"
      >
        <div className="flex items-center gap-2 mb-6 text-xs font-medium">
          {[
            [1, '1. Membre'],
            [2, '2. Forfait'],
            [3, '3. Paiement'],
          ].map(([sNum, label]) => (
            <button
              key={sNum}
              type="button"
              onClick={() => setStep(sNum as 1 | 2 | 3)}
              title={`Aller à l’étape ${label}`}
              className={`flex-1 py-2 px-3 rounded-xl border text-center transition-colors ${
                step === sNum
                  ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold'
                  : 'border-slate-200 dark:border-[#262b38] text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleCompleteWizard} className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <input
                type="search"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Filtrer par nom ou code GYM-..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-[#262b38] rounded-xl border border-slate-200 dark:border-[#262b38]">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMemberId(m.id);
                      setIncludeCoachFee(false);
                      if (selectedForfait) {
                        setPrixApplique(selectedForfait.prix);
                        setMontantPaye(selectedForfait.prix);
                      }
                      if (notePay.startsWith('Inclut coaching')) setNotePay('');
                      setStep(2);
                    }}
                    title={`Sélectionner ${m.prenom} ${m.nom} (${m.code_membre})`}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      selectedMemberId === m.id ? 'bg-orange-500/10' : ''
                    }`}
                  >
                    <span className="font-medium">
                      {m.prenom} {m.nom}
                    </span>
                    <span className="font-mono-num text-xs text-slate-500">{m.code_membre}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!selectedMemberId}
                  title="Passer au choix du forfait"
                  className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {forfaits.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleSelectForfait(f.id)}
                    title={`Choisir le forfait ${f.nom} (${formatMoney(f.prix, f.devise)})`}
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      selectedForfaitId === f.id
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-slate-200 dark:border-[#262b38]'
                    }`}
                  >
                    <p className="font-semibold text-sm">{f.nom}</p>
                    <p className="font-mono-num text-sm font-bold text-orange-600 dark:text-orange-400 mt-1">
                      {formatMoney(f.prix, f.devise)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {f.duree_jours} jour(s) ·{' '}
                      {f.nb_seances_max ? `${f.nb_seances_max} séances` : 'Illimité'}
                    </p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Prix appliqué ({selectedForfait?.devise || config.devise_defaut})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={prixApplique}
                    onChange={(e) => setPrixApplique(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  title="Revenir au choix du membre"
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!selectedForfaitId}
                  title="Passer à la saisie du paiement"
                  className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
                >
                  Passer à l’encaissement
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] text-sm flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    {selectedMember?.prenom} {selectedMember?.nom}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedForfait?.nom} · Début {formatDateFR(dateDebut)}
                  </p>
                </div>
                <p className="font-mono-num font-bold text-orange-600 dark:text-orange-400">
                  {formatMoney(prixApplique, selectedForfait?.devise || config.devise_defaut)}
                </p>
              </div>

              {selectedMember && (selectedMember.coach_id || Number(selectedMember.tarif_coach || 0) > 0) && (() => {
                const assignedCoach = coachs.find((c) => c.id === selectedMember.coach_id);
                const rawCoachFee =
                  Number(selectedMember.tarif_coach || 0) ||
                  Number(assignedCoach?.tarif_coaching || config.tarif_coach_defaut || 0);
                if (rawCoachFee <= 0) return null;
                const targetDev = selectedForfait?.devise || config.devise_defaut;
                const convertedFee =
                  Math.round(
                    convertCurrency(rawCoachFee, config.devise_defaut, targetDev, config.taux_change) * 100
                  ) / 100;
                return (
                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-orange-500/8 border border-orange-500/25 text-xs cursor-pointer">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={includeCoachFee}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIncludeCoachFee(checked);
                          const base = selectedForfait ? Number(selectedForfait.prix) : prixApplique;
                          const nextTotal = Math.round((checked ? base + convertedFee : base) * 100) / 100;
                          setPrixApplique(nextTotal);
                          setMontantPaye(nextTotal);
                          if (checked) {
                            const coachName = assignedCoach
                              ? `${assignedCoach.prenom} ${assignedCoach.nom}`
                              : 'Coach personnalisé';
                            setNotePay(`Inclut coaching (${coachName})`);
                          } else if (notePay.startsWith('Inclut coaching')) {
                            setNotePay('');
                          }
                        }}
                      />
                      Inclure le suivi coach (
                      {assignedCoach ? `${assignedCoach.prenom} ${assignedCoach.nom}` : 'Personnalisé'})
                    </span>
                    <span className="font-mono-num font-bold text-orange-600 dark:text-orange-400">
                      + {formatMoney(rawCoachFee, config.devise_defaut)}
                    </span>
                  </label>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Montant encaissé (0 = crédit / partiel possible)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={montantPaye}
                    onChange={(e) => setMontantPaye(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Devise</label>
                  <select
                    value={devisePay}
                    onChange={(e) => setDevisePay(e.target.value as Devise)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    <option value="HTG">HTG (Gourdes)</option>
                    <option value="USD">USD (Dollars)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Mode de paiement
                  </label>
                  <select
                    value={modePay}
                    onChange={(e) => setModePay(e.target.value as ModePaiement)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Référence (MonCash / NatCash / Bordereau)
                  </label>
                  <input
                    type="text"
                    value={refPay}
                    onChange={(e) => setRefPay(e.target.value)}
                    placeholder="ex. MC-452019"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Note</label>
                  <input
                    type="text"
                    value={notePay}
                    onChange={(e) => setNotePay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  title="Revenir au choix du forfait"
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Précédent
                </button>
                <button
                  type="submit"
                  title="Enregistrer l’abonnement, le paiement et afficher le reçu"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  Valider & Générer le reçu
                </button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Modale Règlement de solde */}
      <Modal
        open={Boolean(balanceTarget)}
        onClose={() => setBalanceTarget(null)}
        title="Régler le solde restant"
        maxWidth="max-w-md"
      >
        {balanceTarget && (
          <form onSubmit={handlePayBalance} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Membre :{' '}
              <strong>
                {balanceTarget.membre?.prenom} {balanceTarget.membre?.nom}
              </strong>
              <br />
              Solde dû :{' '}
              <strong className="font-mono-num text-amber-600 dark:text-amber-400">
                {formatMoney(balanceTarget.solde, balanceTarget.devise)}
              </strong>
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Montant ({balanceTarget.devise})
              </label>
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mode</label>
              <select
                value={balanceMode}
                onChange={(e) => setBalanceMode(e.target.value as ModePaiement)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Référence</label>
              <input
                type="text"
                value={balanceRef}
                onChange={(e) => setBalanceRef(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBalanceTarget(null)}
                title="Annuler et fermer"
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                title="Valider le règlement du solde restant"
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
              >
                Encaisser
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Reçu Imprimable (80 mm thermique ou A4) */}
      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Reçu de paiement"
        maxWidth="max-w-xl"
      >
        {receipt &&
          (() => {
            const m = membres.find((x) => x.id === receipt.membre_id);
            const abo = abonnements.find((x) => x.id === receipt.abonnement_id);
            const forfait = forfaits.find((x) => x.id === abo?.forfait_id);
            return (
              <div className="space-y-4">
                <div className="no-print flex items-center justify-between gap-2">
                  <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
                    <button
                      type="button"
                      onClick={() => setReceiptFormat('80mm')}
                      title="Afficher le reçu au format ticket thermique 80 mm"
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${
                        receiptFormat === '80mm'
                          ? 'bg-white dark:bg-[#232836] shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Thermique 80 mm
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptFormat('a4')}
                      title="Afficher le reçu au format page A4"
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${
                        receiptFormat === 'a4'
                          ? 'bg-white dark:bg-[#232836] shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Format A4
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="Lancer l’impression du reçu"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
                  >
                    <MaterialIcon name="print" className="w-4 h-4" />
                    Imprimer
                  </button>
                </div>

                <div
                  className={`mx-auto bg-white text-slate-900 border border-slate-300 rounded-xl p-5 ${
                    receiptFormat === '80mm'
                      ? 'print-area-thermal max-w-[300px] text-xs'
                      : 'print-area-a4 w-full text-sm'
                  }`}
                >
                  <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                    <p className="font-display font-bold text-base">{config.nom_gym}</p>
                    <p className="text-[11px] text-slate-600">{config.adresse}</p>
                    <p className="text-[11px] text-slate-600">{config.telephone}</p>
                    <p className="font-mono-num font-bold mt-2">REÇU N° {receipt.recu_numero}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Date :</span>
                      <span className="font-mono-num">{formatDateFR(receipt.date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Membre :</span>
                      <span className="font-semibold">
                        {m ? `${m.prenom} ${m.nom}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Code :</span>
                      <span className="font-mono-num">{m?.code_membre || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Forfait :</span>
                      <span>{forfait?.nom || 'Abonnement'}</span>
                    </div>
                    {abo && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Validité :</span>
                        <span className="font-mono-num">
                          {formatDateFR(abo.date_debut)} - {formatDateFR(abo.date_fin)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">Mode :</span>
                      <span>
                        {receipt.mode} {receipt.reference ? `(${receipt.reference})` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 mt-3 pt-3 flex justify-between items-center font-bold text-base">
                    <span>TOTAL PAYÉ</span>
                    <span className="font-mono-num">
                      {formatMoney(receipt.montant, receipt.devise)}
                    </span>
                  </div>

                  {config.message_recu && (
                    <p className="mt-4 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-600">
                      {config.message_recu}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>

      <PrintPortal active={Boolean(receipt)}>
        {receipt &&
          (() => {
            const m = membres.find((x) => x.id === receipt.membre_id);
            const abo = abonnements.find((x) => x.id === receipt.abonnement_id);
            const forfait = forfaits.find((x) => x.id === abo?.forfait_id);
            return (
              <div
                className={`mx-auto bg-white text-slate-900 border border-slate-300 rounded-xl p-5 ${
                  receiptFormat === '80mm'
                    ? 'print-area-thermal max-w-[300px] text-xs'
                    : 'print-area-a4 w-full text-sm'
                }`}
              >
                <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                  <p className="font-brand font-bold text-base">{config.nom_gym}</p>
                  <p className="text-[11px] text-slate-600">{config.adresse}</p>
                  <p className="text-[11px] text-slate-600">{config.telephone}</p>
                  <p className="font-mono-num font-bold mt-2">REÇU N° {receipt.recu_numero}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Date :</span>
                    <span className="font-mono-num">{formatDateFR(receipt.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Membre :</span>
                    <span className="font-semibold">{m ? `${m.prenom} ${m.nom}` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Code :</span>
                    <span className="font-mono-num">{m?.code_membre || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Forfait :</span>
                    <span>{forfait?.nom || 'Abonnement'}</span>
                  </div>
                  {abo && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Validité :</span>
                      <span className="font-mono-num">
                        {formatDateFR(abo.date_debut)} - {formatDateFR(abo.date_fin)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Mode :</span>
                    <span>
                      {receipt.mode} {receipt.reference ? `(${receipt.reference})` : ''}
                    </span>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-300 mt-3 pt-3 flex justify-between items-center font-bold text-base">
                  <span>TOTAL PAYÉ</span>
                  <span className="font-mono-num">
                    {formatMoney(receipt.montant, receipt.devise)}
                  </span>
                </div>
                {config.message_recu && (
                  <p className="mt-4 pt-3 border-t border-slate-200 text-center text-[11px] text-slate-600">
                    {config.message_recu}
                  </p>
                )}
              </div>
            );
          })()}
      </PrintPortal>
    </div>
  );
};
