"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

export default function TopRightControls() {
  const { unreadCount } = useNotifications();
  return <Link href="/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} title="Notifications"
    className="fixed right-6 top-6 z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
    <Bell size={18} />
    {unreadCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
  </Link>;
}