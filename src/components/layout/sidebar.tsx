'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Phone,
  Building2,
  MessageSquare,
  Settings,
  Activity,
  Mic,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'AI Agent', icon: Phone },
  { href: '/business', label: 'Business', icon: Building2 },
  { href: '/logs', label: 'Conversations', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
              style={{ background: 'var(--gradient-primary)' }}>
              <Mic size={18} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--foreground)]">VoiceAI</h1>
              <p className="text-xs text-[var(--muted-foreground)]">Agent Platform</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
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

        {/* Status footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
            <span className="text-xs text-[var(--muted-foreground)]">Agent Online</span>
          </div>
        </div>
      </aside>
    </>
  );
}
