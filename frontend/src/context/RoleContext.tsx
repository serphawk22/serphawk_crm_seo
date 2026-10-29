"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE_URL } from '@/config';
import { isInternalApi } from '@/lib/apiRequest';

export type Role = 'SuperAdmin' | 'Admin' | 'Employee' | 'Client' | 'Intern' | 'SalesManager' | 'Supplier' | 'Demo' | 'ProjectMember' | 'Developer' | 'Student' | 'Instructor' | 'Sales';

interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  client_id?: number;
  tenant_id?: number | null;
}

interface RoleContextType {
  role: Role;
  email: string;
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string; is_new_user?: boolean }>;
  logout: () => void;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

if (typeof window !== 'undefined' && !(window as any)._fetchPatched) {
  (window as any)._fetchPatched = true;
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let [resource, config] = args;
    const saved = localStorage.getItem('crm_user');
    const token = localStorage.getItem('crm_token');
    
    // Only inject tenant_id for internal API calls, not external ones like docs.google.com
    const internal = isInternalApi(resource, API_BASE_URL, window.location.origin);

    if (saved && internal) {
      try {
        const parsed = JSON.parse(saved);
        config = config || {};
        // Header names are case-insensitive. Object spreads can leave both
        // "authorization" and "Authorization", which fetch combines into an
        // invalid comma-separated bearer token. Merge and replace using Headers.
        const headers = new Headers(resource instanceof Request ? resource.headers : undefined);
        new Headers(config.headers).forEach((value, key) => headers.set(key, value));
        // Signed session token (the real credential). X-User-ID below stays for backends that have not
        // been upgraded yet; an upgraded backend ignores it whenever a token is present.
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (parsed.id) {
          headers.set('X-User-ID', String(parsed.id));
        }
        // Explicit tenant headers serve platform configuration requests only;
        // ordinary users always use their own tenant and the backend enforces it.
        const selectedTenant = parsed.role === 'SuperAdmin'
          ? headers.get('X-Tenant-ID') : parsed.tenant_id;
        if (selectedTenant) {
          headers.set('X-Tenant-ID', String(selectedTenant));
        }
        // Keep queued offline requests serializable while retaining one entry per header.
        config.headers = Object.fromEntries(headers);
      } catch (e) {}
    }
    if (!navigator.onLine && config && config.method && config.method !== 'GET') {
      try {
        const { openDB } = await import('idb');
        const db = await openDB("crm-sync-queue", 1);
        await db.add("requests", {
          url: resource,
          method: config.method,
          headers: config.headers,
          body: config.body,
          timestamp: Date.now(),
        });
        return new Response(JSON.stringify({ id: -1, status: "offline", message: "Saved offline" }), { status: 200, statusText: "OK" });
      } catch(err) {}
    }
    // Universal "confirm before email" gate: block any outbound request that
    // sends a mail until the user confirms it in the popup.
    if (internal && typeof resource === 'string') {
      try {
        const { emailTriggerInfo, requestEmailConfirmation } = await import('@/lib/emailConfirm');
        const info = emailTriggerInfo(resource, config);
        if (info) {
          const ok = await requestEmailConfirmation(info);
          if (!ok) {
            return new Response(
              JSON.stringify({ ok: false, cancelled: true, email_sent: false, message: "Email send cancelled by user." }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (e) {}
    }
    let response: Response;
    try {
      response = await originalFetch(resource, config);
    } catch (netErr) {
      console.warn(`[API] Request failed (network): ${typeof resource === 'string' ? resource : '(non-string URL)'}`, netErr instanceof Error ? netErr.message : netErr);
      return new Response(
        JSON.stringify({ ok: false, message: 'Network error. Please try again.', status: 'network_error' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // If we get a 401 from an internal API (other than the login endpoint itself)
    if (response.status === 401 && internal && typeof resource === 'string' && !resource.endsWith('/login')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('crm_user');
        localStorage.removeItem('crm_token');
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
      }
    }
    
    // The API refuses a module the company has not got with 403 + {feature}: tell the user once instead of failing silently.
    if (response.status === 403 && internal && typeof window !== 'undefined') {
      response.clone().json().then((body) => {
        if (body && body.feature) {
          window.dispatchEvent(new CustomEvent('module-not-enabled', { detail: { feature: body.feature, message: body.detail } }));
        }
      }).catch(() => undefined);
    }

    return response;
  };
}

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
      if (!isAuthenticated && pathname !== '/login' && pathname !== '/signup' && pathname !== '/register' && pathname !== '/' && !pathname?.startsWith('/demo_showcase') && pathname !== '/reset-password' && !pathname?.startsWith('/p/')) {
        router.replace('/login');
      } else if (isAuthenticated && (pathname === '/login' || pathname === '/signup' || pathname === '/register')) {
        if (user?.role === 'Supplier') {
          router.replace('/supplier');
        } else if (user?.role === 'SalesManager') {
          router.replace('/clients');
        } else if (user?.role === 'Student') {
          router.replace('/learning');
        } else if (user?.role === 'Instructor') {
          router.replace('/teaching');
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        if (data.token) localStorage.setItem('crm_token', data.token);
        else localStorage.removeItem('crm_token');
        return { success: true };
      }
      if (res.status === 503 && (data.status === 'network_error' || data.ok === false)) {
        return { success: false, message: `Unable to connect to the CRM API at ${API_BASE_URL}. Please check that the backend is reachable and try again.` };
      }
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
    localStorage.removeItem('crm_token');
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
