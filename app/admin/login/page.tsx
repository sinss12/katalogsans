'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    setIsLoading(false);

    if (res.ok) {
      router.push('/admin');
      router.refresh();
    } else {
      setError('Password salah, coba lagi bro');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-lg font-bold text-slate-100 mb-1">Admin Login</h1>
        <p className="text-xs text-slate-500 mb-6">Masuk untuk mengakses Central Control Panel</p>

        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-slate-500 mb-4"
          placeholder="••••••••"
          required
        />

        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 p-3 rounded-lg font-semibold text-xs uppercase tracking-wide transition-colors disabled:opacity-50"
        >
          {isLoading ? 'MEMVERIFIKASI...' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}