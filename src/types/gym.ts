/**
 * Types TypeScript correspondant exactement aux 16 feuilles Google Sheets et à la file sync_queue.
 */

export type Devise = 'HTG' | 'USD';
export type UserRole = 'admin' | 'caissier' | 'coach';
export type ModePaiement = 'espèces' | 'MonCash' | 'NatCash' | 'virement' | 'carte';

export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string;
  deleted: 0 | 1;
}

export interface Membre extends BaseRecord {
  code_membre: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F' | 'Autre';
  date_naissance: string; // YYYY-MM-DD
  telephone: string;
  email: string;
  adresse: string;
  photo: string; // base64 compressée ou vide
  contact_urgence_nom: string;
  contact_urgence_tel: string;
  objectif: string;
  notes_sante: string;
  date_inscription: string; // YYYY-MM-DD
  statut: 'actif' | 'expiré' | 'suspendu';
  coach_id?: string;
  tarif_coach?: number;
}

export interface Forfait extends BaseRecord {
  nom: string;
  duree_jours: number;
  prix: number;
  devise: Devise;
  nb_seances_max: number | '';
  actif: 0 | 1;
}

export interface Abonnement extends BaseRecord {
  membre_id: string;
  forfait_id: string;
  date_debut: string;
  date_fin: string;
  prix_applique: number;
  statut: 'actif' | 'expiré' | 'annulé';
}

export interface Paiement extends BaseRecord {
  membre_id: string;
  abonnement_id: string;
  date: string;
  montant: number;
  devise: Devise;
  mode: ModePaiement;
  reference: string;
  note: string;
  recu_numero: string;
}

export interface Presence extends BaseRecord {
  membre_id: string;
  date: string; // YYYY-MM-DD
  heure_entree: string; // HH:mm
  heure_sortie: string; // HH:mm ou ''
  methode: 'manuel' | 'code';
}

export interface Coach extends BaseRecord {
  nom: string;
  prenom: string;
  telephone: string;
  specialite: string;
  salaire_base: number;
  tarif_coaching?: number;
  date_embauche: string;
  actif: 0 | 1;
}

export interface Cours extends BaseRecord {
  titre: string;
  coach_id: string;
  jour_semaine:
    | 'Lundi'
    | 'Mardi'
    | 'Mercredi'
    | 'Jeudi'
    | 'Vendredi'
    | 'Samedi'
    | 'Dimanche';
  heure_debut: string;
  heure_fin: string;
  capacite: number;
  salle: string;
}

export interface Reservation extends BaseRecord {
  cours_id: string;
  membre_id: string;
  date_cours: string;
  statut: 'réservé' | 'présent' | 'absent' | 'annulé';
}

export interface Equipement extends BaseRecord {
  nom: string;
  categorie: string;
  quantite: number;
  etat: 'bon' | 'à réparer' | 'hors service';
  date_achat: string;
  derniere_maintenance: string;
  prochaine_maintenance: string;
}

export interface Produit extends BaseRecord {
  nom: string;
  categorie: 'boissons' | 'suppléments' | 'accessoires';
  prix_vente: number;
  stock: number;
  seuil_alerte: number;
}

export interface Vente extends BaseRecord {
  date: string;
  membre_id: string;
  produit_id: string;
  quantite: number;
  prix_unitaire: number;
  total: number;
  mode_paiement: ModePaiement;
}

export interface Depense extends BaseRecord {
  date: string;
  categorie: 'loyer' | 'électricité' | 'salaires' | 'maintenance' | 'autre';
  description: string;
  montant: number;
  devise: Devise;
}

export interface Mesure extends BaseRecord {
  membre_id: string;
  date: string;
  poids: number; // kg
  taille: number; // cm
  imc: number;
  tour_taille: number; // cm
  tour_poitrine: number; // cm
  tour_bras: number; // cm
  notes: string;
}

export interface Utilisateur extends BaseRecord {
  nom_utilisateur: string;
  mot_de_passe_hash: string; // sha256(sel + mot_de_passe) stocké en "sel:hash"
  role: UserRole;
  actif: 0 | 1;
}

export interface Parametre extends BaseRecord {
  cle: string;
  valeur: string;
}

export interface JournalEntry extends BaseRecord {
  date_heure: string;
  utilisateur: string;
  action: string;
  details: string;
}

export type TableName =
  | 'Membres'
  | 'Forfaits'
  | 'Abonnements'
  | 'Paiements'
  | 'Presences'
  | 'Coachs'
  | 'Cours'
  | 'Reservations'
  | 'Equipements'
  | 'Produits'
  | 'Ventes'
  | 'Depenses'
  | 'Mesures'
  | 'Utilisateurs'
  | 'Parametres'
  | 'Journal';

export interface SyncQueueItem {
  id: string;
  table: TableName;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  timestamp: string;
  statut: 'pending' | 'error';
  erreur?: string;
}

export type PaletteId = 'orange' | 'emerald' | 'cobalt' | 'crimson' | 'gold';
export type AutoBackupMode = 'interval' | 'daily_time';

export interface AutoBackupSnapshot {
  id: string;
  created_at: string;
  trigger: 'auto' | 'manual';
  record_count: number;
  size_bytes: number;
  json: string;
}

export interface SubscriptionAlertItem {
  membreId: string;
  codeMembre: string;
  nomComplet: string;
  telephone: string;
  photo: string;
  forfaitId: string;
  forfaitNom: string;
  dateFin: string;
  daysRemaining: number; // < 0 => expiré, >= 0 => expire bientôt
  kind: 'expired' | 'expiring';
}

export interface GymConfig {
  nom_gym: string;
  logo: string;
  adresse: string;
  telephone: string;
  email_gym: string;
  horaires_ouverture: string;
  devise_defaut: Devise;
  taux_change: number; // 1 USD = X HTG
  frais_inscription: number; // Frais d'inscription lors de l'enregistrement d'un membre
  tarif_coach_defaut: number; // Tarif par défaut du suivi par un coach
  palette_couleur: PaletteId;
  alerte_expiration_jours: number;
  message_recu: string;
  reglements_titre: string;
  reglements_contenu: string;
  auto_logout_minutes: number;
  apps_script_url: string;
  apps_script_key: string;
  auto_backup_enabled: 0 | 1;
  auto_backup_mode: AutoBackupMode;
  auto_backup_hours: number;
  auto_backup_minutes: number;
  auto_backup_time: string; // HH:mm
  auto_backup_download_json: 0 | 1;
  auto_backup_sync_sheets: 0 | 1;
  auto_backup_keep_count: number;
  auto_backup_last_at: string;
}

export type AppRoute =
  | 'accueil'
  | 'dashboard'
  | 'membres'
  | 'paiements'
  | 'presences'
  | 'cours'
  | 'coachs'
  | 'equipements'
  | 'boutique'
  | 'depenses'
  | 'mesures'
  | 'rapports'
  | 'parametres';
