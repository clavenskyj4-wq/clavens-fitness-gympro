import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { ConfirmModal, EmptyState, Modal } from '../components/ui';
import { SessionUser } from '../lib/auth';
import { getAllRecords, logAction, saveRecord, softDeleteRecord } from '../lib/db';
import { formatDateFR, todayISO } from '../lib/utils';
import { Coach, Cours, Membre, Reservation } from '../types/gym';

interface CoursPageProps {
  user: SessionUser;
  refreshTick: number;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const JOURS: Cours['jour_semaine'][] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

export const CoursPage: React.FC<CoursPageProps> = ({ user, refreshTick, onNotify }) => {
  const [cours, setCours] = useState<Cours[]>([]);
  const [coachs, setCoachs] = useState<Coach[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState<Partial<Cours>>({
    titre: '',
    coach_id: '',
    jour_semaine: 'Lundi',
    heure_debut: '17:30',
    heure_fin: '18:30',
    capacite: 15,
    salle: 'Studio Principal',
  });

  const [selectedCourse, setSelectedCourse] = useState<Cours | null>(null);
  const [resDate, setResDate] = useState(todayISO());
  const [resMembreId, setResMembreId] = useState('');
  const [deleteCourseTarget, setDeleteCourseTarget] = useState<Cours | null>(null);

  const loadData = async () => {
    const [cr, ch, m, r] = await Promise.all([
      getAllRecords<Cours>('Cours'),
      getAllRecords<Coach>('Coachs'),
      getAllRecords<Membre>('Membres'),
      getAllRecords<Reservation>('Reservations'),
    ]);
    setCours(cr);
    setCoachs(ch.filter((c) => c.actif === 1));
    setMembres(m);
    setReservations(r);
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.titre?.trim()) return;
    await saveRecord<Cours>('Cours', {
      ...courseForm,
      id: editingCourseId || undefined,
      capacite: Number(courseForm.capacite || 15),
    });
    await logAction(
      user.nom_utilisateur,
      editingCourseId ? 'Modification cours' : 'Nouveau cours',
      courseForm.titre
    );
    setCourseModalOpen(false);
    await loadData();
    onNotify('success', 'Cours enregistré.');
  };

  const handleAddReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !resMembreId) return;
    const activeForDate = reservations.filter(
      (r) =>
        r.cours_id === selectedCourse.id &&
        r.date_cours === resDate &&
        r.statut !== 'annulé'
    );
    if (activeForDate.length >= selectedCourse.capacite) {
      onNotify('error', 'Capacité maximale atteinte pour ce cours.');
      return;
    }
    await saveRecord<Reservation>('Reservations', {
      cours_id: selectedCourse.id,
      membre_id: resMembreId,
      date_cours: resDate,
      statut: 'réservé',
    });
    await loadData();
    onNotify('success', 'Réservation ajoutée.');
  };

  const handleUpdateResStatus = async (r: Reservation, statut: Reservation['statut']) => {
    await saveRecord<Reservation>('Reservations', { ...r, statut });
    await loadData();
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Cours & Réservations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Planning hebdomadaire, capacité par salle et feuille de présence
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingCourseId(null);
            setCourseForm({
              titre: '',
              coach_id: coachs[0]?.id || '',
              jour_semaine: 'Lundi',
              heure_debut: '17:30',
              heure_fin: '18:30',
              capacite: 15,
              salle: 'Studio Principal',
            });
            setCourseModalOpen(true);
          }}
          title="Planifier un nouveau cours collectif"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Nouveau cours
        </button>
      </div>

      {cours.length === 0 ? (
        <EmptyState
          icon="sports_gymnastics"
          title="Aucun cours planifié"
          description="Créez votre planning hebdomadaire de cours collectifs et assignez vos coachs."
          actionLabel="Créer un cours"
          onAction={() => setCourseModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {JOURS.map((jour) => {
            const dayCourses = cours
              .filter((c) => c.jour_semaine === jour)
              .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
            return (
              <div
                key={jour}
                className="p-4 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#262b38] pb-2">
                  <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    {jour}
                  </h2>
                  <span className="font-mono-num text-xs text-slate-500">
                    {dayCourses.length} cours
                  </span>
                </div>
                {dayCourses.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">Repos / Libre</p>
                ) : (
                  <div className="space-y-2.5">
                    {dayCourses.map((c) => {
                      const coach = coachs.find((ch) => ch.id === c.coach_id);
                      const countToday = reservations.filter(
                        (r) => r.cours_id === c.id && r.statut !== 'annulé'
                      ).length;
                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm text-slate-900 dark:text-white">
                              {c.titre}
                            </p>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCourseId(c.id);
                                  setCourseForm(c);
                                  setCourseModalOpen(true);
                                }}
                                className="p-1 text-slate-500 hover:text-orange-500"
                                title="Modifier ce cours"
                              >
                                <MaterialIcon name="edit" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteCourseTarget(c)}
                                className="p-1 text-slate-500 hover:text-red-500"
                                title="Supprimer ce cours"
                              >
                                <MaterialIcon name="delete" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="font-mono-num text-xs text-orange-600 dark:text-orange-400">
                            {c.heure_debut} – {c.heure_fin} · {c.salle}
                          </p>
                          <p className="text-xs text-slate-500">
                            Coach : {coach ? `${coach.prenom} ${coach.nom}` : 'Non assigné'}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-mono-num text-xs text-slate-600 dark:text-slate-400">
                              Capacité : {countToday}/{c.capacite}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCourse(c);
                                setResMembreId(membres[0]?.id || '');
                              }}
                              title="Gérer les réservations et présences de ce cours"
                              className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                            >
                              Réservations
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modale Créer / Modifier Cours */}
      <Modal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        title={editingCourseId ? 'Modifier le cours' : 'Planifier un cours'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Titre du cours *</label>
            <input
              type="text"
              required
              value={courseForm.titre || ''}
              onChange={(e) => setCourseForm({ ...courseForm, titre: e.target.value })}
              placeholder="ex. HIIT, Zumba, Cross-Training..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Jour</label>
              <select
                value={courseForm.jour_semaine || 'Lundi'}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    jour_semaine: e.target.value as Cours['jour_semaine'],
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                {JOURS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Coach</label>
              <select
                value={courseForm.coach_id || ''}
                onChange={(e) => setCourseForm({ ...courseForm, coach_id: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="">— Aucun —</option>
                {coachs.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.prenom} {ch.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Début</label>
              <input
                type="time"
                value={courseForm.heure_debut || '17:30'}
                onChange={(e) => setCourseForm({ ...courseForm, heure_debut: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fin</label>
              <input
                type="time"
                value={courseForm.heure_fin || '18:30'}
                onChange={(e) => setCourseForm({ ...courseForm, heure_fin: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Capacité</label>
              <input
                type="number"
                min={1}
                value={courseForm.capacite || 15}
                onChange={(e) => setCourseForm({ ...courseForm, capacite: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Salle</label>
              <input
                type="text"
                value={courseForm.salle || ''}
                onChange={(e) => setCourseForm({ ...courseForm, salle: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCourseModalOpen(false)}
              title="Annuler et fermer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer le cours dans le planning"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale Réservations & Présence au cours */}
      <Modal
        open={Boolean(selectedCourse)}
        onClose={() => setSelectedCourse(null)}
        title={
          selectedCourse
            ? `Réservations — ${selectedCourse.titre} (${selectedCourse.jour_semaine})`
            : ''
        }
        maxWidth="max-w-xl"
      >
        {selectedCourse && (
          <div className="space-y-4">
            <form onSubmit={handleAddReservation} className="flex flex-col sm:flex-row gap-2">
              <select
                value={resMembreId}
                onChange={(e) => setResMembreId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                {membres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom} ({m.code_membre})
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
              <button
                type="submit"
                disabled={!resMembreId}
                title="Ajouter une réservation pour ce membre"
                className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold whitespace-nowrap"
              >
                Réserver
              </button>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-[#262b38] max-h-72 overflow-y-auto">
              {reservations
                .filter((r) => r.cours_id === selectedCourse.id)
                .map((r) => {
                  const m = membres.find((x) => x.id === r.membre_id);
                  return (
                    <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {m ? `${m.prenom} ${m.nom}` : 'Membre'}
                        </p>
                        <p className="font-mono-num text-xs text-slate-500">
                          {formatDateFR(r.date_cours)}
                        </p>
                      </div>
                      <select
                        value={r.statut}
                        onChange={(e) =>
                          handleUpdateResStatus(r, e.target.value as Reservation['statut'])
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] text-xs font-medium"
                      >
                        <option value="réservé">Réservé</option>
                        <option value="présent">Présent</option>
                        <option value="absent">Absent</option>
                        <option value="annulé">Annulé</option>
                      </select>
                    </div>
                  );
                })}
              {reservations.filter((r) => r.cours_id === selectedCourse.id).length === 0 && (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Aucune réservation pour ce cours.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteCourseTarget)}
        onClose={() => setDeleteCourseTarget(null)}
        onConfirm={async () => {
          if (!deleteCourseTarget) return;
          await softDeleteRecord('Cours', deleteCourseTarget.id);
          await logAction(user.nom_utilisateur, 'Suppression cours', deleteCourseTarget.titre);
          await loadData();
          onNotify('info', `Cours "${deleteCourseTarget.titre}" supprimé.`);
        }}
        title="Supprimer ce cours ?"
        message={
          deleteCourseTarget
            ? `Confirmez-vous la suppression du cours "${deleteCourseTarget.titre}" (${deleteCourseTarget.jour_semaine} ${deleteCourseTarget.heure_debut}) ?`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};
