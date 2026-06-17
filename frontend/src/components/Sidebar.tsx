"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Bot,
  UserCheck,
  Activity,
  LogOut,
  Radar,
  StickyNote,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole, Role } from "@/context/RoleContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { logout, user } = useRole();
  const { t, language } = useLanguage();
  const { collapsed, setCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const allItems = [
    { name: language === 'es' ? 'Tablero' : 'Dashboard', icon: LayoutDashboard, href: '/', roles: ['Admin', 'Employee', 'Client', 'Intern'] },
    { name: language === 'es' ? 'Proyectos' : 'Projects', icon: StickyNote, href: '/projects', roles: ['Admin', 'Employee', 'Intern'] },
    { name: language === 'es' ? 'Clientes' : 'Clients', icon: Users, href: '/clients', roles: ['Admin', 'Employee', 'SalesManager'] },
    { name: language === 'es' ? 'Gerente de Ventas' : 'Sales Manager', icon: UserCheck, href: '/sales-manager', roles: ['Admin', 'Employee', 'SalesManager'] },
    { name: language === 'es' ? 'Pasantes' : 'Interns', icon: Activity, href: '/interns', roles: ['Admin', 'Employee'] },
    { name: language === 'es' ? 'Equipo de Ventas' : 'Sales Team', icon: UserCheck, href: '/admin/sales-team', roles: ['Admin'] },
    { name: language === 'es' ? 'Agente de Email' : 'Email Agent', icon: Bot, href: '/email-agent', roles: ['Admin', 'Employee'] },
    { name: language === 'es' ? 'Radar de Competidores' : 'Radar Analysis', icon: Radar, href: '/admin/radar', roles: ['Admin', 'Employee'] },
    { name: language === 'es' ? 'Inteligencia de API' : 'API Intelligence', icon: Activity, href: '/admin/api-intelligence', roles: ['Admin'] },
  ];

  const filteredItems = allItems.filter(item => item.roles.includes(role));

  const initial = user?.name?.charAt(0).toUpperCase() || "A";

  return (
    <>
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col py-6 overflow-hidden shadow-sm"
        style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        {/* Workspace Selector */}
        <div className={cn("flex items-center gap-3 mb-8 shrink-0", collapsed ? "justify-center px-0" : "px-5")}>
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col overflow-hidden"
              >
                <span className="font-semibold text-sm leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>SERP Hawk</span>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Corporate HQ</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Links */}
        <nav className={cn("flex flex-col gap-1 flex-1 overflow-y-auto", collapsed ? "items-center px-0" : "px-4")}>
          {filteredItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-md flex items-center transition-colors group shrink-0",
                  collapsed ? "w-10 h-10 justify-center" : "gap-3 px-3 py-2",
                  isActive ? "font-semibold" : "font-medium"
                )}
                style={isActive
                  ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-text)" }
                  : { color: "var(--sidebar-text)" }
                }
              >
                <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", !isActive && "group-hover:text-[var(--text-primary)]")} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.15 }}
                      className="text-[14px] truncate"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {/* Tooltip */}
                {collapsed && (
                  <span className="absolute left-full ml-4 px-2 py-1 text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md z-[100]"
                    style={{ background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section (Theme, Profile, Logout) */}
        <div className={cn("shrink-0 pt-4 flex flex-col gap-2", collapsed ? "px-0 items-center" : "px-4")} style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className={cn("relative rounded-md flex items-center transition-colors group", collapsed ? "w-10 h-10 justify-center" : "gap-3 px-3 py-2 w-full")}
            style={{ color: "var(--sidebar-text)" }}
          >
            {theme === "dark" ? <Moon className="w-5 h-5 shrink-0" /> : theme === "light" ? <Sun className="w-5 h-5 shrink-0" /> : <Monitor className="w-5 h-5 shrink-0" />}
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[14px] font-medium group-hover:text-[var(--text-primary)] transition-colors"
                >
                  {theme === "dark" ? "Dark Mode" : theme === "light" ? "Light Mode" : "System Theme"}
                </motion.span>
              )}
            </AnimatePresence>
            {collapsed && (
              <span className="absolute left-full ml-4 px-2 py-1 text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md z-[100]"
                style={{ background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                Theme
              </span>
            )}
          </button>

          {/* User Profile */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="flex items-center gap-3 px-3 py-2 rounded-md border mt-2"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{user?.name || "Admin"}</p>
                  <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>{role}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Logout */}
          <button
            onClick={logout}
            className={cn("relative rounded-md flex items-center transition-colors group hover:text-red-500", collapsed ? "w-10 h-10 justify-center" : "gap-3 px-3 py-2 w-full")}
            style={{ color: "var(--sidebar-text)" }}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[14px] font-medium"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
            {collapsed && (
              <span className="absolute left-full ml-4 px-2 py-1 text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md z-[100]"
                style={{ background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                Logout
              </span>
            )}
          </button>

        </div>
      </motion.div>

      {/* Expand / Collapse Button */}
      <motion.button
        onClick={() => setCollapsed(!collapsed)}
        animate={{ left: collapsed ? 72 : 260 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.95 }}
        className="fixed top-6 -translate-x-1/2 z-[60] flex items-center justify-center w-6 h-6 rounded-full border shadow-sm transition-colors"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-300", !collapsed && "rotate-180")} />
      </motion.button>
    </>
  );
}
