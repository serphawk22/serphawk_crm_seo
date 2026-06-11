"use client";

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Search, Map as MapIcon, Loader2, Navigation, 
  ShieldAlert, Building2, Globe, Star, Activity, CheckCircle2, XCircle
} from 'lucide-react';
import { API_BASE_URL } from '@/config';
import dynamic from 'next/dynamic';

const RadarMap = dynamic(() => import('./RadarMap'), { ssr: false });

export default function CompetitorRadarPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [radarState, setRadarState] = useState<'extracting' | 'searching' | 'analyzing' | 'complete'>('extracting');
  const [competitors, setCompetitors] = useState<any[]>([]);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${id}`);
      if (res.ok) {
        const data = await res.json();
        setClient(data.client);
        startRadarSimulation(data.client);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const startRadarSimulation = async (clientData: any) => {
    setLoading(false);
    setRadarState('searching');
    
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${clientData.id}/competitors/scan`);
      if (res.ok) {
        setRadarState('analyzing');
        const data = await res.json();
        
        // Ensure lat/lng are set on the client object for the map center
        setClient((prev: any) => ({ ...prev, lat: data.lat, lng: data.lng }));
        
        // Update competitors list
        if (data.competitors && Array.isArray(data.competitors)) {
            setCompetitors(data.competitors);
        }
        setRadarState('complete');
      } else {
        const err = await res.json();
        console.error("Scan error:", err);
        setRadarState('complete'); // Handle error gracefully (e.g., show empty state)
      }
    } catch (e) {
      console.error(e);
      setRadarState('complete');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (loading) return <div className="p-10 text-white">Loading Radar...</div>;

  const parseServices = (str?: string) => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map((s: any) => s.name || s);
      return [str];
    } catch {
      return [str];
    }
  };

  const clientServices = parseServices(client?.services_offered);

  return (
    <div className="max-w-[1500px] mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 glass-card rounded-xl text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 flex items-center gap-3">
            Competitor Radar <Navigation className="w-6 h-6 text-indigo-400" />
          </h1>
          <p className="text-slate-400 font-medium text-sm mt-1">Intelligence scan for {client?.companyName || client?.projectName}</p>
        </div>
      </div>

      {radarState !== 'complete' ? (
        <div className="h-[60vh] glass-card rounded-[2.5rem] flex flex-col items-center justify-center p-10 text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="w-24 h-24 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin flex items-center justify-center relative z-10">
              <Navigation className="w-8 h-8 text-indigo-400 animate-pulse" />
            </div>
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2">
            {radarState === 'extracting' && "Extracting Client Intelligence..."}
            {radarState === 'searching' && "Scanning Local Radius via Google Places..."}
            {radarState === 'analyzing' && "Analyzing Service Match & Price Intelligence..."}
          </h2>
          <p className="text-slate-400 max-w-md">Our AI is actively mapping the local competitive landscape based on industry keywords, location data, and service overlap.</p>
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" variants={containerVariants} className="space-y-6">
          
          {/* Top Row: Intelligence Card & Map */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <motion.div variants={itemVariants} className="glass-card rounded-[2rem] p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl"><Activity className="w-6 h-6" /></div>
                  <h3 className="text-xl font-black text-white">Intelligence Summary</h3>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Competitors</p>
                      <p className="text-3xl font-black text-white">{competitors.length}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Avg Rating</p>
                      <p className="text-3xl font-black text-white flex items-center gap-2">4.7 <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" /></p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Strongest Match</p>
                    {competitors.length > 0 ? (
                      <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="font-bold text-red-400">{competitors[0].name}</p>
                          <p className="text-xs text-red-400/70">{competitors[0].distance} away</p>
                        </div>
                        <span className="text-xl font-black text-red-400">{competitors[0].similarity}%</span>
                      </div>
                    ) : (
                      <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                        <p className="text-sm text-slate-400">No competitors found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button className="w-full mt-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Auto Monitor (Weekly)
              </button>
            </motion.div>

            <motion.div variants={itemVariants} className="xl:col-span-2 glass-card rounded-[2rem] p-2 overflow-hidden h-[400px] border border-white/10">
               <RadarMap clientLat={client?.lat || 37.7749} clientLng={client?.lng || -122.4194} competitors={competitors} clientName={client?.companyName || client?.projectName} />
            </motion.div>
          </div>

          {/* Competitor Table */}
          <motion.div variants={itemVariants} className="glass-card rounded-[2rem] border border-white/10 overflow-hidden">
             <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <h3 className="text-lg font-black text-white flex items-center gap-2"><Building2 className="w-5 h-5" /> Detailed Radar Data</h3>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold border border-red-500/30">Direct (1)</span>
                  <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-bold border border-orange-500/30">Partial (1)</span>
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30">Partner (1)</span>
                </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="bg-black/20 text-[10px] uppercase tracking-widest text-slate-400 border-b border-white/10">
                     <th className="px-6 py-4 font-black">Competitor</th>
                     <th className="px-6 py-4 font-black">Distance</th>
                     <th className="px-6 py-4 font-black">Rating</th>
                     <th className="px-6 py-4 font-black">Service Match</th>
                     <th className="px-6 py-4 font-black">Est. Pricing</th>
                     <th className="px-6 py-4 font-black text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {competitors.map(comp => (
                     <tr key={comp.id} className="hover:bg-white/5 transition-colors">
                       <td className="px-6 py-4">
                         <div className="font-bold text-white text-sm">{comp.name}</div>
                         <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1"><Globe className="w-3 h-3" /> {comp.website}</div>
                       </td>
                       <td className="px-6 py-4 text-sm text-slate-300 font-medium">{comp.distance}</td>
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                           {comp.rating} <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> <span className="text-[10px] text-slate-500 font-normal">({comp.reviews})</span>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex flex-col gap-1.5 w-[200px]">
                           <div className="flex items-center justify-between">
                             <span className={cn("text-xs font-bold", comp.type === 'direct' ? 'text-red-400' : comp.type === 'partial' ? 'text-orange-400' : 'text-emerald-400')}>{comp.similarity}% Match</span>
                           </div>
                           <div className="flex flex-wrap gap-1">
                             {comp.services.map((s: string) => (
                               <span key={s} className="px-1.5 py-0.5 bg-white/10 text-slate-300 text-[9px] rounded border border-white/10 uppercase tracking-wide">{s}</span>
                             ))}
                           </div>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-sm font-bold text-indigo-300">{comp.priceRange}</td>
                       <td className="px-6 py-4 text-right">
                         <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10">View Profile</button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}
