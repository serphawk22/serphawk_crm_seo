"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE_URL } from '@/config';

export type Role = 'Admin' | 'Employee' | 'Client' | 'Intern' | 'SalesManager';

interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  client_id?: number;
}

interface RoleContextType {
  role: Role;
  email: string;
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const savedUser = localStorage.getItem('crm_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated && pathname !== '/login' && pathname !== '/') {
        router.replace('/login');
      } else if (isAuthenticated && pathname === '/login') {
        if (user?.role === 'SalesManager') {
          router.replace('/clients');
        } else {
          router.replace('/');
        }
      }
    }
  }, [isAuthenticated, pathname, loading, router]);

  const login = async (email: string, pass: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        return { success: true };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, message: data.detail || 'Invalid credentials. Please try again.' };
    } catch (err) {
      console.error('Login request failed', err);
      return {
        success: false,
        message: `Unable to connect to the CRM API at ${API_BASE_URL}. Please verify that the backend is running and reachable.`,
      };
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('crm_user');
    router.replace('/login');
  };

  return (
    <RoleContext.Provider value={{ 
      role: user?.role || 'Client' as Role, 
      email: user?.email || '', 
      isAuthenticated, 
      user, 
      login, 
      logout,
      loading
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
