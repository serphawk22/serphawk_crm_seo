"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Grid3x3,
  FileText,
  Menu,
  Settings,
  LogOut,
  Target,
  Upload,
  Bell,
  CheckSquare,
  Receipt,
  FileSignature,
  BarChart2,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import BrandMark from "./BrandMark";

const NAV_ITEMS = [
  { icon: Grid3x3, href: "/", labelKey: "navigation.home" },
  { icon: FileText, href: "/store", labelKey: "navigation.services" },
  { icon: CheckSquare, href: "/tasks", labelKey: "navigation.tasks" },
  { icon: Receipt, href: "/invoices", labelKey: "navigation.invoices" },
  { icon: FileSignature, href: "/proposals", labelKey: "navigation.proposals" },
  { icon: BarChart2, href: "/rankings", labelKey: "navigation.rankings" },
  { icon: Menu, href: "/messages", labelKey: "navigation.messages" },
  { icon: Target, href: "/milestones", labelKey: "navigation.milestones" },
  { icon: Upload, href: "/my-files", labelKey: "navigation.my_files" },
  { icon: Bell, href: "/notifications", labelKey: "navigation.notifications" },
  { icon: Settings, href: "/setup", labelKey: "common.settings" },
];

export function ClientSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useRole();
  const { brandName } = useTenantConfig();
  const { collapsed, setCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
  };

  const initial = user?.name?.charAt(0).toUpperCase() || "S";

  return (
    <>
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 72 : 220 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        className="app-sidebar fixed left-0 top-0 z-50 flex flex-col py-4 overflow-hidden h-screen border-r border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#0c0d12]/95 backdrop-blur-xl shadow-xs"
        style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)" }}
      >
        {/* Company Logo & Branding */}
        <div className={cn("flex items-center gap-2.5 pb-4 mb-2 border-b border-slate-200/80 dark:border-white/10 shrink-0", collapsed ? "justify-center px-2" : "px-3.5")}>
          <div className="shrink-0 w-8 h-8 rounded-lg border border-slate-200/90 dark:border-white/10 shadow-xs flex items-center justify-center overflow-hidden bg-white dark:bg-zinc-900">
            <BrandMark size={28} fallback={
              <div className="w-full h-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-sm">
                {initial}
              </div>
            } />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col overflow-hidden flex-1 min-w-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs leading-tight tracking-tight text-slate-900 dark:text-white truncate">{brandName}</span>
                  <button
                    onClick={toggleTheme}
                    className="p-1 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  >
                    {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                  </button>
                </div>
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mt-0.5">{t("clients.clientPortal", "Client Portal")}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Icons */}
        <nav className={cn("flex flex-col gap-1 flex-1 overflow-y-auto px-2", collapsed && "items-center px-1")}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-lg flex items-center transition-all group shrink-0 border",
                  collapsed ? "w-9 h-9 justify-center mx-auto" : "gap-2.5 px-2.5 py-1.5 min-h-[34px]",
                  isActive
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border-amber-500/25 shadow-xs"
                    : "border-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-100/70 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="client-sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-amber-500"
                  />
                )}
                <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-200")} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.14 }}
                      className={cn("text-xs truncate", isActive ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-zinc-300")}
                    >
                      {t(item.labelKey)}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* Tooltip only when collapsed */}
                {collapsed && (
                  <span
                    className="absolute left-full ml-3 px-2.5 py-1 text-xs font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md bg-slate-900 text-white dark:bg-zinc-800 border border-slate-700 z-50"
                  >
                    {t(item.labelKey)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout at bottom */}
        <div className={cn("shrink-0 pt-2.5 border-t border-slate-200/80 dark:border-white/10 mt-auto bg-slate-50/50 dark:bg-white/5", collapsed ? "px-1 flex flex-col items-center" : "px-3 pb-1")}>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white dark:bg-zinc-900/60 mb-2 shadow-xs"
              >
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs shadow-xs border border-amber-400/30">
                    {initial}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.name || t("clients.client", "Client")}</p>
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 truncate">{t("clients.client", "Client")}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {collapsed && (
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-slate-500 dark:text-zinc-400 mb-1.5 shadow-xs"
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
            </button>
          )}

          <button
            onClick={handleLogout}
            className={cn(
              "rounded-lg flex items-center transition-all group hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 text-slate-500 dark:text-zinc-400 border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20",
              collapsed ? "w-8 h-8 justify-center" : "gap-2 px-2.5 py-1.5 w-full text-xs font-semibold"
            )}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="truncate"
                >
                  {t("auth.logout", "Logout")}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.div>

      {/* Expand / Collapse toggle button */}
      <motion.button
        onClick={() => setCollapsed(!collapsed)}
        animate={{ left: collapsed ? 72 : 220 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-10 rounded-r-lg bg-amber-600 shadow-sm text-white hover:bg-amber-500 transition-colors border-y border-r border-amber-700/30"
      >
        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-300", !collapsed && "rotate-180")} />
      </motion.button>
    </>
  );
}
