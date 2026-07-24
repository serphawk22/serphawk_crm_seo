"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Bell, Users, FolderOpen, CheckSquare, CheckCircle, Radar, Mail,
  Zap, LayoutList, Globe, BarChart2, Activity, FileText, FileEdit, ShoppingBag, Settings,
  Moon, Sun, ChevronDown, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Calendar,
  Phone, Package, ShoppingCart, Truck, HeadphonesIcon, BookOpen, FileBarChart2, Edit2, GripVertical, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole, Role } from "@/context/RoleContext";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/config";
import { useTranslation } from "react-i18next";
import { useLanguage, Language } from "@/context/LanguageContext";

// --- DND Kit Imports ---
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Icon mapping for dynamically loaded sections
const iconMap: Record<string, any> = {
  LayoutDashboard, Bell, Users, FolderOpen, CheckSquare, CheckCircle, Radar, Mail,
  Zap, LayoutList, Globe, BarChart2, Activity, FileText, FileEdit, ShoppingBag, Settings,
  Moon, Sun, ChevronDown, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Calendar,
  Phone, Package, ShoppingCart, Truck, HeadphonesIcon, BookOpen, FileBarChart2
};

interface SidebarProps {
  role: Role;
}

const NOTIFICATION_COUNT = 3;

const defaultSidebarSections = [
  {
    id: "section-main",
    heading: null,
    items: [
      { id: "item-dashboard", name: "Dashboard", icon: "LayoutDashboard", href: "/", roles: ["Admin", "Employee", "Client", "Intern", "SalesManager"] },
      { id: "item-notifications", name: "Notifications", icon: "Bell", href: "/notifications", roles: ["Admin", "Employee", "Client"], badge: NOTIFICATION_COUNT },
      { id: "item-work-queue", name: "My Work Queue", icon: "LayoutList", href: "/work-queue", roles: ["Admin", "Employee"] },
    ],
  },
  {
    id: "section-crm",
    heading: "CRM",
    items: [
      { id: "item-leads", name: "Leads", icon: "Radar", href: "/leads", roles: ["Admin", "Employee", "SalesManager"] },
      { id: "item-contacts", name: "Contacts", icon: "Users", href: "/contacts", roles: ["Admin", "Employee", "SalesManager"] },
      { id: "item-clients", name: "Clients", icon: "CheckCircle", href: "/clients", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    id: "section-activities",
    heading: "ACTIVITIES",
    items: [
      { id: "item-meetings", name: "Meetings", icon: "Calendar", href: "/meetings", roles: ["Admin", "Employee", "SalesManager"] },
      { id: "item-calls", name: "Calls", icon: "Phone", href: "/calls", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    id: "section-projects",
    heading: "PROJECTS",
    items: [
      { id: "item-projects", name: "Projects", icon: "FolderOpen", href: "/projects", roles: ["Admin", "Employee", "Intern"] },
      { id: "item-milestones", name: "Milestones", icon: "Activity", href: "/milestones", roles: ["Admin", "Employee", "Intern"] },
    ],
  },
  {
    id: "section-ai-agents",
    heading: "AI AGENTS",
    items: [
      { id: "item-email-agent", name: "Email Agent", icon: "Mail", href: "/email-agent", roles: ["Admin", "Employee"] },
      { id: "item-radar", name: "Radar Analysis", icon: "Radar", href: "/admin/radar", roles: ["Admin", "Employee"] },
      { id: "item-competitor", name: "Competitor Analysis", icon: "BarChart2", href: "/admin/agents/competitor", roles: ["Admin", "Employee"] },
      { id: "item-website-scanner", name: "Website Scanner", icon: "Globe", href: "/admin/agents/website-scanner", roles: ["Admin", "Employee"] },
    ],
  },
  {
    id: "section-inventory",
    heading: "INVENTORY",
    items: [
      { id: "item-products", name: "Products", icon: "Package", href: "/products", roles: ["Admin", "SalesManager"] },
      { id: "item-orders", name: "Orders", icon: "ShoppingCart", href: "/orders", roles: ["Admin", "SalesManager"] },
      { id: "item-billing", name: "Billing", icon: "FileText", href: "/billing", roles: ["Admin", "SalesManager"] },
    ],
  },
  {
    id: "section-support",
    heading: "SUPPORT",
    items: [
      { id: "item-cases", name: "Cases", icon: "HeadphonesIcon", href: "/support/cases", roles: ["Admin", "Employee", "SalesManager"] },
      { id: "item-solutions", name: "Solutions", icon: "BookOpen", href: "/support/solutions", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    id: "section-financials",
    heading: "FINANCIALS",
    items: [
      { id: "item-proposals", name: "Proposals", icon: "FileEdit", href: "/proposals", roles: ["Admin", "SalesManager"] },
      { id: "item-marketplace", name: "Marketplace", icon: "ShoppingBag", href: "/admin/marketplace", roles: ["Admin", "Employee", "SalesManager"] },
    ],
  },
  {
    id: "section-system",
    heading: "SYSTEM",
    items: [
      { id: "item-api-intelligence", name: "API Intelligence", icon: "Activity", href: "/admin/api-intelligence", roles: ["Admin"] },
    ],
  },
];

// --- Sortable Section Component ---
function SortableSection({ section, role, pathname, collapsed, isEditMode, onRenameSection, unreadCount }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as any,
    zIndex: isDragging ? 10 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.heading || "");

  const handleSave = () => {
    onRenameSection(section.id, editValue);
    setIsEditing(false);
  };

  const visibleItems = section.items.filter((item: any) => item.roles.includes(role));
  if (visibleItems.length === 0) return null;

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col mt-3")}>
      <AnimatePresence>
        {!collapsed && section.heading !== null && (
          <div className="flex items-center group px-3 pt-1 pb-1.5 gap-2">
            {isEditMode && (
              <div {...attributes} {...listeners} className="cursor-grab hover:bg-slate-200 dark:hover:bg-slate-700 p-0.5 rounded">
                <GripVertical className="w-3 h-3 text-slate-400" />
              </div>
            )}
            
            {isEditing && isEditMode ? (
              <div className="flex items-center gap-1 flex-1">
                <input 
                  type="text" 
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-transparent text-[10px] font-bold tracking-[0.12em] uppercase text-slate-600 dark:text-slate-300 outline-none w-full border-b border-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <Check onClick={handleSave} className="w-3 h-3 text-green-500 cursor-pointer" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 text-[10px] font-bold tracking-[0.12em] uppercase flex justify-between items-center"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>{section.heading}</span>
                {isEditMode && (
                  <Edit2 onClick={() => setIsEditing(true)} className="w-3 h-3 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" />
                )}
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-0.5">
        {visibleItems.map((item: any) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const IconComp = iconMap[item.icon] || LayoutDashboard;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative group flex items-center gap-3 rounded-xl transition-all duration-150 select-none shrink-0",
                collapsed ? "w-11 h-11 justify-center mx-auto" : "h-[42px] px-3",
                !isActive && "hover:bg-gray-50 dark:hover:bg-slate-800/50"
              )}
              style={isActive ? { background: "rgba(37,99,235,0.08)", color: "#2563eb" } : { color: "var(--sidebar-text)" }}
            >
              {isActive && !collapsed && (
                <motion.span layoutId="sidebar-active-indicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-blue-600" />
              )}
              <IconComp className={cn("w-[18px] h-[18px] shrink-0 transition-colors", isActive ? "text-blue-600" : "group-hover:text-blue-500")} />
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
              {(item.id === "item-notifications" ? unreadCount : item.badge) > 0 && !collapsed && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {item.id === "item-notifications" ? unreadCount : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useRole();
  const { collapsed, setCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [darkToggle, setDarkToggle] = useState(theme === "dark");
  
  const [sections, setSections] = useState<any[]>(defaultSidebarSections);
  const [isEditMode, setIsEditMode] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const initial = user?.name?.charAt(0).toUpperCase() || "B";
  const userName = user?.name || "Brajesh";

  useEffect(() => {
    fetchSidebarPrefs();
    
    if (!user?.id) return;
    const fetchNotifs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/${user.id}?unread_only=true`);
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const fetchSidebarPrefs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/me/sidebar-preferences`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.sidebar_preferences?.sections) {
          setSections(data.sidebar_preferences.sections);
        }
      }
    } catch (e) {
      console.error("Failed to load sidebar prefs", e);
    }
  };

  const saveSidebarPrefs = async (newSections: any[]) => {
    try {
      await fetch(`${API_BASE_URL}/users/me/sidebar-preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebar_preferences: { sections: newSections } }),
      });
    } catch (e) {
      console.error("Failed to save sidebar prefs", e);
    }
  };

  const handleDarkToggle = () => {
    setDarkToggle(!darkToggle);
    toggleTheme();
  };

  const handleRenameSection = (sectionId: string, newName: string) => {
    const updated = sections.map(sec => sec.id === sectionId ? { ...sec, heading: newName } : sec);
    setSections(updated);
    saveSidebarPrefs(updated);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = sections.findIndex(sec => sec.id === active.id);
      const newIndex = sections.findIndex(sec => sec.id === over.id);
      const updated = arrayMove(sections, oldIndex, newIndex);
      setSections(updated);
      saveSidebarPrefs(updated);
    }
  };

  // ── Language Toggle ──
  const { i18n } = useTranslation();
  const { setLanguage } = useLanguage();
  const [activeLang, setActiveLang] = useState<"en" | "es">("en");

  const switchLanguage = useCallback((lang: "en" | "es") => {
    i18n.changeLanguage(lang);
    localStorage.setItem("crm-language", lang);
    setLanguage(lang as Language);
    setActiveLang(lang);

    if (lang === "en") {
      // Set flag BEFORE reload — sync script in <head> reads this and adds
      // 'notranslate' to <html> BEFORE GT loads, so GT never retranslates.
      sessionStorage.setItem("crm_gt_restore_en", "1");
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}`;
      window.location.reload();
      return;
    }

    // Switching TO Spanish:
    // Remove notranslate so GT is allowed to translate the page.
    document.documentElement.classList.remove("notranslate");
    document.documentElement.removeAttribute("translate");

    const triggerGT = (attempts = 0) => {
      const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
      if (select) {
        select.value = lang;
        select.dispatchEvent(new Event("change"));
      } else if (attempts < 25) {
        setTimeout(() => triggerGT(attempts + 1), 100);
      }
    };
    triggerGT();
  }, [i18n, setLanguage]);

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
                className="flex-1 min-w-0 overflow-hidden flex items-center justify-between"
              >
                <div>
                  <span className="block font-bold text-[15px] leading-tight tracking-tight truncate" style={{ color: "var(--text-primary)" }}>SERP Hawk</span>
                  <span className="block text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>Corporate HQ</span>
                </div>
                <button 
                  onClick={() => setIsEditMode(!isEditMode)} 
                  className={cn("p-1.5 rounded-lg transition-colors", isEditMode ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800")}
                  title="Customize Sidebar"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── LANGUAGE TOGGLE (top-left, below branding) ── */}
        <div className={cn("shrink-0 pb-3", collapsed ? "flex justify-center px-2" : "px-3")}>
          {collapsed ? (
            // Collapsed: single flag, click cycles EN ↔ ES
            <button
              onClick={() => switchLanguage(activeLang === "en" ? "es" : "en")}
              title={activeLang === "en" ? "Switch to Español" : "Switch to English"}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:bg-white/10 transition-all"
            >
              {activeLang === "en" ? "🇺🇸" : "🇪🇸"}
            </button>
          ) : (
            // Expanded: full pill toggle
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-xl border"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <button
                onClick={() => switchLanguage("en")}
                title="Switch to English"
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all duration-200",
                  activeLang === "en" ? "bg-white shadow-sm" : "hover:opacity-70"
                )}
                style={activeLang === "en" ? { color: "var(--accent)" } : { color: "var(--text-secondary)" }}
              >
                <span className="text-[14px] leading-none">🇺🇸</span>
                <span>EN</span>
              </button>

              <button
                onClick={() => switchLanguage("es")}
                title="Cambiar a Español"
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all duration-200",
                  activeLang === "es" ? "bg-white shadow-sm" : "hover:opacity-70"
                )}
                style={activeLang === "es" ? { color: "var(--accent)" } : { color: "var(--text-secondary)" }}
              >
                <span className="text-[14px] leading-none">🇪🇸</span>
                <span>ES</span>
              </button>
            </div>
          )}
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
        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 pb-2", collapsed ? "px-2" : "px-3")} style={{ scrollbarWidth: "none" }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => (
                <SortableSection 
                  key={section.id} 
                  section={section} 
                  unreadCount={unreadCount}
                  role={role} 
                  pathname={pathname} 
                  collapsed={collapsed} 
                  isEditMode={isEditMode}
                  onRenameSection={handleRenameSection}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        {/* ── BOTTOM SECTION ── */}
        <div className="shrink-0" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <div className={cn("flex flex-col gap-0.5 py-3", collapsed ? "px-2" : "px-3")}>
            <Link
              href="/admin/settings"
              className={cn("group flex items-center gap-3 rounded-xl transition-all duration-150 hover:bg-gray-50 dark:hover:bg-slate-800/50", collapsed ? "w-11 h-11 justify-center mx-auto" : "h-[42px] px-3")}
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
            </Link>

            <div
              className={cn("group flex items-center gap-3 rounded-xl transition-all duration-150 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50", collapsed ? "w-11 h-11 justify-center mx-auto relative" : "h-[42px] px-3")}
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
            </div>
          </div>

          <div className={cn("pb-4", collapsed ? "px-2" : "px-3")}>
            <AnimatePresence>
              {!collapsed ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-slate-800/50 group"
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
