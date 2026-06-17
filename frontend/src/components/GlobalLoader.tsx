"use client";
import { motion } from "framer-motion";

export function GlobalLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm" style={{ background: "var(--background)" }}>
      <div className="flex flex-col items-center gap-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="relative w-16 h-16"
        >
          <div className="absolute inset-0 rounded-full border-4 border-t-transparent shadow-lg" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
          <div className="absolute inset-2 rounded-full border-4 border-b-transparent opacity-50" style={{ borderColor: "var(--primary-hover)", borderBottomColor: "transparent" }} />
        </motion.div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: "var(--text-secondary)" }}
        >
          Loading Workspace
        </motion.div>
      </div>
    </div>
  );
}
