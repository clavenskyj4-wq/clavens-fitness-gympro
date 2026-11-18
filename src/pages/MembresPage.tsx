import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { downloadMemberCardPNG, MemberIDCard } from '../components/MemberIDCard';
import {
  ConfirmModal,
  EmptyState,
  Modal,
  PrintPortal,
  SubscriptionProgressBar,
} from '../components/ui';
import { SessionUser } from '../lib/auth';
import {
  getAllRecords,
  getNextMemberCode,
  getNextReceiptNumber,
  logAction,
  saveRecord,
  softDeleteRecord,
} from '../lib/db';
import { generateQRMatrix } from '../lib/qr';
import {
  addDaysISO,
  compressImageFile,
  convertCurrency,
  daysUntil,
  formatDateFR,
  formatMoney,
  todayISO,
} from '../lib/utils';
import {
  Abonnement,
  Coach,
  Forfait,
  GymConfig,
  Membre,
  Mesure,
  ModePaiement,
  Paiement,
  Presence,
} from '../types/gym';

interface MembresPageProps {
  user: SessionUser;
  config: GymConfig;
  refreshTick: number;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  onOpenPublicJoin?: () => void;
}

const emptyMemberForm = (code: string): Partial<Membre> => ({
  code_membre: code,
  nom: '',
  prenom: '',
  sexe: 'M',
  date_naissance: '',
  telephone: '',
  email: '',
  adresse: '',
  photo: '',
  contact_urgence_nom: '',
  contact_urgence_tel: '',
  objectif: '',
  notes_sante: '',
  date_inscription: todayISO(),
  statut: 'actif',
  coach_id: '',
  tarif_coach: 0,
});

export const MembresPage: React.FC<MembresPageProps> = ({
  user,
  config,
  refreshTick,
  onNotify,
  onOpenPublicJoin,
}) => {
  const isReadOnly = user.role === 'coach';
  const isAdmin = user.role === 'admin';
  const [membres, setMembres] = useState<Membre[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [coachs, setCoachs] = useState<Coach[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [mesures, setMesures] = useState<Mesure[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'tous' | 'actif' | 'en_attente' | 'expiré' | 'suspendu' | 'expirant'
  >('tous');
  const [viewMode, setViewMode] = useState<'cartes' | 'tableau'>('cartes');

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Membre>>(emptyMemberForm('GYM-0001'));
  const [editingId, setEditingId] = useState<string | null>(null);

  // Champs d'inscription initiale (frais d'inscription + forfait choisi + coach optionnel)
  const [selectedForfaitId, setSelectedForfaitId] = useState<string>('');
  const [fraisInscription, setFraisInscription] = useState<number>(config.frais_inscription || 0);
  const [applyFrais, setApplyFrais] = useState<boolean>(true);
  const [wantCoach, setWantCoach] = useState<boolean>(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [coachPrice, setCoachPrice] = useState<number>(config.tarif_coach_defaut || 0);
  const [modeInscription, setModeInscription] = useState<ModePaiement>('espèces');
  const [refInscription, setRefInscription] = useState<string>('');
  const [encaisserTout, setEncaisserTout] = useState<boolean>(true);

  const [detailMember, setDetailMember] = useState<Membre | null>(null);
  const [detailTab, setDetailTab] = useState<
    'infos' | 'abonnements' | 'paiements' | 'presences' | 'mesures'
  >('infos');
  const [cardMember, setCardMember] = useState<Membre | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Membre | null>(null);

  // QR Code inscription à distance & Validation Admin
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const saved = localStorage.getItem('gympro_public_base_url');
    return saved || window.location.origin;
  });
  const [validateTarget, setValidateTarget] = useState<Membre | null>(null);
  const [validateCode, setValidateCode] = useState('GYM-0001');
  const [validateForfaitId, setValidateForfaitId] = useState('');
  const [validateIncludeFrais, setValidateIncludeFrais] = useState(false);
  const [validateEncaisser, setValidateEncaisser] = useState(false);
  const [validateMode, setValidateMode] = useState<ModePaiement>('espèces');
  const [validateRef, setValidateRef] = useState('');
  const [rejectTarget, setRejectTarget] = useState<Membre | null>(null);

  // Caméra pour prise de photo locale
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadData = async () => {
    let [m, a, f, c, p, pr, ms] = await Promise.all([
      getAllRecords<Membre>('Membres'),
      getAllRecords<Abonnement>('Abonnements'),
      getAllRecords<Forfait>('Forfaits'),
      getAllRecords<Coach>('Coachs'),
      getAllRecords<Paiement>('Paiements'),
      getAllRecords<Presence>('Presences'),
      getAllRecords<Mesure>('Mesures'),
    ]);

    // Récupère les nouvelles demandes soumises à distance via QR Code depuis le relais serveur
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch('/api/public-registration/pending', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; items?: Membre[] };
          const existingIds = new Set(m.map((x) => x.id));
          let added = false;
          for (const item of data.items || []) {
            if (!existingIds.has(item.id)) {
              await saveRecord<Membre>('Membres', { ...item });
              added = true;
            }
          }
          if (added) {
            m = await getAllRecords<Membre>('Membres');
          }
        }
      } catch {
        // ignore offline / network error
      }
    }

    setMembres(m.sort((x, y) => x.code_membre.localeCompare(y.code_membre)));
    setAbonnements(a);
    setForfaits(f);
    setCoachs(c);
    setPaiements(p);
    setPresences(pr);
    setMesures(ms);
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  // Synchronise les infos publiques & le pont Google Sheets côté serveur pour les scans QR distants
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.onLine || isReadOnly) return;
    const activeList = forfaits
      .filter((f) => f.actif === 1)
      .map((f) => ({
        id: f.id,
        nom: f.nom,
        prix: Number(f.prix),
        devise: f.devise,
        duree_jours: Number(f.duree_jours),
      }));
    fetch('/api/public-registration/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom_gym: config.nom_gym,
        adresse: config.adresse,
        telephone: config.telephone,
        apps_script_url: config.apps_script_url,
        apps_script_key: config.apps_script_key,
        forfaits: activeList,
      }),
    }).catch(() => {});
  }, [
    isReadOnly,
    config.nom_gym,
    config.adresse,
    config.telephone,
    config.apps_script_url,
    config.apps_script_key,
    forfaits,
  ]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const activeForfaits = useMemo(() => forfaits.filter((f) => f.actif === 1), [forfaits]);
  const activeCoachs = useMemo(() => coachs.filter((c) => c.actif !== 0), [coachs]);
  const chosenForfait = activeForfaits.find((f) => f.id === selectedForfaitId);
  const chosenCoach = activeCoachs.find((c) => c.id === selectedCoachId) || null;
  const paymentDevise = chosenForfait?.devise || config.devise_defaut;
  const effectiveFrais = applyFrais ? Math.max(0, Number(fraisInscription || 0)) : 0;
  const effectiveFraisConverted = convertCurrency(
    effectiveFrais,
    config.devise_defaut,
    paymentDevise,
    config.taux_change
  );
  const effectiveCoachPrice = wantCoach ? Math.max(0, Number(coachPrice || 0)) : 0;
  const effectiveCoachConverted = convertCurrency(
    effectiveCoachPrice,
    config.devise_defaut,
    paymentDevise,
    config.taux_change
  );
  const totalInscription =
    Math.round(
      (effectiveFraisConverted +
        (chosenForfait ? Number(chosenForfait.prix) : 0) +
        effectiveCoachConverted) *
        100
    ) / 100;

  const getCoachDisplay = (m: Membre) => {
    const c = m.coach_id ? coachs.find((x) => x.id === m.coach_id) : undefined;
    const price = Number(m.tarif_coach || 0);
    if (!c && price <= 0) return null;
    return {
      coach: c || null,
      nom: c ? `${c.prenom} ${c.nom}` : 'Coach personnalisé',
      specialite: c?.specialite || '',
      prix: price,
    };
  };

  const getLatestSubscriptionInfo = (membreId: string) => {
    const abos = abonnements
      .filter((a) => a.membre_id === membreId && a.statut !== 'annulé')
      .sort((a, b) => b.date_fin.localeCompare(a.date_fin));
    if (abos.length === 0) {
      return {
        abo: null as Abonnement | null,
        forfait: null as Forfait | null,
        forfaitNom: 'Aucun forfait',
        dateExpiration: undefined as string | undefined,
        daysLeft: -999,
      };
    }
    const abo = abos[0];
    const forfait = forfaits.find((x) => x.id === abo.forfait_id) || null;
    return {
      abo,
      forfait,
      forfaitNom: forfait?.nom || 'Forfait',
      dateExpiration: abo.date_fin,
      daysLeft: daysUntil(abo.date_fin),
    };
  };

  const kpiStats = useMemo(() => {
    const alertDays = config.alerte_expiration_jours || 7;
    let actifs = 0;
    let enAttente = 0;
    let expirant = 0;
    let alerteInactifs = 0;
    for (const m of membres) {
      if (m.statut === 'actif') actifs++;
      else if (m.statut === 'en_attente') enAttente++;
      else alerteInactifs++;
      if (m.statut === 'en_attente') continue;
      const memberAbos = abonnements
        .filter((a) => a.membre_id === m.id && a.statut === 'actif')
        .sort((a, b) => b.date_fin.localeCompare(a.date_fin));
      if (memberAbos[0]) {
        const d = daysUntil(memberAbos[0].date_fin);
        if (d >= 0 && d <= alertDays) expirant++;
      }
    }
    return {
      total: membres.length,
      actifs,
      enAttente,
      expirant,
      alerteInactifs,
    };
  }, [membres, abonnements, config.alerte_expiration_jours]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const alertDays = config.alerte_expiration_jours || 7;
    return membres.filter((m) => {
      if (statusFilter === 'expirant') {
        const memberAbos = abonnements
          .filter((a) => a.membre_id === m.id && a.statut === 'actif')
          .sort((a, b) => b.date_fin.localeCompare(a.date_fin));
        const d = memberAbos[0] ? daysUntil(memberAbos[0].date_fin) : -999;
        if (d < 0 || d > alertDays) return false;
      } else if (statusFilter !== 'tous' && m.statut !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const coach = m.coach_id ? coachs.find((c) => c.id === m.coach_id) : null;
      const coachFull = coach ? `${coach.prenom} ${coach.nom}`.toLowerCase() : '';
      return (
        m.code_membre.toLowerCase().includes(q) ||
        m.nom.toLowerCase().includes(q) ||
        m.prenom.toLowerCase().includes(q) ||
        m.telephone.toLowerCase().includes(q) ||
        coachFull.includes(q)
      );
    });
  }, [membres, abonnements, coachs, search, statusFilter, config.alerte_expiration_jours]);

  const openCreate = async () => {
    const nextCode = await getNextMemberCode();
    setEditingId(null);
    setFormData(emptyMemberForm(nextCode));
    setSelectedForfaitId(activeForfaits[0]?.id || '');
    setFraisInscription(config.frais_inscription || 0);
    setApplyFrais((config.frais_inscription || 0) > 0);
    setWantCoach(false);
    setSelectedCoachId('');
    setCoachPrice(config.tarif_coach_defaut || 0);
    setModeInscription('espèces');
    setRefInscription('');
    setEncaisserTout(true);
    setFormOpen(true);
  };

  const openEdit = (m: Membre) => {
    setEditingId(m.id);
    setFormData({
      ...m,
      coach_id: m.coach_id || '',
      tarif_coach: m.tarif_coach ?? 0,
    });
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFile(file, 300, 0.72);
      setFormData((prev) => ({ ...prev, photo: b64 }));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lecture photo.');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      onNotify('error', 'Caméra inaccessible ou autorisation refusée.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = 300;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const vw = video.videoWidth || 300;
    const vh = video.videoHeight || 300;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    setFormData((prev) => ({ ...prev, photo: dataUrl }));
    stopCamera();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom?.trim() || !formData.prenom?.trim()) {
      onNotify('error', 'Le nom et le prénom sont obligatoires.');
      return;
    }

    const resolvedCoachId = !editingId
      ? wantCoach
        ? selectedCoachId
        : ''
      : formData.coach_id || '';
    const resolvedCoachFee = !editingId
      ? wantCoach
        ? effectiveCoachPrice
        : 0
      : formData.coach_id || Number(formData.tarif_coach || 0) > 0
      ? Math.max(0, Number(formData.tarif_coach || 0))
      : 0;

    const saved = await saveRecord<Membre>('Membres', {
      ...formData,
      id: editingId || undefined,
      nom: formData.nom.trim(),
      prenom: formData.prenom.trim(),
      code_membre: (formData.code_membre || 'GYM-0001').trim().toUpperCase(),
      coach_id: resolvedCoachId,
      tarif_coach: resolvedCoachFee,
    });

    if (!editingId) {
      const dateIns = formData.date_inscription || todayISO();
      let createdAboId = '';

      if (chosenForfait) {
        const dateFin = addDaysISO(dateIns, Math.max(0, Number(chosenForfait.duree_jours) - 1));
        const abo = await saveRecord<Abonnement>('Abonnements', {
          membre_id: saved.id,
          forfait_id: chosenForfait.id,
          date_debut: dateIns,
          date_fin: dateFin,
          prix_applique: Number(chosenForfait.prix),
          statut: 'actif',
        });
        createdAboId = abo.id;
      }

      if (encaisserTout && totalInscription > 0) {
        const recu = await getNextReceiptNumber();
        const details: string[] = [];
        if (effectiveFrais > 0) {
          details.push(
            `Frais d’inscription (${formatMoney(effectiveFrais, config.devise_defaut)})`
          );
        }
        if (chosenForfait) {
          details.push(
            `Forfait ${chosenForfait.nom} (${formatMoney(chosenForfait.prix, chosenForfait.devise)})`
          );
        }
        if (wantCoach && effectiveCoachPrice > 0) {
          const coachLabel = chosenCoach
            ? `${chosenCoach.prenom} ${chosenCoach.nom}`
            : 'Coach personnalisé';
          details.push(
            `Coaching ${coachLabel} (${formatMoney(effectiveCoachPrice, config.devise_defaut)})`
          );
        }
        await saveRecord<Paiement>('Paiements', {
          membre_id: saved.id,
          abonnement_id: createdAboId,
          date: dateIns,
          montant: totalInscription,
          devise: chosenForfait?.devise || config.devise_defaut,
          mode: modeInscription,
          reference: refInscription.trim(),
          note: details.join(' + '),
          recu_numero: recu,
        });
      }
    }

    await logAction(
      user.nom_utilisateur,
      editingId ? 'Modification membre' : 'Création membre',
      `${saved.code_membre} — ${saved.prenom} ${saved.nom}${
        !editingId && chosenForfait ? ` (${chosenForfait.nom})` : ''
      }${!editingId && wantCoach ? ` · Coach: ${chosenCoach ? `${chosenCoach.prenom} ${chosenCoach.nom}` : 'Personnalisé'}` : ''}`
    );

    stopCamera();
    setFormOpen(false);
    await loadData();
    onNotify(
      'success',
      editingId
        ? 'Fiche membre mise à jour.'
        : wantCoach
        ? 'Membre enregistré avec son accompagnement coach.'
        : 'Membre enregistré avec frais d’inscription et forfait.'
    );
  };

  const confirmDeleteMember = async () => {
    if (!deleteTarget) return;
    await softDeleteRecord('Membres', deleteTarget.id);
    await logAction(
      user.nom_utilisateur,
      'Suppression membre',
      `${deleteTarget.code_membre} — ${deleteTarget.prenom} ${deleteTarget.nom}`
    );
    await loadData();
    onNotify('info', `Membre ${deleteTarget.code_membre} supprimé.`);
    setDeleteTarget(null);
  };

  const getLatestForfaitName = (membreId: string) => {
    const abos = abonnements
      .filter((a) => a.membre_id === membreId && a.statut !== 'annulé')
      .sort((a, b) => b.date_fin.localeCompare(a.date_fin));
    if (abos.length === 0) return 'Aucun forfait';
    const f = forfaits.find((x) => x.id === abos[0].forfait_id);
    return f?.nom || 'Forfait';
  };

  const statusTextClass = (statut: Membre['statut']) => {
    if (statut === 'actif') return 'text-emerald-600 dark:text-emerald-400';
    if (statut === 'en_attente') return 'text-sky-600 dark:text-sky-400';
    if (statut === 'suspendu') return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formatMemberStatusLabel = (statut: Membre['statut']) =>
    statut === 'en_attente' ? 'En attente' : statut;

  const cleanBaseUrl = publicBaseUrl.trim().replace(/\/+$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');
  const registrationUrl = `${cleanBaseUrl}/?join=1`;
  const qrMatrix = useMemo(() => generateQRMatrix(registrationUrl), [registrationUrl]);

  const openValidateModal = async (m: Membre) => {
    const nextCode = await getNextMemberCode();
    setValidateTarget(m);
    setValidateCode(nextCode);
    setValidateForfaitId('');
    setValidateIncludeFrais((config.frais_inscription || 0) > 0);
    setValidateEncaisser(false);
    setValidateMode('espèces');
    setValidateRef('');
  };

  const handleConfirmValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateTarget || !isAdmin) return;

    const finalCode = (validateCode || 'GYM-0001').trim().toUpperCase();
    const dateVal = todayISO();
    await saveRecord<Membre>('Membres', {
      ...validateTarget,
      code_membre: finalCode,
      statut: 'actif',
      date_inscription: validateTarget.date_inscription || dateVal,
    });

    const selectedF = activeForfaits.find((f) => f.id === validateForfaitId);
    let createdAboId = '';
    if (selectedF) {
      const dateFin = addDaysISO(dateVal, Math.max(0, Number(selectedF.duree_jours) - 1));
      const abo = await saveRecord<Abonnement>('Abonnements', {
        membre_id: validateTarget.id,
        forfait_id: selectedF.id,
        date_debut: dateVal,
        date_fin: dateFin,
        prix_applique: Number(selectedF.prix),
        statut: 'actif',
      });
      createdAboId = abo.id;
    }

    if (validateEncaisser) {
      const devisePay = selectedF?.devise || config.devise_defaut;
      const fraisConv = validateIncludeFrais
        ? convertCurrency(
            Math.max(0, Number(config.frais_inscription || 0)),
            config.devise_defaut,
            devisePay,
            config.taux_change
          )
        : 0;
      const totalPay = Math.round((fraisConv + (selectedF ? Number(selectedF.prix) : 0)) * 100) / 100;
      if (totalPay > 0) {
        const recu = await getNextReceiptNumber();
        const notes: string[] = [];
        if (fraisConv > 0) notes.push(`Frais d’inscription (${formatMoney(config.frais_inscription, config.devise_defaut)})`);
        if (selectedF) notes.push(`Forfait ${selectedF.nom} (${formatMoney(selectedF.prix, selectedF.devise)})`);
        await saveRecord<Paiement>('Paiements', {
          membre_id: validateTarget.id,
          abonnement_id: createdAboId,
          date: dateVal,
          montant: totalPay,
          devise: devisePay,
          mode: validateMode,
          reference: validateRef.trim(),
          note: notes.join(' + '),
          recu_numero: recu,
        });
      }
    }

    await fetch('/api/public-registration/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: validateTarget.id }),
    }).catch(() => {});

    await logAction(
      user.nom_utilisateur,
      'Validation inscription QR',
      `${finalCode} — ${validateTarget.prenom} ${validateTarget.nom}${selectedF ? ` (${selectedF.nom})` : ''}`
    );

    setValidateTarget(null);
    await loadData();
    onNotify('success', `Inscription validée : ${finalCode} est maintenant actif.`);
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget || !isAdmin) return;
    await softDeleteRecord('Membres', rejectTarget.id);
    await fetch('/api/public-registration/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rejectTarget.id }),
    }).catch(() => {});
    await logAction(
      user.nom_utilisateur,
      'Refus inscription QR',
      `${rejectTarget.code_membre} — ${rejectTarget.prenom} ${rejectTarget.nom}`
    );
    setRejectTarget(null);
    await loadData();
    onNotify('info', 'Demande d’inscription refusée et retirée.');
  };

  const handleDownloadQrPoster = () => {
    const W = 900;
    const H = 1120;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Carte blanche centrale
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(60, 70, W - 120, H - 140, 32);
    ctx.fill();

    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRÉ-INSCRIPTION EN LIGNE', W / 2, 145);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 40px Montserrat, Poppins, sans-serif';
    ctx.fillText((config.nom_gym || 'GYMPRO FITNESS').toUpperCase(), W / 2, 200);

    // QR Code
    const qrDim = 540;
    const qx = (W - qrDim) / 2;
    const qy = 250;
    const modSize = qrDim / qrMatrix.length;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx - 18, qy - 18, qrDim + 36, qrDim + 36);
    ctx.fillStyle = '#0f172a';
    qrMatrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) {
          ctx.fillRect(
            qx + c * modSize,
            qy + r * modSize,
            Math.ceil(modSize),
            Math.ceil(modSize)
          );
        }
      });
    });

    ctx.fillStyle = '#334155';
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('Scannez ce QR Code pour vous inscrire à distance', W / 2, 855);

    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillText('Validation requise par l’administrateur à la réception', W / 2, 900);

    ctx.fillStyle = '#64748b';
    ctx.font = '18px monospace';
    ctx.fillText(registrationUrl.slice(0, 58), W / 2, 955);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-inscription-${(config.nom_gym || 'gym').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    a.click();
    onNotify('success', 'Affiche QR Code téléchargée en PNG.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Membres
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {membres.length} membre(s) enregistré(s) · Frais d’inscription :{' '}
            {formatMoney(config.frais_inscription, config.devise_defaut)}
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              title="Partager un QR Code permettant à un futur membre de s’inscrire à distance (validation admin requise)"
              data-tooltip="Partager QR Code d’inscription"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-300 text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <MaterialIcon name="qr_code_2" className="w-4 h-4" />
              QR Code Inscription
            </button>
            <button
              type="button"
              onClick={openCreate}
              title="Inscrire un nouveau membre avec frais d’inscription et forfait"
              data-tooltip="Inscrire un nouveau membre"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <MaterialIcon name="person_add" className="w-4 h-4" />
              Ajouter un membre
            </button>
          </div>
        )}
      </div>

      {kpiStats.enAttente > 0 && (
        <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
              <MaterialIcon name="qr_code_2" className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {kpiStats.enAttente} inscription(s) à distance en attente de vérification
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Ces dossiers restent inactifs tant qu’un administrateur ne les a pas vérifiés et validés.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('en_attente')}
            title="Afficher uniquement les inscriptions en attente de validation"
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
          >
            Voir les demandes ({kpiStats.enAttente})
          </button>
        </div>
      )}

      {/* Cartes KPI récapitulatives */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('tous')}
          title="Afficher tous les membres inscrits"
          className={`text-left p-4 rounded-2xl bg-white dark:bg-[#151821] border transition-colors ${
            statusFilter === 'tous'
              ? 'border-orange-500 ring-1 ring-orange-500/40'
              : 'border-slate-200 dark:border-[#262b38] hover:border-orange-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total membres</span>
            <MaterialIcon name="group" className="w-4 h-4 text-orange-500" />
          </div>
          <p className="mt-1.5 font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
            {kpiStats.total}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Base locale synchronisée</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('actif')}
          title="Filtrer uniquement les membres actifs"
          className={`text-left p-4 rounded-2xl bg-white dark:bg-[#151821] border transition-colors ${
            statusFilter === 'actif'
              ? 'border-emerald-500 ring-1 ring-emerald-500/40'
              : 'border-slate-200 dark:border-[#262b38] hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Membres actifs</span>
            <MaterialIcon name="check_circle" className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-1.5 font-mono-num text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {kpiStats.actifs}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Accès autorisé</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('expirant')}
          title={`Filtrer les forfaits expirant sous ${config.alerte_expiration_jours} jours`}
          className={`text-left p-4 rounded-2xl bg-white dark:bg-[#151821] border transition-colors ${
            statusFilter === 'expirant'
              ? 'border-amber-500 ring-1 ring-amber-500/40'
              : 'border-slate-200 dark:border-[#262b38] hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expirent sous {config.alerte_expiration_jours} j</span>
            <MaterialIcon name="schedule" className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-1.5 font-mono-num text-2xl font-bold text-amber-600 dark:text-amber-400">
            {kpiStats.expirant}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">À renouveler bientôt</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('expiré')}
          title="Filtrer les membres expirés ou suspendus"
          className={`text-left p-4 rounded-2xl bg-white dark:bg-[#151821] border transition-colors ${
            statusFilter === 'expiré' || statusFilter === 'suspendu'
              ? 'border-red-500 ring-1 ring-red-500/40'
              : 'border-slate-200 dark:border-[#262b38] hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expirés / Suspendus</span>
            <MaterialIcon name="warning" className="w-4 h-4 text-red-500" />
          </div>
          <p className="mt-1.5 font-mono-num text-2xl font-bold text-red-600 dark:text-red-400">
            {kpiStats.alerteInactifs}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Relance requise</p>
        </button>
      </div>

      {/* Recherche, Filtres & Bascule Cartes / Tableau */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <MaterialIcon
            name="search"
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, code (GYM-0001) ou téléphone..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-x-auto">
            {(
              [
                ['tous', 'Tous'],
                ['actif', 'Actifs'],
                ['en_attente', `En attente (${kpiStats.enAttente})`],
                ['expirant', 'Expirent bientôt'],
                ['expiré', 'Expirés'],
                ['suspendu', 'Suspendus'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                title={`Afficher les membres (${label})`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sélecteur Vue Cartes vs Vue Tableau */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
            <button
              type="button"
              onClick={() => setViewMode('cartes')}
              title="Afficher la liste des membres sous forme de cartes"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'cartes'
                  ? 'bg-white dark:bg-[#232836] text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MaterialIcon name="grid_view" className="w-4 h-4" />
              Cartes
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tableau')}
              title="Afficher la liste des membres sous forme de tableau"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'tableau'
                  ? 'bg-white dark:bg-[#232836] text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MaterialIcon name="view_list" className="w-4 h-4" />
              Tableau
            </button>
          </div>
        </div>
      </div>

      {/* Liste des membres (Cartes ou Tableau) */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="group"
          title="Aucun membre trouvé"
          description="Ajoutez votre premier membre ou modifiez vos filtres de recherche."
          actionLabel={!isReadOnly ? 'Inscrire un membre' : undefined}
          onAction={!isReadOnly ? openCreate : undefined}
        />
      ) : viewMode === 'cartes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const sub = getLatestSubscriptionInfo(m.id);
            return (
              <div
                key={m.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] hover:border-orange-500/50 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailMember(m);
                      setDetailTab('infos');
                    }}
                    title="Ouvrir la fiche détaillée du membre"
                    className="flex items-center gap-3 text-left min-w-0 group"
                  >
                    {m.photo ? (
                      <img
                        src={m.photo}
                        alt={`${m.prenom} ${m.nom}`}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <span className="w-12 h-12 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold flex items-center justify-center shrink-0">
                        {m.prenom.charAt(0)}
                        {m.nom.charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-display font-bold text-base text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors truncate">
                        {m.prenom} {m.nom}
                      </p>
                      <p className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                        {m.code_membre} · {m.telephone || 'Sans tél.'}
                      </p>
                    </div>
                  </button>

                  <span
                    className={`text-xs font-semibold shrink-0 ${statusTextClass(
                      m.statut
                    )}`}
                  >
                    ● {formatMemberStatusLabel(m.statut)}
                  </span>
                </div>

                {/* Barre de progression du forfait et contrôle de date d'expiration */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200/80 dark:border-[#262b38] space-y-2">
                  {sub.abo ? (
                    <SubscriptionProgressBar
                      dateDebut={sub.abo.date_debut}
                      dateFin={sub.abo.date_fin}
                      forfaitNom={sub.forfaitNom}
                      alertDays={config.alerte_expiration_jours}
                    />
                  ) : (
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Aucun abonnement actif</span>
                      <span className="font-mono-num">
                        Inscrit : {formatDateFR(m.date_inscription)}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const cInfo = getCoachDisplay(m);
                    if (!cInfo) return null;
                    return (
                      <div className="pt-2 border-t border-slate-200/80 dark:border-[#262b38] flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                          <MaterialIcon name="fitness_center" className="w-3.5 h-3.5 text-orange-500" />
                          <span className="truncate">Coach : {cInfo.nom}</span>
                        </span>
                        <span className="font-mono-num font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                          {formatMoney(cInfo.prix, config.devise_defaut)}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-[#262b38]">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailMember(m);
                      setDetailTab('infos');
                    }}
                    title="Consulter le dossier complet du membre"
                    className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    Dossier complet
                  </button>

                  <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                    {m.statut === 'en_attente' && (
                      isAdmin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openValidateModal(m)}
                            title="Vérifier et activer cette inscription à distance"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                          >
                            <MaterialIcon name="check_circle" className="w-3.5 h-3.5" />
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTarget(m)}
                            title="Refuser cette demande d’inscription"
                            aria-label="Refuser la demande"
                            className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10"
                          >
                            <MaterialIcon name="cancel" className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="px-2 py-1 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300 text-[11px] font-medium">
                          Validation admin requise
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setCardMember(m)}
                      title="Afficher et imprimer la carte officielle de membre"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1c202b] hover:bg-orange-500/15 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                    >
                      <MaterialIcon name="badge" className="w-3.5 h-3.5 text-orange-500" />
                      Carte
                    </button>
                    {!isReadOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          title="Modifier la fiche du membre"
                          aria-label="Modifier le membre"
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <MaterialIcon name="edit" className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          title="Supprimer ce membre (confirmation requise)"
                          aria-label="Supprimer le membre"
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        >
                          <MaterialIcon name="delete" className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4">Membre</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Forfait & Expiration</th>
                  <th className="py-3.5 px-4">Téléphone</th>
                  <th className="py-3.5 px-4">Inscription</th>
                  <th className="py-3.5 px-4">Statut</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38] text-sm">
                {filtered.map((m) => {
                  const sub = getLatestSubscriptionInfo(m.id);
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailMember(m);
                            setDetailTab('infos');
                          }}
                          title="Ouvrir la fiche détaillée du membre"
                          className="flex items-center gap-3 text-left group"
                        >
                          {m.photo ? (
                            <img
                              src={m.photo}
                              alt={`${m.prenom} ${m.nom}`}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <span className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 font-semibold flex items-center justify-center shrink-0">
                              {m.prenom.charAt(0)}
                              {m.nom.charAt(0)}
                            </span>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">
                              {m.prenom} {m.nom}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {(() => {
                                const cInfo = getCoachDisplay(m);
                                return cInfo
                                  ? `Coach : ${cInfo.nom} (${formatMoney(cInfo.prix, config.devise_defaut)})`
                                  : m.objectif || m.adresse || '—';
                              })()}
                            </p>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {m.code_membre}
                      </td>
                      <td className="py-3 px-4">
                        {sub.abo ? (
                          <SubscriptionProgressBar
                            dateDebut={sub.abo.date_debut}
                            dateFin={sub.abo.date_fin}
                            forfaitNom={sub.forfaitNom}
                            alertDays={config.alerte_expiration_jours}
                            compact
                          />
                        ) : (
                          <span className="text-xs text-slate-400">Aucun forfait</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                        {m.telephone || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                        {formatDateFR(m.date_inscription)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-semibold ${statusTextClass(m.statut)}`}>
                          {formatMemberStatusLabel(m.statut)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {m.statut === 'en_attente' && isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openValidateModal(m)}
                                title="Valider et activer cette inscription à distance"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                              >
                                <MaterialIcon name="check_circle" className="w-3.5 h-3.5" />
                                Valider
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectTarget(m)}
                                title="Refuser cette inscription"
                                aria-label="Refuser la demande"
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10"
                              >
                                <MaterialIcon name="cancel" className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setCardMember(m)}
                            title="Afficher et imprimer la carte officielle de membre"
                            aria-label="Carte de membre QR Code"
                            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <MaterialIcon name="badge" className="w-4 h-4" />
                          </button>
                          {!isReadOnly && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(m)}
                                title="Modifier la fiche du membre"
                                aria-label="Modifier le membre"
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <MaterialIcon name="edit" className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(m)}
                                title="Supprimer ce membre (confirmation requise)"
                                aria-label="Supprimer le membre"
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10"
                              >
                                <MaterialIcon name="delete" className="w-4 h-4" />
                              </button>
                            </>
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
      )}

      {/* Confirmation suppression membre */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteMember}
        title="Confirmer la suppression du membre"
        message={
          deleteTarget
            ? `Voulez-vous vraiment supprimer la fiche de ${deleteTarget.prenom} ${deleteTarget.nom} (${deleteTarget.code_membre}) ? Cette action est enregistrée dans le journal.`
            : ''
        }
        confirmLabel="Supprimer le membre"
      />

      {/* Modale Création / Modification Membre */}
      <Modal
        open={formOpen}
        onClose={() => {
          stopCamera();
          setFormOpen(false);
        }}
        title={editingId ? 'Modifier la fiche membre' : 'Inscrire un nouveau membre'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Bloc photo (caméra ou fichier) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
            {formData.photo ? (
              <img
                src={formData.photo}
                alt="Aperçu"
                className="w-20 h-20 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-slate-200 dark:bg-[#1c202b] flex items-center justify-center text-slate-400">
                <MaterialIcon name="person" className="w-8 h-8" />
              </div>
            )}
            <div className="space-y-2 flex-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Photo du membre (compressée localement)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={cameraOpen ? stopCamera : startCamera}
                  title="Ouvrir la caméra pour photographier le membre"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <MaterialIcon name="photo_camera" className="w-4 h-4" />
                  {cameraOpen ? 'Fermer caméra' : 'Prendre une photo'}
                </button>
                <label
                  title="Importer une photo depuis l’appareil"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <MaterialIcon name="upload" className="w-4 h-4" />
                  Choisir un fichier
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                {formData.photo && (
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, photo: '' }))}
                    title="Retirer la photo"
                    className="text-xs text-red-600 dark:text-red-400 hover:underline px-2"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>

          {cameraOpen && (
            <div className="p-4 rounded-xl bg-black/90 flex flex-col items-center gap-3">
              <video ref={videoRef} playsInline muted className="w-56 h-56 object-cover rounded-xl" />
              <button
                type="button"
                onClick={capturePhoto}
                title="Prendre le cliché maintenant"
                className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold"
              >
                Capturer maintenant
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Code membre
              </label>
              <input
                type="text"
                required
                value={formData.code_membre || ''}
                onChange={(e) => setFormData({ ...formData, code_membre: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Prénom *
              </label>
              <input
                type="text"
                required
                value={formData.prenom || ''}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nom *
              </label>
              <input
                type="text"
                required
                value={formData.nom || ''}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sexe
              </label>
              <select
                value={formData.sexe || 'M'}
                onChange={(e) =>
                  setFormData({ ...formData, sexe: e.target.value as Membre['sexe'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
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
                value={formData.date_naissance || ''}
                onChange={(e) => setFormData({ ...formData, date_naissance: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Téléphone
              </label>
              <input
                type="tel"
                value={formData.telephone || ''}
                onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                placeholder="+509 ..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Adresse
              </label>
              <input
                type="text"
                value={formData.adresse || ''}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Contact d’urgence (Nom)
              </label>
              <input
                type="text"
                value={formData.contact_urgence_nom || ''}
                onChange={(e) => setFormData({ ...formData, contact_urgence_nom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Contact d’urgence (Tél)
              </label>
              <input
                type="tel"
                value={formData.contact_urgence_tel || ''}
                onChange={(e) => setFormData({ ...formData, contact_urgence_tel: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Statut
              </label>
              <select
                value={formData.statut || 'actif'}
                onChange={(e) =>
                  setFormData({ ...formData, statut: e.target.value as Membre['statut'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="actif">Actif</option>
                <option value="en_attente">En attente (validation admin)</option>
                <option value="expiré">Expiré</option>
                <option value="suspendu">Suspendu</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Objectif sportif
              </label>
              <input
                type="text"
                value={formData.objectif || ''}
                onChange={(e) => setFormData({ ...formData, objectif: e.target.value })}
                placeholder="ex. Perte de poids, prise de masse, cardio..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Date d’inscription
              </label>
              <input
                type="date"
                value={formData.date_inscription || todayISO()}
                onChange={(e) => setFormData({ ...formData, date_inscription: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Notes santé / allergies / contre-indications
              </label>
              <textarea
                rows={2}
                value={formData.notes_sante || ''}
                onChange={(e) => setFormData({ ...formData, notes_sante: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
          </div>

          {/* Choix volontaire d'un coach en modification */}
          {editingId && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <MaterialIcon name="fitness_center" className="w-4 h-4 text-orange-500" />
                  Accompagnement Coach (Optionnel)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Coach choisi
                  </label>
                  <select
                    value={formData.coach_id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const found = activeCoachs.find((c) => c.id === nextId);
                      const defaultFee = found
                        ? found.tarif_coaching !== undefined
                          ? Number(found.tarif_coaching)
                          : config.tarif_coach_defaut || 0
                        : 0;
                      setFormData((prev) => ({
                        ...prev,
                        coach_id: nextId,
                        tarif_coach: nextId ? defaultFee : 0,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    <option value="">— Aucun coach (entraînement libre) —</option>
                    {activeCoachs.map((c) => {
                      const fee =
                        c.tarif_coaching !== undefined
                          ? Number(c.tarif_coaching)
                          : config.tarif_coach_defaut || 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.prenom} {c.nom} ({formatMoney(fee, config.devise_defaut)})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tarif coaching ({config.devise_defaut})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="50"
                    value={formData.tarif_coach ?? 0}
                    onChange={(e) =>
                      setFormData({ ...formData, tarif_coach: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Frais d'inscription, forfait choisi et choix volontaire de coach lors de la création */}
          {!editingId && (
            <div className="p-4 rounded-xl bg-orange-500/8 border border-orange-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    Frais d’inscription, Forfait & Coach optionnel
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Frais : {formatMoney(config.frais_inscription, config.devise_defaut)} · Coaching par défaut :{' '}
                    {formatMoney(config.tarif_coach_defaut, config.devise_defaut)}
                  </p>
                </div>
                <span className="font-mono-num text-base font-bold text-orange-600 dark:text-orange-400">
                  Total : {formatMoney(totalInscription, paymentDevise)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Forfait / Plan choisi
                  </label>
                  <select
                    value={selectedForfaitId}
                    onChange={(e) => setSelectedForfaitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    <option value="">— Sans forfait immédiat —</option>
                    {activeForfaits.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nom} ({formatMoney(f.prix, f.devise)} / {f.duree_jours} j)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Frais d’inscription ({config.devise_defaut})
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyFrais}
                        onChange={(e) => setApplyFrais(e.target.checked)}
                      />
                      Appliquer
                    </label>
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={!applyFrais}
                    value={fraisInscription}
                    onChange={(e) => setFraisInscription(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num disabled:opacity-45"
                  />
                </div>
              </div>

              {/* Option volontaire de choix de coach avec tarif configurable */}
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-[#0d0f14]/80 border border-orange-500/25 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantCoach}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setWantCoach(checked);
                        if (checked) {
                          const defaultCoach = activeCoachs[0];
                          const nextId = selectedCoachId || defaultCoach?.id || '';
                          setSelectedCoachId(nextId);
                          const c = activeCoachs.find((x) => x.id === nextId);
                          const fee =
                            c && c.tarif_coaching !== undefined
                              ? Number(c.tarif_coaching)
                              : config.tarif_coach_defaut || 0;
                          setCoachPrice(fee);
                        }
                      }}
                    />
                    <MaterialIcon name="fitness_center" className="w-4 h-4 text-orange-500" />
                    Choisir un coach personnel (optionnel / volontaire)
                  </label>
                  {wantCoach && (
                    <span className="font-mono-num text-xs font-bold text-orange-600 dark:text-orange-400">
                      + {formatMoney(effectiveCoachPrice, config.devise_defaut)}
                    </span>
                  )}
                </div>

                {wantCoach && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Sélectionner le coach
                      </label>
                      <select
                        value={selectedCoachId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedCoachId(id);
                          const c = activeCoachs.find((x) => x.id === id);
                          if (c) {
                            setCoachPrice(
                              c.tarif_coaching !== undefined
                                ? Number(c.tarif_coaching)
                                : config.tarif_coach_defaut || 0
                            );
                          } else {
                            setCoachPrice(config.tarif_coach_defaut || 0);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm"
                      >
                        {activeCoachs.length === 0 ? (
                          <option value="">Coach personnalisé (à assigner)</option>
                        ) : (
                          <>
                            <option value="">— Coach à assigner ultérieurement —</option>
                            {activeCoachs.map((c) => {
                              const fee =
                                c.tarif_coaching !== undefined
                                  ? Number(c.tarif_coaching)
                                  : config.tarif_coach_defaut || 0;
                              return (
                                <option key={c.id} value={c.id}>
                                  {c.prenom} {c.nom}
                                  {c.specialite ? ` — ${c.specialite}` : ''} (
                                  {formatMoney(fee, config.devise_defaut)})
                                </option>
                              );
                            })}
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Prix du coaching ({config.devise_defaut})
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="50"
                        value={coachPrice}
                        onChange={(e) => setCoachPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Mode de paiement
                  </label>
                  <select
                    value={modeInscription}
                    onChange={(e) => setModeInscription(e.target.value as ModePaiement)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  >
                    <option value="espèces">Espèces</option>
                    <option value="MonCash">MonCash</option>
                    <option value="NatCash">NatCash</option>
                    <option value="virement">Virement</option>
                    <option value="carte">Carte</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Référence paiement
                  </label>
                  <input
                    type="text"
                    value={refInscription}
                    onChange={(e) => setRefInscription(e.target.value)}
                    placeholder="ex. MC-452019"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                  />
                </div>
              </div>

              {/* Détail récapitulatif transparent */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-orange-500/20 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {effectiveFrais > 0 && (
                    <span>
                      Inscription :{' '}
                      <strong className="font-mono-num">
                        {formatMoney(effectiveFrais, config.devise_defaut)}
                      </strong>
                    </span>
                  )}
                  {chosenForfait && (
                    <span>
                      Forfait ({chosenForfait.nom}) :{' '}
                      <strong className="font-mono-num">
                        {formatMoney(chosenForfait.prix, chosenForfait.devise)}
                      </strong>
                    </span>
                  )}
                  {wantCoach && (
                    <span>
                      Coach ({chosenCoach ? `${chosenCoach.prenom} ${chosenCoach.nom}` : 'Personnalisé'}) :{' '}
                      <strong className="font-mono-num text-orange-600 dark:text-orange-400">
                        {formatMoney(effectiveCoachPrice, config.devise_defaut)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={encaisserTout}
                  onChange={(e) => setEncaisserTout(e.target.checked)}
                />
                Encaisser immédiatement le paiement et générer le reçu
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setFormOpen(false);
              }}
              title="Annuler et fermer sans enregistrer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer le membre dans la base locale"
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale Fiche Détaillée 5 Onglets */}
      <Modal
        open={Boolean(detailMember)}
        onClose={() => setDetailMember(null)}
        title={detailMember ? `${detailMember.prenom} ${detailMember.nom} (${detailMember.code_membre})` : ''}
        maxWidth="max-w-3xl"
      >
        {detailMember && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
              {(
                [
                  ['infos', 'Infos'],
                  ['abonnements', 'Abonnements'],
                  ['paiements', 'Paiements'],
                  ['presences', 'Présences'],
                  ['mesures', 'Mesures'],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setDetailTab(tabKey)}
                  title={`Afficher l’onglet ${label}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    detailTab === tabKey
                      ? 'bg-white dark:bg-[#1c202b] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailTab === 'infos' && (
              <div className="space-y-4 text-sm">
                {(() => {
                  const sub = getLatestSubscriptionInfo(detailMember.id);
                  return sub.abo ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Suivi de durée & contrôle d’expiration du forfait
                      </p>
                      <SubscriptionProgressBar
                        dateDebut={sub.abo.date_debut}
                        dateFin={sub.abo.date_fin}
                        forfaitNom={sub.forfaitNom}
                        alertDays={config.alerte_expiration_jours}
                      />
                    </div>
                  ) : null;
                })()}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-500">Forfait actuel</span>
                    <p className="font-semibold text-orange-600 dark:text-orange-400">
                      {getLatestForfaitName(detailMember.id)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Accompagnement Coach</span>
                    {(() => {
                      const cInfo = getCoachDisplay(detailMember);
                      return cInfo ? (
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {cInfo.nom}{' '}
                          <span className="font-mono-num text-xs text-orange-600 dark:text-orange-400">
                            ({formatMoney(cInfo.prix, config.devise_defaut)})
                          </span>
                        </p>
                      ) : (
                        <p className="font-medium text-slate-500">Aucun coach (entraînement libre)</p>
                      );
                    })()}
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Téléphone</span>
                    <p className="font-medium">{detailMember.telephone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Email</span>
                    <p className="font-medium">{detailMember.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Adresse</span>
                    <p className="font-medium">{detailMember.adresse || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Date de naissance</span>
                    <p className="font-medium">{formatDateFR(detailMember.date_naissance)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Contact d’urgence</span>
                    <p className="font-medium">
                      {detailMember.contact_urgence_nom || '—'} ·{' '}
                      {detailMember.contact_urgence_tel || ''}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Objectif</span>
                    <p className="font-medium">{detailMember.objectif || '—'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Notes santé</span>
                    <p className="font-medium">{detailMember.notes_sante || 'Aucune note'}</p>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'abonnements' && (
              <div className="space-y-3">
                {abonnements
                  .filter((a) => a.membre_id === detailMember.id)
                  .map((a) => {
                    const f = forfaits.find((x) => x.id === a.forfait_id);
                    return (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#262b38] space-y-2.5 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{f?.nom || 'Forfait'}</p>
                            <p className="text-xs text-slate-500">
                              Du {formatDateFR(a.date_debut)} au {formatDateFR(a.date_fin)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono-num font-semibold">
                              {formatMoney(a.prix_applique, f?.devise || config.devise_defaut)}
                            </p>
                            <p className="text-xs capitalize text-slate-500">{a.statut}</p>
                          </div>
                        </div>
                        <SubscriptionProgressBar
                          dateDebut={a.date_debut}
                          dateFin={a.date_fin}
                          alertDays={config.alerte_expiration_jours}
                          compact
                        />
                      </div>
                    );
                  })}
                {abonnements.filter((a) => a.membre_id === detailMember.id).length === 0 && (
                  <p className="text-sm text-slate-500 py-4 text-center">Aucun abonnement.</p>
                )}
              </div>
            )}

            {detailTab === 'paiements' && (
              <div className="space-y-2">
                {paiements
                  .filter((p) => p.membre_id === detailMember.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-[#262b38] flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-mono-num font-semibold">{p.recu_numero}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateFR(p.date)} · {p.mode} {p.note ? `· ${p.note}` : ''}
                        </p>
                      </div>
                      <p className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(p.montant, p.devise)}
                      </p>
                    </div>
                  ))}
                {paiements.filter((p) => p.membre_id === detailMember.id).length === 0 && (
                  <p className="text-sm text-slate-500 py-4 text-center">Aucun paiement.</p>
                )}
              </div>
            )}

            {detailTab === 'presences' && (
              <div className="space-y-2">
                {presences
                  .filter((pr) => pr.membre_id === detailMember.id)
                  .slice(0, 20)
                  .map((pr) => (
                    <div
                      key={pr.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-[#262b38] flex items-center justify-between text-sm"
                    >
                      <span className="font-mono-num">{formatDateFR(pr.date)}</span>
                      <span className="font-mono-num text-xs text-slate-500">
                        Entrée {pr.heure_entree} {pr.heure_sortie ? `· Sortie ${pr.heure_sortie}` : ''}
                      </span>
                    </div>
                  ))}
                {presences.filter((pr) => pr.membre_id === detailMember.id).length === 0 && (
                  <p className="text-sm text-slate-500 py-4 text-center">Aucune présence.</p>
                )}
              </div>
            )}

            {detailTab === 'mesures' && (
              <div className="space-y-2">
                {mesures
                  .filter((ms) => ms.membre_id === detailMember.id)
                  .map((ms) => (
                    <div
                      key={ms.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-[#262b38] flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-mono-num font-semibold">{formatDateFR(ms.date)}</p>
                        <p className="text-xs text-slate-500">{ms.notes || 'Mesure corporelle'}</p>
                      </div>
                      <p className="font-mono-num text-xs">
                        {ms.poids} kg · IMC {ms.imc} · Taille {ms.tour_taille} cm
                      </p>
                    </div>
                  ))}
                {mesures.filter((ms) => ms.membre_id === detailMember.id).length === 0 && (
                  <p className="text-sm text-slate-500 py-4 text-center">Aucune mesure.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modale Carte de Membre Professionnelle (style Carte Étudiant CR80) */}
      <Modal
        open={Boolean(cardMember)}
        onClose={() => setCardMember(null)}
        title="Carte officielle de membre"
        maxWidth="max-w-lg"
      >
        {cardMember &&
          (() => {
            const sub = getLatestSubscriptionInfo(cardMember.id);
            return (
              <div className="space-y-5">
                <MemberIDCard
                  member={cardMember}
                  config={config}
                  forfaitNom={sub.forfaitNom}
                  dateExpiration={sub.dateExpiration}
                />

                <div className="no-print flex flex-wrap justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCardMember(null)}
                    title="Fermer l’aperçu de la carte"
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium"
                  >
                    Fermer
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await downloadMemberCardPNG(
                        cardMember,
                        config,
                        sub.forfaitNom,
                        sub.dateExpiration
                      );
                      onNotify('success', `Carte ${cardMember.code_membre} téléchargée en PNG.`);
                    }}
                    title="Télécharger la carte officielle en image PNG haute définition"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 text-sm font-semibold"
                  >
                    <MaterialIcon name="download" className="w-4 h-4" />
                    Télécharger PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="Imprimer la carte officielle (format CR80 isolé)"
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
                  >
                    <MaterialIcon name="print" className="w-4 h-4" />
                    Imprimer la carte
                  </button>
                </div>
              </div>
            );
          })()}
      </Modal>

      <PrintPortal active={Boolean(cardMember)}>
        {cardMember &&
          (() => {
            const sub = getLatestSubscriptionInfo(cardMember.id);
            return (
              <MemberIDCard
                member={cardMember}
                config={config}
                forfaitNom={sub.forfaitNom}
                dateExpiration={sub.dateExpiration}
              />
            );
          })()}
      </PrintPortal>

      {/* Modale Partage QR Code d'inscription à distance */}
      <Modal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Partager le QR Code d’inscription à distance"
        maxWidth="max-w-lg"
      >
        <div className="space-y-5">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Partagez ce QR Code ou ce lien par WhatsApp, affiche ou réception. Toute personne peut
            remplir son formulaire d’inscription où qu’elle soit, mais son dossier restera{' '}
            <strong>inactif (En attente)</strong> tant que l’administrateur ne l’a pas validé.
          </p>

          <div className="flex flex-col items-center p-5 rounded-2xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <svg
                viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                className="w-52 h-52"
                role="img"
                aria-label="QR Code d’inscription à distance"
              >
                <rect width={qrMatrix.length} height={qrMatrix.length} fill="#ffffff" />
                {qrMatrix.map((row, r) =>
                  row.map((cell, c) =>
                    cell ? (
                      <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0f172a" />
                    ) : null
                  )
                )}
              </svg>
            </div>
            <p className="mt-3 font-brand font-bold text-sm text-slate-900 dark:text-white">
              {config.nom_gym}
            </p>
            <p className="mt-1 font-mono-num text-[11px] text-orange-600 dark:text-orange-400 break-all text-center">
              {registrationUrl}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Adresse publique du site pour le QR Code
            </label>
            <input
              type="url"
              value={publicBaseUrl}
              onChange={(e) => {
                setPublicBaseUrl(e.target.value);
                localStorage.setItem('gympro_public_base_url', e.target.value);
              }}
              placeholder="https://clavens-fitness-gympro.onrender.com"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-xs font-mono-num"
            />
            {(publicBaseUrl.includes('ais-dev-') || publicBaseUrl.includes('localhost')) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                <span>
                  Lien privé détecté : utilisez votre adresse publique Render pour les téléphones externes.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const renderUrl = 'https://clavens-fitness-gympro.onrender.com';
                    setPublicBaseUrl(renderUrl);
                    localStorage.setItem('gympro_public_base_url', renderUrl);
                  }}
                  title="Utiliser le lien public permanent Render"
                  className="font-semibold underline shrink-0"
                >
                  Utiliser le lien Render
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-[#262b38]">
            {onOpenPublicJoin && (
              <button
                type="button"
                onClick={() => {
                  setQrModalOpen(false);
                  onOpenPublicJoin();
                }}
                title="Aperçu du formulaire public d’inscription"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="description" className="w-4 h-4" />
                Tester le formulaire
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(registrationUrl);
                    onNotify('success', 'Lien d’inscription copié dans le presse-papiers.');
                  } catch {
                    onNotify('info', registrationUrl);
                  }
                }}
                title="Copier le lien d’inscription à partager"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="content_copy" className="w-4 h-4" />
                Copier lien
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: `Inscription — ${config.nom_gym}`,
                        text: `Inscrivez-vous à ${config.nom_gym} en ligne (validation administrateur requise) :`,
                        url: registrationUrl,
                      });
                      return;
                    } catch {
                      // annulé ou non supporté
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(registrationUrl);
                    onNotify('success', 'Lien prêt à partager (copié).');
                  } catch {
                    onNotify('info', registrationUrl);
                  }
                }}
                title="Partager ce lien via WhatsApp, SMS ou autre application"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300 text-xs font-semibold"
              >
                <MaterialIcon name="share" className="w-4 h-4" />
                Partager
              </button>

              <button
                type="button"
                onClick={handleDownloadQrPoster}
                title="Télécharger le QR Code d’inscription en image PNG imprimable"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                <MaterialIcon name="download" className="w-4 h-4" />
                Télécharger PNG
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modale de vérification & validation Administrateur */}
      <Modal
        open={Boolean(validateTarget)}
        onClose={() => setValidateTarget(null)}
        title="Vérifier et valider l’inscription"
        maxWidth="max-w-lg"
      >
        {validateTarget && (
          <form onSubmit={handleConfirmValidate} className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] flex items-start gap-3">
              {validateTarget.photo ? (
                <img
                  src={validateTarget.photo}
                  alt={validateTarget.prenom}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-300 dark:border-slate-700"
                />
              ) : (
                <span className="w-14 h-14 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300 font-bold flex items-center justify-center shrink-0">
                  {validateTarget.prenom.charAt(0)}
                  {validateTarget.nom.charAt(0)}
                </span>
              )}
              <div className="min-w-0 text-xs space-y-1">
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {validateTarget.prenom} {validateTarget.nom}
                </p>
                <p className="text-slate-600 dark:text-slate-300 font-mono-num">
                  Tél : {validateTarget.telephone || '—'} · Demande : {validateTarget.code_membre}
                </p>
                {validateTarget.adresse && (
                  <p className="text-slate-500">Adresse : {validateTarget.adresse}</p>
                )}
                {validateTarget.notes_sante && (
                  <p className="text-amber-700 dark:text-amber-300">
                    Notes : {validateTarget.notes_sante}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Code membre officiel attribué
                </label>
                <input
                  type="text"
                  required
                  value={validateCode}
                  onChange={(e) => setValidateCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Forfait à activer (optionnel)
                </label>
                <select
                  value={validateForfaitId}
                  onChange={(e) => setValidateForfaitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                >
                  <option value="">Activer la fiche sans forfait pour l’instant</option>
                  {activeForfaits.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom} — {formatMoney(f.prix, f.devise)} ({f.duree_jours} j)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-2.5">
              {(config.frais_inscription || 0) > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={validateIncludeFrais}
                    onChange={(e) => setValidateIncludeFrais(e.target.checked)}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  Inclure les frais d’inscription ({formatMoney(config.frais_inscription, config.devise_defaut)})
                </label>
              )}

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={validateEncaisser}
                  onChange={(e) => setValidateEncaisser(e.target.checked)}
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                Encaisser le paiement maintenant à la validation
              </label>

              {validateEncaisser && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <select
                    value={validateMode}
                    onChange={(e) => setValidateMode(e.target.value as ModePaiement)}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                  >
                    <option value="espèces">Espèces</option>
                    <option value="MonCash">MonCash</option>
                    <option value="NatCash">NatCash</option>
                    <option value="virement">Virement</option>
                    <option value="carte">Carte</option>
                  </select>
                  <input
                    type="text"
                    value={validateRef}
                    onChange={(e) => setValidateRef(e.target.value)}
                    placeholder="Référence paiement (optionnel)"
                    className="px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setValidateTarget(null)}
                title="Annuler la validation"
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                title="Confirmer la vérification et activer le membre"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                <MaterialIcon name="check_circle" className="w-4 h-4" />
                Valider & Activer
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleConfirmReject}
        title="Refuser l’inscription à distance"
        message={
          rejectTarget
            ? `Voulez-vous refuser et supprimer la demande de ${rejectTarget.prenom} ${rejectTarget.nom} (${rejectTarget.code_membre}) ?`
            : ''
        }
        confirmLabel="Refuser la demande"
        danger
      />
    </div>
  );
};
