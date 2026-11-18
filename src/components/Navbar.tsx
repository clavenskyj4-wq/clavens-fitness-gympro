import React, { useCallback, useEffect, useRef, useState } from 'react';
import { canAccessRoute, getRoleLabel, SessionUser } from '../lib/auth';
import { formatDateFR } from '../lib/utils';
import { AppRoute, GymConfig, SubscriptionAlertItem } from '../types/gym';
import { MaterialIcon, MaterialIconName } from './MaterialIcon';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  user: SessionUser | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  config: GymConfig;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  subscriptionAlerts: SubscriptionAlertItem[];
  onRegularizeMember: (memberId: string, forfaitId?: string) => void;
}

interface NavItem {
  route: AppRoute;
  label: string;
  icon: MaterialIconName;
}

const PRIMARY_NAV: NavItem[] = [
  { route: 'accueil', label: 'Accueil', icon: 'home' },
  { route: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
  { route: 'membres', label: 'Membres', icon: 'group' },
  { route: 'paiements', label: 'Paiements', icon: 'payments' },
  { route: 'presences', label: 'Présences', icon: 'event_available' },
];

const SECONDARY_NAV: NavItem[] = [
  { route: 'cours', label: 'Cours & Réservations', icon: 'sports_gymnastics' },
  { route: 'boutique', label: 'Boutique POS', icon: 'point_of_sale' },
  { route: 'coachs', label: 'Coachs', icon: 'fitness_center' },
  { route: 'equipements', label: 'Équipements', icon: 'build' },
  { route: 'depenses', label: 'Dépenses', icon: 'receipt_long' },
  { route: 'mesures', label: 'Mesures corporelles', icon: 'monitor_weight' },
  { route: 'rapports', label: 'Rapports', icon: 'bar_chart' },
  { route: 'parametres', label: 'Paramètres', icon: 'settings' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  user,
  onOpenLogin,
  onLogout,
  config,
  isOnline,
  pendingCount,
  isSyncing,
  onSyncNow,
  theme,
  onToggleTheme,
  subscriptionAlerts,
  onRegularizeMember,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'expired' | 'expiring'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [notifRightOffset, setNotifRightOffset] = useState(16);
  const [userRightOffset, setUserRightOffset] = useState(16);

  const scrollRef = useRef<HTMLDivElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);
  const userPanelRef = useRef<HTMLDivElement>(null);

  const visiblePrimary = PRIMARY_NAV.filter((item) =>
    item.route === 'accueil' ? true : canAccessRoute(user?.role, item.route)
  );
  const visibleSecondary = SECONDARY_NAV.filter((item) =>
    canAccessRoute(user?.role, item.route)
  );
  const allVisibleNav = [...visiblePrimary, ...visibleSecondary];

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    window.addEventListener('resize', updateScrollState);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, user, allVisibleNav.length, pendingCount]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLElement>(`[data-nav-route="${currentRoute}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentRoute]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        notifOpen &&
        !notifBtnRef.current?.contains(target) &&
        !notifPanelRef.current?.contains(target)
      ) {
        setNotifOpen(false);
      }
      if (
        userMenuOpen &&
        !userBtnRef.current?.contains(target) &&
        !userPanelRef.current?.contains(target)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [notifOpen, userMenuOpen]);

  const computeRightOffset = (btn: HTMLButtonElement | null, panelWidth: number) => {
    if (!btn) return 16;
    const rect = btn.getBoundingClientRect();
    const rawRight = window.innerWidth - rect.right;
    const maxRight = Math.max(12, window.innerWidth - panelWidth - 12);
    return Math.min(Math.max(12, rawRight), maxRight);
  };

  const handleToggleNotif = () => {
    if (!notifOpen) {
      setNotifRightOffset(computeRightOffset(notifBtnRef.current, 384));
      setUserMenuOpen(false);
    }
    setNotifOpen((v) => !v);
  };

  const handleToggleUserMenu = () => {
    if (!userMenuOpen) {
      setUserRightOffset(computeRightOffset(userBtnRef.current, 240));
      setNotifOpen(false);
    }
    setUserMenuOpen((v) => !v);
  };

  const handleScrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleNavbarWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const expiredCount = subscriptionAlerts.filter((a) => a.kind === 'expired').length;
  const expiringCount = subscriptionAlerts.filter((a) => a.kind === 'expiring').length;
  const filteredAlerts = subscriptionAlerts.filter((a) =>
    notifFilter === 'all' ? true : a.kind === notifFilter
  );

  const handleGo = (route: AppRoute) => {
    onNavigate(route);
    setDrawerOpen(false);
    setUserMenuOpen(false);
    setNotifOpen(false);
  };

  return (
    <>
      {/* Barre supérieure fixe avec défilement horizontal et barre visible */}
      <header className="no-print fixed top-0 inset-x-0 z-40 h-16 bg-white/85 dark:bg-[#0d0f14]/85 backdrop-blur-md border-b border-slate-200 dark:border-[#262b38]">
        <div className="max-w-[1440px] mx-auto h-full px-2 sm:px-4 lg:px-6 flex items-center gap-1.5">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => handleScrollBy(-240)}
              title="Faire défiler la barre vers la gauche"
              aria-label="Défiler à gauche"
              className="shrink-0 p-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-orange-500/15 hover:text-orange-600 dark:hover:text-orange-400 border border-slate-200 dark:border-[#262b38] transition-colors"
            >
              <MaterialIcon name="chevron_left" className="w-4 h-4" />
            </button>
          )}

          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            onWheel={handleNavbarWheel}
            className="gp-navbar-scroll flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden flex items-center gap-2.5 sm:gap-3 px-1 pb-0.5"
          >
            {/* Logo + nom du gym animé */}
            <button
              type="button"
              onClick={() => handleGo('accueil')}
              title="Retour à la page d’accueil"
              className="group flex items-center gap-3 text-left whitespace-nowrap shrink-0 px-2 py-1 rounded-xl hover:bg-orange-500/5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <span className="relative flex items-center justify-center shrink-0">
                <span
                  aria-hidden="true"
                  className="gp-brand-halo absolute -inset-1 rounded-xl pointer-events-none"
                />
                {config.logo ? (
                  <img
                    src={config.logo}
                    alt={config.nom_gym}
                    className="relative w-9 h-9 rounded-xl object-cover border border-orange-500/40 shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
                  />
                ) : (
                  <span className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 text-white flex items-center justify-center shadow-md shadow-orange-600/25 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-6">
                    <MaterialIcon name="fitness_center" className="w-5 h-5" />
                  </span>
                )}
              </span>

              <span className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5 py-0.5">
                  <span
                    aria-label={config.nom_gym || 'GymPro'}
                    className="gp-brand-title font-brand font-extrabold text-[15.5px] sm:text-[16.5px] leading-none tracking-tight flex items-center"
                  >
                    {Array.from(config.nom_gym || 'GymPro').map((char, idx) => (
                      <span
                        key={`${idx}-${char}`}
                        aria-hidden="true"
                        className="gp-sine-char"
                        style={{ '--char-i': idx } as React.CSSProperties}
                      >
                        {char === ' ' ? '\u00A0' : char}
                      </span>
                    ))}
                  </span>
                  <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="gp-sine-wave-track w-full mt-0.5 opacity-85 group-hover:opacity-100"
                >
                  <svg
                    viewBox="0 0 160 8"
                    preserveAspectRatio="none"
                    className="gp-sine-wave-svg"
                  >
                    <path
                      d="M0 4 Q 10 0.5, 20 4 T 40 4 T 60 4 T 80 4 T 100 4 T 120 4 T 140 4 T 160 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
            </button>

            <span
              aria-hidden="true"
              className="h-6 w-px bg-slate-200 dark:bg-[#262b38] shrink-0"
            />

            {/* Tous les boutons de navigation (principaux + modules) accessibles par défilement */}
            <nav className="flex items-center gap-1 shrink-0" aria-label="Navigation principale">
              {allVisibleNav.map((item) => {
                const active = currentRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    data-nav-route={item.route}
                    onClick={() => handleGo(item.route)}
                    title={`Ouvrir ${item.label}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-orange-600 dark:text-orange-400 bg-orange-500/10'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <MaterialIcon name={item.icon} className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <span
              aria-hidden="true"
              className="h-6 w-px bg-slate-200 dark:bg-[#262b38] shrink-0"
            />

            {/* Actions : État réseau + Synchro + Installer + Notifications + Thème + Utilisateur */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 ${
                  isOnline
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
                }`}
                title={
                  isOnline
                    ? 'Connexion internet active'
                    : 'Mode hors ligne : toutes les données sont enregistrées en local'
                }
              >
                <MaterialIcon name={isOnline ? 'wifi' : 'wifi_off'} className="w-3.5 h-3.5" />
                <span>{isOnline ? 'En ligne' : 'Hors ligne'}</span>
                {pendingCount > 0 && (
                  <span className="font-mono-num ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    {pendingCount}
                  </span>
                )}
              </div>

              {user && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  title="Synchroniser avec Google Sheets maintenant"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-[#262b38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <MaterialIcon
                    name={isOnline ? 'cloud_sync' : 'cloud_off'}
                    className={`w-4 h-4 ${isSyncing ? 'animate-spin text-orange-500' : ''}`}
                  />
                  <span>{isSyncing ? 'Synchro...' : 'Synchro'}</span>
                </button>
              )}

              <div className="shrink-0">
                <PWAInstallButton variant="compact" />
              </div>

              {user && (
                <button
                  ref={notifBtnRef}
                  type="button"
                  onClick={handleToggleNotif}
                  aria-expanded={notifOpen}
                  aria-label="Notifications des abonnements expirés"
                  title={
                    subscriptionAlerts.length > 0
                      ? `${expiredCount} forfait(s) expiré(s), ${expiringCount} bientôt expiré(s) — Cliquez pour régulariser`
                      : 'Notifications abonnements (aucune alerte)'
                  }
                  className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                >
                  <MaterialIcon
                    name="notifications"
                    className={`w-5 h-5 ${
                      expiredCount > 0 ? 'text-red-500 dark:text-red-400' : ''
                    }`}
                  />
                  {subscriptionAlerts.length > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold font-mono-num text-white flex items-center justify-center shadow-sm ${
                        expiredCount > 0 ? 'bg-red-600' : 'bg-amber-500'
                      }`}
                    >
                      {subscriptionAlerts.length > 99 ? '99+' : subscriptionAlerts.length}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onToggleTheme}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
                title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
              >
                <MaterialIcon
                  name={theme === 'dark' ? 'light_mode' : 'dark_mode'}
                  className="w-4 h-4"
                />
              </button>

              {user ? (
                <button
                  ref={userBtnRef}
                  type="button"
                  onClick={handleToggleUserMenu}
                  title="Ouvrir le menu du compte utilisateur"
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#262b38] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <MaterialIcon name="person" className="w-4 h-4 text-orange-500" />
                  <span className="max-w-[110px] truncate">{user.nom_utilisateur}</span>
                  <MaterialIcon name="expand_more" className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  title="Se connecter à votre compte GymPro"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <MaterialIcon name="lock" className="w-4 h-4" />
                  Se connecter
                </button>
              )}
            </div>
          </div>

          {canScrollRight && (
            <button
              type="button"
              onClick={() => handleScrollBy(240)}
              title="Faire défiler la barre vers la droite"
              aria-label="Défiler à droite"
              className="shrink-0 p-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-orange-500/15 hover:text-orange-600 dark:hover:text-orange-400 border border-slate-200 dark:border-[#262b38] transition-colors"
            >
              <MaterialIcon name="chevron_right" className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Panneau Notifications rendu hors de overflow-x-auto pour éviter toute coupure */}
        {user && notifOpen && (
          <div
            ref={notifPanelRef}
            style={{ right: `${notifRightOffset}px` }}
            className="fixed left-3 sm:left-auto top-[68px] sm:w-96 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] flex items-center justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Alertes abonnements ({subscriptionAlerts.length})
                </p>
                <p className="text-[11px] text-slate-500">
                  Membres à régulariser ou à renouveler
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                title="Fermer les notifications"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="close" className="w-4 h-4" />
              </button>
            </div>

            {subscriptionAlerts.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-200 dark:border-[#262b38] flex items-center gap-1.5 bg-slate-50 dark:bg-[#0d0f14]">
                {[
                  { id: 'all' as const, label: `Tous (${subscriptionAlerts.length})` },
                  { id: 'expired' as const, label: `Expirés (${expiredCount})` },
                  { id: 'expiring' as const, label: `Bientôt (${expiringCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setNotifFilter(f.id)}
                    title={`Filtrer : ${f.label}`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      notifFilter === f.id
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-[#262b38]">
              {filteredAlerts.length === 0 ? (
                <div className="px-4 py-8 text-center space-y-1.5">
                  <MaterialIcon
                    name="check_circle"
                    className="w-8 h-8 text-emerald-500 mx-auto"
                  />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {subscriptionAlerts.length === 0
                      ? 'Tous les abonnements sont à jour !'
                      : 'Aucun membre dans cette catégorie.'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Les alertes apparaîtront ici dès qu’un forfait expire.
                  </p>
                </div>
              ) : (
                filteredAlerts.map((item) => {
                  const canPay = canAccessRoute(user.role, 'paiements');
                  return (
                    <div
                      key={item.membreId}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#1a1f2b] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.photo ? (
                          <img
                            src={item.photo}
                            alt={item.nomComplet}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-bold flex items-center justify-center shrink-0">
                            {item.nomComplet.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.nomComplet}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            <span className="font-mono-num">{item.codeMembre}</span> ·{' '}
                            {item.forfaitNom}
                            {item.dateFin ? ` · ${formatDateFR(item.dateFin)}` : ''}
                          </p>
                          <span
                            className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              item.kind === 'expired'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {item.kind === 'expired'
                              ? item.dateFin
                                ? `Expiré depuis ${Math.abs(item.daysRemaining)} j`
                                : 'Abonnement expiré'
                              : item.daysRemaining === 0
                              ? 'Expire aujourd’hui'
                              : `Expire dans ${item.daysRemaining} j`}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          onRegularizeMember(item.membreId, item.forfaitId || undefined);
                        }}
                        title={
                          canPay
                            ? `Encaisser et régulariser l’abonnement de ${item.nomComplet}`
                            : `Voir le dossier de ${item.nomComplet}`
                        }
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors ${
                          item.kind === 'expired'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-orange-600 hover:bg-orange-700'
                        }`}
                      >
                        {canPay ? 'Régulariser' : 'Voir'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-[#262b38] bg-slate-50 dark:bg-[#0d0f14] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  handleGo(canAccessRoute(user.role, 'paiements') ? 'paiements' : 'membres')
                }
                title="Accéder au module de paiement et renouvellement des abonnements"
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
              >
                {canAccessRoute(user.role, 'paiements')
                  ? 'Ouvrir Caisse & Abonnements →'
                  : 'Voir la liste des membres →'}
              </button>
              <span className="text-[10px] text-slate-400">
                Seuil : {config.alerte_expiration_jours} j
              </span>
            </div>
          </div>
        )}

        {/* Menu utilisateur rendu hors de overflow-x-auto pour éviter toute coupure */}
        {user && userMenuOpen && (
          <div
            ref={userPanelRef}
            style={{ right: `${userRightOffset}px` }}
            className="fixed top-[68px] w-60 rounded-xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] shadow-xl py-2 z-50"
          >
            <div className="px-4 py-2 border-b border-slate-200 dark:border-[#262b38]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {user.nom_utilisateur}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {getRoleLabel(user.role)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                onToggleTheme();
              }}
              title={theme === 'dark' ? 'Basculer vers le mode clair' : 'Basculer vers le mode sombre'}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MaterialIcon
                name={theme === 'dark' ? 'light_mode' : 'dark_mode'}
                className="w-4 h-4"
              />
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </button>
            {canAccessRoute(user.role, 'parametres') && (
              <button
                type="button"
                onClick={() => handleGo('parametres')}
                title="Ouvrir les paramètres et la synchronisation"
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MaterialIcon name="settings" className="w-4 h-4" />
                Paramètres & Synchro
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                onLogout();
              }}
              title="Fermer votre session"
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <MaterialIcon name="logout" className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        )}
      </header>

      {/* Navigation mobile inférieure fixe (5 icônes + Plus) */}
      {user && (
        <nav
          className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 dark:bg-[#0d0f14]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#262b38] grid grid-cols-5"
          aria-label="Navigation mobile"
        >
          {[
            { route: 'dashboard' as AppRoute, label: 'Bord', icon: 'dashboard' as MaterialIconName },
            { route: 'membres' as AppRoute, label: 'Membres', icon: 'group' as MaterialIconName },
            { route: 'paiements' as AppRoute, label: 'Caisse', icon: 'payments' as MaterialIconName },
            { route: 'presences' as AppRoute, label: 'Présences', icon: 'event_available' as MaterialIconName },
          ].map((item) => {
            const allowed = canAccessRoute(user.role, item.route);
            const target = allowed ? item.route : 'accueil';
            const active = currentRoute === target;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleGo(target)}
                title={allowed ? `Ouvrir ${item.label}` : 'Revenir à l’accueil'}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <MaterialIcon name={item.icon} className="w-5 h-5" />
                <span>{allowed ? item.label : 'Accueil'}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Ouvrir tous les modules et actions"
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400"
          >
            <MaterialIcon name="menu" className="w-5 h-5" />
            <span>Plus</span>
          </button>
        </nav>
      )}

      {/* Tiroir latéral mobile animé */}
      {drawerOpen && (
        <div
          className="no-print lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="w-72 max-w-[85vw] h-full bg-white dark:bg-[#151821] border-l border-slate-200 dark:border-[#262b38] flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-[#262b38]">
              <div>
                <p className="font-brand font-bold text-slate-900 dark:text-white">
                  {config.nom_gym}
                </p>
                {user && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {user.nom_utilisateur} · {getRoleLabel(user.role)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                title="Fermer le menu latéral"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer le menu"
              >
                <MaterialIcon name="close" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {allVisibleNav.map((item) => {
                const active = currentRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => handleGo(item.route)}
                    title={`Ouvrir ${item.label}`}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MaterialIcon name={item.icon} className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-[#262b38] space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSyncNow}
                  title="Synchroniser la file locale avec Google Sheets"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#262b38] text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <MaterialIcon name="cloud_sync" className="w-4 h-4" />
                  Synchro ({pendingCount})
                </button>
                <PWAInstallButton variant="compact" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onLogout();
                }}
                title="Fermer votre session"
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-600/10 text-red-600 dark:text-red-400 text-sm font-medium"
              >
                <MaterialIcon name="logout" className="w-4 h-4" />
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
