import React, { useEffect, useRef, useState } from 'react';
import { getAllRecords } from '../lib/db';
import { Abonnement, AppRoute, Cours, Forfait, Membre, Presence } from '../types/gym';
import { MaterialIcon, MaterialIconName } from '../components/MaterialIcon';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface LandingPageProps {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onNavigate: (route: AppRoute) => void;
  pendingCount: number;
  hasGoogleConfig: boolean;
}

interface QuickChecklistState {
  gymConfigured: boolean;
  hasForfaits: boolean;
  hasMembre: boolean;
  sheetsConnected: boolean;
}

const FAQ_ITEMS = [
  {
    q: 'Que se passe-t-il si la connexion internet coupe pendant un encaissement ?',
    a: 'Rien n’est bloqué. GymPro enregistre immédiatement le membre, le paiement et le reçu dans votre base locale IndexedDB et place l’opération dans la file de synchronisation. Dès que le réseau revient, tout est envoyé vers votre Google Sheet.',
  },
  {
    q: 'Puis-je utiliser les devises HTG (Gourdes) et USD en même temps ?',
    a: 'Oui. Le HTG est configuré par défaut, avec taux de change personnalisable dans Paramètres. Vous pouvez encaisser en espèces, MonCash, NatCash, virement bancaire ou carte.',
  },
  {
    q: 'Comment fonctionne l’impression des reçus et des cartes de membres ?',
    a: 'GymPro génère les reçus en format thermique 80 mm et en A4 ainsi que des cartes de membres avec QR Code local, sans aucun service externe ni internet.',
  },
  {
    q: 'Mes données sont-elles sécurisées sur l’appareil partagé de la réception ?',
    a: 'Oui. Chaque utilisateur (Administrateur, Caissier, Coach) dispose de son propre accès avec mot de passe haché en SHA-256 + sel, permissions restreintes par rôle et déconnexion automatique après inactivité.',
  },
];

function useAnimatedCounter(target: number, durationMs = 650): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || target === 0) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  isAuthenticated,
  onOpenLogin,
  onNavigate,
  pendingCount,
  hasGoogleConfig,
}) => {
  const [stats, setStats] = useState({
    membresActifs: 0,
    presencesTotal: 0,
    forfaitsActifs: 0,
    coursHebdo: 0,
  });
  const [checklist, setChecklist] = useState<QuickChecklistState>({
    gymConfigured: false,
    hasForfaits: false,
    hasMembre: false,
    sheetsConnected: hasGoogleConfig,
  });
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('gympro_quickstart_checks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function loadLocalMetrics() {
      try {
        const [membres, presences, forfaits, cours, abos, params] = await Promise.all([
          getAllRecords<Membre>('Membres'),
          getAllRecords<Presence>('Presences'),
          getAllRecords<Forfait>('Forfaits'),
          getAllRecords<Cours>('Cours'),
          getAllRecords<Abonnement>('Abonnements'),
          getAllRecords<{ id: string; cle: string; valeur: string; created_at: string; updated_at: string; deleted: 0 | 1 }>('Parametres'),
        ]);
        if (!active) return;
        const actifs = membres.filter((m) => m.statut === 'actif').length;
        const activeAbos = abos.filter((a) => a.statut === 'actif').length;
        const nomGymParam = params.find((p) => p.cle === 'nom_gym')?.valeur;
        setStats({
          membresActifs: Math.max(actifs, activeAbos),
          presencesTotal: presences.length,
          forfaitsActifs: forfaits.filter((f) => f.actif === 1).length,
          coursHebdo: cours.length,
        });
        setChecklist({
          gymConfigured: Boolean(nomGymParam && nomGymParam !== 'GymPro Fitness'),
          hasForfaits: forfaits.length > 0,
          hasMembre: membres.length > 0,
          sheetsConnected: hasGoogleConfig,
        });
      } catch {
        // Garde les zéros en cas de premier démarrage
      }
    }
    loadLocalMetrics();
    return () => {
      active = false;
    };
  }, [hasGoogleConfig]);

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;
    const elements = Array.from(container.querySelectorAll('.gp-reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toggleManualCheck = (key: string) => {
    setManualChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('gympro_quickstart_checks', JSON.stringify(next));
      return next;
    });
  };

  const cMembres = useAnimatedCounter(stats.membresActifs);
  const cPresences = useAnimatedCounter(stats.presencesTotal);
  const cForfaits = useAnimatedCounter(stats.forfaitsActifs);
  const cCours = useAnimatedCounter(stats.coursHebdo);

  const steps: { num: string; title: string; desc: string; icon: MaterialIconName }[] = [
    {
      num: '01',
      title: 'Inscrire le membre',
      desc: 'Créez la fiche en 30 secondes avec photo caméra et carte QR Code générée sur place.',
      icon: 'person_add',
    },
    {
      num: '02',
      title: 'Encaisser en HTG ou USD',
      desc: 'Validez l’abonnement en espèces, MonCash ou NatCash et imprimez le reçu 80 mm.',
      icon: 'payments',
    },
    {
      num: '03',
      title: 'Contrôler les présences',
      desc: 'Saisissez le code membre à l’accueil : feu vert si actif, alerte rouge si expiré.',
      icon: 'event_available',
    },
    {
      num: '04',
      title: 'Analyser & Synchroniser',
      desc: 'Suivez les revenus, dépenses et stocks, puis synchronisez automatiquement vers Google Sheets.',
      icon: 'bar_chart',
    },
  ];

  const features: { title: string; desc: string; icon: MaterialIconName; route: AppRoute; span?: string }[] = [
    {
      title: 'Membres & Cartes QR',
      desc: 'Recherche instantanée, photo par webcam ou fichier, onglets complets (abonnements, paiements, présences, mesures) et carte membre imprimable.',
      icon: 'group',
      route: 'membres',
      span: 'lg:col-span-2',
    },
    {
      title: 'Abonnements & MonCash / NatCash',
      desc: 'Inscription en 3 étapes, paiements partiels avec solde restant, renouvellement en un clic et reçus 80 mm / A4.',
      icon: 'payments',
      route: 'paiements',
    },
    {
      title: 'Contrôle d’accès rapide',
      desc: 'Pointage par code ou nom avec alerte visuelle immédiate si l’abonnement est expiré ou suspendu.',
      icon: 'qr_code_2',
      route: 'presences',
    },
    {
      title: 'Cours, Coachs & Réservations',
      desc: 'Planning hebdomadaire, suivi de capacité par salle et feuilles de présence par séance.',
      icon: 'sports_gymnastics',
      route: 'cours',
    },
    {
      title: 'Boutique POS & Stock',
      desc: 'Vente rapide de boissons, suppléments et accessoires avec alerte automatique de rupture.',
      icon: 'point_of_sale',
      route: 'boutique',
    },
    {
      title: 'Équipements & Dépenses',
      desc: 'Inventaire des machines, calendrier de maintenance et suivi des charges (loyer, génératrice, salaires).',
      icon: 'inventory_2',
      route: 'equipements',
    },
    {
      title: 'Mesures & Rapports PDF',
      desc: 'Courbe d’évolution poids/IMC, bilans financiers par période, export CSV Excel et impression PDF.',
      icon: 'trending_up',
      route: 'rapports',
    },
  ];

  const checklistRows = [
    {
      key: 'gym',
      title: 'Configurer les informations de votre salle',
      detail: 'Nom du gym, adresse, téléphone, devise par défaut (HTG) et taux USD.',
      done: checklist.gymConfigured || Boolean(manualChecks.gym),
      route: 'parametres' as AppRoute,
    },
    {
      key: 'forfaits',
      title: 'Créer vos forfaits d’abonnement',
      detail: 'Mensuel, Trimestriel, Pass séances ou Séance unique avec tarifs en HTG.',
      done: checklist.hasForfaits || Boolean(manualChecks.forfaits),
      route: 'parametres' as AppRoute,
    },
    {
      key: 'membre',
      title: 'Enregistrer un premier membre',
      detail: 'Testez l’inscription hors ligne, la photo et la génération de carte QR Code.',
      done: checklist.hasMembre || Boolean(manualChecks.membre),
      route: 'membres' as AppRoute,
    },
    {
      key: 'sheets',
      title: 'Connecter votre classeur Google Sheets',
      detail: 'Collez l’URL du Web App Apps Script et la clé secrète dans Paramètres.',
      done: checklist.sheetsConnected || Boolean(manualChecks.sheets),
      route: 'parametres' as AppRoute,
    },
  ];

  const completedCount = checklistRows.filter((r) => r.done).length;

  return (
    <div ref={rootRef} className="min-h-screen">
      {/* 1. HERO PLEIN ÉCRAN */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden bg-[#0d0f14] text-white pt-20 pb-16">
        <img
          src="/src/assets/images/hero_gym_training_1794937170300.jpg"
          alt="Salle de musculation moderne équipée"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-80 brightness-95 contrast-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d0f14]/88 via-[#0d0f14]/55 to-[#0d0f14]/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f14]/75 via-transparent to-[#0d0f14]/30" />

        {/* Formes géométriques animées légères (CSS pur) */}
        <div
          aria-hidden="true"
          className="gp-shape-float absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-600/15 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="gp-shape-float-reverse absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-red-600/15 blur-3xl pointer-events-none"
        />

        <div className="relative z-10 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-orange-400 tracking-wide">
              Application PWA pour salles de sport en Haïti · 100 % hors ligne
            </p>
            <h1
              className="mt-4 font-brand font-extrabold tracking-tight text-white leading-[1.08]"
              style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.85rem)', textWrap: 'balance' }}
            >
              Pilotez votre salle de sport sans jamais dépendre d’internet
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Inscrivez vos membres, encaissez vos abonnements en HTG ou USD (Espèces, MonCash,
              NatCash), imprimez vos reçus 80 mm et contrôlez l’accès à l’entrée. Dès que la
              connexion revient, vos données se synchronisent avec Google Sheets.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  title="Accéder au tableau de bord et aux statistiques"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  <MaterialIcon name="dashboard" className="w-5 h-5" />
                  Ouvrir le tableau de bord
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  title="Ouvrir l’écran de connexion utilisateur"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  <MaterialIcon name="lock" className="w-5 h-5" />
                  Se connecter
                </button>
              )}

              <a
                href="#fonctionnalites"
                title="Explorer tous les modules de gestion GymPro"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/25 bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors whitespace-nowrap"
              >
                Découvrir les fonctionnalités
                <MaterialIcon name="arrow_forward" className="w-4 h-4" />
              </a>

              <PWAInstallButton variant="full" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. BANDE DE STATISTIQUES ANIMÉES (DONNÉES LOCALES RÉELLES) */}
      <section className="border-y border-slate-200 dark:border-[#262b38] bg-white dark:bg-[#151821]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <p className="font-mono-num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              {cMembres}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Membres ou abonnements actifs
            </p>
          </div>
          <div>
            <p className="font-mono-num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              {cPresences}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Séances enregistrées en local
            </p>
          </div>
          <div>
            <p className="font-mono-num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              {cForfaits}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Forfaits configurés
            </p>
          </div>
          <div>
            <p className="font-mono-num text-3xl sm:text-4xl font-bold text-orange-600 dark:text-orange-400">
              {pendingCount > 0 ? pendingCount : cCours}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {pendingCount > 0 ? 'Modifications en attente de synchro' : 'Cours planifiés par semaine'}
            </p>
          </div>
        </div>
      </section>

      {/* 3. COMMENT ÇA MARCHE (4 ÉTAPES) */}
      <section className="py-20 bg-slate-50 dark:bg-[#0d0f14]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl gp-reveal">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Comment ça marche au quotidien
            </h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Un flux pensé pour la réception, la caisse et les coachs, rapide même lors des
              heures de pointe.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s) => (
              <div
                key={s.num}
                className="gp-reveal p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono-num text-sm font-semibold text-orange-600 dark:text-orange-400">
                    {s.num}.
                  </span>
                  <span className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                    <MaterialIcon name={s.icon} className="w-5 h-5" />
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. GRILLE DES FONCTIONNALITÉS */}
      <section
        id="fonctionnalites"
        className="py-20 bg-white dark:bg-[#12151d] border-y border-slate-200 dark:border-[#262b38]"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-12 gp-reveal">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Tous les outils de gestion réunis dans une seule application
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">
                Remplacez les cahiers papier et les fichiers dispersés par un outil fiable adapté à
                votre salle : suivi des paiements partiels, gestion des coachs, caisse boutique et
                courbes de progression physique.
              </p>
            </div>
            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#262b38]">
              <img
                src="/src/assets/images/gym_coaching_floor_1794937170900.jpg"
                alt="Séance de coaching sportif en salle"
                referrerPolicy="no-referrer"
                className="w-full h-full max-h-60 object-cover"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat) => (
              <button
                key={feat.title}
                type="button"
                onClick={() => (isAuthenticated ? onNavigate(feat.route) : onOpenLogin())}
                title={
                  isAuthenticated
                    ? `Ouvrir le module ${feat.title}`
                    : `Se connecter pour accéder à ${feat.title}`
                }
                className={`gp-reveal text-left p-6 rounded-2xl bg-slate-50 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] hover:border-orange-500/60 transition-all hover:-translate-y-0.5 flex flex-col justify-between ${
                  feat.span || ''
                }`}
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4">
                    <MaterialIcon name={feat.icon} className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                  <span>{isAuthenticated ? 'Ouvrir le module' : 'Se connecter pour accéder'}</span>
                  <MaterialIcon name="chevron_right" className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 5. FONCTIONNE MÊME SANS INTERNET (SCHÉMA SVG LOCAL) */}
      <section className="py-20 bg-slate-50 dark:bg-[#0d0f14]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 gp-reveal">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Fonctionne même sans internet
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">
              Chaque fiche, paiement ou présence est d’abord écrit dans la base locale IndexedDB
              de votre appareil. Aucune attente réseau, aucun écran figé.
            </p>
            <ul className="mt-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <MaterialIcon name="check_circle" className="w-5 h-5 text-emerald-500 mt-0.5" />
                <span>
                  Service Worker cache-first : l’application s’ouvre instantanément même en mode
                  avion.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <MaterialIcon name="check_circle" className="w-5 h-5 text-emerald-500 mt-0.5" />
                <span>
                  File de synchronisation chronologique : zéro perte de données lors des coupures.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <MaterialIcon name="check_circle" className="w-5 h-5 text-emerald-500 mt-0.5" />
                <span>
                  Résolution automatique des conflits par horodatage (dernière modification gagne).
                </span>
              </li>
            </ul>
          </div>

          {/* Schéma visuel SVG d'architecture local-first */}
          <div className="lg:col-span-7 gp-reveal p-6 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]">
            <svg
              viewBox="0 0 680 220"
              className="w-full h-auto"
              role="img"
              aria-label="Architecture locale vers Google Sheets"
            >
              {/* Bloc 1 : Interface */}
              <rect
                x="14"
                y="45"
                width="145"
                height="115"
                rx="14"
                className="fill-slate-100 dark:fill-[#1c202b] stroke-slate-300 dark:stroke-[#2d3446]"
                strokeWidth="1.5"
              />
              <text
                x="86"
                y="88"
                textAnchor="middle"
                className="fill-slate-900 dark:fill-white text-[13px] font-bold"
              >
                GymPro UI
              </text>
              <text
                x="86"
                y="110"
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[11px]"
              >
                PC · Tablette · Mobile
              </text>
              <text
                x="86"
                y="132"
                textAnchor="middle"
                className="fill-emerald-600 dark:fill-emerald-400 text-[11px] font-semibold"
              >
                0 ms blocage réseau
              </text>

              {/* Flèche 1 */}
              <path
                d="M165 102 L195 102"
                className="stroke-orange-500"
                strokeWidth="2.5"
                markerEnd="url(#gp-arrow)"
              />

              {/* Bloc 2 : IndexedDB + File */}
              <rect
                x="200"
                y="32"
                width="175"
                height="142"
                rx="14"
                className="fill-orange-500/10 stroke-orange-500/50"
                strokeWidth="1.5"
              />
              <text
                x="287"
                y="68"
                textAnchor="middle"
                className="fill-slate-900 dark:fill-white text-[13px] font-bold"
              >
                IndexedDB Local
              </text>
              <text
                x="287"
                y="89"
                textAnchor="middle"
                className="fill-slate-600 dark:fill-slate-300 text-[11px]"
              >
                16 tables locales
              </text>
              <rect
                x="220"
                y="108"
                width="135"
                height="46"
                rx="8"
                className="fill-white dark:fill-[#151821] stroke-orange-500/40"
              />
              <text
                x="287"
                y="129"
                textAnchor="middle"
                className="fill-orange-600 dark:fill-orange-400 text-[11px] font-semibold"
              >
                File sync_queue
              </text>
              <text
                x="287"
                y="144"
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px]"
              >
                Envoi dès retour réseau
              </text>

              {/* Flèche 2 */}
              <path
                d="M382 102 L414 102"
                className="stroke-orange-500"
                strokeWidth="2.5"
                strokeDasharray="5 4"
              />

              {/* Bloc 3 : Google Sheets via Apps Script */}
              <rect
                x="420"
                y="45"
                width="244"
                height="115"
                rx="14"
                className="fill-emerald-500/10 stroke-emerald-500/45"
                strokeWidth="1.5"
              />
              <text
                x="542"
                y="86"
                textAnchor="middle"
                className="fill-slate-900 dark:fill-white text-[13px] font-bold"
              >
                Google Sheets
              </text>
              <text
                x="542"
                y="108"
                textAnchor="middle"
                className="fill-slate-600 dark:fill-slate-300 text-[11px]"
              >
                Via Web App Apps Script sécurisé
              </text>
              <text
                x="542"
                y="132"
                textAnchor="middle"
                className="fill-emerald-600 dark:fill-emerald-400 text-[11px] font-semibold"
              >
                16 feuilles · Sauvegarde cloud
              </text>

              <defs>
                <marker
                  id="gp-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L6,3 z" fill="#f97316" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      </section>

      {/* 6. GUIDE DE DÉMARRAGE RAPIDE (CHECKLIST INTERACTIVE) */}
      <section className="py-20 bg-white dark:bg-[#12151d] border-y border-slate-200 dark:border-[#262b38]">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 gp-reveal">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Guide de démarrage rapide
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Suivez ces 4 étapes pour mettre votre salle en production dès aujourd’hui.
              </p>
            </div>
            <p className="font-mono-num text-sm font-semibold text-orange-600 dark:text-orange-400">
              {completedCount} / {checklistRows.length} complétées
            </p>
          </div>

          <div className="space-y-3 gp-reveal">
            {checklistRows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-[#151821] border border-slate-200 dark:border-[#262b38]"
              >
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    onClick={() => toggleManualCheck(row.key)}
                    title={`Marquer "${row.title}" comme ${row.done ? 'non terminé' : 'terminé'}`}
                    aria-label={`Marquer "${row.title}" comme ${row.done ? 'non terminé' : 'terminé'}`}
                    className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                      row.done
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent'
                    }`}
                  >
                    {row.done && <MaterialIcon name="check_circle" className="w-4 h-4" />}
                  </button>
                  <div>
                    <h3
                      className={`text-base font-semibold ${
                        row.done
                          ? 'line-through text-slate-500 dark:text-slate-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {row.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      {row.detail}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (isAuthenticated ? onNavigate(row.route) : onOpenLogin())}
                  title={
                    isAuthenticated
                      ? `Ouvrir la configuration pour "${row.title}"`
                      : 'Se connecter pour configurer'
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#262b38] hover:border-orange-500 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  {isAuthenticated ? 'Configurer' : 'Se connecter'}
                  <MaterialIcon name="chevron_right" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FAQ EN ACCORDÉON + PIED DE PAGE */}
      <section className="py-20 bg-slate-50 dark:bg-[#0d0f14]">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-10 gp-reveal">
            Questions fréquentes
          </h2>
          <div className="space-y-3 gp-reveal">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    title={isOpen ? 'Réduire la réponse' : 'Afficher la réponse'}
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <span>{item.q}</span>
                    <MaterialIcon
                      name="expand_more"
                      className={`w-5 h-5 text-slate-500 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-slate-200 dark:border-[#262b38] bg-white dark:bg-[#0d0f14]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>GymPro — Gestion de salle de sport hors ligne · Haïti (HTG / USD)</p>
          <p>Stockage local IndexedDB + Synchronisation Google Sheets</p>
        </div>
      </footer>
    </div>
  );
};
