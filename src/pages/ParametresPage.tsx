import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import {
  RegulationsDocument,
  buildRegulationsShareText,
  downloadRegulationsPNG,
  downloadRegulationsTXT,
} from '../components/RegulationsDocument';
import { ConfirmModal, Modal, PrintPortal } from '../components/ui';
import { hashPassword, SessionUser, verifyPassword } from '../lib/auth';
import {
  clearAutoBackupSnapshots,
  clearSyncQueue,
  createAutoBackupSnapshot,
  deleteAutoBackupSnapshot,
  enqueueAllForSync,
  exportAllJSON,
  getAllRecords,
  getAutoBackupSnapshots,
  getSyncQueue,
  importAllJSON,
  logAction,
  saveGymConfig,
  saveRecord,
  softDeleteRecord,
} from '../lib/db';
import { loadDemoData } from '../lib/demo';
import { pullFromGoogleSheets, testGoogleSheetsConnection } from '../lib/sync';
import {
  COLOR_PALETTES,
  DEFAULT_REGLEMENTS_CONTENU,
  DEFAULT_REGLEMENTS_TITRE,
  compressImageFile,
  computeNextAutoBackupDate,
  formatBytesFR,
  formatDateTimeFR,
  formatMoney,
  triggerJsonFileDownload,
} from '../lib/utils';
import {
  AutoBackupMode,
  AutoBackupSnapshot,
  Devise,
  Forfait,
  GymConfig,
  JournalEntry,
  PaletteId,
  SyncQueueItem,
  UserRole,
  Utilisateur,
} from '../types/gym';

interface ParametresPageProps {
  user: SessionUser;
  config: GymConfig;
  refreshTick: number;
  onConfigUpdated: (c: GymConfig) => void;
  onSyncNow: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<void>;
}

export const ParametresPage: React.FC<ParametresPageProps> = ({
  user,
  config,
  refreshTick,
  onConfigUpdated,
  onSyncNow,
  onNotify,
}) => {
  const [tab, setTab] = useState<
    'gym' | 'reglements' | 'forfaits' | 'users' | 'sheets' | 'sauvegarde'
  >('gym');
  const [gymForm, setGymForm] = useState<GymConfig>(config);

  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [forfaitModal, setForfaitModal] = useState(false);
  const [editForfaitId, setEditForfaitId] = useState<string | null>(null);
  const [forfaitForm, setForfaitForm] = useState<Partial<Forfait>>({
    nom: '',
    duree_jours: 30,
    prix: 3500,
    devise: 'HTG',
    nb_seances_max: '',
    actif: 1,
  });

  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [userModal, setUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    nom_utilisateur: '',
    password: '',
    role: 'caissier' as UserRole,
  });
  const [passwordTargetUser, setPasswordTargetUser] = useState<Utilisateur | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassFields, setShowPassFields] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [snapshots, setSnapshots] = useState<AutoBackupSnapshot[]>([]);
  const [runningBackupNow, setRunningBackupNow] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  const [copyingScript, setCopyingScript] = useState(false);
  const [showScriptKey, setShowScriptKey] = useState(false);
  const [sheetsDiag, setSheetsDiag] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);

  const loadAll = async () => {
    const [f, u, q, j, snaps] = await Promise.all([
      getAllRecords<Forfait>('Forfaits'),
      getAllRecords<Utilisateur>('Utilisateurs'),
      getSyncQueue(),
      getAllRecords<JournalEntry>('Journal'),
      getAutoBackupSnapshots(),
    ]);
    setForfaits(f);
    setUsers(u);
    setQueue(q);
    setJournal(j.sort((a, b) => b.date_heure.localeCompare(a.date_heure)).slice(0, 40));
    setSnapshots(snaps);
  };

  useEffect(() => {
    setGymForm(config);
    loadAll();
  }, [config, refreshTick]);

  const handleSaveGym = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await saveGymConfig(gymForm);
    await logAction(user.nom_utilisateur, 'Paramètres gym', 'Configuration enregistrée');
    onConfigUpdated(updated);
    onNotify('success', 'Paramètres du gym et palette enregistrés.');
  };

  const handleSelectPalette = async (paletteId: PaletteId) => {
    const next = { ...gymForm, palette_couleur: paletteId };
    setGymForm(next);
    const updated = await saveGymConfig({ palette_couleur: paletteId });
    onConfigUpdated(updated);
    onNotify('success', 'Palette de couleur appliquée.');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFile(file, 160, 0.8);
      setGymForm((prev) => ({ ...prev, logo: b64 }));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Image invalide.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setGymForm((prev) => ({ ...prev, logo: '' }));
    const updated = await saveGymConfig({ logo: '' });
    await logAction(user.nom_utilisateur, 'Paramètres gym', 'Logo du gym supprimé');
    onConfigUpdated(updated);
    onNotify('success', 'Logo supprimé.');
  };

  const handleSaveReglements = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await saveGymConfig({
      nom_gym: gymForm.nom_gym,
      adresse: gymForm.adresse,
      telephone: gymForm.telephone,
      email_gym: gymForm.email_gym,
      horaires_ouverture: gymForm.horaires_ouverture,
      reglements_titre: gymForm.reglements_titre,
      reglements_contenu: gymForm.reglements_contenu,
    });
    await logAction(user.nom_utilisateur, 'Règlements gym', 'Règlement intérieur mis à jour');
    onConfigUpdated(updated);
    onNotify('success', 'Règlements du gym enregistrés avec l’en-tête de l’entreprise.');
  };

  const copyTextFallback = async (text: string) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  const handleCopyReglements = async () => {
    const text = buildRegulationsShareText(
      gymForm,
      gymForm.reglements_titre,
      gymForm.reglements_contenu
    );
    try {
      await copyTextFallback(text);
      onNotify('success', 'Règlements copiés avec l’en-tête de l’entreprise.');
    } catch {
      onNotify('error', 'Impossible de copier automatiquement le texte.');
    }
  };

  const handleShareReglements = async () => {
    const text = buildRegulationsShareText(
      gymForm,
      gymForm.reglements_titre,
      gymForm.reglements_contenu
    );
    const title = `${gymForm.nom_gym} — ${gymForm.reglements_titre || 'Règlement Intérieur'}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        onNotify('success', 'Règlements partagés.');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    try {
      await copyTextFallback(text);
      onNotify(
        'info',
        'Texte complet copié dans le presse-papiers pour partage (WhatsApp, SMS ou e-mail).'
      );
    } catch {
      onNotify('error', 'Partage indisponible sur ce navigateur.');
    }
  };

  const handleAddRuleLine = () => {
    const existingLines = String(gymForm.reglements_contenu || '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
    const nextIndex = existingLines.length + 1;
    const prefix = gymForm.reglements_contenu.trim() ? `${gymForm.reglements_contenu.trimEnd()}\n` : '';
    setGymForm((prev) => ({
      ...prev,
      reglements_contenu: `${prefix}${nextIndex}. Nouvel article : Précisez ici la consigne à respecter.`,
    }));
  };

  const handleSaveForfait = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forfaitForm.nom?.trim()) return;
    await saveRecord<Forfait>('Forfaits', {
      ...forfaitForm,
      id: editForfaitId || undefined,
      duree_jours: Number(forfaitForm.duree_jours || 30),
      prix: Number(forfaitForm.prix || 0),
      nb_seances_max:
        forfaitForm.nb_seances_max === '' || forfaitForm.nb_seances_max === undefined
          ? ''
          : Number(forfaitForm.nb_seances_max),
      actif: forfaitForm.actif === 0 ? 0 : 1,
    });
    setForfaitModal(false);
    await loadAll();
    onNotify('success', 'Forfait enregistré.');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.nom_utilisateur.trim() || newUser.password.length < 6) {
      onNotify('error', 'Nom requis et mot de passe de 6 caractères minimum.');
      return;
    }
    if (
      users.some(
        (u) => u.nom_utilisateur.toLowerCase() === newUser.nom_utilisateur.trim().toLowerCase()
      )
    ) {
      onNotify('error', 'Ce nom d’utilisateur existe déjà.');
      return;
    }
    const hash = await hashPassword(newUser.password);
    await saveRecord<Utilisateur>('Utilisateurs', {
      nom_utilisateur: newUser.nom_utilisateur.trim(),
      mot_de_passe_hash: hash,
      role: newUser.role,
      actif: 1,
    });
    await logAction(
      user.nom_utilisateur,
      'Création utilisateur',
      `${newUser.nom_utilisateur} (${newUser.role})`
    );
    setUserModal(false);
    setNewUser({ nom_utilisateur: '', password: '', role: 'caissier' });
    await loadAll();
    onNotify('success', 'Utilisateur créé.');
  };

  const openPasswordModal = (target: Utilisateur) => {
    setPasswordTargetUser(target);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setShowPassFields(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUser) return;

    const isSelf = passwordTargetUser.id === user.id;
    if (isSelf) {
      if (!passwordForm.currentPassword) {
        onNotify('error', 'Veuillez saisir votre mot de passe actuel.');
        return;
      }
      const validCurrent = await verifyPassword(
        passwordForm.currentPassword,
        passwordTargetUser.mot_de_passe_hash
      );
      if (!validCurrent) {
        onNotify('error', 'Le mot de passe actuel est incorrect.');
        return;
      }
    }

    if (passwordForm.newPassword.length < 6) {
      onNotify('error', 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      onNotify('error', 'La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSavingPassword(true);
    try {
      const newHash = await hashPassword(passwordForm.newPassword);
      await saveRecord<Utilisateur>('Utilisateurs', {
        ...passwordTargetUser,
        mot_de_passe_hash: newHash,
      });
      await logAction(
        user.nom_utilisateur,
        'Changement mot de passe',
        `Compte : ${passwordTargetUser.nom_utilisateur} (${passwordTargetUser.role})`
      );
      const targetName = passwordTargetUser.nom_utilisateur;
      setPasswordTargetUser(null);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await loadAll();
      onNotify(
        'success',
        `Mot de passe du compte « ${targetName} » modifié avec succès.`
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleTestSheets = async () => {
    setTestingConn(true);
    const cleanUrl = gymForm.apps_script_url.trim();
    const cleanKey = gymForm.apps_script_key.trim();
    const updated = await saveGymConfig({
      apps_script_url: cleanUrl,
      apps_script_key: cleanKey,
    });
    onConfigUpdated(updated);
    const res = await testGoogleSheetsConnection(cleanUrl, cleanKey);
    setSheetsDiag({ ok: res.ok, message: res.message });
    setTestingConn(false);
    onNotify(res.ok ? 'success' : 'error', res.message);
  };

  const handleGenerateSecretKey = async () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomPart = (len: number) => {
      const bytes = new Uint8Array(len);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < len; i += 1) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    };
    const generated = `GYMPRO-${randomPart(4)}-${randomPart(4)}-${randomPart(4)}`;
    setGymForm((prev) => ({ ...prev, apps_script_key: generated }));
    setShowScriptKey(true);
    const updated = await saveGymConfig({ apps_script_key: generated });
    onConfigUpdated(updated);
    onNotify('success', 'Nouvelle clé secrète générée et enregistrée.');
  };

  const getCustomizedCodeGs = async (): Promise<string> => {
    const res = await fetch('/apps-script/Code.gs');
    if (!res.ok) {
      throw new Error('Impossible de charger le modèle Code.gs local.');
    }
    let scriptText = await res.text();
    const cleanKey = gymForm.apps_script_key.trim();
    if (cleanKey) {
      const escapedKey = cleanKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      scriptText = scriptText.replace(
        "const DEFAULT_SECRET_KEY = 'GYMPRO-CLE-SECRETE-A-CHANGER';",
        `const DEFAULT_SECRET_KEY = '${escapedKey}';`
      );
    }
    return scriptText;
  };

  const handleCopyCodeGs = async () => {
    setCopyingScript(true);
    try {
      const scriptText = await getCustomizedCodeGs();
      await copyTextFallback(scriptText);
      onNotify(
        'success',
        gymForm.apps_script_key.trim()
          ? 'Code.gs copié avec votre clé secrète intégrée.'
          : 'Code.gs copié dans le presse-papiers.'
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Impossible de copier Code.gs.'
      );
    } finally {
      setCopyingScript(false);
    }
  };

  const handleDownloadCodeGs = async () => {
    try {
      const scriptText = await getCustomizedCodeGs();
      const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Code.gs';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(
        'success',
        gymForm.apps_script_key.trim()
          ? 'Code.gs téléchargé avec votre clé secrète intégrée.'
          : 'Code.gs téléchargé.'
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Impossible de télécharger Code.gs.'
      );
    }
  };

  const handleInitialPushAll = async () => {
    const cleanUrl = gymForm.apps_script_url.trim();
    const cleanKey = gymForm.apps_script_key.trim();
    if (!cleanUrl || !cleanKey) {
      onNotify('error', 'Renseignez d’abord l’URL /exec et la clé secrète.');
      return;
    }
    setPushingAll(true);
    try {
      const updated = await saveGymConfig({
        apps_script_url: cleanUrl,
        apps_script_key: cleanKey,
      });
      onConfigUpdated(updated);
      const added = await enqueueAllForSync();
      await loadAll();
      await onSyncNow();
      await loadAll();
      if (added > 0) {
        onNotify('info', `${added} enregistrement(s) ajouté(s) à l’envoi initial.`);
      }
    } finally {
      setPushingAll(false);
    }
  };

  const handlePullSheets = async () => {
    setPulling(true);
    const updated = await saveGymConfig({
      apps_script_url: gymForm.apps_script_url.trim(),
      apps_script_key: gymForm.apps_script_key.trim(),
    });
    onConfigUpdated(updated);
    const res = await pullFromGoogleSheets();
    setPulling(false);
    await loadAll();
    onNotify(res.ok ? 'success' : 'error', res.message);
  };

  const handleExportJSON = async () => {
    const json = await exportAllJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gympro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('success', 'Sauvegarde JSON téléchargée.');
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setConfirmState({
        title: 'Confirmer la restauration JSON',
        message: `Voulez-vous importer le fichier "${file.name}" dans votre base locale IndexedDB ? Les enregistrements ayant le même identifiant seront mis à jour.`,
        confirmLabel: 'Importer les données',
        danger: false,
        action: async () => {
          const count = await importAllJSON(text);
          const updated = await saveGymConfig({});
          onConfigUpdated(updated);
          await loadAll();
          onNotify('success', `${count} enregistrement(s) restauré(s) depuis la sauvegarde.`);
        },
      });
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Fichier JSON invalide.');
    }
    e.target.value = '';
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      await loadDemoData(user.nom_utilisateur);
      const updated = await saveGymConfig({});
      onConfigUpdated(updated);
      await loadAll();
      onNotify('success', 'Données de démonstration haïtiennes chargées en local.');
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleSaveAutoBackupSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Math.max(0, Math.min(24, Number(gymForm.auto_backup_hours) || 0));
    const minutes = Math.max(0, Math.min(59, Number(gymForm.auto_backup_minutes) || 0));
    if (gymForm.auto_backup_mode === 'interval' && hours * 60 + minutes < 1) {
      onNotify('error', 'Définissez au moins 1 minute pour l’intervalle de sauvegarde.');
      return;
    }

    const nowIso = new Date().toISOString();
    if (gymForm.auto_backup_enabled === 1 && typeof localStorage !== 'undefined') {
      localStorage.setItem('gympro_auto_backup_anchor', nowIso);
    }

    const updated = await saveGymConfig({
      auto_backup_enabled: gymForm.auto_backup_enabled,
      auto_backup_mode: gymForm.auto_backup_mode,
      auto_backup_hours: hours,
      auto_backup_minutes: minutes,
      auto_backup_time: gymForm.auto_backup_time || '20:00',
      auto_backup_download_json: gymForm.auto_backup_download_json,
      auto_backup_sync_sheets: gymForm.auto_backup_sync_sheets,
      auto_backup_keep_count: Math.max(1, Math.min(50, Number(gymForm.auto_backup_keep_count) || 10)),
    });

    const summary =
      updated.auto_backup_enabled === 1
        ? updated.auto_backup_mode === 'daily_time'
          ? `Quotidienne à ${updated.auto_backup_time}`
          : `Toutes les ${updated.auto_backup_hours} h ${String(updated.auto_backup_minutes).padStart(2, '0')} min`
        : 'Désactivée';

    await logAction(user.nom_utilisateur, 'Sauvegarde automatique', summary);
    onConfigUpdated(updated);
    onNotify('success', `Planification enregistrée (${summary}).`);
  };

  const handleBackupNowSnapshot = async () => {
    setRunningBackupNow(true);
    try {
      const snapshot = await createAutoBackupSnapshot(
        'manual',
        gymForm.auto_backup_keep_count || 10
      );
      if (gymForm.auto_backup_download_json === 1) {
        const stamp = snapshot.created_at.slice(0, 16).replace('T', '_').replace(':', '-');
        triggerJsonFileDownload(`gympro-sauvegarde-${stamp}.json`, snapshot.json);
      }
      if (
        gymForm.auto_backup_sync_sheets === 1 &&
        navigator.onLine &&
        gymForm.apps_script_url.trim() &&
        gymForm.apps_script_key.trim()
      ) {
        await onSyncNow();
      }
      const updated = await saveGymConfig({});
      onConfigUpdated(updated);
      await loadAll();
      onNotify(
        'success',
        `Instantané local créé (${snapshot.record_count} enregistrements, ${formatBytesFR(snapshot.size_bytes)}).`
      );
    } finally {
      setRunningBackupNow(false);
    }
  };

  const handleRestoreSnapshot = async (snap: AutoBackupSnapshot) => {
    const count = await importAllJSON(snap.json);
    await logAction(
      user.nom_utilisateur,
      'Restauration instantané',
      `Instantané du ${formatDateTimeFR(snap.created_at)} (${count} lignes)`
    );
    const updated = await saveGymConfig({});
    onConfigUpdated(updated);
    await loadAll();
    onNotify('success', `${count} enregistrement(s) restauré(s) depuis l’instantané.`);
  };

  const nextAutoBackupDate = computeNextAutoBackupDate(gymForm);
  const [timeHour = '20', timeMinute = '00'] = (gymForm.auto_backup_time || '20:00').split(':');

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Paramètres & Synchronisation
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Frais d’inscription, palettes de couleur, forfaits, rôles, Google Sheets et sauvegardes
        </p>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] self-start inline-flex">
        {(
          [
            ['gym', 'Gym, Frais & Couleurs'],
            ['reglements', 'Règlements du gym'],
            ['forfaits', 'Forfaits'],
            ['users', 'Utilisateurs & Rôles'],
            ['sheets', `Google Sheets (${queue.length})`],
            ['sauvegarde', 'Sauvegarde & Démo'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            title={`Afficher la section ${label}`}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === k
                ? 'bg-white dark:bg-[#232836] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Onglet 1 : Infos Gym, Frais d'inscription & Palette de couleurs */}
      {tab === 'gym' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveGym}
            className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-5"
          >
            <div className="flex flex-wrap items-center gap-4">
              {gymForm.logo ? (
                <img
                  src={gymForm.logo}
                  alt="Logo"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-orange-500/15 text-orange-500 flex items-center justify-center">
                  <MaterialIcon name="fitness_center" className="w-7 h-7" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  title="Importer le logo de votre salle de sport"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <MaterialIcon name="upload" className="w-4 h-4" />
                  Changer le logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {gymForm.logo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    title="Supprimer définitivement le logo du gym"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <MaterialIcon name="delete" className="w-4 h-4" />
                    Supprimer le logo
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nom du gym</label>
                <input
                  type="text"
                  required
                  value={gymForm.nom_gym}
                  onChange={(e) => setGymForm({ ...gymForm, nom_gym: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={gymForm.telephone}
                  onChange={(e) => setGymForm({ ...gymForm, telephone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Adresse</label>
                <input
                  type="text"
                  value={gymForm.adresse}
                  onChange={(e) => setGymForm({ ...gymForm, adresse: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  E-mail du gym
                </label>
                <input
                  type="email"
                  value={gymForm.email_gym}
                  onChange={(e) => setGymForm({ ...gymForm, email_gym: e.target.value })}
                  placeholder="contact@votre-gym.ht"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Horaires d’ouverture
                </label>
                <input
                  type="text"
                  value={gymForm.horaires_ouverture}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, horaires_ouverture: e.target.value })
                  }
                  placeholder="Lun–Sam : 06h00 – 21h00"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Devise par défaut
                </label>
                <select
                  value={gymForm.devise_defaut}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, devise_defaut: e.target.value as Devise })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                >
                  <option value="HTG">HTG — Gourde haïtienne</option>
                  <option value="USD">USD — Dollar américain</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Taux de change (1 USD = X HTG)
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={gymForm.taux_change}
                  onChange={(e) => setGymForm({ ...gymForm, taux_change: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Frais d’inscription ({gymForm.devise_defaut})
                </label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  value={gymForm.frais_inscription}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, frais_inscription: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Tarif coaching par défaut ({gymForm.devise_defaut})
                </label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  value={gymForm.tarif_coach_defaut}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, tarif_coach_defaut: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Alerte expiration (jours avant)
                </label>
                <input
                  type="number"
                  min={1}
                  value={gymForm.alerte_expiration_jours}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, alerte_expiration_jours: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Déconnexion auto (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  value={gymForm.auto_logout_minutes}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, auto_logout_minutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Message affiché en bas des reçus
                </label>
                <input
                  type="text"
                  value={gymForm.message_recu}
                  onChange={(e) => setGymForm({ ...gymForm, message_recu: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              title="Enregistrer les informations générales du gym"
              className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              Enregistrer les paramètres
            </button>
          </form>

          {/* Configuration Palette de couleurs & Polices */}
          <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-5 h-fit">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Palette de couleurs de l’interface
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Personnalisez la couleur d’accentuation de GymPro selon l’identité de votre salle.
              </p>
            </div>

            <div className="space-y-2.5">
              {COLOR_PALETTES.map((pal) => {
                const selected = gymForm.palette_couleur === pal.id;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => handleSelectPalette(pal.id)}
                    title={`Activer la palette ${pal.label}`}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-colors ${
                      selected
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-slate-200 dark:border-[#262b38] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-lg shrink-0 border border-white/20"
                        style={{ backgroundColor: pal.swatch }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {pal.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {pal.description}
                        </p>
                      </div>
                    </div>
                    {selected && (
                      <MaterialIcon name="check_circle" className="w-5 h-5 text-orange-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-[#262b38] text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Polices embarquées localement (100 % hors ligne) :
              </p>
              <p>
                <span className="font-brand font-bold">Montserrat</span> (Hero & Marque) ·{' '}
                <span className="font-display font-semibold">Poppins</span> (Titres) ·{' '}
                <span>Inter</span> (Texte)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Onglet 2 : Règlements du gym (Définition, En-tête entreprise, Impression & Partage) */}
      {tab === 'reglements' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Éditeur et actions de partage / impression */}
          <form
            onSubmit={handleSaveReglements}
            className="xl:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-4 h-fit"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <MaterialIcon name="description" className="w-5 h-5 text-orange-500" />
                  Règlements intérieurs du gym
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Définissez les règles officielles de votre salle, imprimez-les en A4 ou partagez-les avec vos membres.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Titre du document officiel
              </label>
              <input
                type="text"
                required
                value={gymForm.reglements_titre}
                onChange={(e) => setGymForm({ ...gymForm, reglements_titre: e.target.value })}
                placeholder="ex. Règlement Intérieur & Charte des Membres"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
              <div className="sm:col-span-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Informations affichées dans l’en-tête
                </span>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Nom de l’entreprise</label>
                <input
                  type="text"
                  value={gymForm.nom_gym}
                  onChange={(e) => setGymForm({ ...gymForm, nom_gym: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={gymForm.telephone}
                  onChange={(e) => setGymForm({ ...gymForm, telephone: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">E-mail</label>
                <input
                  type="email"
                  value={gymForm.email_gym}
                  onChange={(e) => setGymForm({ ...gymForm, email_gym: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Horaires</label>
                <input
                  type="text"
                  value={gymForm.horaires_ouverture}
                  onChange={(e) =>
                    setGymForm({ ...gymForm, horaires_ouverture: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Adresse complète</label>
                <input
                  type="text"
                  value={gymForm.adresse}
                  onChange={(e) => setGymForm({ ...gymForm, adresse: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-500">
                  Articles du règlement (1 ligne par article)
                </label>
                <button
                  type="button"
                  onClick={handleAddRuleLine}
                  title="Ajouter une nouvelle ligne d’article à la fin"
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <MaterialIcon name="add" className="w-3.5 h-3.5" />
                  Ajouter un article
                </button>
              </div>
              <textarea
                rows={11}
                required
                value={gymForm.reglements_contenu}
                onChange={(e) =>
                  setGymForm({ ...gymForm, reglements_contenu: e.target.value })
                }
                placeholder="1. Accès et identification : Présentez votre carte à l’entrée..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-xs sm:text-sm leading-relaxed"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Astuce : écrivez <span className="font-mono-num">Titre : Détail</span> pour mettre le titre en gras, ou commencez une ligne par <span className="font-mono-num">#</span> pour un sous-titre de section.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                title="Enregistrer les règlements et l’en-tête en local (et synchronisation)"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                <MaterialIcon name="save" className="w-4 h-4" />
                Enregistrer
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                title="Imprimer le règlement officiel en format A4 avec l’en-tête du gym"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                <MaterialIcon name="print" className="w-4 h-4" />
                Imprimer (A4)
              </button>

              <button
                type="button"
                onClick={handleShareReglements}
                title="Partager les règlements (application de partage ou copie rapide)"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <MaterialIcon name="share" className="w-4 h-4" />
                Partager
              </button>

              <button
                type="button"
                onClick={handleCopyReglements}
                title="Copier le texte complet avec en-tête dans le presse-papiers"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="content_copy" className="w-4 h-4" />
                Copier
              </button>

              <button
                type="button"
                onClick={async () => {
                  await downloadRegulationsPNG(
                    gymForm,
                    gymForm.reglements_titre,
                    gymForm.reglements_contenu
                  );
                  onNotify('success', 'Affiche PNG des règlements téléchargée.');
                }}
                title="Télécharger les règlements en affiche image PNG haute résolution (100 % hors ligne)"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="download" className="w-4 h-4" />
                Affiche PNG
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadRegulationsTXT(
                    gymForm,
                    gymForm.reglements_titre,
                    gymForm.reglements_contenu
                  );
                  onNotify('success', 'Fichier texte des règlements téléchargé.');
                }}
                title="Télécharger le document au format texte (.txt)"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="description" className="w-4 h-4" />
                Fichier .TXT
              </button>

              <button
                type="button"
                onClick={() =>
                  setConfirmState({
                    title: 'Restaurer le modèle standard ?',
                    message:
                      'Les articles actuels seront remplacés par le modèle standard de règlement intérieur dans l’éditeur.',
                    confirmLabel: 'Restaurer le modèle',
                    danger: false,
                    action: async () => {
                      setGymForm((prev) => ({
                        ...prev,
                        reglements_titre: DEFAULT_REGLEMENTS_TITRE,
                        reglements_contenu: DEFAULT_REGLEMENTS_CONTENU,
                      }));
                      onNotify('info', 'Modèle standard restauré dans l’éditeur (pensez à enregistrer).');
                    },
                  })
                }
                title="Réinitialiser les règlements avec le modèle standard du gym"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="refresh" className="w-4 h-4" />
                Modèle standard
              </button>
            </div>
          </form>

          {/* Aperçu officiel en direct + Portail d'impression A4 */}
          <div className="xl:col-span-7 space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Aperçu officiel (En-tête entreprise + Règlements)
              </p>
              <span className="text-[11px] text-slate-500">Prêt pour impression A4 ou affichage</span>
            </div>
            <RegulationsDocument
              config={gymForm}
              titre={gymForm.reglements_titre}
              contenu={gymForm.reglements_contenu}
            />
          </div>

          <PrintPortal active={tab === 'reglements'}>
            <RegulationsDocument
              config={gymForm}
              titre={gymForm.reglements_titre}
              contenu={gymForm.reglements_contenu}
            />
          </PrintPortal>
        </div>
      )}

      {/* Onglet 3 : Forfaits */}
      {tab === 'forfaits' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display font-semibold text-base">Forfaits d’abonnement</h2>
            <button
              type="button"
              onClick={() => {
                setEditForfaitId(null);
                setForfaitForm({
                  nom: '',
                  duree_jours: 30,
                  prix: 3500,
                  devise: config.devise_defaut,
                  nb_seances_max: '',
                  actif: 1,
                });
                setForfaitModal(true);
              }}
              title="Créer un nouveau forfait d’abonnement"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold"
            >
              <MaterialIcon name="add" className="w-4 h-4" />
              Nouveau forfait
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {forfaits.map((f) => (
              <div
                key={f.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] flex justify-between items-start"
              >
                <div>
                  <h3 className="font-semibold text-base">{f.nom}</h3>
                  <p className="font-mono-num text-lg font-bold text-orange-600 dark:text-orange-400 mt-1">
                    {formatMoney(f.prix, f.devise)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {f.duree_jours} jour(s) ·{' '}
                    {f.nb_seances_max ? `${f.nb_seances_max} séances` : 'Illimité'} ·{' '}
                    {f.actif === 1 ? 'Actif' : 'Inactif'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditForfaitId(f.id);
                      setForfaitForm(f);
                      setForfaitModal(true);
                    }}
                    title="Modifier ce forfait"
                    className="p-1.5 text-slate-500 hover:text-orange-500"
                  >
                    <MaterialIcon name="edit" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: 'Supprimer ce forfait ?',
                        message: `Voulez-vous supprimer le forfait "${f.nom}" ? Les abonnements existants ne seront pas effacés.`,
                        confirmLabel: 'Supprimer le forfait',
                        danger: true,
                        action: async () => {
                          await softDeleteRecord('Forfaits', f.id);
                          await loadAll();
                          onNotify('info', `Forfait "${f.nom}" supprimé.`);
                        },
                      })
                    }
                    title="Supprimer ce forfait (confirmation requise)"
                    className="p-1.5 text-slate-500 hover:text-red-500"
                  >
                    <MaterialIcon name="delete" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Onglet 3 : Utilisateurs & Rôles */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="font-display font-semibold text-base">
                Comptes d’accès (hachage SHA-256 + sel)
              </h2>
              <p className="text-xs text-slate-500">
                Gérez les accès administrateur, réception et coach, et modifiez votre mot de passe admin à tout moment.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const adminAccount =
                  users.find((u) => u.id === user.id) ||
                  users.find((u) => u.role === 'admin');
                if (!adminAccount) return null;
                return (
                  <button
                    type="button"
                    onClick={() => openPasswordModal(adminAccount)}
                    title="Modifier le mot de passe du compte administrateur"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151821] text-xs font-semibold hover:border-orange-500"
                  >
                    <MaterialIcon name="lock" className="w-4 h-4 text-orange-500" />
                    Modifier mot de passe admin
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setUserModal(true)}
                title="Créer un compte caissier, coach ou admin"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold"
              >
                <MaterialIcon name="person_add" className="w-4 h-4" />
                Ajouter un utilisateur
              </button>
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                  <th className="py-3 px-4">Utilisateur</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4 font-semibold">
                      {u.nom_utilisateur}
                      {u.id === user.id && (
                        <span className="ml-2 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[10px] font-semibold">
                          Vous
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 capitalize text-xs">{u.role}</td>
                    <td className="py-3 px-4 text-xs">
                      {u.actif === 1 ? 'Actif' : 'Désactivé'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openPasswordModal(u)}
                          title={`Modifier le mot de passe de ${u.nom_utilisateur}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400"
                        >
                          <MaterialIcon name="lock" className="w-3.5 h-3.5" />
                          Mot de passe
                        </button>
                        {u.id !== user.id && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                title:
                                  u.actif === 1
                                    ? 'Désactiver cet utilisateur ?'
                                    : 'Réactiver cet utilisateur ?',
                                message: `Confirmez-vous la ${
                                  u.actif === 1 ? 'désactivation' : 'réactivation'
                                } du compte "${u.nom_utilisateur}" ?`,
                                confirmLabel: u.actif === 1 ? 'Désactiver' : 'Activer',
                                danger: u.actif === 1,
                                action: async () => {
                                  await saveRecord<Utilisateur>('Utilisateurs', {
                                    ...u,
                                    actif: u.actif === 1 ? 0 : 1,
                                  });
                                  await loadAll();
                                  onNotify('info', 'Statut du compte mis à jour.');
                                },
                              })
                            }
                            title={
                              u.actif === 1
                                ? 'Désactiver ce compte utilisateur'
                                : 'Réactiver ce compte utilisateur'
                            }
                            className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            {u.actif === 1 ? 'Désactiver' : 'Activer'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet 4 : Google Sheets & File de Synchro */}
      {tab === 'sheets' && (
        <div className="space-y-6">
          {/* Guide rapide en 4 étapes */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-display font-semibold text-base">
                  Assistant de configuration Google Sheets (16 feuilles)
                </h2>
                <p className="text-xs text-slate-500">
                  Suivez ces 4 étapes une seule fois pour activer la synchronisation bidirectionnelle hors ligne.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyCodeGs}
                  disabled={copyingScript}
                  title="Copier le script Code.gs avec votre clé secrète pré-remplie"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold hover:opacity-90"
                >
                  <MaterialIcon name="content_copy" className="w-4 h-4" />
                  {copyingScript ? 'Copie...' : 'Copier Code.gs'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodeGs}
                  title="Télécharger le script Google Apps Script prêt à coller avec votre clé"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#1b1f2b]"
                >
                  <MaterialIcon name="download" className="w-4 h-4" />
                  Télécharger Code.gs
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold">
                  Étape 1
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  Créer le classeur
                </p>
                <p className="text-slate-500 leading-relaxed">
                  Ouvrez Google Sheets et créez un nouveau classeur vide (ex. <strong>GymPro Données</strong>). Les 16 onglets seront créés automatiquement.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold">
                  Étape 2
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  Coller Code.gs
                </p>
                <p className="text-slate-500 leading-relaxed">
                  Générez une clé secrète ci-dessous, cliquez sur <strong>Copier Code.gs</strong>, puis dans Sheets ouvrez <strong>Extensions &gt; Apps Script</strong> et collez le script.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold">
                  Étape 3
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  Déployer en Web App
                </p>
                <p className="text-slate-500 leading-relaxed">
                  Dans Apps Script : <strong>Déployer &gt; Nouveau déploiement &gt; Application Web</strong>. Exécuter en tant que <strong>Moi</strong>, Qui a accès : <strong>Tout le monde</strong>.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] space-y-1">
                <span className="inline-block px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold">
                  Étape 4
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  Connecter & Initialiser
                </p>
                <p className="text-slate-500 leading-relaxed">
                  Collez l’URL <strong>/exec</strong> ci-dessous, cliquez sur <strong>Tester &amp; Enregistrer</strong>, puis sur <strong>Tout envoyer vers Sheets</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-4">
              <h2 className="font-display font-semibold text-base">
                Identifiants Web App Apps Script
              </h2>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  URL du Web App Apps Script (se termine obligatoirement par /exec)
                </label>
                <input
                  type="url"
                  value={gymForm.apps_script_url}
                  onChange={(e) => {
                    setGymForm({ ...gymForm, apps_script_url: e.target.value });
                    setSheetsDiag(null);
                  }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                />
                {/\/dev(\?|$)/i.test(gymForm.apps_script_url.trim()) && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <MaterialIcon name="warning" className="w-4 h-4" />
                    Attention : cette URL se termine par /dev (lien de test). Utilisez l’URL finale en /exec obtenue après « Déployer ».
                  </p>
                )}
                {/^https:\/\/script\.google\.com\//i.test(gymForm.apps_script_url.trim()) &&
                  !/\/dev(\?|$)/i.test(gymForm.apps_script_url.trim()) &&
                  !/\/exec(\?|$)/i.test(gymForm.apps_script_url.trim()) && (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <MaterialIcon name="warning" className="w-4 h-4" />
                      L’URL semble incomplète : vérifiez qu’elle se termine bien par <strong>/exec</strong>.
                    </p>
                  )}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-slate-500">
                    Clé secrète (identique à DEFAULT_SECRET_KEY dans Code.gs)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSecretKey}
                    title="Générer automatiquement une clé secrète unique et sécurisée"
                    className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    + Générer une clé
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type={showScriptKey ? 'text' : 'password'}
                    value={gymForm.apps_script_key}
                    onChange={(e) => {
                      setGymForm({ ...gymForm, apps_script_key: e.target.value });
                      setSheetsDiag(null);
                    }}
                    placeholder="GYMPRO-XXXX-XXXX-XXXX"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={() => setShowScriptKey((v) => !v)}
                    title={showScriptKey ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1b1f2b]"
                  >
                    {showScriptKey ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
              </div>

              {sheetsDiag && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    sheetsDiag.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MaterialIcon
                      name={sheetsDiag.ok ? 'check_circle' : 'warning'}
                      className="w-4 h-4 mt-0.5"
                    />
                    <span>{sheetsDiag.message}</span>
                  </div>
                  {!sheetsDiag.ok && (
                    <ul className="list-disc pl-6 space-y-0.5 text-[11px] opacity-90">
                      <li>
                        Dans Apps Script : <strong>Déployer &gt; Gérer les déploiements &gt; Modifier</strong> → vérifiez que <strong>Qui a accès</strong> est réglé sur <strong>Tout le monde</strong> (Anyone).
                      </li>
                      <li>
                        Si vous avez modifié <code>Code.gs</code> ou la clé secrète, choisissez <strong>Nouvelle version</strong> lors du déploiement et cliquez sur <strong>Enregistrer / Déployer</strong>.
                      </li>
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestSheets}
                  disabled={testingConn}
                  title="Enregistrer les identifiants et tester la connexion Google Sheets"
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#1b1f2b]"
                >
                  {testingConn ? 'Test en cours...' : 'Tester & Enregistrer'}
                </button>
                <button
                  type="button"
                  onClick={onSyncNow}
                  title="Envoyer la file d’attente vers Google Sheets"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700"
                >
                  <MaterialIcon name="cloud_sync" className="w-4 h-4" />
                  Synchroniser maintenant ({queue.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      title: 'Envoyer toute la base locale vers Google Sheets ?',
                      message:
                        'Idéal lors de la première connexion : toutes vos fiches existantes (membres, forfaits, paiements, coachs, etc.) seront ajoutées à la file d’envoi puis poussées vers Google Sheets.',
                      confirmLabel: 'Tout envoyer maintenant',
                      danger: false,
                      action: handleInitialPushAll,
                    })
                  }
                  disabled={pushingAll}
                  title="Envoyer toutes les données locales existantes vers un Google Sheet neuf ou vide"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  <MaterialIcon name="upload" className="w-4 h-4" />
                  {pushingAll ? 'Envoi initial...' : 'Tout envoyer vers Sheets (Initial)'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      title: 'Importer depuis Google Sheets ?',
                      message:
                        'Cette action télécharge les feuilles Google Sheets et fusionne les modifications plus récentes (updated_at) dans votre base locale.',
                      confirmLabel: 'Lancer l’import',
                      danger: false,
                      action: handlePullSheets,
                    })
                  }
                  disabled={pulling}
                  title="Télécharger et fusionner les données depuis Google Sheets"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  <MaterialIcon name="download" className="w-4 h-4" />
                  {pulling ? 'Import...' : 'Importer depuis Google Sheets'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm">
                  File de synchronisation ({queue.length})
                </h3>
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: 'Vider la file de synchronisation ?',
                        message: `Attention : ${queue.length} modification(s) locale(s) en attente ne seront plus envoyées automatiquement vers Google Sheets.`,
                        confirmLabel: 'Vider la file',
                        danger: true,
                        action: async () => {
                          await clearSyncQueue();
                          await loadAll();
                          onNotify('info', 'File de synchronisation vidée.');
                        },
                      })
                    }
                    title="Supprimer toutes les opérations en attente d’envoi"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Vider la file
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-[#262b38] text-xs">
                {queue.length === 0 ? (
                  <p className="text-slate-500 py-8 text-center">
                    Aucune opération en attente. Tout est synchronisé.
                  </p>
                ) : (
                  queue.map((item) => (
                    <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{item.table}</span> · {item.action}
                        {item.erreur && <p className="text-red-500">{item.erreur}</p>}
                      </div>
                      <span className="font-mono-num text-slate-500">
                        {formatDateTimeFR(item.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglet 5 : Sauvegarde Automatique, JSON, Données Démo & Journal */}
      {tab === 'sauvegarde' && (
        <div className="space-y-6">
          {/* Module Sauvegarde Automatique par (Heure, Minute) */}
          <form
            onSubmit={handleSaveAutoBackupSchedule}
            className="p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <MaterialIcon name="schedule" className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-base">
                    Sauvegarde automatique (Heures &amp; Minutes)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Protégez automatiquement vos 16 tables en local (IndexedDB) selon une fréquence en heures/minutes ou à une heure fixe chaque jour.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setGymForm((prev) => ({
                    ...prev,
                    auto_backup_enabled: prev.auto_backup_enabled === 1 ? 0 : 1,
                  }))
                }
                title={
                  gymForm.auto_backup_enabled === 1
                    ? 'Désactiver la sauvegarde automatique'
                    : 'Activer la sauvegarde automatique'
                }
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  gymForm.auto_backup_enabled === 1
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-[#0d0f14] border-slate-300 dark:border-[#262b38] text-slate-600 dark:text-slate-300'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    gymForm.auto_backup_enabled === 1 ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                {gymForm.auto_backup_enabled === 1
                  ? 'Sauvegarde auto : ACTIVE'
                  : 'Sauvegarde auto : DÉSACTIVÉE'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Colonne gauche : Fréquence Heure / Minute */}
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">
                    Mode de planification
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setGymForm((prev) => ({
                          ...prev,
                          auto_backup_mode: 'interval' as AutoBackupMode,
                        }))
                      }
                      title="Sauvegarder automatiquement toutes les X heures et Y minutes"
                      className={`p-3 rounded-xl border text-left transition-all ${
                        gymForm.auto_backup_mode === 'interval'
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-slate-200 dark:border-[#262b38] bg-slate-50 dark:bg-[#0d0f14]'
                      }`}
                    >
                      <p className="text-xs font-semibold">Intervalle (Heures + Minutes)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Ex. toutes les 0 h 30 min ou 2 h 00 min
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setGymForm((prev) => ({
                          ...prev,
                          auto_backup_mode: 'daily_time' as AutoBackupMode,
                        }))
                      }
                      title="Sauvegarder automatiquement chaque jour à une heure et minute précises"
                      className={`p-3 rounded-xl border text-left transition-all ${
                        gymForm.auto_backup_mode === 'daily_time'
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-slate-200 dark:border-[#262b38] bg-slate-50 dark:bg-[#0d0f14]'
                      }`}
                    >
                      <p className="text-xs font-semibold">Heure fixe quotidienne (HH:MM)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Ex. tous les jours à 20 h 30
                      </p>
                    </button>
                  </div>
                </div>

                {gymForm.auto_backup_mode === 'interval' ? (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Heures (0 – 24)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          value={gymForm.auto_backup_hours}
                          onChange={(e) =>
                            setGymForm((prev) => ({
                              ...prev,
                              auto_backup_hours: Math.max(
                                0,
                                Math.min(24, Number(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Minutes (0 – 59)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={gymForm.auto_backup_minutes}
                          onChange={(e) =>
                            setGymForm((prev) => ({
                              ...prev,
                              auto_backup_minutes: Math.max(
                                0,
                                Math.min(59, Number(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 mr-1">Raccourcis :</span>
                      {[
                        { label: '15 min', h: 0, m: 15 },
                        { label: '30 min', h: 0, m: 30 },
                        { label: '1 h 00', h: 1, m: 0 },
                        { label: '2 h 00', h: 2, m: 0 },
                        { label: '6 h 00', h: 6, m: 0 },
                        { label: '12 h 00', h: 12, m: 0 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            setGymForm((prev) => ({
                              ...prev,
                              auto_backup_hours: preset.h,
                              auto_backup_minutes: preset.m,
                            }))
                          }
                          title={`Régler l’intervalle sur ${preset.label}`}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151821] text-[11px] font-medium hover:border-orange-500"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38]">
                    <label className="block text-xs font-medium text-slate-500 mb-2">
                      Heure et minute quotidiennes de sauvegarde
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Heure</label>
                        <select
                          value={timeHour.padStart(2, '0')}
                          onChange={(e) =>
                            setGymForm((prev) => ({
                              ...prev,
                              auto_backup_time: `${e.target.value}:${timeMinute.padStart(2, '0')}`,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                        >
                          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(
                            (hh) => (
                              <option key={hh} value={hh}>
                                {hh} h
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Minute</label>
                        <select
                          value={timeMinute.padStart(2, '0')}
                          onChange={(e) =>
                            setGymForm((prev) => ({
                              ...prev,
                              auto_backup_time: `${timeHour.padStart(2, '0')}:${e.target.value}`,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#151821] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
                        >
                          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(
                            (mm) => (
                              <option key={mm} value={mm}>
                                {mm} min
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Instantanés conservés en local
                    </label>
                    <select
                      value={gymForm.auto_backup_keep_count}
                      onChange={(e) =>
                        setGymForm((prev) => ({
                          ...prev,
                          auto_backup_keep_count: Number(e.target.value) || 10,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
                    >
                      <option value={5}>5 derniers instantanés</option>
                      <option value={10}>10 derniers instantanés</option>
                      <option value={20}>20 derniers instantanés</option>
                      <option value={30}>30 derniers instantanés</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-1 sm:pt-5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gymForm.auto_backup_download_json === 1}
                        onChange={(e) =>
                          setGymForm((prev) => ({
                            ...prev,
                            auto_backup_download_json: e.target.checked ? 1 : 0,
                          }))
                        }
                        className="rounded border-slate-300 text-orange-600"
                      />
                      <span>Télécharger aussi le fichier .json</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gymForm.auto_backup_sync_sheets === 1}
                        onChange={(e) =>
                          setGymForm((prev) => ({
                            ...prev,
                            auto_backup_sync_sheets: e.target.checked ? 1 : 0,
                          }))
                        }
                        className="rounded border-slate-300 text-orange-600"
                      />
                      <span>Synchroniser aussi vers Google Sheets (si en ligne)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Colonne droite : Statut en direct & Actions */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-200 dark:border-[#262b38] flex flex-col justify-between space-y-4">
                <div className="space-y-2.5 text-xs">
                  <p className="font-semibold text-sm">État de la planification</p>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200 dark:border-[#262b38]">
                    <span className="text-slate-500">Fréquence configurée</span>
                    <span className="font-semibold font-mono-num">
                      {gymForm.auto_backup_mode === 'daily_time'
                        ? `Chaque jour à ${gymForm.auto_backup_time || '20:00'}`
                        : `Toutes les ${gymForm.auto_backup_hours} h ${String(
                            gymForm.auto_backup_minutes
                          ).padStart(2, '0')} min`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200 dark:border-[#262b38]">
                    <span className="text-slate-500">Dernière sauvegarde</span>
                    <span className="font-mono-num">
                      {gymForm.auto_backup_last_at
                        ? formatDateTimeFR(gymForm.auto_backup_last_at)
                        : 'Aucune encore'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200 dark:border-[#262b38]">
                    <span className="text-slate-500">Prochaine sauvegarde</span>
                    <span className="font-mono-num font-semibold text-orange-600 dark:text-orange-400">
                      {gymForm.auto_backup_enabled === 1 && nextAutoBackupDate
                        ? formatDateTimeFR(nextAutoBackupDate.toISOString())
                        : 'Planification en pause'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Instantanés stockés</span>
                    <span className="font-mono-num font-semibold">{snapshots.length}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    title="Enregistrer les réglages de sauvegarde automatique"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700"
                  >
                    <MaterialIcon name="save" className="w-4 h-4" />
                    Enregistrer la planification
                  </button>
                  <button
                    type="button"
                    disabled={runningBackupNow}
                    onClick={handleBackupNowSnapshot}
                    title="Créer immédiatement un instantané complet de la base locale"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151821] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#1b1f2b]"
                  >
                    <MaterialIcon name="refresh" className="w-4 h-4" />
                    {runningBackupNow ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Actions manuelles JSON & Démo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-3">
              <h3 className="font-semibold text-sm">Exporter la base (JSON)</h3>
              <p className="text-xs text-slate-500">
                Téléchargez l’intégralité de vos 16 tables locales dans un fichier JSON de secours.
              </p>
              <button
                type="button"
                onClick={handleExportJSON}
                title="Télécharger une sauvegarde complète JSON"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold"
              >
                <MaterialIcon name="download" className="w-4 h-4" />
                Exporter (JSON)
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-3">
              <h3 className="font-semibold text-sm">Importer une sauvegarde (JSON)</h3>
              <p className="text-xs text-slate-500">
                Restaurez vos données depuis un export JSON sans connexion internet.
              </p>
              <label
                title="Choisir un fichier de sauvegarde JSON à restaurer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <MaterialIcon name="upload" className="w-4 h-4" />
                Importer (JSON)
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] space-y-3">
              <h3 className="font-semibold text-sm">Jeu de démonstration</h3>
              <p className="text-xs text-slate-500">
                Charge des membres, forfaits, paiements MonCash/NatCash, cours et mesures réalistes.
              </p>
              <button
                type="button"
                disabled={loadingDemo}
                onClick={() =>
                  setConfirmState({
                    title: 'Charger les données de démonstration ?',
                    message:
                      'Des membres, forfaits, paiements et cours d’exemple seront ajoutés à votre base locale.',
                    confirmLabel: 'Charger la démo',
                    danger: false,
                    action: handleLoadDemo,
                  })
                }
                title="Ajouter des données d’exemple réalistes pour tester l’application"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-500 text-orange-600 dark:text-orange-400 text-xs font-semibold"
              >
                <MaterialIcon name="refresh" className="w-4 h-4" />
                {loadingDemo ? 'Chargement...' : 'Charger des données de démo'}
              </button>
            </div>
          </div>

          {/* Historique des instantanés automatiques */}
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">
                  Historique des instantanés locaux ({snapshots.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Sauvegardes locales consultables, téléchargeables ou restaurables hors ligne.
                </p>
              </div>
              {snapshots.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      title: 'Vider l’historique des instantanés ?',
                      message:
                        'Tous les instantanés locaux conservés seront supprimés. Vos données actuelles en base ne seront pas modifiées.',
                      confirmLabel: 'Tout supprimer',
                      danger: true,
                      action: async () => {
                        await clearAutoBackupSnapshots();
                        await loadAll();
                        onNotify('info', 'Historique des instantanés vidé.');
                      },
                    })
                  }
                  title="Supprimer tous les instantanés locaux enregistrés"
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Vider l’historique
                </button>
              )}
            </div>

            {snapshots.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500 text-center">
                Aucun instantané enregistré pour le moment. Activez la sauvegarde automatique ou cliquez sur « Sauvegarder maintenant ».
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#262b38] text-xs">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-semibold">
                          {formatDateTimeFR(snap.created_at)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            snap.trigger === 'auto'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {snap.trigger === 'auto' ? 'Automatique' : 'Manuel'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono-num">
                        {snap.record_count} enregistrements · {formatBytesFR(snap.size_bytes)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const stamp = snap.created_at
                            .slice(0, 16)
                            .replace('T', '_')
                            .replace(':', '-');
                          triggerJsonFileDownload(`gympro-snapshot-${stamp}.json`, snap.json);
                          onNotify('success', 'Fichier JSON de l’instantané téléchargé.');
                        }}
                        title="Télécharger cet instantané au format JSON"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-[#1b1f2b]"
                      >
                        <MaterialIcon name="download" className="w-3.5 h-3.5" />
                        Télécharger
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: 'Restaurer cet instantané ?',
                            message: `Voulez-vous restaurer les ${snap.record_count} enregistrements de la sauvegarde du ${formatDateTimeFR(
                              snap.created_at
                            )} ?`,
                            confirmLabel: 'Restaurer',
                            danger: false,
                            action: () => handleRestoreSnapshot(snap),
                          })
                        }
                        title="Restaurer votre base locale à partir de cet instantané"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700"
                      >
                        <MaterialIcon name="refresh" className="w-3.5 h-3.5" />
                        Restaurer
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: 'Supprimer cet instantané ?',
                            message: `Supprimer la sauvegarde du ${formatDateTimeFR(
                              snap.created_at
                            )} de l’historique ?`,
                            confirmLabel: 'Supprimer',
                            danger: true,
                            action: async () => {
                              await deleteAutoBackupSnapshot(snap.id);
                              await loadAll();
                              onNotify('info', 'Instantané supprimé.');
                            },
                          })
                        }
                        title="Supprimer cet instantané de l’historique"
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-500/10"
                      >
                        <MaterialIcon name="delete" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Journal de traçabilité */}
          <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] font-semibold text-sm">
              Journal d’activité récent
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-[#262b38] text-xs">
              {journal.map((j) => (
                <div key={j.id} className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold">{j.utilisateur}</span> · {j.action} —{' '}
                    <span className="text-slate-500">{j.details}</span>
                  </div>
                  <span className="font-mono-num text-slate-500 shrink-0">
                    {formatDateTimeFR(j.date_heure)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fenêtre modale de confirmation pour actions sensibles */}
      <ConfirmModal
        open={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={async () => {
          if (confirmState) await confirmState.action();
        }}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel || 'Confirmer'}
        danger={confirmState?.danger ?? true}
      />

      {/* Modale Forfait */}
      <Modal
        open={forfaitModal}
        onClose={() => setForfaitModal(false)}
        title={editForfaitId ? 'Modifier le forfait' : 'Nouveau forfait'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveForfait} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nom du forfait *</label>
            <input
              type="text"
              required
              value={forfaitForm.nom || ''}
              onChange={(e) => setForfaitForm({ ...forfaitForm, nom: e.target.value })}
              placeholder="ex. Mensuel Standard"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Durée (jours)</label>
              <input
                type="number"
                min={1}
                required
                value={forfaitForm.duree_jours || 30}
                onChange={(e) =>
                  setForfaitForm({ ...forfaitForm, duree_jours: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Prix</label>
              <input
                type="number"
                min={0}
                required
                value={forfaitForm.prix || 0}
                onChange={(e) => setForfaitForm({ ...forfaitForm, prix: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Devise</label>
              <select
                value={forfaitForm.devise || 'HTG'}
                onChange={(e) =>
                  setForfaitForm({ ...forfaitForm, devise: e.target.value as Devise })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="HTG">HTG</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Séances max (vide = illimité)
              </label>
              <input
                type="number"
                min={1}
                value={forfaitForm.nb_seances_max ?? ''}
                onChange={(e) =>
                  setForfaitForm({
                    ...forfaitForm,
                    nb_seances_max: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForfaitModal(false)}
              title="Annuler"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer le forfait"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale Utilisateur */}
      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title="Nouvel utilisateur"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nom d’utilisateur *</label>
            <input
              type="text"
              required
              value={newUser.nom_utilisateur}
              onChange={(e) => setNewUser({ ...newUser, nom_utilisateur: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Mot de passe (min 6 caractères) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Rôle</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            >
              <option value="admin">Administrateur (Accès complet)</option>
              <option value="caissier">Réception / Caissier</option>
              <option value="coach">Coach (Cours, Mesures, Membres lecture)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUserModal(false)}
              title="Annuler"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Créer ce compte utilisateur"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Créer le compte
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale Modification Mot de Passe (Admin / Utilisateur) */}
      <Modal
        open={Boolean(passwordTargetUser)}
        onClose={() => setPasswordTargetUser(null)}
        title={`Modifier le mot de passe — ${passwordTargetUser?.nom_utilisateur || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordTargetUser?.id === user.id && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Mot de passe actuel *
              </label>
              <input
                type={showPassFields ? 'text' : 'password'}
                required
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                }
                placeholder="Saisissez le mot de passe actuel"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-slate-500">
                Nouveau mot de passe (min 6 caractères) *
              </label>
              <button
                type="button"
                onClick={() => setShowPassFields((v) => !v)}
                title={showPassFields ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
              >
                {showPassFields ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            <input
              type={showPassFields ? 'text' : 'password'}
              required
              minLength={6}
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              placeholder="Minimum 6 caractères"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Confirmer le nouveau mot de passe *
            </label>
            <input
              type={showPassFields ? 'text' : 'password'}
              required
              minLength={6}
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              placeholder="Répétez le nouveau mot de passe"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPasswordTargetUser(null)}
              title="Annuler la modification du mot de passe"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={savingPassword}
              title="Enregistrer le nouveau mot de passe haché SHA-256"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700"
            >
              {savingPassword ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
