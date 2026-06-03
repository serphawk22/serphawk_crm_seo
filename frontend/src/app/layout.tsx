"use client";

import { useEffect } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { Chatbot } from "@/components/Chatbot";
import { AdminTopbar } from "@/components/AdminTopbar";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { RoleProvider, useRole } from "@/context/RoleContext";
import { LanguageProvider } from "@/context/LanguageContext";
import I18nProvider from "@/i18n/I18nProvider";

function AdminMainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main className="relative z-10 pt-16 min-h-screen transition-all duration-300">
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
        {children}
      </div>
    </main>
  );
}

function ClientLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="client-shell relative w-full min-h-screen bg-zinc-950">
      <ClientSidebar />
      <CallNotificationBar />
      <main className={`min-h-screen transition-all duration-300 pt-6 px-4 md:px-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}>
        {children}
      </main>
      <Chatbot />
    </div>
  );
}
import { ClientSidebar } from "@/components/ClientSidebar";
import { usePathname } from 'next/navigation';
import { CallNotificationBar } from "@/components/CallNotificationBar";

const inter = Inter({ subsets: ["latin"] });

function AppContent({ children }: { children: React.ReactNode }) {
  const { role, loading } = useRole();
  const pathname = usePathname();
  const isClient = role === "Client";
  const isAdminOrEmployee = role === "Admin" || role === "Employee" || role === "Intern" || role === "SalesManager";

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.group("Global Error Captured");
      console.error("Message:", event.message);
      if (event.error?.stack) console.error("Stack:", event.error.stack);
      console.groupEnd();
    };
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center admin-shell">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg animate-pulse">
            SH
          </div>
          <p className="text-slate-400 text-sm font-semibold animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (pathname === '/login') {
    return <main className="h-screen w-full">{children}</main>;
  }

  // ── Client layout ──
  if (isClient) {
    return (
      <SidebarProvider>
        <ClientLayout>{children}</ClientLayout>
      </SidebarProvider>
    );
  }

  // ── Admin / Employee / Intern — Premium Light Layout ──
  if (isAdminOrEmployee) {
    return (
      <SidebarProvider>
      <div className="admin-shell min-h-screen">

        {/* Topbar */}
        <AdminTopbar />

        {/* Main Content */}
        <AdminMainContent>{children}</AdminMainContent>

        <Chatbot />
      </div>
      </SidebarProvider>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="p-6">{children}</main>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <I18nProvider>
          <LanguageProvider>
            <RoleProvider>
              <AppContent>{children}</AppContent>
            </RoleProvider>
          </LanguageProvider>
        </I18nProvider>
        
        {/* Global WhatsApp Widget */}
        <a 
          href="https://wa.me/8519990425?text=Hi,%20I'd%20like%20to%20book%20a%20demo%20or%20catch%20up%20for%20a%20meeting"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 left-6 z-[9999] bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center cursor-pointer"
          title="Chat on WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      </body>
    </html>
  );
}
