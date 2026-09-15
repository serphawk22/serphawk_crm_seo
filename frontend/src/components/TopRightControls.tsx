"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut, User, Sun, Moon, ChevronDown, Bell, CheckCircle2 } from "lucide-react";
import { useRole, Role } from "@/context/RoleContext";
import { useTheme } from "@/context/ThemeContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/config";

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  Admin: { label: "Admin", color: "bg-indigo-100 text-indigo-700 border border-indigo-200" },
  Employee: { label: "Employee", color: "bg-sky-100 text-sky-700 border border-sky-200" },
  Client: { label: "Client", color: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
  Intern: { label: "Intern", color: "bg-amber-100 text-amber-700 border border-amber-200" },
  SalesManager: { label: "Sales Manager", color: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200" },
};

export default function TopRightControls() {
  const { role, email, logout, user } = useRole();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetch(`${API_BASE_URL}/notifications/${user.id}`)
        .then(r => r.json())
        .then(d => {
          setNotifications(d.notifications || []);
          setUnreadCount(d.unread_count || 0);
        }).catch(() => {});
    }
  }, [user]);

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      await fetch(`${API_BASE_URL}/notifications/mark-all-read/${user.id}`, { method: 'PUT' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const badge = ROLE_BADGE[role as string];

  return (
    <div className="fixed top-4 right-6 z-[60] flex items-center gap-3">
      {/* Profile Menu */}
      <div className="relative" ref={userRef}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setUserMenuOpen(!userMenuOpen); setNotificationsOpen(false); }}
          className="flex items-center gap-2 pl-2 pr-2 py-1.5 rounded-xl transition-all shadow-sm border bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-[12px] shadow-sm">
            {email ? email[0].toUpperCase() : "U"}
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`} />
        </motion.button>

        <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-xl overflow-hidden z-[60] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
            >
              <div className="px-4 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-inner">
                  {email ? email[0].toUpperCase() : "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate text-slate-800 dark:text-zinc-100">{email || "User"}</p>
                  <span className={`inline-block mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full ${badge?.color}`}>
                    {badge?.label}
                  </span>
                </div>
              </div>
              
              <div className="py-2">
                <Link href="/profile" onClick={() => setUserMenuOpen(false)}>
                  <div className="flex items-center gap-3 w-full px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-zinc-800 transition-all cursor-pointer">
                    <User className="w-4 h-4" /> Profile
                  </div>
                </Link>
                <Link href="/admin/settings" onClick={() => setUserMenuOpen(false)}>
                  <div className="flex items-center gap-3 w-full px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-zinc-800 transition-all cursor-pointer">
                    <Settings className="w-4 h-4" /> Settings
                  </div>
                </Link>
              </div>
              
              <div className="py-2 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <button
                  onClick={() => { logout(); router.push("/login"); }}
                  className="flex items-center gap-3 w-full px-4 py-2 text-[13px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-100/50 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
