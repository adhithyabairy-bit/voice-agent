'use client';

// ============================================================
// Sign Up Page — Supabase Auth
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/db/supabase';
import { Mic, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        // Redirect to onboarding
        router.push('/onboarding');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-3 no-underline">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Mic size={22} />
            </div>
            <span className="text-2xl font-bold text-[var(--foreground)]">VoiceAI</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-4">Create your business account</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Deploy an intelligent AI voice receptionist in under 2 minutes
          </p>
        </div>

        <div className="glass-card p-6 md:p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Your full name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aditya Sharma"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Business email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@business.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[var(--primary)] text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Continue to Onboarding</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="text-center text-xs text-[var(--muted-foreground)] pt-2 border-t border-[var(--border)]">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[var(--primary)] font-medium hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
