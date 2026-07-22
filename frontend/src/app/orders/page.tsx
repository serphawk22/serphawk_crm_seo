"use client";

import { useState } from "react";
import SalesOrders from "./SalesOrders";
import PurchaseOrders from "./PurchaseOrders";

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<"sales" | "purchase">("sales");

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">Orders</h1>
          <p className="text-gray-500 dark:text-zinc-400 font-medium">Manage your sales and purchase orders.</p>
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === "sales" 
              ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
          }`}
        >
          Sales Orders
        </button>
        <button
          onClick={() => setActiveTab("purchase")}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === "purchase" 
              ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
          }`}
        >
          Purchase Orders
        </button>
      </div>

      <div>
        {activeTab === "sales" ? <SalesOrders /> : <PurchaseOrders />}
      </div>
    </div>
  );
}
