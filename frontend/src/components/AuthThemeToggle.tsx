"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";

export default function AuthThemeToggle() {
  const [mounted, setMounted] = useState(false);
  
  // Custom hook to access ThemeContext directly if it wasn't exported
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    // Initial check
    if (document.documentElement.classList.contains("dark")) {
      setActualTheme("dark");
    } else {
      setActualTheme("light");
    }

    // Mutation observer to watch for class changes on HTML
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const isDark = document.documentElement.classList.contains("dark");
          setActualTheme(isDark ? "dark" : "light");
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9 rounded-full bg-slate-200/50 dark:bg-zinc-800/50 animate-pulse" />;
  }

  const toggle = () => {
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("crm-theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("crm-theme", "dark");
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-xl transition-all duration-200 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm dark:text-slate-300 dark:hover:text-white dark:bg-[#0c1427]/80 dark:hover:bg-[#111c38] dark:border-slate-700/70 z-[99] group cursor-pointer"
      title="Toggle Theme"
      aria-label="Toggle Theme"
    >
      {actualTheme === "dark" ? (
        <Sun className="w-4 h-4 transition-transform group-hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform group-hover:-rotate-12" />
      )}
    </button>
  );
}
