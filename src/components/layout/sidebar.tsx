"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Workflow,
  Package,
  Wallet,
  Truck,
  LogOut,
  Menu,
  X,
  Settings,
  Stethoscope,
  UserCircle,
  ClipboardClock,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/providers/AppProvider";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { canAccessUser, type AppModule } from "@/lib/permissions";
import { getUserRoles } from "@/lib/user-roles";
import { useState } from "react";
import type { UserRole } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  module: AppModule;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard, module: "dashboard" },
  { href: "/orders", label: "הזמנות", icon: ClipboardList, module: "orders" },
  { href: "/workflow", label: "מעקב ייצור", icon: Workflow, module: "workflow" },
  { href: "/my-work", label: "העבודה שלי", icon: UserCircle, module: "my-work" },
  { href: "/my-attendance", label: "הנוכחות שלי", icon: CalendarDays, module: "my-attendance" },
  { href: "/attendance-management", label: "ניהול נוכחות", icon: ClipboardClock, module: "attendance-management" },
  { href: "/inventory", label: "מלאי", icon: Package, module: "inventory" },
  { href: "/accounts", label: "כרטסות", icon: Wallet, module: "accounts" },
  { href: "/shipping", label: "אריזה ושילוח", icon: Truck, module: "shipping" },
  { href: "/portal", label: "פורטל רופא", icon: Stethoscope, module: "portal" },
  { href: "/settings", label: "הגדרות", icon: Settings, module: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!currentUser) return null;

  const filteredNav = navItems.filter((item) => canAccessUser(currentUser, item.module));

  const NavContent = () => (
    <>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-opal-gold shadow-lg shadow-opal-gold/20">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
            <path d="M12 2C8.5 2 6 4.5 6 8c0 2 1 3.5 2.5 4.5C7 13.5 5 15.5 5 19h14c0-3.5-2-5.5-3.5-6.5C17 11.5 18 10 18 8c0-3.5-2.5-6-6-6zm0 2c2.2 0 4 1.8 4 4 0 1.5-.8 2.8-2 3.5-.5.3-1 1-1 2h-2c0-1-.5-1.7-1-2C8.8 10.8 8 9.5 8 8c0-2.2 1.8-4 4-4z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-white">{LAB_INFO.name}</p>
          <p className="text-[11px] text-slate-400">Dental Laboratory</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-opal-gold text-white font-medium shadow-md shadow-opal-gold/20"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
          <p className="text-xs text-opal-gold">
            {getUserRoles(currentUser).map((r) => USER_ROLE_LABELS[r]).join(" · ")}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white lg:hidden shadow-lg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-64 bg-slate-900 flex flex-col">
            <button onClick={() => setMobileOpen(false)} className="absolute left-4 top-4 text-slate-400">
              <X className="h-5 w-5" />
            </button>
            <NavContent />
          </aside>
        </div>
      )}

      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:fixed lg:inset-y-0 lg:right-0 bg-slate-900">
        <NavContent />
      </aside>
    </>
  );
}

export function Header({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  const { currentUser, logout } = useApp();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {description && <p className="text-slate-500 mt-0.5 text-sm">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions}
        {currentUser && (
          <span className="text-xs text-slate-400 hidden sm:inline">{currentUser.name}</span>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          יציאה
        </button>
      </div>
    </header>
  );
}
