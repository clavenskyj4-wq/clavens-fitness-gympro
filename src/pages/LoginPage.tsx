import React, { useState } from 'react';
import { authenticateUser, SessionUser } from '../lib/auth';
import { MaterialIcon } from '../components/MaterialIcon';

interface LoginPageProps {
  gymName: string;
  isFirstRunAdmin: boolean;
  onSuccess: (user: SessionUser) => void;
  onBackHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  gymName,
  isFirstRunAdmin,
  onSuccess,
  onBackHome,
}) => {
  const [username, setUsername] = useState(isFirstRunAdmin ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authenticateUser(username, password);
      if (!res.ok || !res.user) {
        setError(res.error || 'Connexion impossible.');
      } else {
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d’authentification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center bg-slate-50 dark:bg-[#0d0f14]">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center">
            <MaterialIcon name="lock" className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Connexion à {gymName}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authentification locale hors ligne (SHA-256)
            </p>
          </div>
        </div>

        {isFirstRunAdmin && (
          <div className="mb-5 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-800 dark:text-orange-200 space-y-1">
            <p className="font-semibold">Premier démarrage — Compte administrateur initial :</p>
            <p>
              Identifiant : <code className="font-mono-num font-semibold">admin</code> · Mot de
              passe : <code className="font-mono-num font-semibold">GymPro2026!</code>
            </p>
            <p className="opacity-80">Pensez à modifier ce mot de passe dans Paramètres.</p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2"
          >
            <MaterialIcon name="warning" className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-user"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nom d’utilisateur
            </label>
            <input
              id="login-user"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex. admin"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label
              htmlFor="login-pass"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            title="Vérifier vos identifiants et ouvrir l’application"
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Vérification...' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#262b38] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Rôles : Admin · Caissier · Coach</span>
          <button
            type="button"
            onClick={onBackHome}
            title="Revenir à la page d’accueil publique"
            className="font-medium text-orange-600 dark:text-orange-400 hover:underline"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    </div>
  );
};
