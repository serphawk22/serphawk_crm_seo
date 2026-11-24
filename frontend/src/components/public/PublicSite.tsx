"use client";

import React from "react";
import Link from "next/link";
import { Sun, Moon, ArrowUpRight } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { serif } from "@/lib/publicFonts";

/**
 * Shared design tokens for the public Journal (/blogs) and Store (/shop).
 * Classic ivory & ink palette in light mode, warm charcoal & champagne gold in dark mode.
 */
export const T = {
  page: "bg-[#FAF8F4] text-[#1C1917] dark:bg-[#0E0D0B] dark:text-[#F3EEE3]",
  surface: "bg-white dark:bg-[#16140F]",
  soft: "bg-[#F3EFE7] dark:bg-[#1B1813]",
  border: "border-[#E7E2D8] dark:border-[#2A261F]",
  ink: "text-[#1C1917] dark:text-[#F3EEE3]",
  muted: "text-[#6B645A] dark:text-[#A39B8B]",
  faint: "text-[#9C9488] dark:text-[#7A7366]",
  gold: "text-[#9A7B4F] dark:text-[#C9A96E]",
  goldBg: "bg-[#9A7B4F] dark:bg-[#C9A96E]",
  goldBorder: "border-[#9A7B4F] dark:border-[#C9A96E]",
  inkBtn:
    "bg-[#1C1917] text-[#FAF8F4] hover:bg-[#9A7B4F] dark:bg-[#F3EEE3] dark:text-[#0E0D0B] dark:hover:bg-[#C9A96E] transition-colors duration-300",
  ghostBtn:
    "border border-[#E7E2D8] dark:border-[#2A261F] hover:border-[#9A7B4F] dark:hover:border-[#C9A96E] text-[#1C1917] dark:text-[#F3EEE3] transition-colors duration-300",
  eyebrow: "text-[11px] uppercase tracking-[0.22em] font-semibold",
  input:
    "w-full bg-transparent border-0 border-b border-[#E7E2D8] dark:border-[#2A261F] px-0 py-2.5 text-sm text-[#1C1917] dark:text-[#F3EEE3] placeholder:text-[#A39B8B] dark:placeholder:text-[#6B645A] focus:outline-none focus:ring-0 focus:border-[#9A7B4F] dark:focus:border-[#C9A96E] transition-colors",
};

/** Global keyframes & editorial helpers used by the public pages. */
export function PublicStyles() {
  return (
    <style>{`
      @keyframes sh-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes sh-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sh-slide-in { from { transform: translateX(100%); } to { transform: none; } }
      @keyframes sh-scale-in { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }
      .sh-reveal { animation: sh-fade-up .8s cubic-bezier(.2,.7,.2,1) both; }
      .sh-fade { animation: sh-fade .35s ease both; }
      .sh-slide-in { animation: sh-slide-in .45s cubic-bezier(.2,.8,.2,1) both; }
      .sh-scale-in { animation: sh-scale-in .4s cubic-bezier(.2,.8,.2,1) both; }
      .sh-link {
        background-image: linear-gradient(currentColor, currentColor);
        background-size: 0% 1px; background-repeat: no-repeat; background-position: 0 100%;
        transition: background-size .45s cubic-bezier(.2,.7,.2,1);
      }
      .group:hover .sh-link, .sh-link:hover { background-size: 100% 1px; }
      .sh-dropcap > p:first-of-type::first-letter {
        float: left; font-size: 4.4em; line-height: .82; padding: .06em .1em 0 0;
        font-family: var(--sh-serif); font-weight: 600; color: #9A7B4F;
      }
      [data-theme="dark"] .sh-dropcap > p:first-of-type::first-letter { color: #C9A96E; }
      .sh-rule { height: 1px; background: linear-gradient(90deg, transparent, currentColor, transparent); opacity: .35; }
      .sh-noscroll::-webkit-scrollbar { display: none; }
      .sh-noscroll { scrollbar-width: none; }
      @media (prefers-reduced-motion: reduce) {
        .sh-reveal, .sh-fade, .sh-slide-in, .sh-scale-in { animation: none !important; }
      }
    `}</style>
  );
}

export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span
      className={`${serif.className} inline-flex items-center justify-center rounded-full border ${T.goldBorder} ${T.gold} font-semibold italic select-none`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      Sh
    </span>
  );
}

export function ThemeToggle() {
  const { actualTheme, toggleTheme } = useTheme();
  const dark = actualTheme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`relative w-9 h-9 rounded-full inline-flex items-center justify-center ${T.ghostBtn} cursor-pointer`}
    >
      <Sun className={`w-4 h-4 absolute transition-all duration-500 ${dark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} />
      <Moon className={`w-4 h-4 absolute transition-all duration-500 ${dark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
    </button>
  );
}

export function PublicHeader({
  active,
  right,
}: {
  active: "journal" | "store";
  right?: React.ReactNode;
}) {
  const navLink = (href: string, label: string, key: "journal" | "store") => (
    <Link
      href={href}
      className={`relative text-[13px] tracking-wide py-1 transition-colors ${
        active === key ? T.ink : `${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`
      }`}
    >
      {label}
      <span
        className={`absolute left-0 -bottom-0.5 h-px ${T.goldBg} transition-all duration-500 ${
          active === key ? "w-full" : "w-0"
        }`}
      />
    </Link>
  );

  return (
    <header className={`sticky top-0 z-40 w-full border-b ${T.border} bg-[#FAF8F4]/85 dark:bg-[#0E0D0B]/85 backdrop-blur-xl`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href={active === "journal" ? "/blogs" : "/shop"} className="flex items-center gap-3 group">
            <Monogram size={34} />
            <div className="leading-none">
              <span className={`${serif.className} text-lg font-semibold tracking-tight ${T.ink}`}>SerpHawk</span>
              <span className={`block mt-1 text-[9px] uppercase tracking-[0.3em] ${T.gold}`}>
                {active === "journal" ? "The Journal" : "The Store"}
              </span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navLink("/blogs", "Journal", "journal")}
            {navLink("/shop", "Store", "store")}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {right}
          <ThemeToggle />
          <Link
            href="/login"
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-medium tracking-wide ${T.inkBtn}`}
          >
            <span>Open CRM</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={`border-t ${T.border} mt-24`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14 grid gap-10 md:grid-cols-12">
        <div className="md:col-span-5 space-y-4">
          <div className="flex items-center gap-3">
            <Monogram size={40} />
            <span className={`${serif.className} text-2xl font-semibold ${T.ink}`}>SerpHawk</span>
          </div>
          <p className={`text-sm leading-relaxed max-w-sm ${T.muted}`}>
            A modern CRM for teams who sell with care — lead intelligence, proposals and pipelines, composed in one quiet workspace.
          </p>
        </div>
        <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
          <div className="space-y-3">
            <p className={`${T.eyebrow} ${T.gold}`}>Read</p>
            <Link href="/blogs" className={`block ${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`}>The Journal</Link>
          </div>
          <div className="space-y-3">
            <p className={`${T.eyebrow} ${T.gold}`}>Shop</p>
            <Link href="/shop" className={`block ${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`}>Services & Packages</Link>
          </div>
          <div className="space-y-3">
            <p className={`${T.eyebrow} ${T.gold}`}>Platform</p>
            <Link href="/login" className={`block ${T.muted} hover:text-[#1C1917] dark:hover:text-[#F3EEE3]`}>Sign in to CRM</Link>
          </div>
        </div>
      </div>
      <div className={`border-t ${T.border}`}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs ${T.faint}`}>
          <span>© {new Date().getFullYear()} SerpHawk. All rights reserved.</span>
          <span className={`${serif.className} italic`}>Crafted for teams who sell with care.</span>
        </div>
      </div>
    </footer>
  );
}

