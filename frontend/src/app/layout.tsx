"use client";

import { useEffect } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { Chatbot } from "@/components/Chatbot";
import QuickAddFab from "@/components/QuickAddFab";
import OmniSearch from "@/components/OmniSearch";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { RoleProvider, useRole } from "@/context/RoleContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import I18nProvider from "@/i18n/I18nProvider";
import { Sidebar } from "@/components/Sidebar";
import { ClientSidebar } from "@/components/ClientSidebar";
import { SyncProvider } from "@/context/SyncContext";
import { GlobalLoader } from "@/components/GlobalLoader";
import { usePathname } from "next/navigation";
import { CallNotificationBar } from "@/components/CallNotificationBar";
import { DeveloperHeader } from "@/components/DeveloperHeader";
import SpaceAtmosphere from "@/components/SpaceAtmosphere";
import TelemetryTracker from "@/components/TelemetryTracker";
import Script from "next/script";
import TopRightControls from "@/components/TopRightControls";
import GoogleProviderWrapper from "@/components/GoogleProviderWrapper";
import { GlobalLimitModal } from "@/components/GlobalLimitModal";

function AdminMainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const isClientDetail = pathname?.match(/^\/admin\/clients\/\d+$/);

  return (
    <main className={`relative z-10 min-h-screen transition-all duration-300 ${collapsed ? "ml-[72px]" : "ml-[280px]"}`}>
      <TopRightControls />
      <div className={isClientDetail ? "w-full h-full" : "p-6 md:p-8 max-w-[1600px] mx-auto h-full"}>
        {children}
      </div>
    </main>
  );
}

function ClientLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="client-shell relative w-full min-h-screen bg-transparent text-white" style={{ color: "var(--text-primary)" }}>
      <ClientSidebar />
      <CallNotificationBar />
      <main className={`min-h-screen transition-all duration-300 pt-6 px-4 md:px-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}>
        {children}
      </main>
    </div>
  );
}

const inter = Inter({ subsets: ["latin"] });

function AppContent({ children }: { children: React.ReactNode }) {
  const { role, loading } = useRole();
  const pathname = usePathname();
  const isClient = role === "Client";
  const isDeveloper = role === "ProjectMember";
  const isAdminOrEmployee = role === "Admin" || role === "Employee" || role === "Intern" || role === "SalesManager" || role === "Demo";
  const showChatbot = !!role && role !== "Client"; // Show for ALL roles except unauthenticated Client

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.group("Global Error Captured");
      console.error("Message:", event.message);
      if (event.error?.stack) console.error("Stack:", event.error.stack);
      console.groupEnd();
    };
    window.addEventListener("error", handleError);

    // Global fetch interceptor for LIMIT_REACHED
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 403) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          if (data?.detail?.error === "LIMIT_REACHED") {
            const event = new CustomEvent("limit-reached", { detail: data.detail });
            window.dispatchEvent(event);
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
      return response;
    };

    return () => {
      window.removeEventListener("error", handleError);
      window.fetch = originalFetch;
    };
  }, []);

  if (loading) {
    return <GlobalLoader />;
  }

  if (pathname === "/login" || pathname === "/signup" || pathname === "/demo_showcase" || pathname?.startsWith("/demo_showcase")) {
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

  // ── Supplier layout ──
  if (role === "Supplier") {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-black">
        <nav className="bg-white dark:bg-black border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-black">S</span>
            </div>
            <span className="font-bold text-slate-800 dark:text-white text-sm">Supplier Portal</span>
          </div>
          <a href="/login" onClick={() => { localStorage.removeItem("crm_user"); }}
            className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors">
            Sign Out
          </a>
        </nav>
        <main>{children}</main>
        <Chatbot />
      </div>
    );
  }

  // ── Admin / Employee / Intern layout ──
  if (isAdminOrEmployee) {
    return (
    <SyncProvider>
      <SidebarProvider>
        <div className="admin-shell min-h-screen" style={{ background: "var(--background)" }}>
          <Sidebar role={role} />
          <AdminMainContent>
            <CallNotificationBar />
            {children}
          </AdminMainContent>
          {showChatbot && <Chatbot />}
        </div>
      </SidebarProvider>
    </SyncProvider>
    );
  }

  // ── Developer layout ──
  if (isDeveloper) {
    return (
      <div className="developer-shell min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
        <DeveloperHeader />
        <main className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full h-full">
          {children}
        </main>
        {showChatbot && <Chatbot />}
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-secondary)" }}>
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
      <head>
        {/* Suppress Google Translate native toolbar */}
        <style>{`
          .goog-te-banner-frame, .goog-te-balloon-frame { display: none !important; }
          .goog-te-gadget { display: none !important; }
          body { top: 0 !important; }
          .skiptranslate { display: none !important; }
          #google_translate_element { display: none !important; }
        `}</style>
        {/*
          SYNC SCRIPT — runs before GT loads.
          If user clicked EN, we mark the html element with 'notranslate'
          so Google Translate sees it and skips the page entirely.
          This is the ONLY reliable way to prevent GT re-applying Spanish.
        */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (sessionStorage.getItem('crm_gt_restore_en') === '1') {
              sessionStorage.removeItem('crm_gt_restore_en');
              document.documentElement.classList.add('notranslate');
              document.documentElement.setAttribute('translate', 'no');
            }
          })();
        `}} />
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.log('ServiceWorker registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
        <GoogleProviderWrapper>
          <ThemeProvider>
            <I18nProvider>
              <LanguageProvider>
                <RoleProvider>
                  <TelemetryTracker />
                  <SpaceAtmosphere />
                  <AppContent>{children}</AppContent>
                  <OmniSearch />
                  <QuickAddFab />
                  <GlobalLimitModal />
                </RoleProvider>
              </LanguageProvider>
            </I18nProvider>
          </ThemeProvider>
        </GoogleProviderWrapper>

        {/* Global WhatsApp Widget */}
        <a
          href="https://wa.me/919502901416?text=Hi,%20I'd%20like%20to%20book%20a%20demo%20or%20catch%20up%20for%20a%20meeting"
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
