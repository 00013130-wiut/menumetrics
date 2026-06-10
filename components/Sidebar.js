'use client';

// Sidebar.js — the app's left-hand navigation.
// Shown on every signed-in page (rendered by app/(app)/layout.js). On desktop
// it's a fixed warm sidebar; on mobile it collapses to a top bar with a
// hamburger that opens a slide-in drawer. Reads the current restaurant/user from
// the shared app context and handles sign-out.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ReceiptText,
  Trash2,
  ScrollText,
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/sales', label: 'Sales', icon: ReceiptText },
  { href: '/waste', label: 'Waste', icon: Trash2 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function initials(name) {
  if (!name) return 'MM';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'MM';
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, restaurant, profile } = useApp();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const NavLinks = ({ onNavigate }) => (
    <nav className="flex flex-col gap-[3px] mt-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              'flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-sm font-medium transition-colors ' +
              (active
                ? 'bg-primary text-white'
                : 'text-soft hover:bg-[#ebe0d2] hover:text-ink')
            }
          >
            <Icon size={17} strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="flex items-center gap-[9px]">
      <span className="brand-logo">M</span>
      <span className="font-serif font-semibold text-[19px] tracking-[-0.02em]">
        MenuMetrics
      </span>
    </div>
  );

  const Foot = () => (
    <div className="mt-auto border-t border-hairline pt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-[34px] h-[34px] rounded-full bg-secondary text-white grid place-items-center font-semibold text-[13px] shrink-0">
          {initials(restaurant?.name)}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[13px] truncate">
            {restaurant?.name || 'Restaurant'}
          </div>
          <div className="text-[11.5px] text-muted truncate">
            {[restaurant?.city, profile?.role === 'platform_admin' ? 'Admin' : 'Manager']
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
      <button
        onClick={signOut}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-[9px] text-[13px] font-semibold text-soft border border-hairline bg-surface hover:bg-warm-2 transition-colors"
      >
        <LogOut size={15} /> Sign out
      </button>
      <div className="text-[11px] text-muted mt-2 truncate text-center">
        {user?.email}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-warm border-b border-hairline">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 rounded-lg hover:bg-[#ebe0d2] text-ink"
        >
          <MenuIcon size={22} />
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[236px] shrink-0 flex-col bg-warm border-r border-hairline px-[18px] py-6 sticky top-0 h-screen">
        <div className="mb-7">
          <Brand />
        </div>
        <NavLinks />
        <Foot />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[256px] flex flex-col bg-warm border-r border-hairline px-[18px] py-6 shadow-pop animate-[slidein_0.18s_ease]">
            <div className="flex items-center justify-between mb-7">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg hover:bg-[#ebe0d2] text-ink"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <Foot />
          </aside>
        </div>
      )}
    </>
  );
}
