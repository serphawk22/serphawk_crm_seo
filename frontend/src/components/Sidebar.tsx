"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  Users,
  FolderOpen,
  CheckSquare,
  CheckCircle,
  Radar,
  Mail,
  Zap,
  Globe,
  BarChart2,
  Activity,
  FileText,
  FileEdit,
  ShoppingBag,
  Settings,
  Moon,
  Sun,
  ChevronDown,
  ChevronRight,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar,
  Phone,
  Package,
  ShoppingCart,
  Truck,
  HeadphonesIcon,
  BookOpen,
  FileBarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole, Role } from "@/context/RoleContext";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useState } from "react";

interface SidebarProps {
  role: Role;
}

const NOTIFICATION_COUNT = 3;

const sidebarSections = [
  {
    heading: null,
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/", roles: ["Admin", "Employee", "Client", "Intern", "SalesManager"] },
      { name: "Notifications", icon: Bell, href: "/notifications", roles: ["Admin", "Employee", "Client"], badge: NOTIFICATION_COUNT },
    ],
  },
  {
    heading: "CRM",
    items: [
      { name: "Leads", icon: Radar, href: "/leads", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Accounts", icon: FolderOpen, href: "/accounts", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Contacts", icon: Users, href: "/contacts", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Clients", icon: CheckCircle, href: "/clients", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    heading: "ACTIVITIES",
    items: [
      { name: "Meetings", icon: Calendar, href: "/meetings", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Calls", icon: Phone, href: "/calls", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Tasks", icon: CheckSquare, href: "/tasks", roles: ["Admin", "Employee", "Intern"] },
      { name: "Completed", icon: CheckCircle, href: "/admin/completed", roles: ["Admin", "Employee"] },
    ],
  },
  {
    heading: "PROJECTS",
    items: [
      { name: "Projects", icon: FolderOpen, href: "/projects", roles: ["Admin", "Employee", "Intern"] },
      { name: "Milestones", icon: Activity, href: "/milestones", roles: ["Admin", "Employee", "Intern"] },
    ],
  },
  {
    heading: "AI AGENTS",
    items: [
      { name: "Email Agent", icon: Mail, href: "/email-agent", roles: ["Admin", "Employee"] },
      { name: "Radar Analysis", icon: Radar, href: "/admin/radar", roles: ["Admin", "Employee"] },
      { name: "Competitor Analysis", icon: BarChart2, href: "/admin/agents/competitor", roles: ["Admin", "Employee"] },
      { name: "Website Scanner", icon: Globe, href: "/admin/agents/website-scanner", roles: ["Admin", "Employee"] },
      { name: "AI Automations", icon: Zap, href: "/admin/automations", roles: ["Admin"] },
    ],
  },
  {
    heading: "INVENTORY",
    items: [
      { name: "Products", icon: Package, href: "/products", roles: ["Admin", "SalesManager"] },
      { name: "Quotes", icon: FileBarChart2, href: "/quotes", roles: ["Admin", "SalesManager"] },
      { name: "Sales Orders", icon: ShoppingCart, href: "/sales-orders", roles: ["Admin", "SalesManager"] },
      { name: "Purchase Orders", icon: Truck, href: "/purchase-orders", roles: ["Admin"] },
      { name: "Invoices", icon: FileText, href: "/invoices", roles: ["Admin", "SalesManager"] },
    ],
  },
  {
    heading: "SUPPORT",
    items: [
      { name: "Cases", icon: HeadphonesIcon, href: "/support/cases", roles: ["Admin", "Employee", "SalesManager"] },
      { name: "Solutions", icon: BookOpen, href: "/support/solutions", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    heading: "FINANCIALS",
    items: [
      { name: "Proposals", icon: FileEdit, href: "/proposals", roles: ["Admin", "SalesManager"] },
      { name: "Marketplace", icon: ShoppingBag, href: "/admin/marketplace", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    heading: "SYSTEM",
    items: [
      { name: "API Intelligence", icon: Activity, href: "/admin/api-intelligence", roles: ["Admin"] },
    ],
  },
];

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useRole();
  const { collapsed, setCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [darkToggle, setDarkToggle] = useState(theme === "dark");

  const initial = user?.name?.charAt(0).toUpperCase() || "B";
  const userName = user?.name || "Brajesh";

  const handleDarkToggle = () => {
    setDarkToggle(!darkToggle);
    toggleTheme();
  };

  return (
    <>
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 72 : 280 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          background: "var(--sidebar-bg)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.06)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* ── TOP BRANDING ── */}
        <div className={cn("shrink-0 flex items-center py-4", collapsed ? "justify-center px-2" : "px-4 gap-3")}>
          {/* Logo */}
          <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" fill="white" fillOpacity="0.9" />
              <path d="M12 7L7 10V14L12 17L17 14V10L12 7Z" fill="white" fillOpacity="0.5" />
              <circle cx="12" cy="12" r="2" fill="white" />
            </svg>
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <span className="block font-bold text-[15px] leading-tight tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                  SERP Hawk
                </span>
                <span className="block text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                  Corporate HQ
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── SEARCH BAR ── */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="shrink-0 px-3 pb-3"
            >
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-secondary)" }} />
                <input
                  type="text"
                  placeholder="Search anything..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder-gray-400"
                  style={{ color: "var(--text-primary)" }}
                />
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border shrink-0" style={{ color: "var(--text-secondary)", borderColor: "var(--border)", background: "var(--background)" }}>
                  ⌘K
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MAIN NAVIGATION ── */}
        <nav
          className={cn("flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 pb-2", collapsed ? "px-2" : "px-3")}
          style={{ scrollbarWidth: "none" }}
        >
          {sidebarSections.map((section, sIdx) => {
            const visibleItems = section.items.filter((item) => item.roles.includes(role));
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className={cn("flex flex-col", sIdx > 0 ? "mt-3" : "mt-0")}>
                <AnimatePresence>
                  {!collapsed && section.heading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="px-3 pt-1 pb-1.5 text-[10px] font-bold tracking-[0.12em] uppercase"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {section.heading}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col gap-0.5">
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "relative group flex items-center gap-3 rounded-xl transition-all duration-150 select-none shrink-0",
                          collapsed ? "w-11 h-11 justify-center mx-auto" : "h-[42px] px-3",
                          !isActive && "hover:bg-gray-50"
                        )}
                        style={isActive ? { background: "rgba(37,99,235,0.08)", color: "#2563eb" } : { color: "var(--sidebar-text)" }}
                      >
                        {isActive && !collapsed && (
                          <motion.span layoutId="sidebar-active-indicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-blue-600" />
                        )}
                        <item.icon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", isActive ? "text-blue-600" : "group-hover:text-blue-500")} />
                        <AnimatePresence>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -6 }}
                              transition={{ duration: 0.14 }}
                              className={cn("flex-1 text-[13.5px] font-medium truncate", isActive && "font-semibold")}
                            >
                              {item.name}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        {item.badge && item.badge > 0 && !collapsed && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {item.badge}
                          </span>
                        )}
                        {!collapsed && !item.badge && (
                          <ChevronRight className={cn("shrink-0 w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity", isActive && "opacity-40")} />
                        )}
                        {collapsed && (
                          <span
                            className="absolute left-full ml-3 px-2.5 py-1.5 text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none shadow-lg z-[100] whitespace-nowrap transition-all duration-150"
                            style={{ background: "var(--text-primary)", color: "var(--background)" }}
                          >
                            {item.name}{item.badge ? ` (${item.badge})` : ""}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── BOTTOM SECTION ── */}
        <div className="shrink-0" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <div className={cn("flex flex-col gap-0.5 py-3", collapsed ? "px-2" : "px-3")}>
            {/* Settings */}
            <Link
              href="/admin/settings"
              className={cn("group flex items-center gap-3 rounded-xl transition-all duration-150 hover:bg-gray-50", collapsed ? "w-11 h-11 justify-center mx-auto" : "h-[42px] px-3")}
              style={{ color: "var(--sidebar-text)" }}
            >
              <Settings className="w-[18px] h-[18px] shrink-0 group-hover:text-blue-500 transition-colors" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-[13.5px] font-medium">
                    Settings
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && <ChevronRight className="shrink-0 w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
              {collapsed && (
                <span className="absolute left-full ml-3 px-2.5 py-1.5 text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none shadow-lg z-[100] whitespace-nowrap" style={{ background: "var(--text-primary)", color: "var(--background)" }}>
                  Settings
                </span>
              )}
            </Link>

            {/* Dark Mode Toggle */}
            <div
              className={cn("group flex items-center gap-3 rounded-xl transition-all duration-150 cursor-pointer hover:bg-gray-50", collapsed ? "w-11 h-11 justify-center mx-auto relative" : "h-[42px] px-3")}
              style={{ color: "var(--sidebar-text)" }}
              onClick={handleDarkToggle}
            >
              {theme === "dark" ? <Moon className="w-[18px] h-[18px] shrink-0 group-hover:text-blue-500 transition-colors" /> : <Sun className="w-[18px] h-[18px] shrink-0 group-hover:text-blue-500 transition-colors" />}
              <AnimatePresence>
                {!collapsed && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-between">
                    <span className="text-[13.5px] font-medium">Dark Mode</span>
                    <div className={cn("relative w-9 h-5 rounded-full transition-all duration-300 shrink-0", darkToggle ? "bg-blue-600" : "bg-gray-300")}>
                      <div className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300", darkToggle ? "left-[18px]" : "left-0.5")} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {collapsed && (
                <span className="absolute left-full ml-3 px-2.5 py-1.5 text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none shadow-lg z-[100] whitespace-nowrap" style={{ background: "var(--text-primary)", color: "var(--background)" }}>
                  Dark Mode
                </span>
              )}
            </div>
          </div>

          {/* User Profile Card */}
          <div className={cn("pb-4", collapsed ? "px-2" : "px-3")}>
            <AnimatePresence>
              {!collapsed ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-gray-50 group"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "var(--text-primary)" }}>{userName}</p>
                    <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>Admin</p>
                  </div>
                  <ChevronDown className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-secondary)" }} />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-11 h-11 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm cursor-pointer shadow-sm"
                  title={`${userName} — Admin`}
                >
                  {initial}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ── FLOATING COLLAPSE / EXPAND TOGGLE (no overlap, always visible) ── */}
      <motion.button
        animate={{ left: collapsed ? 72 : 280 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        onClick={() => setCollapsed(!collapsed)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="fixed top-[52px] z-[60] -translate-x-1/2 flex items-center justify-center w-7 h-7 rounded-full border-2 shadow-md transition-colors"
        style={{
          background: "var(--sidebar-bg)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
        }}
      >
        {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
      </motion.button>
    </>
  );
}
