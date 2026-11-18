import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { getAllRecords, saveRecord } from '../lib/db';
import { compressImageFile, formatMoney, todayISO } from '../lib/utils';
import { Forfait, GymConfig, Membre } from '../types/gym';

interface PublicJoinPageProps {
  config: GymConfig;
  onBackHome: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface PublicGymInfo {
  nom_gym: string;
  adresse: string;
  telephone: string;
  forfaits: Array<{
    id: string;
    nom: string;
    prix: number;
    devise: string;
    duree_jours: number;
  }>;
}

export const PublicJoinPage: React.FC<PublicJoinPageProps> = ({
  config,
  onBackHome,
  onNotify,
}) => {
  const [gymInfo, setGymInfo] = useState<PublicGymInfo>({
    nom_gym: config.nom_gym || 'GymPro Fitness',
    adresse: config.adresse || '',
    telephone: config.telephone || '',
    forfaits: [],
  });

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [sexe, setSexe] = useState<'M' | 'F' | 'Autre'>('M');
  const [dateNaissance, setDateNaissance] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [adresse, setAdresse] = useState('');
  const [objectif, setObjectif] = useState('');
  const [forfaitSouhaite, setForfaitSouhaite] = useState('');
  const [contactUrgenceNom, setContactUrgenceNom] = useState('');
  const [contactUrgenceTel, setContactUrgenceTel] = useState('');
  const [notesSante, setNotesSante] = useState('');
  const [photo, setPhoto] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    code_membre: string;
    prenom: string;
    nom: string;
    syncedToSheets: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPublicInfo() {
      try {
        const [serverRes, localForfaits] = await Promise.all([
          fetch('/api/public-registration/info', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          getAllRecords<Forfait>('Forfaits').catch(() => [] as Forfait[]),
        ]);
        if (!active) return;

        const serverForfaits = Array.isArray(serverRes?.forfaits) ? serverRes.forfaits : [];
        const fallbackForfaits = localForfaits
          .filter((f) => f.actif === 1)
          .map((f) => ({
            id: f.id,
            nom: f.nom,
            prix: Number(f.prix),
            devise: f.devise,
            duree_jours: Number(f.duree_jours),
          }));

        setGymInfo({
          nom_gym: String(serverRes?.nom_gym || config.nom_gym || 'GymPro Fitness'),
          adresse: String(serverRes?.adresse || config.adresse || ''),
          telephone: String(serverRes?.telephone || config.telephone || ''),
          forfaits: serverForfaits.length > 0 ? serverForfaits : fallbackForfaits,
        });
      } catch {
        // garde les infos par défaut
      }
    }
    loadPublicInfo();
    return () => {
      active = false;
    };
  }, [config.nom_gym, config.adresse, config.telephone]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFile(file, 260, 0.72);
      setPhoto(b64);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lecture photo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !nom.trim() || !telephone.trim()) {
      onNotify('error', 'Veuillez remplir votre prénom, nom et téléphone.');
      return;
    }

    setSubmitting(true);
    try {
      let savedViaServer = false;
      let resultMember: { code_membre: string; prenom: string; nom: string } | null = null;
      let syncedToSheets = false;

      if (navigator.onLine) {
        try {
          const res = await fetch('/api/public-registration/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prenom: prenom.trim(),
              nom: nom.trim(),
              sexe,
              date_naissance: dateNaissance,
              telephone: telephone.trim(),
              email: email.trim(),
              adresse: adresse.trim(),
              objectif: objectif.trim(),
              forfait_souhaite: forfaitSouhaite,
              contact_urgence_nom: contactUrgenceNom.trim(),
              contact_urgence_tel: contactUrgenceTel.trim(),
              notes_sante: notesSante.trim(),
              photo,
            }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            member?: Membre;
            syncedToSheets?: boolean;
            error?: string;
          };
          if (res.ok && data.ok && data.member) {
            savedViaServer = true;
            syncedToSheets = Boolean(data.syncedToSheets);
            resultMember = {
              code_membre: data.member.code_membre,
              prenom: data.member.prenom,
              nom: data.member.nom,
            };
          }
        } catch {
          // fallback local ci-dessous
        }
      }

      if (!savedViaServer) {
        const fallbackCode = `DEM-${Math.floor(1000 + Math.random() * 9000)}`;
        const notesCombined = forfaitSouhaite
          ? `[Forfait souhaité : ${forfaitSouhaite}]${
              notesSante.trim() ? ` ${notesSante.trim()}` : ''
            }`
          : notesSante.trim();
        const savedLocal = await saveRecord<Membre>('Membres', {
          code_membre: fallbackCode,
          nom: nom.trim(),
          prenom: prenom.trim(),
          sexe,
          date_naissance: dateNaissance,
          telephone: telephone.trim(),
          email: email.trim(),
          adresse: adresse.trim(),
          photo,
          contact_urgence_nom: contactUrgenceNom.trim(),
          contact_urgence_tel: contactUrgenceTel.trim(),
          objectif: objectif.trim(),
          notes_sante: notesCombined,
          date_inscription: todayISO(),
          statut: 'en_attente',
          coach_id: '',
          tarif_coach: 0,
        });
        resultMember = {
          code_membre: savedLocal.code_membre,
          prenom: savedLocal.prenom,
          nom: savedLocal.nom,
        };
      }

      if (resultMember) {
        setSubmittedResult({
          ...resultMember,
          syncedToSheets,
        });
        onNotify('success', 'Votre demande d’inscription a bien été transmise !');
      }
    } catch {
      onNotify('error', 'Erreur lors de l’envoi de votre inscription.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* En-tête salle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <MaterialIcon name="fitness_center" className="w-6 h-6" />
            </span>
            <div>
              <h1 className="font-brand font-extrabold text-xl text-slate-900 dark:text-white">
                {gymInfo.nom_gym}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pré-inscription en ligne par QR Code
                {gymInfo.adresse ? ` · ${gymInfo.adresse}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackHome}
            title="Revenir à l’accueil de l’application"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <MaterialIcon name="home" className="w-4 h-4" />
            Accueil
          </button>
        </div>

        {submittedResult ? (
          <div className="p-7 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] shadow-lg text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <MaterialIcon name="schedule" className="w-9 h-9" />
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                Statut : En attente de validation administrateur
              </span>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Merci {submittedResult.prenom} {submittedResult.nom} !
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                Votre fiche a bien été envoyée à <strong>{gymInfo.nom_gym}</strong>. Votre
                adhésion restera <strong>inactive</strong> jusqu’à la vérification et l’activation
                par l’administrateur à la réception.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] inline-block">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Référence de demande à présenter à l’accueil
              </p>
              <p className="mt-1 font-mono-num text-2xl font-extrabold text-orange-600 dark:text-orange-400">
                {submittedResult.code_membre}
              </p>
            </div>

            {gymInfo.telephone && (
              <p className="text-xs text-slate-500">
                Besoin d’aide ? Contactez le gym au{' '}
                <strong className="font-mono-num">{gymInfo.telephone}</strong>.
              </p>
            )}

            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSubmittedResult(null);
                  setPrenom('');
                  setNom('');
                  setTelephone('');
                  setEmail('');
                  setAdresse('');
                  setPhoto('');
                  setNotesSante('');
                }}
                title="Inscrire une autre personne"
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Nouvelle inscription
              </button>
              <button
                type="button"
                onClick={onBackHome}
                title="Retour à la page d’accueil"
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                Terminer
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] shadow-sm space-y-5"
          >
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <MaterialIcon
                name="verified"
                className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <p className="font-semibold">Validation administrateur requise</p>
                <p className="mt-0.5">
                  Remplissez vos informations où que vous soyez. Votre compte restera en statut{' '}
                  <strong>En attente</strong> et ne sera activé qu’après vérification à la
                  réception par l’administrateur.
                </p>
              </div>
            </div>

            {/* Photo optionnelle */}
            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
              {photo ? (
                <img
                  src={photo}
                  alt="Photo profil"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-200 dark:bg-[#1c202b] flex items-center justify-center text-slate-400 shrink-0">
                  <MaterialIcon name="person" className="w-7 h-7" />
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Photo d’identité (optionnelle)
                </p>
                <div className="flex items-center gap-2">
                  <label
                    title="Prendre ou choisir une photo"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <MaterialIcon name="photo_camera" className="w-4 h-4" />
                    Ajouter une photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {photo && (
                    <button
                      type="button"
                      onClick={() => setPhoto('')}
                      title="Supprimer la photo choisie"
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prénom"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom de famille"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Téléphone / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+509 ..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Sexe
                </label>
                <select
                  value={sexe}
                  onChange={(e) => setSexe(e.target.value as 'M' | 'F' | 'Autre')}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                >
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Date de naissance
                </label>
                <input
                  type="date"
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Email (optionnel)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemple@email.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Adresse
                </label>
                <input
                  type="text"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Quartier / Rue / Ville"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>

              {gymInfo.forfaits.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Forfait souhaité (pour vérification à l’accueil)
                  </label>
                  <select
                    value={forfaitSouhaite}
                    onChange={(e) => setForfaitSouhaite(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    <option value="">Choisir plus tard à la réception</option>
                    {gymInfo.forfaits.map((f) => (
                      <option key={f.id} value={f.nom}>
                        {f.nom} ({f.duree_jours} j — {formatMoney(f.prix, f.devise as 'HTG' | 'USD')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Objectif sportif
                </label>
                <input
                  type="text"
                  value={objectif}
                  onChange={(e) => setObjectif(e.target.value)}
                  placeholder="ex. Remise en forme, prise de masse, cardio..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Contact d’urgence (Nom)
                </label>
                <input
                  type="text"
                  value={contactUrgenceNom}
                  onChange={(e) => setContactUrgenceNom(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Contact d’urgence (Téléphone)
                </label>
                <input
                  type="tel"
                  value={contactUrgenceTel}
                  onChange={(e) => setContactUrgenceTel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Notes santé / allergies / informations utiles
                </label>
                <textarea
                  rows={2}
                  value={notesSante}
                  onChange={(e) => setNotesSante(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              title="Envoyer ma demande d’inscription pour validation par l’administrateur"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              <MaterialIcon name="person_add" className="w-4 h-4" />
              {submitting ? 'Envoi en cours...' : 'Envoyer mon inscription'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
