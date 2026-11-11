"use client";
import { useEffect, useState } from "react";
import OperationsDashboard, { OverviewStats } from "@/components/OperationsDashboard";
import { API_BASE_URL } from "@/config";

export default function InstituteDashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/dashboard-b2c/stats`).then(async r => {
      if (!r.ok) throw new Error("Could not load the dashboard");
      const data = await r.json();
      if (active) setStats(data);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!stats) return <p role="status">Loading dashboard…</p>;
  return <OperationsDashboard stats={stats} variant="dashboard_b2c" callPitch={null} />;
}
