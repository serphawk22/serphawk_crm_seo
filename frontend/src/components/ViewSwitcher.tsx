"use client";

import React, { useState, useEffect } from "react";
import { List, LayoutGrid, BarChart2, PieChart, Star, Check } from "lucide-react";

export type ViewType = "list" | "kanban" | "graph" | "pivot";

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  storageKey?: string;
}

export function ViewSwitcher({ currentView, onViewChange, storageKey }: ViewSwitcherProps) {
  const [defaultView, setDefaultView] = useState<ViewType | null>(null);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  // Load saved default on mount
  useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey) as ViewType | null;
      if (saved && ["list", "kanban", "graph", "pivot"].includes(saved)) {
        setDefaultView(saved);
        if (saved !== currentView) {
          onViewChange(saved);
        }
      }
    }
  }, [storageKey]);

  const handleSetDefault = () => {
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(storageKey, currentView);
      setDefaultView(currentView);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const views: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: "kanban", label: "Kanban", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: "list", label: "List View", icon: <List className="w-3.5 h-3.5" /> },
    { id: "graph", label: "Graph", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: "pivot", label: "Pivot", icon: <PieChart className="w-3.5 h-3.5" /> },
  ];

  const isCurrentDefault = defaultView === currentView;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl w-fit border border-slate-200/60 dark:border-white/10">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onViewChange(v.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentView === v.id
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {v.icon}
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      {storageKey && (
        <button
          type="button"
          onClick={handleSetDefault}
          title={isCurrentDefault ? "This view is your default" : "Set this view as your default"}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition border cursor-pointer ${
            isCurrentDefault
              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800"
              : "bg-slate-50 dark:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          {justSaved ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-600 font-bold">Saved!</span>
            </>
          ) : (
            <>
              <Star className={`w-3 h-3 ${isCurrentDefault ? "fill-amber-400 text-amber-500" : ""}`} />
              <span className="hidden sm:inline">{isCurrentDefault ? "Default View" : "Set Default"}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
