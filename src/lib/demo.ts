import {
  Abonnement,
  Coach,
  Cours,
  Depense,
  Equipement,
  Forfait,
  Membre,
  Mesure,
  Paiement,
  Presence,
  Produit,
  Reservation,
  Vente,
} from '../types/gym';
import { hashPassword } from './auth';
import { getAllRecords, logAction, saveGymConfig, saveRecord } from './db';
import { addDaysISO, generateUUID, todayISO } from './utils';

/**
 * Charge un jeu de données réaliste pour démonstration (Haïti — Port-au-Prince / Pétion-Ville).
 * Uniquement déclenché manuellement par le bouton dans Paramètres.
 */
export async function loadDemoData(actorName: string): Promise<void> {
  const today = todayISO();

  await saveGymConfig({
    nom_gym: 'Force Ayiti Gym',
    adresse: 'Rue Panaméricaine #42, Pétion-Ville, Haïti',
    telephone: '+509 3712-4589',
    devise_defaut: 'HTG',
    taux_change: 132,
    tarif_coach_defaut: 2500,
    alerte_expiration_jours: 7,
    message_recu: 'Mèsi pou konfyans ou! Rete fò ak Force Ayiti Gym.',
  });

  // Forfaits
  const f1 = await saveRecord<Forfait>('Forfaits', {
    id: generateUUID(),
    nom: 'Mensuel Standard',
    duree_jours: 30,
    prix: 3500,
    devise: 'HTG',
    nb_seances_max: '',
    actif: 1,
  });
  const f2 = await saveRecord<Forfait>('Forfaits', {
    id: generateUUID(),
    nom: 'Trimestriel Pro',
    duree_jours: 90,
    prix: 9500,
    devise: 'HTG',
    nb_seances_max: '',
    actif: 1,
  });
  const f3 = await saveRecord<Forfait>('Forfaits', {
    id: generateUUID(),
    nom: 'Pass 12 Séances',
    duree_jours: 45,
    prix: 2800,
    devise: 'HTG',
    nb_seances_max: 12,
    actif: 1,
  });
  await saveRecord<Forfait>('Forfaits', {
    id: generateUUID(),
    nom: 'Séance Unique',
    duree_jours: 1,
    prix: 350,
    devise: 'HTG',
    nb_seances_max: 1,
    actif: 1,
  });

  // Coachs
  const c1 = await saveRecord<Coach>('Coachs', {
    id: generateUUID(),
    nom: 'Jean-Baptiste',
    prenom: 'Marc-Antoine',
    telephone: '+509 3411-9023',
    specialite: 'Musculation & Force',
    salaire_base: 32000,
    tarif_coaching: 3000,
    date_embauche: addDaysISO(today, -365),
    actif: 1,
  });
  const c2 = await saveRecord<Coach>('Coachs', {
    id: generateUUID(),
    nom: 'Pierre-Louis',
    prenom: 'Nadine',
    telephone: '+509 4820-1145',
    specialite: 'HIIT & Cardio Boxe',
    salaire_base: 28000,
    tarif_coaching: 2500,
    date_embauche: addDaysISO(today, -200),
    actif: 1,
  });

  // Utilisateurs supplémentaires (caissier & coach)
  const existingUsers = await getAllRecords<{ nom_utilisateur: string } & Membre>('Utilisateurs');
  if (!existingUsers.some((u) => u.nom_utilisateur === 'caissier')) {
    await saveRecord('Utilisateurs', {
      id: generateUUID(),
      nom_utilisateur: 'caissier',
      mot_de_passe_hash: await hashPassword('Caissier2026!'),
      role: 'caissier',
      actif: 1,
    });
  }
  if (!existingUsers.some((u) => u.nom_utilisateur === 'coach')) {
    await saveRecord('Utilisateurs', {
      id: generateUUID(),
      nom_utilisateur: 'coach',
      mot_de_passe_hash: await hashPassword('Coach2026!'),
      role: 'coach',
      actif: 1,
    });
  }

  // Membres
  const m1 = await saveRecord<Membre>('Membres', {
    id: generateUUID(),
    code_membre: 'GYM-0001',
    nom: 'Toussaint',
    prenom: 'Kervens',
    sexe: 'M',
    date_naissance: '1995-04-18',
    telephone: '+509 3845-2210',
    email: 'kervens.t@exemple.ht',
    adresse: 'Delmas 33, Port-au-Prince',
    photo: '',
    contact_urgence_nom: 'Marie Toussaint',
    contact_urgence_tel: '+509 3711-0022',
    objectif: 'Prise de masse musculaire',
    notes_sante: 'RAS',
    date_inscription: addDaysISO(today, -45),
    statut: 'actif',
    coach_id: c1.id,
    tarif_coach: 3000,
  });
  const m2 = await saveRecord<Membre>('Membres', {
    id: generateUUID(),
    code_membre: 'GYM-0002',
    nom: 'Joseph',
    prenom: 'Fabiola',
    sexe: 'F',
    date_naissance: '1998-09-07',
    telephone: '+509 4412-8871',
    email: 'fabiola.j@exemple.ht',
    adresse: 'Pétion-Ville, Rue Faubert',
    photo: '',
    contact_urgence_nom: 'Widler Joseph',
    contact_urgence_tel: '+509 3600-9120',
    objectif: 'Remise en forme & Cardio',
    notes_sante: 'Genou gauche sensible',
    date_inscription: addDaysISO(today, -25),
    statut: 'actif',
    coach_id: c2.id,
    tarif_coach: 2500,
  });
  const m3 = await saveRecord<Membre>('Membres', {
    id: generateUUID(),
    code_membre: 'GYM-0003',
    nom: 'Desir',
    prenom: 'Emmanuel',
    sexe: 'M',
    date_naissance: '1991-12-03',
    telephone: '+509 3901-7452',
    email: 'emmanuel.d@exemple.ht',
    adresse: 'Tabarre 27',
    photo: '',
    contact_urgence_nom: 'Claire Desir',
    contact_urgence_tel: '+509 3122-4501',
    objectif: 'Perte de poids',
    notes_sante: 'RAS',
    date_inscription: addDaysISO(today, -65),
    statut: 'expiré',
  });
  const m4 = await saveRecord<Membre>('Membres', {
    id: generateUUID(),
    code_membre: 'GYM-0004',
    nom: 'Charles',
    prenom: 'Stéphanie',
    sexe: 'F',
    date_naissance: '2000-02-22',
    telephone: '+509 3256-1198',
    email: 'stephanie.c@exemple.ht',
    adresse: 'Carrefour, Thor 12',
    photo: '',
    contact_urgence_nom: 'Ronald Charles',
    contact_urgence_tel: '+509 3788-3341',
    objectif: 'Tonification',
    notes_sante: 'RAS',
    date_inscription: addDaysISO(today, -5),
    statut: 'actif',
  });

  // Abonnements & Paiements
  const a1 = await saveRecord<Abonnement>('Abonnements', {
    id: generateUUID(),
    membre_id: m1.id,
    forfait_id: f2.id,
    date_debut: addDaysISO(today, -20),
    date_fin: addDaysISO(today, 70),
    prix_applique: f2.prix,
    statut: 'actif',
  });
  await saveRecord<Paiement>('Paiements', {
    id: generateUUID(),
    membre_id: m1.id,
    abonnement_id: a1.id,
    date: addDaysISO(today, -20),
    montant: 9500,
    devise: 'HTG',
    mode: 'MonCash',
    reference: 'MC-894120',
    note: 'Paiement complet trimestriel',
    recu_numero: 'REC-2026-0001',
  });

  // Expire sous 4 jours (alerte tableau de bord)
  const a2 = await saveRecord<Abonnement>('Abonnements', {
    id: generateUUID(),
    membre_id: m2.id,
    forfait_id: f1.id,
    date_debut: addDaysISO(today, -26),
    date_fin: addDaysISO(today, 4),
    prix_applique: f1.prix,
    statut: 'actif',
  });
  await saveRecord<Paiement>('Paiements', {
    id: generateUUID(),
    membre_id: m2.id,
    abonnement_id: a2.id,
    date: addDaysISO(today, -26),
    montant: 2500,
    devise: 'HTG',
    mode: 'NatCash',
    reference: 'NC-44102',
    note: 'Acompte (solde 1000 HTG)',
    recu_numero: 'REC-2026-0002',
  });

  // Expiré
  const a3 = await saveRecord<Abonnement>('Abonnements', {
    id: generateUUID(),
    membre_id: m3.id,
    forfait_id: f1.id,
    date_debut: addDaysISO(today, -40),
    date_fin: addDaysISO(today, -10),
    prix_applique: f1.prix,
    statut: 'expiré',
  });
  await saveRecord<Paiement>('Paiements', {
    id: generateUUID(),
    membre_id: m3.id,
    abonnement_id: a3.id,
    date: addDaysISO(today, -40),
    montant: 3500,
    devise: 'HTG',
    mode: 'espèces',
    reference: '',
    note: 'Règlement guichet',
    recu_numero: 'REC-2026-0003',
  });

  const a4 = await saveRecord<Abonnement>('Abonnements', {
    id: generateUUID(),
    membre_id: m4.id,
    forfait_id: f3.id,
    date_debut: addDaysISO(today, -5),
    date_fin: addDaysISO(today, 40),
    prix_applique: f3.prix,
    statut: 'actif',
  });
  await saveRecord<Paiement>('Paiements', {
    id: generateUUID(),
    membre_id: m4.id,
    abonnement_id: a4.id,
    date: addDaysISO(today, -5),
    montant: 2800,
    devise: 'HTG',
    mode: 'espèces',
    reference: '',
    note: 'Pass 12 séances',
    recu_numero: 'REC-2026-0004',
  });

  // Présences récentes
  for (let offset = 0; offset < 6; offset++) {
    await saveRecord<Presence>('Presences', {
      id: generateUUID(),
      membre_id: offset % 2 === 0 ? m1.id : m2.id,
      date: addDaysISO(today, -offset),
      heure_entree: '07:15',
      heure_sortie: offset === 0 ? '' : '08:45',
      methode: 'code',
    });
  }
  await saveRecord<Presence>('Presences', {
    id: generateUUID(),
    membre_id: m4.id,
    date: today,
    heure_entree: '09:05',
    heure_sortie: '',
    methode: 'manuel',
  });

  // Cours
  const cr1 = await saveRecord<Cours>('Cours', {
    id: generateUUID(),
    titre: 'HIIT Brûle-Graisse',
    coach_id: c2.id,
    jour_semaine: 'Lundi',
    heure_debut: '17:30',
    heure_fin: '18:30',
    capacite: 18,
    salle: 'Studio Cardio',
  });
  await saveRecord<Cours>('Cours', {
    id: generateUUID(),
    titre: 'Force & Haltérophilie',
    coach_id: c1.id,
    jour_semaine: 'Mercredi',
    heure_debut: '18:00',
    heure_fin: '19:15',
    capacite: 12,
    salle: 'Zone Poids Libres',
  });
  await saveRecord<Cours>('Cours', {
    id: generateUUID(),
    titre: 'Cardio Boxe Samedi',
    coach_id: c2.id,
    jour_semaine: 'Samedi',
    heure_debut: '08:30',
    heure_fin: '09:30',
    capacite: 20,
    salle: 'Studio Cardio',
  });

  await saveRecord<Reservation>('Reservations', {
    id: generateUUID(),
    cours_id: cr1.id,
    membre_id: m2.id,
    date_cours: today,
    statut: 'réservé',
  });

  // Équipements
  await saveRecord<Equipement>('Equipements', {
    id: generateUUID(),
    nom: 'Rack Squat Olympique #1',
    categorie: 'Musculation',
    quantite: 2,
    etat: 'bon',
    date_achat: addDaysISO(today, -400),
    derniere_maintenance: addDaysISO(today, -30),
    prochaine_maintenance: addDaysISO(today, 60),
  });
  await saveRecord<Equipement>('Equipements', {
    id: generateUUID(),
    nom: 'Tapis de course Matrix T50',
    categorie: 'Cardio',
    quantite: 4,
    etat: 'à réparer',
    date_achat: addDaysISO(today, -500),
    derniere_maintenance: addDaysISO(today, -90),
    prochaine_maintenance: addDaysISO(today, 3),
  });

  // Produits & Ventes
  const p1 = await saveRecord<Produit>('Produits', {
    id: generateUUID(),
    nom: 'Eau minérale fraîche 500ml',
    categorie: 'boissons',
    prix_vente: 75,
    stock: 48,
    seuil_alerte: 12,
  });
  const p2 = await saveRecord<Produit>('Produits', {
    id: generateUUID(),
    nom: 'Shake Whey Protéine (Dose)',
    categorie: 'suppléments',
    prix_vente: 350,
    stock: 4,
    seuil_alerte: 8,
  });
  await saveRecord<Produit>('Produits', {
    id: generateUUID(),
    nom: 'Gants de musculation Pro',
    categorie: 'accessoires',
    prix_vente: 1250,
    stock: 9,
    seuil_alerte: 3,
  });

  await saveRecord<Vente>('Ventes', {
    id: generateUUID(),
    date: today,
    membre_id: m1.id,
    produit_id: p2.id,
    quantite: 1,
    prix_unitaire: 350,
    total: 350,
    mode_paiement: 'MonCash',
  });
  await saveRecord<Vente>('Ventes', {
    id: generateUUID(),
    date: addDaysISO(today, -1),
    membre_id: m4.id,
    produit_id: p1.id,
    quantite: 2,
    prix_unitaire: 75,
    total: 150,
    mode_paiement: 'espèces',
  });

  // Dépenses
  await saveRecord<Depense>('Depenses', {
    id: generateUUID(),
    date: addDaysISO(today, -10),
    categorie: 'électricité',
    description: 'Carburant génératrice & EDH',
    montant: 14500,
    devise: 'HTG',
  });
  await saveRecord<Depense>('Depenses', {
    id: generateUUID(),
    date: addDaysISO(today, -2),
    categorie: 'maintenance',
    description: 'Lubrification et courroies tapis cardio',
    montant: 4200,
    devise: 'HTG',
  });

  // Mesures corporelles
  await saveRecord<Mesure>('Mesures', {
    id: generateUUID(),
    membre_id: m1.id,
    date: addDaysISO(today, -45),
    poids: 74.5,
    taille: 178,
    imc: 23.5,
    tour_taille: 82,
    tour_poitrine: 99,
    tour_bras: 35,
    notes: 'Bilan initial',
  });
  await saveRecord<Mesure>('Mesures', {
    id: generateUUID(),
    membre_id: m1.id,
    date: addDaysISO(today, -15),
    poids: 76.2,
    taille: 178,
    imc: 24.1,
    tour_taille: 81.5,
    tour_poitrine: 101,
    tour_bras: 36.2,
    notes: 'Bonne progression haut du corps',
  });
  await saveRecord<Mesure>('Mesures', {
    id: generateUUID(),
    membre_id: m1.id,
    date: today,
    poids: 77.4,
    taille: 178,
    imc: 24.4,
    tour_taille: 81,
    tour_poitrine: 103,
    tour_bras: 37,
    notes: 'Objectif force atteint',
  });

  await logAction(actorName, 'Données démo', 'Jeu de données de démonstration chargé.');
}
