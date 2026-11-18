import React, { useEffect, useState } from 'react';
import { getRoleLabel, SessionUser } from '../lib/auth';
import { GymConfig } from '../types/gym';
import { MaterialIcon } from './MaterialIcon';

interface WelcomeProgressPageProps {
  user: SessionUser;
  config: GymConfig;
  onComplete: () => void;
}

const LOADING_STEPS = [
  { at: 1, label: 'Préparation de votre espace de travail' },
  { at: 28, label: 'Chargement des données du gym' },
  { at: 56, label: 'Vérification de vos accès sécurisés' },
  { at: 82, label: 'Votre espace est presque prêt' },
  { at: 100, label: 'Tout est prêt. Bonne séance !' },
];

export const WelcomeProgressPage: React.FC<WelcomeProgressPageProps> = ({
  user,
  config,
  onComplete,
}) => {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setProgress((current) =>
        Math.min(100, current + Math.max(1, Math.ceil((100 - current) / 35)))
      );
    }, 75);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (progress < 100) return;
    const timeoutId = window.setTimeout(onComplete, 700);
    return () => window.clearTimeout(timeoutId);
  }, [progress, onComplete]);

  const currentStep = [...LOADING_STEPS].reverse().find((step) => progress >= step.at);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090d14] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-orange-600/15 blur-[120px]" />
        <div className="absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full bg-rose-700/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <section className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111722]/90 shadow-[0_35px_120px_-30px_rgba(0,0,0,.8)] backdrop-blur-xl">
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-rose-500 transition-[width] duration-150 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid md:grid-cols-[1fr_0.85fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10 md:p-12">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg shadow-orange-950/30">
                {config.logo ? (
                  <img
                    src={config.logo}
                    alt={`Logo ${config.nom_gym}`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <MaterialIcon name="fitness_center" className="h-6 w-6 text-orange-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-wide text-white">
                  {config.nom_gym || 'GymPro Fitness'}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Espace de gestion
                </p>
              </div>
            </div>

            <div className="mt-12">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
                Connexion sécurisée
              </span>
              <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Bienvenue,
                <span className="mt-1 block bg-gradient-to-r from-orange-300 via-amber-200 to-white bg-clip-text text-transparent">
                  {user.nom_utilisateur}
                </span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-400 sm:text-base">
                Votre espace est prêt. Nous préparons vos outils pour vous permettre de reprendre
                votre activité en toute simplicité.
              </p>
            </div>

            <div className="mt-10">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    {currentStep?.label || LOADING_STEPS[0].label}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {getRoleLabel(user.role)} · Session personnelle
                  </p>
                </div>
                <span className="font-mono-num text-2xl font-bold tabular-nums text-orange-300">
                  {progress}
                  <span className="ml-0.5 text-sm text-orange-300/60">%</span>
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-white/[0.07] p-[2px]"
                role="progressbar"
                aria-label="Préparation de votre espace"
                aria-valuemin={1}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-rose-400 shadow-[0_0_16px_rgba(251,146,60,.55)] transition-[width] duration-150 ease-out motion-reduce:transition-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <MaterialIcon name="verified" className="h-4 w-4 text-emerald-400" />
                Accès vérifié et protégé
              </div>
              <button
                type="button"
                onClick={onComplete}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
              >
                Accéder maintenant
              </button>
            </div>
          </div>

          <div className="relative hidden min-h-[480px] items-center justify-center overflow-hidden border-l border-white/[0.06] bg-gradient-to-br from-orange-500/[0.08] via-transparent to-rose-500/[0.08] md:flex">
            <div className="absolute h-72 w-72 rounded-full border border-orange-300/10" />
            <div className="absolute h-56 w-56 rounded-full border border-orange-300/15" />
            <div className="absolute h-40 w-40 rounded-full border border-orange-300/20" />
            <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[2rem] border border-white/15 bg-[#151d29]/90 shadow-[0_25px_80px_-20px_rgba(249,115,22,.55)]">
              {config.logo ? (
                <img
                  src={config.logo}
                  alt={`Logo ${config.nom_gym}`}
                  className="h-full w-full object-contain p-5"
                />
              ) : (
                <MaterialIcon name="fitness_center" className="h-14 w-14 text-orange-300" />
              )}
            </div>
            <div className="absolute bottom-10 left-8 right-8 text-center">
              <p className="font-display text-sm font-bold tracking-wide text-white/90">
                {config.nom_gym || 'GymPro Fitness'}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Entraînez-vous. Progressez. Réussissez.
              </p>
            </div>
            <div className="absolute right-8 top-8 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-orange-300">
              <MaterialIcon name="verified" className="h-4 w-4" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
