import React, { useEffect, useState } from 'react';
import { WeightProgressChart } from '../components/Charts';
import { MaterialIcon } from '../components/MaterialIcon';
import { ConfirmModal, EmptyState, Modal } from '../components/ui';
import { SessionUser } from '../lib/auth';
import { getAllRecords, logAction, saveRecord, softDeleteRecord } from '../lib/db';
import { calculateBMI, formatDateFR, formatMoney, todayISO } from '../lib/utils';
import { Coach, Depense, Devise, Equipement, GymConfig, Membre, Mesure } from '../types/gym';

interface CommonPageProps {
  user: SessionUser;
  config: GymConfig;
  refreshTick: number;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

/* ==================== COACHS ==================== */
export const CoachsPage: React.FC<CommonPageProps> = ({
  user,
  config,
  refreshTick,
  onNotify,
}) => {
  const [coachs, setCoachs] = useState<Coach[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coach | null>(null);
  const [form, setForm] = useState<Partial<Coach>>({
    nom: '',
    prenom: '',
    telephone: '',
    specialite: '',
    salaire_base: 25000,
    tarif_coaching: config.tarif_coach_defaut || 2500,
    date_embauche: todayISO(),
    actif: 1,
  });

  const load = async () => {
    const [c, m] = await Promise.all([
      getAllRecords<Coach>('Coachs'),
      getAllRecords<Membre>('Membres'),
    ]);
    setCoachs(c);
    setMembres(m);
  };
  useEffect(() => {
    load();
  }, [refreshTick]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom?.trim() || !form.prenom?.trim()) return;
    await saveRecord<Coach>('Coachs', {
      ...form,
      id: editId || undefined,
      salaire_base: Number(form.salaire_base || 0),
      tarif_coaching: Math.max(0, Number(form.tarif_coaching ?? config.tarif_coach_defaut ?? 0)),
      actif: form.actif === 0 ? 0 : 1,
    });
    await logAction(user.nom_utilisateur, 'Coach', `${form.prenom} ${form.nom}`);
    setOpen(false);
    await load();
    onNotify('success', 'Fiche coach enregistrée.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Coachs & Instructeurs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Équipe sportive, spécialités, salaires et tarifs de coaching personnalisés
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditId(null);
            setForm({
              nom: '',
              prenom: '',
              telephone: '',
              specialite: '',
              salaire_base: 25000,
              tarif_coaching: config.tarif_coach_defaut || 2500,
              date_embauche: todayISO(),
              actif: 1,
            });
            setOpen(true);
          }}
          title="Ajouter un nouveau coach ou instructeur"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Ajouter un coach
        </button>
      </div>

      {coachs.length === 0 ? (
        <EmptyState
          icon="fitness_center"
          title="Aucun coach enregistré"
          description="Ajoutez vos coachs pour les assigner aux cours collectifs et aux membres."
          actionLabel="Ajouter un coach"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coachs.map((c) => {
            const coachFee =
              c.tarif_coaching !== undefined
                ? Number(c.tarif_coaching)
                : config.tarif_coach_defaut || 0;
            const coachedCount = membres.filter((m) => m.coach_id === c.id).length;
            return (
              <div
                key={c.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                        {c.prenom} {c.nom}
                      </h3>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          c.actif === 0
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {c.actif === 0 ? 'Inactif' : 'Actif'}
                      </span>
                    </div>
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                      {c.specialite || 'Coaching général'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(c.id);
                        setForm({
                          ...c,
                          tarif_coaching:
                            c.tarif_coaching !== undefined
                              ? c.tarif_coaching
                              : config.tarif_coach_defaut || 0,
                        });
                        setOpen(true);
                      }}
                      title="Modifier la fiche du coach"
                      className="p-1.5 text-slate-500 hover:text-orange-500"
                    >
                      <MaterialIcon name="edit" className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      title="Supprimer ce coach"
                      className="p-1.5 text-slate-500 hover:text-red-500"
                    >
                      <MaterialIcon name="delete" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="font-mono-num text-xs text-slate-500">Tél : {c.telephone || '—'}</p>
                <div className="pt-2 border-t border-slate-200 dark:border-[#262b38] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono-num font-semibold text-orange-600 dark:text-orange-400">
                    Tarif coaching : {formatMoney(coachFee, config.devise_defaut)}
                  </span>
                  <span className="text-slate-500">
                    {coachedCount} membre(s) suivi(s)
                  </span>
                </div>
                <p className="font-mono-num text-[11px] text-slate-500">
                  Embauche : {formatDateFR(c.date_embauche)} · Salaire :{' '}
                  {formatMoney(c.salaire_base, config.devise_defaut)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Fiche Coach" maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Prénom *</label>
              <input
                type="text"
                required
                value={form.prenom || ''}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nom *</label>
              <input
                type="text"
                required
                value={form.nom || ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Téléphone</label>
              <input
                type="tel"
                value={form.telephone || ''}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Spécialité</label>
              <input
                type="text"
                value={form.specialite || ''}
                onChange={(e) => setForm({ ...form, specialite: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Tarif coaching ({config.devise_defaut})
              </label>
              <input
                type="number"
                min={0}
                step="50"
                value={form.tarif_coaching ?? config.tarif_coach_defaut ?? 0}
                onChange={(e) => setForm({ ...form, tarif_coaching: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Salaire de base</label>
              <input
                type="number"
                value={form.salaire_base || 0}
                onChange={(e) => setForm({ ...form, salaire_base: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Date d’embauche
              </label>
              <input
                type="date"
                value={form.date_embauche || todayISO()}
                onChange={(e) => setForm({ ...form, date_embauche: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
              <select
                value={form.actif === 0 ? 0 : 1}
                onChange={(e) => setForm({ ...form, actif: Number(e.target.value) as 0 | 1 })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value={1}>Actif (disponible)</option>
                <option value={0}>Inactif</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Annuler et fermer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer la fiche coach"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await softDeleteRecord('Coachs', deleteTarget.id);
          await logAction(
            user.nom_utilisateur,
            'Suppression coach',
            `${deleteTarget.prenom} ${deleteTarget.nom}`
          );
          await load();
          onNotify('info', `Coach "${deleteTarget.prenom} ${deleteTarget.nom}" supprimé.`);
        }}
        title="Supprimer ce coach ?"
        message={
          deleteTarget
            ? `Confirmez-vous la suppression de ${deleteTarget.prenom} ${deleteTarget.nom} ?`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};

/* ==================== ÉQUIPEMENTS ==================== */
export const EquipementsPage: React.FC<CommonPageProps> = ({
  user,
  refreshTick,
  onNotify,
}) => {
  const [items, setItems] = useState<Equipement[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Equipement | null>(null);
  const [form, setForm] = useState<Partial<Equipement>>({
    nom: '',
    categorie: 'Musculation',
    quantite: 1,
    etat: 'bon',
    date_achat: todayISO(),
    derniere_maintenance: todayISO(),
    prochaine_maintenance: '',
  });

  const load = async () => setItems(await getAllRecords<Equipement>('Equipements'));
  useEffect(() => {
    load();
  }, [refreshTick]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom?.trim()) return;
    await saveRecord<Equipement>('Equipements', {
      ...form,
      id: editId || undefined,
      quantite: Number(form.quantite || 1),
    });
    await logAction(user.nom_utilisateur, 'Équipement', form.nom);
    setOpen(false);
    await load();
    onNotify('success', 'Équipement enregistré.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Équipements & Maintenance
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inventaire du matériel et suivi des entretiens
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditId(null);
            setForm({
              nom: '',
              categorie: 'Musculation',
              quantite: 1,
              etat: 'bon',
              date_achat: todayISO(),
              derniere_maintenance: todayISO(),
              prochaine_maintenance: '',
            });
            setOpen(true);
          }}
          title="Ajouter un nouvel équipement à l’inventaire"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Ajouter un équipement
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="build"
          title="Aucun équipement répertorié"
          description="Suivez l’état de vos machines, tapis et poids libres."
          actionLabel="Ajouter un équipement"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                  <th className="py-3.5 px-4">Équipement</th>
                  <th className="py-3.5 px-4">Catégorie</th>
                  <th className="py-3.5 px-4">Qté</th>
                  <th className="py-3.5 px-4">État</th>
                  <th className="py-3.5 px-4">Prochaine maintenance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                {items.map((eq) => (
                  <tr key={eq.id}>
                    <td className="py-3 px-4 font-semibold">{eq.nom}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{eq.categorie}</td>
                    <td className="py-3 px-4 font-mono-num">{eq.quantite}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold capitalize ${
                          eq.etat === 'bon'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : eq.etat === 'à réparer'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {eq.etat}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs">
                      {formatDateFR(eq.prochaine_maintenance)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(eq.id);
                          setForm(eq);
                          setOpen(true);
                        }}
                        title="Modifier cet équipement"
                        className="p-1.5 text-slate-500 hover:text-orange-500"
                      >
                        <MaterialIcon name="edit" className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(eq)}
                        title="Supprimer cet équipement"
                        className="p-1.5 text-slate-500 hover:text-red-500"
                      >
                        <MaterialIcon name="delete" className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Équipement" maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nom *</label>
              <input
                type="text"
                required
                value={form.nom || ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Catégorie</label>
              <input
                type="text"
                value={form.categorie || ''}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Quantité</label>
              <input
                type="number"
                min={1}
                value={form.quantite || 1}
                onChange={(e) => setForm({ ...form, quantite: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">État</label>
              <select
                value={form.etat || 'bon'}
                onChange={(e) =>
                  setForm({ ...form, etat: e.target.value as Equipement['etat'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="bon">Bon</option>
                <option value="à réparer">À réparer</option>
                <option value="hors service">Hors service</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date d’achat</label>
              <input
                type="date"
                value={form.date_achat || ''}
                onChange={(e) => setForm({ ...form, date_achat: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Dernière maintenance
              </label>
              <input
                type="date"
                value={form.derniere_maintenance || ''}
                onChange={(e) => setForm({ ...form, derniere_maintenance: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Prochaine maintenance
              </label>
              <input
                type="date"
                value={form.prochaine_maintenance || ''}
                onChange={(e) => setForm({ ...form, prochaine_maintenance: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Annuler et fermer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer cet équipement"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await softDeleteRecord('Equipements', deleteTarget.id);
          await logAction(user.nom_utilisateur, 'Suppression équipement', deleteTarget.nom);
          await load();
          onNotify('info', `Équipement "${deleteTarget.nom}" supprimé.`);
        }}
        title="Supprimer cet équipement ?"
        message={
          deleteTarget
            ? `Confirmez-vous la suppression de "${deleteTarget.nom}" de l’inventaire ?`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};

/* ==================== DÉPENSES ==================== */
export const DepensesPage: React.FC<CommonPageProps> = ({
  user,
  config,
  refreshTick,
  onNotify,
}) => {
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Depense | null>(null);
  const [form, setForm] = useState<Partial<Depense>>({
    date: todayISO(),
    categorie: 'électricité',
    description: '',
    montant: 0,
    devise: config.devise_defaut,
  });

  const load = async () => {
    const d = await getAllRecords<Depense>('Depenses');
    setDepenses(d.sort((x, y) => y.date.localeCompare(x.date)));
  };
  useEffect(() => {
    load();
  }, [refreshTick]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description?.trim() || !form.montant) return;
    await saveRecord<Depense>('Depenses', {
      ...form,
      montant: Number(form.montant),
    });
    await logAction(user.nom_utilisateur, 'Dépense', `${form.categorie} : ${form.montant}`);
    setOpen(false);
    await load();
    onNotify('success', 'Dépense enregistrée.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Dépenses & Charges
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loyer, électricité / carburant, salaires et maintenance
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm({
              date: todayISO(),
              categorie: 'électricité',
              description: '',
              montant: 0,
              devise: config.devise_defaut,
            });
            setOpen(true);
          }}
          title="Saisir une nouvelle dépense ou charge"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Enregistrer une dépense
        </button>
      </div>

      {depenses.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Aucune dépense enregistrée"
          description="Ajoutez vos charges pour calculer votre bénéfice net réel."
          actionLabel="Ajouter une dépense"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Catégorie</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4 text-right">Montant</th>
                  <th className="py-3.5 px-4 text-right">Suppr.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                {depenses.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 px-4 font-mono-num text-xs">{formatDateFR(d.date)}</td>
                    <td className="py-3 px-4 capitalize text-xs font-semibold">{d.categorie}</td>
                    <td className="py-3 px-4">{d.description}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-red-600 dark:text-red-400">
                      {formatMoney(d.montant, d.devise)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(d)}
                        title="Supprimer cette dépense"
                        className="p-1.5 text-slate-400 hover:text-red-500"
                      >
                        <MaterialIcon name="delete" className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle dépense" maxWidth="max-w-md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
              <input
                type="date"
                required
                value={form.date || todayISO()}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Catégorie</label>
              <select
                value={form.categorie || 'électricité'}
                onChange={(e) =>
                  setForm({ ...form, categorie: e.target.value as Depense['categorie'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="loyer">Loyer</option>
                <option value="électricité">Électricité / Carburant</option>
                <option value="salaires">Salaires</option>
                <option value="maintenance">Maintenance</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description *</label>
            <input
              type="text"
              required
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Montant *</label>
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={form.montant || ''}
                onChange={(e) => setForm({ ...form, montant: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Devise</label>
              <select
                value={form.devise || 'HTG'}
                onChange={(e) => setForm({ ...form, devise: e.target.value as Devise })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="HTG">HTG</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Annuler et fermer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer cette dépense"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await softDeleteRecord('Depenses', deleteTarget.id);
          await logAction(
            user.nom_utilisateur,
            'Suppression dépense',
            `${deleteTarget.description} (${deleteTarget.montant} ${deleteTarget.devise})`
          );
          await load();
          onNotify('info', 'Dépense supprimée.');
        }}
        title="Supprimer cette dépense ?"
        message={
          deleteTarget
            ? `Confirmez-vous la suppression de la dépense "${deleteTarget.description}" (${formatMoney(
                deleteTarget.montant,
                deleteTarget.devise
              )}) ?`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};

/* ==================== MESURES CORPORELLES ==================== */
export const MesuresPage: React.FC<CommonPageProps> = ({
  user,
  refreshTick,
  onNotify,
}) => {
  const [membres, setMembres] = useState<Membre[]>([]);
  const [mesures, setMesures] = useState<Mesure[]>([]);
  const [selectedMembreId, setSelectedMembreId] = useState('');
  const [form, setForm] = useState({
    date: todayISO(),
    poids: 75,
    taille: 175,
    tour_taille: 82,
    tour_poitrine: 98,
    tour_bras: 34,
    notes: '',
  });

  const load = async () => {
    const [m, ms] = await Promise.all([
      getAllRecords<Membre>('Membres'),
      getAllRecords<Mesure>('Mesures'),
    ]);
    setMembres(m);
    setMesures(ms.sort((a, b) => a.date.localeCompare(b.date)));
    if (!selectedMembreId && m[0]) setSelectedMembreId(m[0].id);
  };
  useEffect(() => {
    load();
  }, [refreshTick]);

  const memberMeasures = mesures.filter((m) => m.membre_id === selectedMembreId);
  const imcPreview = calculateBMI(form.poids, form.taille);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMembreId) return;
    const imc = calculateBMI(form.poids, form.taille);
    await saveRecord<Mesure>('Mesures', {
      membre_id: selectedMembreId,
      date: form.date,
      poids: Number(form.poids),
      taille: Number(form.taille),
      imc,
      tour_taille: Number(form.tour_taille),
      tour_poitrine: Number(form.tour_poitrine),
      tour_bras: Number(form.tour_bras),
      notes: form.notes.trim(),
    });
    await logAction(user.nom_utilisateur, 'Mesure corporelle', `Poids ${form.poids} kg (IMC ${imc})`);
    setForm((p) => ({ ...p, notes: '' }));
    await load();
    onNotify('success', 'Mesure corporelle enregistrée.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Suivi des mesures corporelles
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Calcul automatique de l’IMC et courbe d’évolution locale
          </p>
        </div>
        <select
          value={selectedMembreId}
          onChange={(e) => setSelectedMembreId(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] text-sm font-medium min-w-[240px]"
        >
          {membres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.prenom} {m.nom} ({m.code_membre})
            </option>
          ))}
        </select>
      </div>

      {membres.length === 0 ? (
        <EmptyState
          icon="monitor_weight"
          title="Aucun membre disponible"
          description="Inscrivez d’abord un membre pour suivre ses mensurations et son IMC."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAdd}
            className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-4 h-fit"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-base">Nouvelle prise de mesures</h2>
              <span className="font-mono-num text-xs font-semibold text-orange-600 dark:text-orange-400">
                IMC calculé : {imcPreview}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Poids (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.poids}
                  onChange={(e) => setForm({ ...form, poids: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Taille (cm)</label>
                <input
                  type="number"
                  value={form.taille}
                  onChange={(e) => setForm({ ...form, taille: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tour taille (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.tour_taille}
                  onChange={(e) => setForm({ ...form, tour_taille: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Poitrine (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.tour_poitrine}
                  onChange={(e) => setForm({ ...form, tour_poitrine: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Bras (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.tour_bras}
                  onChange={(e) => setForm({ ...form, tour_bras: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observations du coach..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              title="Enregistrer la mesure corporelle et mettre à jour la courbe"
              className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              Enregistrer la mesure
            </button>
          </form>

          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
              <h2 className="font-display font-semibold text-base mb-4">
                Évolution du poids & IMC
              </h2>
              <WeightProgressChart
                points={memberMeasures.map((ms) => ({
                  dateLabel: formatDateFR(ms.date),
                  poids: ms.poids,
                  imc: ms.imc,
                }))}
              />
            </div>

            {memberMeasures.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Poids</th>
                        <th className="py-3 px-4">IMC</th>
                        <th className="py-3 px-4">Taille / Poitrine / Bras</th>
                        <th className="py-3 px-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                      {[...memberMeasures].reverse().map((ms) => (
                        <tr key={ms.id}>
                          <td className="py-2.5 px-4 font-mono-num text-xs">
                            {formatDateFR(ms.date)}
                          </td>
                          <td className="py-2.5 px-4 font-mono-num font-semibold">{ms.poids} kg</td>
                          <td className="py-2.5 px-4 font-mono-num">{ms.imc}</td>
                          <td className="py-2.5 px-4 font-mono-num text-xs">
                            {ms.tour_taille} / {ms.tour_poitrine} / {ms.tour_bras} cm
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-500">{ms.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
