"use client";

import Link from "next/link";
import { CalendarDays, GraduationCap, LogOut, School } from "lucide-react";
import { useRole, Role } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";

export default function InstitutionPortalShell({ children, role }: { children: React.ReactNode; role: Role }) {
  const { user, logout } = useRole();
  const { brandName } = useTenantConfig();
  const isStudent = role === "Student";
  const homeHref = isStudent ? "/learning" : "/teaching";
  const homeLabel = isStudent ? "My learning" : "Teaching schedule";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <School className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{brandName}</span>
              <span className="block text-xs text-[var(--text-secondary)]">{isStudent ? "Student portal" : "Instructor portal"}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link href={homeHref} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-[var(--background)]">
              {isStudent ? <GraduationCap className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
              <span className="hidden sm:inline">{homeLabel}</span>
            </Link>
            <span className="hidden max-w-40 truncate border-l border-[var(--border)] pl-4 text-sm text-[var(--text-secondary)] md:block">
              {user?.name || user?.email}
            </span>
            <button onClick={logout} title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40">
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}