"use client";

import { useState } from "react";
import Quotes from "./Quotes";
import Invoices from "./Invoices";

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<"quotes" | "invoices">("quotes");

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">Billing</h1>
          <p className="text-gray-500 dark:text-zinc-400 font-medium">Manage your quotes and invoices.</p>
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("quotes")}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === "quotes" 
              ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
          }`}
        >
          Quotes
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === "invoices" 
              ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
          }`}
        >
          Invoices
        </button>
      </div>

      <div>
        {activeTab === "quotes" ? <Quotes /> : <Invoices />}
      </div>
    </div>
  );
}
