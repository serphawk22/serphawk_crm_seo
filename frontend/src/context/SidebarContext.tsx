"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const narrowScreen = window.matchMedia("(max-width: 767px)");
    const collapseOnSmallScreen = () => { if (narrowScreen.matches) setCollapsed(true); };
    collapseOnSmallScreen();
    narrowScreen.addEventListener("change", collapseOnSmallScreen);
    return () => narrowScreen.removeEventListener("change", collapseOnSmallScreen);
  }, []);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
