"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Bell, Users, FolderOpen, CheckSquare, CheckCircle, Radar, Mail,
  Zap, LayoutList, Globe, BarChart2, Activity, FileText, FileEdit, ShoppingBag, Settings,
  Moon, Sun, ChevronDown, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Calendar, X,
  Phone, Package, ShoppingCart, Truck, HeadphonesIcon, BookOpen, FileBarChart2, Briefcase, Edit2, GripVertical, Check,
  Cloud, Trophy, Star, Inbox, PhoneCall, CalendarClock, Building2, TrendingUp, IndianRupee, GraduationCap, Lightbulb, LogOut
} from "lucide-react";
import { createVisiblePoll } from "@/lib/visiblePoll";
import { cn } from "@/lib/utils";
import { useRole, Role } from "@/context/RoleContext";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useState, useEffect, useCallback, useRef } from "react";
import { mergeSidebarSections, sidebarPathMatches } from "@/lib/sidebarPreferences";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useTenantConfig } from "@/context/TenantConfigContext";
import { isPlatformManagementPage } from "@/lib/moduleRoutes";

// --- DND Kit Imports ---
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import type { LucideIcon } from "lucide-react";
import BrandMark from "./BrandMark";
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Bell, Users, FolderOpen, CheckSquare, CheckCircle, Radar, Mail,
  Zap, LayoutList, Globe, BarChart2, Activity, FileText, FileEdit, ShoppingBag, Settings,
  Moon, Sun, ChevronDown, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Calendar, X,
  Phone, Package, ShoppingCart, Truck, HeadphonesIcon, BookOpen, FileBarChart2, Briefcase, Cloud, Trophy, Star, Inbox, PhoneCall, CalendarClock, Building2, TrendingUp, IndianRupee, GraduationCap, Lightbulb
};

// Roles that can open /inbox (routers/inbox.py enforces the same list server-side).
const INBOX_ROLES = ["Admin", "SalesManager", "Employee", "Demo", "SuperAdmin"];

// Sidebar item -> feature (module) a tenant can switch off. Items not listed are always shown.
const ITEM_FEATURE: Record<string, string> = {
  "item-dashboard": "dashboard",
  "item-dashboard-b2c": "dashboard_b2c",
  "item-admissions": "institute",
  "item-work-queue": "work_queue", "item-inbox": "inbox", "item-followups": "followups",
  "item-leads": "leads", "item-contacts": "contacts", "item-clients": "clients",
  "item-projects": "projects", "item-task-sheet": "task_sheet", "item-reports": "reports",
  "item-meetings": "meetings", "item-calls": "calls", "item-teams": "teams", "item-leaderboard": "leaderboard",
  "item-email-agent": "email_agent", "item-voice-agent": "voice_agent",
  "item-inventory": "inventory", "item-orders": "inventory", "item-products": "products",
  "item-billing": "billing", "item-invoices": "invoices", "item-proposals": "proposals", "item-marketplace": "marketplace",
  "item-cases": "cases", "item-solutions": "support", "item-support-sh": "support_sh",
  "item-import": "import_data", "item-api-intelligence": "api_intelligence", "item-demo-accounts": "demo_accounts",
};

// Add-on modules (off unless the tenant has them): shown only once the tenant config says they are on.
const ITEM_ADDON: Record<string, string> = {
  "item-support-sh": "support_sh",
  "item-command-center": "command_center", "item-revenue": "finance_suite", "item-business-costs": "finance_suite",
  "item-lead-sources": "lead_sources", "item-lead-source-analytics": "lead_source_analytics", "item-ownership": "ownership",
  "item-dropped-clients": "dropped_clients",
  "item-students": "institute", "item-courses": "institute", "item-batches": "institute", "item-instructors": "institute",
  "item-enrollments": "institute", "item-schedule": "institute", "item-institute-analytics": "institute",
};

// Live count shown next to a sidebar item, if any.
function badgeCount(item: SidebarItem, unreadCount: number, inboxUnread: number): number {
  return item.id === "item-notifications" ? unreadCount : item.id === "item-inbox" ? inboxUnread : item.badge || 0;
}

interface SidebarItem {
  id: string;
  name: string;
  icon: string;
  href: string;
  roles: Role[];
  badge?: number;
}

interface SidebarSection {
  id: string;
  heading: string | null;
  items: SidebarItem[];
}

interface SidebarProps {
  role: Role;
}

const defaultSidebarSections: SidebarSection[] = [
  {
    id: "section-home",
    heading: null,
    items: [
      { id: "item-dashboard", name: "Command Center", icon: "LayoutDashboard", href: "/legacy-command-center", roles: ["Admin", "Employee", "Client", "Intern", "SalesManager", "Demo"] },
      { id: "item-dashboard-b2c", name: "Dashboard", icon: "LayoutDashboard", href: "/dashboard-b2c", roles: ["Admin", "Employee", "SalesManager", "Sales", "Demo"] },
      { id: "item-work-queue", name: "My Work Queue", icon: "LayoutList", href: "/work-queue", roles: ["Admin", "Demo", "SalesManager", "Employee", "ProjectMember", "Intern", "Developer"] },
      { id: "item-notifications", name: "Notifications", icon: "Bell", href: "/notifications", roles: ["Admin", "Demo", "SalesManager", "Employee"] },
      { id: "item-inbox", name: "Inbox", icon: "Inbox", href: "/inbox", roles: ["Admin", "Demo", "SalesManager", "Employee"] },
      { id: "item-followups", name: "Follow-ups", icon: "CalendarClock", href: "/followups", roles: ["Admin", "Demo", "SalesManager", "Employee"] },
    ],
  },
  {
    id: "section-crm",
    heading: "CRM",
    items: [
      { id: "item-leads", name: "Leads", icon: "Radar", href: "/leads", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-contacts", name: "Contacts", icon: "Users", href: "/contacts", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-clients", name: "Clients", icon: "CheckCircle", href: "/clients", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-projects",
    heading: "PROJECTS & ACTIVITIES",
    items: [
      { id: "item-projects", name: "Projects", icon: "FolderOpen", href: "/projects", roles: ["Admin", "Employee", "Intern", "ProjectMember", "Demo"] },
      { id: "item-task-sheet", name: "Task Sheet", icon: "FileBarChart2", href: "/task-sheet", roles: ["Admin", "Employee", "SalesManager", "ProjectMember", "Intern", "Demo"] },
      { id: "item-reports", name: "Reports", icon: "BarChart2", href: "/reports", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-meetings", name: "Meetings", icon: "Calendar", href: "/meetings", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-calls", name: "Calls", icon: "Phone", href: "/calls", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-teams",
    heading: "TEAMS",
    items: [
      { id: "item-teams", name: "Team Directory", icon: "Users", href: "/teams", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-leaderboard", name: "Leaderboard", icon: "Trophy", href: "/admin/leaderboard", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-institute",
    heading: "INSTITUTE",
    items: [
      { id: "item-admissions", name: "Admissions", icon: "GraduationCap", href: "/admissions", roles: ["Admin", "Admissions", "Demo"] },
      { id: "item-students", name: "Students", icon: "GraduationCap", href: "/students", roles: ["Admin", "Employee", "SalesManager", "Sales", "Demo"] },
      { id: "item-courses", name: "Courses", icon: "BookOpen", href: "/courses", roles: ["Admin", "Employee", "SalesManager", "Sales", "Demo"] },
      { id: "item-batches", name: "Batches", icon: "Users", href: "/batches", roles: ["Admin", "Employee", "Instructor", "SalesManager", "Demo"] },
      { id: "item-instructors", name: "Instructors", icon: "Users", href: "/instructors", roles: ["Admin", "Employee", "Demo"] },
      { id: "item-enrollments", name: "Enrollments & Fees", icon: "FileText", href: "/enrollments", roles: ["Admin", "Employee", "SalesManager", "Demo"] },
      { id: "item-schedule", name: "Important Dates", icon: "CalendarClock", href: "/schedule", roles: ["Admin", "Employee", "SalesManager", "Sales", "Demo"] },
      { id: "item-institute-analytics", name: "My Analytics", icon: "BarChart2", href: "/institute-analytics", roles: ["Admin", "Demo"] },
    ],
  },
  {
    id: "section-business-suite",
    heading: "BUSINESS SUITE",
    items: [
      { id: "item-command-center", name: "Dashboard", icon: "LayoutDashboard", href: "/command-center", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-revenue", name: "Revenue Dashboard", icon: "TrendingUp", href: "/revenue", roles: ["Admin"] },
      { id: "item-business-costs", name: "Business Costs", icon: "IndianRupee", href: "/business-costs", roles: ["Admin"] },
      { id: "item-lead-sources", name: "Lead Sources", icon: "Zap", href: "/lead-sources", roles: ["Admin", "SalesManager", "Employee", "Sales"] },
      { id: "item-lead-source-analytics", name: "Lead Source Analytics", icon: "BarChart2", href: "/lead-source-analytics", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-ownership", name: "Ownership", icon: "Users", href: "/ownership", roles: ["Admin"] },
      { id: "item-dropped-clients", name: "Dropped Clients", icon: "Users", href: "/dropped-clients", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-ai-agents",
    heading: "AI AGENTS",
    items: [
      { id: "item-email-agent", name: "Email Agent", icon: "Mail", href: "/email-agent", roles: ["Admin", "Demo"] },
      { id: "item-voice-agent", name: "AI Voice Caller", icon: "PhoneCall", href: "/voice-agent", roles: ["Admin", "SalesManager", "Employee", "Demo"] },
    ],
  },
  {
    id: "section-inventory",
    heading: "INVENTORY",
    items: [
      { id: "item-inventory", name: "Inventory", icon: "Package", href: "/inventory", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-products", name: "Products Catalog", icon: "Package", href: "/products", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-orders", name: "Orders", icon: "ShoppingCart", href: "/orders", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-billing", name: "Billing", icon: "FileText", href: "/billing", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-invoices", name: "Invoices", icon: "FileText", href: "/invoices", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-proposals", name: "Proposals", icon: "FileEdit", href: "/proposals", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-marketplace", name: "Marketplace", icon: "ShoppingBag", href: "/admin/marketplace", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-support",
    heading: "SUPPORT",
    items: [
      { id: "item-support-sh", name: "Support @SH", icon: "HeadphonesIcon", href: "/support/helpdesk", roles: ["Admin", "SalesManager", "Sales", "Employee", "ProjectMember", "Demo"] },
      { id: "item-cases", name: "Cases", icon: "HeadphonesIcon", href: "/support/cases", roles: ["Admin", "SalesManager", "Employee", "ProjectMember", "Demo"] },
      { id: "item-solutions", name: "Solutions", icon: "BookOpen", href: "/support/solutions", roles: ["Admin", "SalesManager", "Demo"] },
    ],
  },
  {
    id: "section-system",
    heading: "SYSTEM",
    items: [
      { id: "item-import", name: "Import Data", icon: "FileBarChart2", href: "/import", roles: ["Admin", "SalesManager", "Demo"] },
      { id: "item-api-intelligence", name: "API Intelligence", icon: "Activity", href: "/admin/api-intelligence", roles: ["Admin", "SuperAdmin"] },
      { id: "item-demo-accounts", name: "Demo Account Data", icon: "Users", href: "/admin/telemetry", roles: ["Admin", "SuperAdmin"] },
      { id: "item-client-management", name: "Client Management", icon: "Building2", href: "/superadmin/clients", roles: ["SuperAdmin"] },
      { id: "item-client-requests", name: "Client Requests", icon: "Inbox", href: "/superadmin/requests", roles: ["SuperAdmin"] },
      { id: "item-branding", name: "Profile & Settings", icon: "Settings", href: "/settings", roles: ["Admin", "SuperAdmin", "SalesManager", "Sales", "Employee", "Demo", "Intern", "ProjectMember", "Developer"] },
      { id: "item-customization-requests", name: "Customization Requests", icon: "Lightbulb", href: "/requests", roles: ["Admin"] },
    ],
  },
];

// --- Sortable Section Component ---
const DEFAULT_HEADINGS = ["CRM", "PROJECTS & ACTIVITIES", "TEAMS", "INSTITUTE", "BUSINESS SUITE", "AI AGENTS", "INVENTORY", "SUPPORT", "SYSTEM"];
const ITEM_KEY_OVERRIDES: Record<string, string> = {
  "item-teams": "team_directory",
  "item-products": "catalog",
  "item-import": "import_data",
};
function sidebarItemKey(id: string): string {
  return ITEM_KEY_OVERRIDES[id] || String(id).replace("item-", "").replace(/-/g, "_");
}
function sidebarSectionKey(id: string): string {
  return String(id).replace("section-", "").replace(/-/g, "_");
}

interface SortableSectionProps {
  section: SidebarSection;
  role: Role;
  pathname: string | null;
  collapsed: boolean;
  isEditMode: boolean;
  onRenameSection: (sectionId: string, name: string) => void;
  unreadCount: number;
  inboxUnread: number;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  searchQuery: string;
  isOpen: boolean;
  onToggleSection: (sectionId: string) => void;
}

function SortableSection({ section, role, pathname, collapsed, isEditMode, onRenameSection, unreadCount, inboxUnread, favourites, onToggleFavourite, searchQuery, isOpen, onToggleSection }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: !isEditMode || collapsed });
  const { t } = useLanguage();
  const { hasFeature, isOn } = useTenantConfig();
  const itemLabel = (item: SidebarItem) => {
    if (item.id === "item-dashboard") return t("Command Center");
    if (item.id === "item-dashboard-b2c") return hasFeature("command_center") ? t("Dashboard B2C") : t("Dashboard");
    if (item.id === "item-command-center") return hasFeature("dashboard_b2c") ? t("Dashboard B2B") : t("Dashboard");
    const k = `sidebar.${sidebarItemKey(item.id)}`;
    const v = t(k);
    return v === k ? t(item.name) : v;
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.heading || "");

  const handleSave = () => {
    onRenameSection(section.id, editValue);
    setIsEditing(false);
  };

  const visibleItems = section.items
    .filter((item: SidebarItem) => (role === 'SuperAdmin' || item.roles.includes(role)) && !(item.id === 'item-reports' && !['Admin', 'SuperAdmin', 'SalesManager'].includes(role)))
    .filter((item: SidebarItem) => (role === 'SuperAdmin' && isPlatformManagementPage(item.href)) || hasFeature(ITEM_FEATURE[item.id]))
    .filter((item: SidebarItem) => !ITEM_ADDON[item.id] || isOn(ITEM_ADDON[item.id]))
    .filter((item: SidebarItem) => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    // a company with the follow-up board gets the board (which has the email follow-ups as a tab) behind the same menu entry
    .map((item: SidebarItem) => (item.id === "item-followups" && isOn("followup_board") ? { ...item, href: "/follow-ups" } : item));

  if (visibleItems.length === 0) return null;

  const hasHeading = section.heading !== null;
  const chevronVisible = hasHeading && !collapsed;

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col mt-2")}>
      <AnimatePresence>
        {chevronVisible && (
          <div className="flex items-center group px-2 pt-1 pb-1 gap-1">
            {isEditMode && (
              <div {...attributes} {...listeners} className="cursor-grab hover:bg-slate-200 dark:hover:bg-slate-700 p-0.5 rounded">
                <GripVertical className="w-2.5 h-2.5 text-slate-400" />
              </div>
            )}
            
            {isEditing && isEditMode ? (
              <div className="flex items-center gap-1 flex-1">
                <input 
                  type="text" 
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-transparent text-[9px] font-bold tracking-[0.1em] uppercase text-slate-600 dark:text-slate-300 outline-none w-full border-b border-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <Check onClick={handleSave} className="w-3 h-3 text-green-500 cursor-pointer" />
              </div>
            ) : (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onToggleSection(section.id)}
                aria-expanded={isOpen}
                className="flex-1 text-[10px] font-bold tracking-wider uppercase flex justify-between items-center cursor-pointer select-none py-1 px-1.5 rounded-md text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors"
              >
                <span>{DEFAULT_HEADINGS.includes(section.heading || "") ? t(`sidebar.section_${sidebarSectionKey(section.id)}`) : section.heading}</span>
                <div className="flex items-center gap-1">
                  {isEditMode && (
                    <Edit2 onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                  </motion.div>
                </div>
              </motion.button>
            )}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {(isOpen || collapsed) && (
          <motion.div
            initial={collapsed ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-[1px]">
              {visibleItems.map((item: SidebarItem) => {
                const isActive = sidebarPathMatches(pathname, item.href);
                const IconComp = iconMap[item.icon] || LayoutDashboard;
                const isFav = favourites?.includes(item.id);
                const badge = badgeCount(item, unreadCount, inboxUnread);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? itemLabel(item) : undefined}
                    aria-label={itemLabel(item)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative group flex items-center gap-2.5 rounded-lg transition-all duration-150 select-none shrink-0 border",
                      collapsed ? "w-9 h-9 justify-center mx-auto" : "py-1.5 px-2.5 min-h-[34px]",
                      isActive
                        ? "bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border-indigo-200/70 dark:border-indigo-500/20 shadow-xs"
                        : "border-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-100/70 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    {isActive && !collapsed && (
                      <motion.span layoutId="sidebar-active-indicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />
                    )}
                    <IconComp className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-200")} />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -6 }}
                          transition={{ duration: 0.14 }}
                          className={cn("flex-1 text-xs truncate", isActive ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-zinc-300")}
                        >
                          {itemLabel(item)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {badge > 0 && !collapsed && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleFavourite(item.id);
                        }}
                        title={isFav ? t("sidebar.remove_favourite") : t("sidebar.add_favourite")}
                        className={cn(
                          "p-0.5 rounded transition-all shrink-0 hover:scale-110 focus-visible:opacity-100",
                          isFav 
                            ? "opacity-100" 
                            : "opacity-0 group-hover:opacity-40 hover:!opacity-100"
                        )}
                      >
                        <Star 
                          className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            isFav 
                              ? "fill-amber-400 text-amber-400" 
                              : "text-slate-400 dark:text-slate-500 hover:text-amber-400"
                          )} 
                        />
                      </button>
                    )}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({ role }: SidebarProps) {
  const { user } = useRole();
  return <SidebarContent key={user?.id || "anonymous"} role={role} />;
}

function SidebarContent({ role }: SidebarProps) {
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const { user, logout } = useRole();
  const { hasFeature, isOn, brandName } = useTenantConfig();
  const preferenceVersion = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const inboxEnabled = hasFeature("inbox");
  const userId = user?.id;
  const { collapsed, setCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  
  const [sections, setSections] = useState<SidebarSection[]>(defaultSidebarSections);
  const [favourites, setFavourites] = useState<string[]>(() => {
    // Restore cached favourites synchronously at first render instead of via
    // a mount effect (which would otherwise setState during an effect).
    if (typeof window === "undefined") return [];
    try {
      const cached = localStorage.getItem(`crm_favourites_${userId || 'default'}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return [...new Set(parsed.filter(value => typeof value === "string"))];
      }
    } catch {}
    return [];
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const { unreadCount } = useNotifications();
  const [inboxUnread, setInboxUnread] = useState(0);

  // Inbox unread badge: light poll, plus an immediate refresh whenever the Inbox page changes read state.
  useEffect(() => {
    if (!user?.id || !INBOX_ROLES.includes(role) || !inboxEnabled) return;
    let alive = true;
    const load = async (signal: AbortSignal) => {
      try {
        const res = await fetch(`${API_BASE_URL}/inbox/counts?only=unread`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (alive && !signal.aborted) setInboxUnread(data.unread || 0);
        }
      } catch {}
    };
    const poll = createVisiblePoll(load, 60000);
    const refresh = (event?: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.unread === "number") {
        setInboxUnread(event.detail.unread);
      } else {
        void poll.refresh();
      }
    };
    window.addEventListener("inbox-unread-changed", refresh);
    return () => {
      alive = false;
      poll.dispose();
      window.removeEventListener("inbox-unread-changed", refresh);
    };
  }, [user?.id, role, inboxEnabled]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // Default: all sections with headings start open
    const initial: Record<string, boolean> = {};
    for (const sec of defaultSidebarSections) {
      if (sec.heading !== null) initial[sec.id] = true;
    }
    // Restore saved section open state synchronously at first render instead of
    // via a mount effect (which would otherwise setState during an effect).
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`crm_sections_open_${userId || 'default'}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...initial, ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "boolean").map(([key, value]) => [key, Boolean(value)])) };
        }
      } catch {}
    }
    return initial;
  });

  // Auto-expand the section containing the current route.
  // Adjusting state during render is the React-recommended replacement for
  // setState-in-effect. Seeding the tracker with the initial pathname/sections
  // means it only runs on later changes, so the saved state still wins on mount.
  const [autoExpandState, setAutoExpandState] = useState<{
    pathname: string | null;
    sections: SidebarSection[];
  }>(() => ({ pathname, sections }));

  if (autoExpandState.pathname !== pathname || autoExpandState.sections !== sections) {
    setAutoExpandState({ pathname, sections });
    let shouldUpdate = false;
    const next: Record<string, boolean> = {};
    for (const sec of sections) {
      if (sec.heading === null) continue;
      const hasActive = sec.items?.some((item: SidebarItem) =>
        sidebarPathMatches(pathname, item.href)
      );
      if (hasActive) {
        next[sec.id] = true;
        shouldUpdate = true;
      }
    }
    if (shouldUpdate) setOpenSections(prev => ({ ...prev, ...next }));
  }

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      try { localStorage.setItem(`crm_sections_open_${userId || 'default'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    let ignore = false;

    const loadSidebarPrefs = async () => {
      const version = preferenceVersion.current;
      const localFavKey = `crm_favourites_${userId || 'default'}`;

      if (!userId) return;

      try {
        const url = `${API_BASE_URL}/users/me/sidebar-preferences?user_id=${userId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.sidebar_preferences && version === preferenceVersion.current) {
            if (data.sidebar_preferences.sections && !ignore) {
              setSections(mergeSidebarSections(defaultSidebarSections, data.sidebar_preferences.sections));
            }
            if (Array.isArray(data.sidebar_preferences.favourites)) {
              if (!ignore) setFavourites([...new Set<string>(data.sidebar_preferences.favourites.filter((value: unknown) => typeof value === "string"))]);
              try {
                localStorage.setItem(localFavKey, JSON.stringify(data.sidebar_preferences.favourites));
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn("Could not load sidebar preferences from server, using local fallback.", e);
      }
    };

    loadSidebarPrefs();
    return () => {
      ignore = true;
    };
    // Unread count now comes from the shared NotificationContext (already
    // polling every 15s) instead of this component running its own
    // independent 30s poll of the same endpoint — was doubling notification
    // request volume with AdminTopbar.tsx polling the identical URL.
  }, [userId]);

  const saveSidebarPrefs = async (newSections: SidebarSection[], newFavourites?: string[]) => {
    preferenceVersion.current += 1;
    const favsToSave = newFavourites !== undefined ? newFavourites : favourites;
    const localFavKey = `crm_favourites_${user?.id || 'default'}`;
    try {
      localStorage.setItem(localFavKey, JSON.stringify(favsToSave));
    } catch {}

    if (!user?.id) return;

    try {
      const url = `${API_BASE_URL}/users/me/sidebar-preferences?user_id=${user.id}`;
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sidebar_preferences: { 
            sections: newSections,
            favourites: favsToSave 
          } 
        }),
      }));
      await saveQueue.current;
    } catch (e) {
      console.warn("Could not save sidebar preferences to server:", e);
    }
  };

  const handleToggleFavourite = (itemId: string) => {
    const updated = favourites.includes(itemId) ? favourites.filter(id => id !== itemId) : [...favourites, itemId];
    setFavourites(updated);
    void saveSidebarPrefs(sections, updated);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = sections.findIndex(sec => sec.id === activeId);
      const newIndex = sections.findIndex(sec => sec.id === overId);
      if (!isEditMode || oldIndex < 0 || newIndex < 0) return;
      const updated = arrayMove(sections, oldIndex, newIndex);
      setSections(updated);
      saveSidebarPrefs(updated);
    }
  };

  // Collect map of all items across sections and defaults
  const allItemsMap = new Map<string, SidebarItem>();
  sections.forEach(sec => {
    sec.items?.forEach((item: SidebarItem) => {
      allItemsMap.set(item.id, item);
    });
  });
  defaultSidebarSections.forEach(sec => {
    sec.items?.forEach((item: SidebarItem) => {
      if (!allItemsMap.has(item.id)) {
        allItemsMap.set(item.id, item);
      }
    });
  });

  const favouriteItems: SidebarItem[] = favourites
    .map(id => allItemsMap.get(id))
    .filter((item): item is SidebarItem => Boolean(item))
    .filter(item => role === 'SuperAdmin' || item.roles?.includes(role))
    .filter(item => ((role === "SuperAdmin" && isPlatformManagementPage(item.href)) || hasFeature(ITEM_FEATURE[item.id])) && (!ITEM_ADDON[item.id] || isOn(ITEM_ADDON[item.id])))
    .filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(item => item.id === "item-followups" && isOn("followup_board") ? { ...item, href: "/follow-ups" } : item);

  const labelFor = (item: SidebarItem) => {
    const k = `sidebar.${sidebarItemKey(item.id)}`;
    const v = t(k);
    return v === k ? t(item.name) : v;
  };

  // ── Language Toggle ──
  const { t, setLanguage, language: activeLang } = useLanguage();

  const switchLanguage = useCallback((lang: "en" | "es") => setLanguage(lang), [setLanguage]);

  return (
    <>
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 72 : 280 }}
        transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeInOut" }}
        className="app-sidebar fixed left-0 top-0 z-50 flex flex-col overflow-hidden"
        style={{
          background: "var(--sidebar-bg)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.06)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* ── TOP BRANDING ── */}
        <div className={cn("shrink-0 flex items-center py-3 border-b border-slate-200/80 dark:border-white/10", collapsed ? "justify-center px-2" : "px-3.5 gap-2.5")}>
          <div className="shrink-0 w-8 h-8 rounded-lg border border-slate-200/90 dark:border-white/10 shadow-xs flex items-center justify-center overflow-hidden bg-white dark:bg-zinc-900">
            <BrandMark size={28} fallback={
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" fill="white" fillOpacity="0.9" />
                  <path d="M12 7L7 10V14L12 17L17 14V10L12 7Z" fill="white" fillOpacity="0.5" />
                  <circle cx="12" cy="12" r="2" fill="white" />
                </svg>
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
                className="flex-1 min-w-0 overflow-hidden flex items-center justify-between"
              >
                <div className="min-w-0">
                  <span className="block font-bold text-xs leading-tight tracking-tight text-slate-900 dark:text-white truncate">{brandName}</span>
                  <span className="block text-[10px] font-medium text-slate-400 dark:text-zinc-500 truncate mt-0.5">{t("sidebar.corporate_hq")}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={toggleTheme}
                    className="p-1 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors shadow-xs"
                    title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  >
                    {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                  </button>
                  <button 
                    onClick={() => setIsEditMode(!isEditMode)} 
                    className={cn("p-1 rounded-lg border transition-colors shadow-xs", isEditMode ? "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30" : "border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10")}
                    title={t("sidebar.customize_sidebar")}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── LANGUAGE TOGGLE ── */}
        <div className={cn("shrink-0 py-2", collapsed ? "flex flex-col items-center gap-1.5 px-2" : "px-3")}>
          {collapsed ? (
            <>
              <button
                onClick={() => switchLanguage(activeLang === "en" ? "es" : "en")}
                title={activeLang === "en" ? t("sidebar.switch_es") : t("sidebar.switch_en")}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-xs"
              >
                {activeLang === "en" ? "🇺🇸" : "🇪🇸"}
              </button>
              
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-xs"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 shadow-xs">
              <button
                onClick={() => switchLanguage("en")}
                title={t("sidebar.switch_en")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  activeLang === "en" 
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/70 dark:border-white/10" 
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span className="text-[11px] leading-none">🇺🇸</span>
                <span>EN</span>
              </button>

              <button
                onClick={() => switchLanguage("es")}
                title={t("sidebar.switch_es")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  activeLang === "es" 
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/70 dark:border-white/10" 
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span className="text-[11px] leading-none">🇪🇸</span>
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
              className="shrink-0 px-3 pb-2"
            >
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 shadow-xs focus-within:border-indigo-400 dark:focus-within:border-indigo-500/50 transition-colors">
                <Search className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder={t("sidebar.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MAIN NAVIGATION ── */}
        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 flex flex-col gap-0.5 pb-2", collapsed ? "px-2" : "px-3")}>
          
          {/* ── FAVOURITES SECTION ── */}
          {favouriteItems.length > 0 && (
            <div className="flex flex-col mb-1 pb-2 border-b border-slate-100 dark:border-slate-800/80">
              {!collapsed && (
                <div className="flex items-center justify-between px-2 pt-1 pb-1">
                  <span 
                    className="text-[9px] font-bold tracking-[0.1em] uppercase flex items-center gap-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    {t("sidebar.favourites")}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800">
                    {favouriteItems.length}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-[1px]">
                {favouriteItems.map((item: SidebarItem) => {
                  const isActive = sidebarPathMatches(pathname, item.href);
                  const IconComp = iconMap[item.icon] || LayoutDashboard;
                  const badge = badgeCount(item, unreadCount, inboxUnread);
                  return (
                    <Link
                      key={`fav-${item.id}-${item.href}`}
                      href={item.href}
                      title={collapsed ? labelFor(item) : undefined}
                      aria-label={labelFor(item)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative group flex items-center gap-2.5 rounded-lg transition-all duration-150 select-none shrink-0 border",
                        collapsed ? "w-9 h-9 justify-center mx-auto" : "py-1.5 px-2.5 min-h-[34px]",
                        isActive
                          ? "bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border-indigo-200/70 dark:border-indigo-500/20 shadow-xs"
                          : "border-transparent text-slate-600 dark:text-zinc-400 hover:bg-slate-100/70 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      {isActive && !collapsed && (
                        <motion.span layoutId="sidebar-fav-active-indicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />
                      )}
                      <IconComp className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-200")} />
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -6 }}
                            transition={{ duration: 0.14 }}
                            className={cn("flex-1 text-xs truncate", isActive ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-zinc-300")}
                          >
                            {labelFor(item)}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {badge > 0 && !collapsed && (
                        <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {!collapsed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleFavourite(item.id);
                          }}
                          title={t("sidebar.remove_favourite")}
                          className="p-0.5 rounded transition-all shrink-0 hover:scale-110 opacity-100"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 transition-colors" />
                        </button>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => (
                <SortableSection 
                  key={section.id}
                  section={section}
                  unreadCount={unreadCount}
                  inboxUnread={inboxUnread}
                  role={role} 
                  pathname={pathname} 
                  collapsed={collapsed} 
                  isEditMode={isEditMode}
                  onRenameSection={handleRenameSection}
                  favourites={favourites}
                  onToggleFavourite={handleToggleFavourite}
                  searchQuery={searchQuery}
                  isOpen={!!searchQuery.trim() || section.heading === null || (openSections[section.id] ?? false)}
                  onToggleSection={toggleSection}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <div className={cn("flex shrink-0 items-center gap-2.5 border-t border-slate-200/80 dark:border-white/10 p-2.5 sm:px-3 bg-slate-50/50 dark:bg-white/5", collapsed && "justify-center p-2")}>
          {!collapsed ? (
            <>
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-400/40 shadow-xs">
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-black" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {user?.name || user?.email || t("User")}
                </p>
                <p className="truncate text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                  {t(role === "SalesManager" || role === "Employee" || role === "Sales" ? "Sales Manager" : role)}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                title={t("Sign out")}
                aria-label={t("Sign out")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20 transition-all shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>

      <motion.button
        animate={{ left: collapsed ? 72 : 280 }}
        transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeInOut" }}
        onClick={() => setCollapsed(!collapsed)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title={collapsed ? t("sidebar.expand_sidebar") : t("sidebar.collapse_sidebar")}
        className="fixed top-[52px] z-[60] -translate-x-1/2 flex items-center justify-center w-6 h-6 rounded-full border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111111] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white shadow-xs transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="w-3 h-3" /> : <PanelLeftClose className="w-3 h-3" />}
      </motion.button>
    </>
  );
}
