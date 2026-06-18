"use client";

import { useEffect } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { Chatbot } from "@/components/Chatbot";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { RoleProvider, useRole } from "@/context/RoleContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import I18nProvider from "@/i18n/I18nProvider";
import { Sidebar } from "@/components/Sidebar";
import { ClientSidebar } from "@/components/ClientSidebar";
import { GlobalLoader } from "@/components/GlobalLoader";
import { usePathname } from "next/navigation";
import { CallNotificationBar } from "@/components/CallNotificationBar";
import SpaceAtmosphere from "@/components/SpaceAtmosphere";

function AdminMainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const isClientDetail = pathname?.match(/^\/admin\/clients\/\d+$/);

  return (
    <main className={`relative z-10 min-h-screen transition-all duration-300 ${collapsed ? "ml-[72px]" : "ml-[280px]"}`}>
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
      <Chatbot />
    </div>
  );
}

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
    return <GlobalLoader />;
  }

  if (pathname === "/login") {
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

  // ── Admin / Employee / Intern layout ──
  if (isAdminOrEmployee) {
    return (
      <SidebarProvider>
        <div className="admin-shell min-h-screen" style={{ background: "var(--background)" }}>
          <Sidebar role={role} />
          <AdminMainContent>{children}</AdminMainContent>
          <Chatbot />
        </div>
      </SidebarProvider>
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
      <body className={inter.className}>
        <ThemeProvider>
          <I18nProvider>
            <LanguageProvider>
              <RoleProvider>
                <SpaceAtmosphere />
                <AppContent>{children}</AppContent>
              </RoleProvider>
            </LanguageProvider>
          </I18nProvider>
        </ThemeProvider>

        {/* WhatsApp widget removed per design update */}
      </body>
    </html>
  );
}
