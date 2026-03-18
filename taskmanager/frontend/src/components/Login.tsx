import { useState } from 'react';
import { setToken as saveToken } from '../api';
import { api } from '../api';

interface LoginProps {
  onSuccess: (token: string) => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token.trim()) {
      setError('Add meg az API tokent');
      return;
    }
    setLoading(true);
    try {
      saveToken(token.trim());
      await api.projects.list();
      onSuccess(token.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba a csatlakozásnál');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-100">Mission Control</h1>
          <p className="text-slate-400 mt-1">Sophon parancsnoki központ</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl"
        >
          <label className="block text-sm font-medium text-slate-300 mb-2">
            API token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="tm_..."
            className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            autoFocus
          />
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Ellenőrzés...' : 'Belépés'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          A tokent a VPS-en generálhatod: <code className="bg-slate-800 px-1 rounded">npx ts-node scripts/generate-agent-token.ts</code>
        </p>
      </div>
    </div>
  );
}
