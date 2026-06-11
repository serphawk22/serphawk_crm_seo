"use client";

import { useState, useEffect } from 'react';
import { useRole } from '@/context/RoleContext';
import { useRouter } from 'next/navigation';
import { BarChart3, Users, Zap, Activity, DollarSign, BrainCircuit, List, Bell, Download, Clock } from 'lucide-react';
import { API_BASE_URL } from '@/config';

export default function ApiIntelligencePage() {
  const { role, isAuthenticated } = useRole();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  
  const [overview, setOverview] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [salespersons, setSalespersons] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [trend, setTrend] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (role !== 'Admin') {
      router.push('/');
      return;
    }
    fetchData();
  }, [isAuthenticated, role]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ov, prov, sales, cli, endp, req, trn] = await Promise.all([
        fetch(`${API_BASE_URL}/api-intelligence/overview`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/providers`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/salespersons`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/clients`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/endpoints`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/requests?limit=100`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api-intelligence/charts/trend`).then(r => r.json())
      ]);
      setOverview(ov);
      setProviders(prov);
      setSalespersons(sales);
      setClients(cli);
      setEndpoints(endp);
      setRequests(req);
      setTrend(trn);
    } catch (e) {
      console.error("Failed to load API data", e);
    } finally {
      setLoading(false);
    }
  };

  // Live polling
  useEffect(() => {
    if (activeTab === 'live') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api-intelligence/requests?limit=50`);
          const data = await res.json();
          setRequests(data);
        } catch (e) { }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  if (!isAuthenticated || role !== 'Admin') return null;

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'providers', name: 'AI Models', icon: BrainCircuit },
    { id: 'sales', name: 'Sales Team', icon: Users },
    { id: 'clients', name: 'Clients', icon: DollarSign },
    { id: 'endpoints', name: 'Endpoints', icon: Activity },
    { id: 'requests', name: 'Request Log', icon: List },
    { id: 'live', name: 'Live Monitor', icon: Zap },
    { id: 'alerts', name: 'Alerts', icon: Bell },
  ];

  return (
    <div className="p-8 bg-gray-50 dark:bg-zinc-950 min-h-screen text-gray-900 dark:text-zinc-50 font-sans">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-zinc-50">API Intelligence Center</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1">Enterprise Token Analytics & Observability</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:bg-zinc-950 transition-colors shadow-sm text-gray-700 dark:text-zinc-200">
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>

      <div className="flex space-x-1 mb-6 bg-white dark:bg-zinc-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.id 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:bg-zinc-950 hover:text-gray-900 dark:text-zinc-50'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-6">
              {/* Top Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <MetricCard title="Total Tokens" value={overview.tokens.total.toLocaleString()} sub={`${overview.tokens.input.toLocaleString()} in / ${overview.tokens.output.toLocaleString()} out`} />
                <MetricCard title="Total Cost" value={`$${overview.cost.total.toFixed(4)}`} sub={`$${overview.cost.today.toFixed(2)} today`} />
                <MetricCard title="Total API Calls" value={overview.calls.total.toLocaleString()} sub={`${overview.calls.today} today`} />
                <MetricCard title="Projected Annual Cost" value={`$${overview.cost.annual_projection.toFixed(2)}`} sub="Based on this month" />
              </div>

              {/* Trend Charts */}
              {trend && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800">
                    <h3 className="font-semibold text-gray-900 dark:text-zinc-50 mb-6">Token Consumption (Last 7 Days)</h3>
                    <div className="h-64 flex items-end gap-2">
                      {trend.tokens.map((val: number, i: number) => {
                        const max = Math.max(...trend.tokens, 1);
                        const height = `${(val / max) * 100}%`;
                        return (
                          <div key={i} className="flex-1 flex flex-col justify-end group relative">
                            <div className="w-full bg-blue-100 rounded-t-md hover:bg-blue-600 transition-colors" style={{ height }}>
                              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none">
                                {val.toLocaleString()} tokens
                              </div>
                            </div>
                            <div className="text-xs text-center mt-2 text-gray-500 dark:text-zinc-400">{trend.labels[i]}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800">
                    <h3 className="font-semibold text-gray-900 dark:text-zinc-50 mb-6">Cost Trend (Last 7 Days)</h3>
                    <div className="h-64 flex items-end gap-2">
                      {trend.costs.map((val: number, i: number) => {
                        const max = Math.max(...trend.costs, 0.01);
                        const height = `${(val / max) * 100}%`;
                        return (
                          <div key={i} className="flex-1 flex flex-col justify-end group relative">
                            <div className="w-full bg-emerald-100 rounded-t-md hover:bg-emerald-500 transition-colors" style={{ height }}>
                              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none">
                                ${val.toFixed(3)}
                              </div>
                            </div>
                            <div className="text-xs text-center mt-2 text-gray-500 dark:text-zinc-400">{trend.labels[i]}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROVIDERS TAB */}
          {activeTab === 'providers' && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {providers.map((p, i) => (
                <div key={i} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col">
                  <h3 className="font-semibold text-gray-900 dark:text-zinc-50 text-lg capitalize mb-4">{p.provider}</h3>
                  <div className="space-y-3 flex-1">
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-zinc-400">Calls</span><span className="font-medium text-gray-900 dark:text-zinc-50">{p.calls}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-zinc-400">Tokens</span><span className="font-medium text-gray-900 dark:text-zinc-50">{p.tokens.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-zinc-400">Cost</span><span className="font-medium text-emerald-600">${p.cost.toFixed(4)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-zinc-400">Avg Latency</span><span className="font-medium text-gray-900 dark:text-zinc-50">{p.avg_response_time.toFixed(0)}ms</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-zinc-400">Error Rate</span><span className={p.error_rate > 0 ? "font-medium text-red-500" : "font-medium text-emerald-500"}>{p.error_rate.toFixed(1)}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SALES TEAM TAB */}
          {activeTab === 'sales' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-950 text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-medium">Salesperson</th>
                    <th className="px-6 py-4 font-medium">API Calls</th>
                    <th className="px-6 py-4 font-medium">Tokens Consumed</th>
                    <th className="px-6 py-4 font-medium">Cost Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {salespersons.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:bg-zinc-950/50 cursor-pointer transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-zinc-50">{s.name}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{s.calls}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{s.tokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-emerald-600 font-medium">${s.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CLIENTS TAB */}
          {activeTab === 'clients' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-950 text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-medium">Client</th>
                    <th className="px-6 py-4 font-medium">API Calls</th>
                    <th className="px-6 py-4 font-medium">Tokens Consumed</th>
                    <th className="px-6 py-4 font-medium">Cost Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clients.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:bg-zinc-950/50 cursor-pointer transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-zinc-50">{c.companyName}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{c.calls}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{c.tokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-emerald-600 font-medium">${c.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REQUESTS LOG TAB */}
          {activeTab === 'requests' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-950 text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-medium">Time</th>
                    <th className="px-6 py-4 font-medium">Endpoint</th>
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Model</th>
                    <th className="px-6 py-4 font-medium">Tokens</th>
                    <th className="px-6 py-4 font-medium">Cost</th>
                    <th className="px-6 py-4 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requests.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:bg-zinc-950/50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 dark:text-zinc-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-zinc-50">{r.endpoint}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{r.salesperson}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300"><span className="px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded text-xs">{r.model}</span></td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{r.total_tokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-emerald-600">${r.total_cost.toFixed(4)}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300 flex items-center gap-1"><Clock className="w-3 h-3"/> {r.response_time_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LIVE MONITOR TAB */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-emerald-600 font-medium">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" /> Live API Stream (Auto-refresh)
              </div>
              <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden text-gray-300 font-mono text-sm">
                <div className="p-4 border-b border-gray-800 bg-gray-950 flex justify-between">
                  <span>Stream Active</span>
                  <span>{requests.length} events loaded</span>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto space-y-2">
                  {requests.map((r, i) => (
                    <div key={i} className="flex gap-4 hover:bg-gray-800/50 p-2 rounded transition-colors">
                      <span className="text-gray-500 dark:text-zinc-400 w-24 flex-shrink-0">{new Date(r.timestamp).toLocaleTimeString()}</span>
                      <span className="text-blue-400 w-32 flex-shrink-0 truncate">{r.salesperson}</span>
                      <span className="text-emerald-400 w-40 flex-shrink-0">{r.endpoint}</span>
                      <span className="text-purple-400 w-32 flex-shrink-0">{r.model}</span>
                      <span className="text-yellow-400 w-24 flex-shrink-0">{r.total_tokens} tkns</span>
                      <span className="text-gray-400">${r.total_cost.toFixed(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-50">Alert Configuration</h3>
              <p className="text-gray-500 dark:text-zinc-400 mt-2 mb-6">Set up automated notifications for cost overruns and error spikes.</p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                Create New Alert
              </button>
            </div>
          )}

          {/* ENDPOINTS TAB */}
          {activeTab === 'endpoints' && (
             <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
             <table className="w-full text-left text-sm">
               <thead className="bg-gray-50 dark:bg-zinc-950 text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800">
                 <tr>
                   <th className="px-6 py-4 font-medium">Endpoint</th>
                   <th className="px-6 py-4 font-medium">Hits</th>
                   <th className="px-6 py-4 font-medium">Tokens</th>
                   <th className="px-6 py-4 font-medium">Cost</th>
                   <th className="px-6 py-4 font-medium">Avg Latency</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                 {endpoints.map((e, i) => (
                   <tr key={i} className="hover:bg-gray-50 dark:bg-zinc-950/50 transition-colors">
                     <td className="px-6 py-4 font-medium text-gray-900 dark:text-zinc-50">{e.endpoint}</td>
                     <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{e.hits}</td>
                     <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{e.tokens.toLocaleString()}</td>
                     <td className="px-6 py-4 text-emerald-600 font-medium">${e.cost.toFixed(4)}</td>
                     <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">{e.avg_latency.toFixed(0)}ms</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
          )}

        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string, value: string | number, sub: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col justify-between h-full">
      <h3 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{title}</h3>
      <div className="mt-2">
        <span className="text-3xl font-bold text-gray-900 dark:text-zinc-50">{value}</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">{sub}</p>
    </div>
  );
}
