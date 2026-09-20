'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Phone,
  Building2,
  MessageSquare,
  Settings,
  Mic,
  Database,
  Sparkles,
  LogOut,
  X,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'Live AI Agent', icon: Phone },
  { href: '/business', label: 'Business Profile', icon: Building2 },
  { href: '/knowledge', label: 'Knowledge & RAG', icon: Database },
  { href: '/logs', label: 'Call History', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, business, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-sm"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <LayoutDashboard size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-[var(--card)] border-r border-[var(--border)] z-40 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:static md:z-auto flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-500/20"
              style={{ background: 'var(--gradient-primary)' }}>
              <Mic size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-[var(--foreground)] truncate">
                {business?.business_name || 'VoiceAI'}
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] capitalize truncate">
                {business?.business_type ? business.business_type.replace('_', ' ') : 'Multi-Business SaaS'}
              </p>
            </div>
          </Link>
        </div>

        {/* Quick Launch Button */}
        <div className="px-4 pt-4">
          <Link
            href="/onboarding"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition shadow-sm"
          >
            <Sparkles size={14} /> + New Business Agent
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User / Sign-out footer */}
        <div className="p-4 border-t border-[var(--border)] space-y-2">
          {user ? (
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate text-[var(--foreground)]">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="text-slate-400 hover:text-rose-400 p-1 transition"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="block text-center py-1.5 text-xs text-[var(--primary)] hover:underline font-medium"
            >
              Sign In
            </Link>
          )}

          <div className="flex items-center gap-2 px-2 pt-1 border-t border-[var(--border)]/50">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-[var(--muted-foreground)]">Voice Engine Active</span>
          </div>
        </div>
      </aside>
    </>
  );
}
