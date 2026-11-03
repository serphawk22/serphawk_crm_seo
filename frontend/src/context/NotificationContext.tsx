"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { createVisiblePoll } from "@/lib/visiblePoll";
import { API_BASE_URL } from "@/config";
import { useRole } from "@/context/RoleContext";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string; // info | success | warning | error
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const POLL_INTERVAL = 15_000; // 15 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useRole();
  const userId = user?.id;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const poll = useRef<ReturnType<typeof createVisiblePoll> | null>(null);
  const fetchNotifications = useCallback(async (signal: AbortSignal) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${userId}`, { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!signal.aborted) setNotifications(data.notifications || []);
    } catch (e) {
      // silently fail — notifications are non-critical
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [userId]);

  // One request at a time; cancel old-account results and pause hidden tabs.
  useEffect(() => {
    setNotifications([]);
    if (userId) {
      setLoading(true);
      const active = createVisiblePoll(fetchNotifications, POLL_INTERVAL);
      poll.current = active;
      return () => { active.dispose(); poll.current = null; };
    } else {
      setLoading(false);
    }
  }, [userId, fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    await fetch(`${API_BASE_URL}/notifications/${id}/read`, { method: "PUT" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await fetch(`${API_BASE_URL}/notifications/mark-all-read/${userId}`, { method: "PUT" });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, [userId]);

  const deleteNotification = useCallback(async (id: number) => {
    await fetch(`${API_BASE_URL}/notifications/${id}`, { method: "DELETE" });
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    await fetch(`${API_BASE_URL}/notifications/clear-all/${userId}`, { method: "DELETE" });
    setNotifications([]);
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refresh: () => { void poll.current?.refresh(); },
        markRead,
        markAllRead,
        deleteNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
