import React, { useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { GymConfig } from '../types/gym';

interface GymAccessRequestPageProps {
  config: GymConfig;
  onBackHome: () => void;
}

export const GymAccessRequestPage: React.FC<GymAccessRequestPageProps> = ({
  config,
  onBackHome,
}) => {
  const [gymName, setGymName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!navigator.onLine) {
        throw new Error('Une connexion internet est nécessaire pour envoyer votre demande.');
      }
      const response = await fetch('/api/gym-access/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymName, username, password }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Impossible d’envoyer la demande d’accès.');
      }
      setSubmitted(true);
      setPassword('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Une erreur est survenue pendant l’envoi.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090d14] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-orange-600/15 blur-[120px]" />
        <div className="absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full bg-rose-700/10 blur-[130px]" />
      </div>
      <section className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#111722]/95 p-7 shadow-[0_35px_120px_-30px_rgba(0,0,0,.8)] backdrop-blur-xl sm:p-10">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
            {config.logo ? (
              <img src={config.logo} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <MaterialIcon name="fitness_center" className="h-6 w-6 text-orange-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold">{config.nom_gym || 'GymPro'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Accès professionnel
            </p>
          </div>
        </header>

        {submitted ? (
          <div className="py-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
              <MaterialIcon name="schedule" className="h-8 w-8" />
            </div>
            <h1 className="mt-5 font-display text-2xl font-extrabold">Demande envoyée</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
              Votre accès administrateur est en attente d’approbation par le Super Admin. Vous
              pourrez vous connecter avec l’identifiant et le mot de passe choisis dès que votre
              demande sera approuvée.
            </p>
            <button
              type="button"
              onClick={onBackHome}
              className="mt-7 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700"
            >
              Retour à l’accueil
            </button>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">
                <MaterialIcon name="verified" className="h-3.5 w-3.5" />
                Validation Super Admin requise
              </span>
              <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight">
                Demander un accès
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Créez vos identifiants de gestion. Ils seront activés après vérification par le
                Super Admin.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-200">
                Nom du gym
                <input
                  autoComplete="organization"
                  required
                  minLength={2}
                  maxLength={120}
                  value={gymName}
                  onChange={(event) => setGymName(event.target.value)}
                  placeholder="Ex. Fitness Club"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1018] px-3.5 py-3 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Utilisateur
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9._-]{3,32}"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Choisissez votre identifiant"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1018] px-3.5 py-3 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-2 focus:ring-orange-500/20"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  3 à 32 caractères : lettres, chiffres, point, tiret ou souligné.
                </span>
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Mot de passe
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="12 caractères minimum"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1018] px-3.5 py-3 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-2 focus:ring-orange-500/20"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Choisissez un mot de passe robuste d’au moins 12 caractères.
                </span>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60"
              >
                <MaterialIcon name="person_add" className="h-4 w-4" />
                {loading ? 'Envoi en cours…' : 'Envoyer ma demande'}
              </button>
            </form>

            <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
              Ces identifiants sont propres à votre gym et distincts des identifiants Super Admin.
            </p>
          </>
        )}
      </section>
    </main>
  );
};
