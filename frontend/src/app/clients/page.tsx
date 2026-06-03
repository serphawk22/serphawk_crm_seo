"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  ExternalLink, 
  Clock, 
  ChevronRight, 
  Plus, 
  FileScan, 
  UploadCloud, 
  Loader2,
  Users,
  Briefcase,
  Globe,
  MoreVertical,
  Activity,
  Mail
} from 'lucide-react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
import { useRole } from '@/context/RoleContext';
import PageGuide from '@/components/PageGuide';

// Framer Motion Variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100 } }
};

interface ActivityLogEntry {
  id: number;
  action: string;
  method: string;
  content: string;
  details?: string;
  clientId: number;
  createdAt: string;
}

interface Client {
  id: number;
  projectName: string;
  category: string;
  email: string;
  status: string;
  keywords: string[];
  website: string;
  services_offered?: string;
  services_requested?: string;
  companyName?: string;
  lastActivity?: string;
  lastActivityDate?: string;
}

interface ClientStatusOption {
  id: number;
  name: string;
  color: string;
}

export default function ClientsPage() {
  const { t, language } = useLanguage();
  const { role, user } = useRole();
  const [clients, setClients] = useState<Client[]>([]);
  const [statuses, setStatuses] = useState<ClientStatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    companyName: '',
    websiteUrl: '',
    email: '',
    projectName: '',
    gmbName: '',
    seoStrategy: '',
    tagline: '',
    targetKeywords: ''
  });
  
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setOcrLoading(true);

    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/documents/ocr`, {
        method: 'POST',
        body: formDataUpload,
      });

      if (response.ok) {
        const result = await response.json();
        // Pre-fill form from OCR result
        setFormData(prev => ({
          ...prev,
          companyName: result.company_name || prev.companyName,
          email: result.email || prev.email,
          websiteUrl: result.website || prev.websiteUrl,
        }));
        setIsOCRModalOpen(false);
        setIsModalOpen(true); // Open standard Add Client modal with prefilled data
      } else {
        alert(language === 'es' ? "Fallo al extraer datos de la imagen." : "Failed to extract data from image.");
      }
    } catch (error) {
      console.error(error);
      alert(language === 'es' ? "Ocurrió un error durante la extracción OCR." : "An error occurred during OCR extraction.");
    } finally {
      setOcrLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);

  const fetchActivities = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/activities`);
      if (role === 'SalesManager' && user?.id) {
        url.searchParams.append('user_id', String(user.id));
      }
      const res = await fetch(url.toString());
      const data = await res.json();
      setActivities(data.activities || []);
    } catch (err) {
      console.error("Failed to fetch activities", err);
    }
  };

  useEffect(() => {
    fetchStatuses();
    fetchActivities();
  }, [role, user]);

  useEffect(() => {
    fetchClients();
  }, [filter, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchClients();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchStatuses = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/client-statuses`);
      const data = await res.json();
      setStatuses(data.statuses || []);
    } catch (err) {
      console.error("Failed to fetch statuses", err);
    }
  };

  const fetchClients = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const url = new URL(`${API_BASE_URL}/clients`);
      if (filter !== 'All') url.searchParams.append('status', filter);
      if (search.trim()) url.searchParams.append('query', search.trim());
      url.searchParams.append('page', String(page));
      url.searchParams.append('per_page', String(perPage));
      if (role === 'SalesManager' && user?.id) {
        url.searchParams.append('assigned_employee_id', String(user.id));
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      setClients(data.clients || []);
      setTotalCount(data.total || 0);
      setLoadTime(Math.round(performance.now() - start));
    } catch (error) {
      console.error("Error fetching clients:", error);
      setClients([]);
      setTotalCount(0);
      setLoadTime(null);
    } finally {
      setLoading(false);
    }
  };

  const [addLoading, setAddLoading] = useState(false);
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addLoading) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          targetKeywords: formData.targetKeywords.split(',').map(k => k.trim())
        })
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchClients();
        setFormData({
          companyName: '',
          websiteUrl: '',
          email: '',
          projectName: '',
          gmbName: '',
          seoStrategy: '',
          tagline: '',
          targetKeywords: ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddLoading(false);
    }
  };

  // Delete client handler
  const handleDeleteClient = async (clientId: number) => {
    if (!window.confirm(language === 'es' ? '¿Estás seguro de que quieres eliminar este cliente?' : 'Are you sure you want to delete this client?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${clientId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchClients();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredClients = clients;

  const StatusBadge = ({ statusName }: { statusName: string }) => {
    const statusObj = statuses.find(s => s.name === statusName);
    const colorClass = statusObj ? statusObj.color.replace('bg-', 'text-').replace('500', '600') : "text-gray-500";
    const bgClass = statusObj ? statusObj.color.replace('bg-', 'bg-').replace('500', '100') : "bg-gray-100";
    
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-white/40 shadow-sm", bgClass, colorClass)}>
        <div className={cn("w-1.5 h-1.5 rounded-full", statusObj ? statusObj.color : 'bg-gray-500')}></div>
        {statusName}
      </div>
    );
  };

  if (loading && clients.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 animate-pulse">{language === 'es' ? 'Cargando Directorio de Clientes...' : 'Loading Client Directory...'}</h2>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto flex flex-col xl:flex-row gap-8">
      <motion.div 
        initial="hidden" animate="show" variants={containerVariants}
        className="flex-1 space-y-8 min-w-0"
      >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10 w-full bg-white/40 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 tracking-tight">{t("clients.title")}</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">{t("clients.description")}</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => setIsOCRModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white/70 backdrop-blur-md text-indigo-700 border border-indigo-100 rounded-xl font-bold hover:bg-white hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            <FileScan className="w-5 h-5" /> <span className="hidden sm:inline">{t("clients.ocr_scan")}</span>
          </button>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl font-bold shadow-[0_8px_20px_rgba(79,70,229,0.3)] hover:shadow-[0_8px_30px_rgba(79,70,229,0.5)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> {t("clients.add_client")}
          </button>
        </div>
      </motion.div>

      <PageGuide
        pageKey="clients"
        title={language === 'es' ? 'Cómo funciona el Hub de Clientes' : 'How the Client Hub works'}
        description={language === 'es' ? 'Su centro de mando para gestionar todas las cuentas de clientes, contactos e inteligencia.' : 'Your central command for managing all client accounts, contacts, and intelligence.'}
        steps={[
          { icon: '➕', text: language === 'es' ? 'Haga clic en "Agregar Cliente" para crear una nueva cuenta con el nombre de la empresa, sitio web, correo electrónico y palabras clave.' : 'Click "Add Client" to create a new account with company name, website, email, and keywords.' },
          { icon: '📷', text: language === 'es' ? 'Utilice "Escaneo OCR" para extraer detalles del cliente de una foto de tarjeta de visita automáticamente.' : 'Use "OCR Scan" to extract client details from a business card photo automatically.' },
          { icon: '🔍', text: language === 'es' ? 'Busque por nombre o empresa y use filtros para encontrar rápidamente a cualquier cliente.' : 'Search by name or company and use filters to quickly find any client.' },
          { icon: '👁️', text: language === 'es' ? 'Haga clic en cualquier tarjeta de cliente para ver su perfil completo, servicios, auditoría e historial de comunicación.' : 'Click any client card to view their full profile, services, audit, and communication history.' },
        ]}
      />

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Users className="w-16 h-16 text-indigo-600" /></div>
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">{t("clients.total_accounts")}</p>
          <p className="text-4xl font-black text-slate-800">{totalCount}</p>
          {loadTime !== null && (
            <p className="text-[10px] text-slate-400 mt-2">Loaded in {loadTime}ms</p>
          )}
        </div>
        {statuses.slice(0, 3).map((status) => (
          <div key={status.id} className="bg-white/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/60 shadow-sm relative overflow-hidden group">
             <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: status.color.replace('bg-', '') || '#6366f1' }}></div>
             <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2 pl-2">{status.name}</p>
             <p className="text-4xl font-black text-slate-800 pl-2">{clients.filter(c => c.status === status.name).length}</p>
          </div>
        ))}
      </motion.div>

      {/* Main Glass Box */}
      <motion.div variants={itemVariants} className="bg-white/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="p-6 border-b border-white/60 flex flex-col md:flex-row gap-6 justify-between items-center bg-white/20">
          <div className="relative w-full md:w-[28rem]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
            <input 
              type="text" 
              placeholder={t("clients.search_placeholder")} 
              className="w-full pl-12 pr-4 py-3 bg-white/70 border border-white/80 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium text-slate-700 placeholder:text-slate-400 shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <button 
              onClick={() => { setFilter('All'); setPage(1); }}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors",
                filter === 'All' ? "bg-indigo-600 text-white shadow-md" : "bg-white/60 text-slate-600 hover:bg-white"
              )}
            >
              {t("clients.all_hubs")}
            </button>
            {statuses.map(stat => (
              <button 
                key={stat.id}
                onClick={() => { setFilter(stat.name); setPage(1); }}
                className={cn(
                  "px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors",
                  filter === stat.name ? "bg-indigo-600 text-white shadow-md" : "bg-white/60 text-slate-600 hover:bg-white"
                )}
              >
                {stat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredClients.map(client => (
                <motion.div
                  key={client.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="relative"
                  onMouseEnter={() => setHoveredId(client.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Link 
                    href={`/admin/clients/${client.id}`}
                    className="block h-full bg-white/60 backdrop-blur-md border border-white/80 rounded-[2rem] p-6 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform"></div>
                    
                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div>
                        <h3 className="font-black text-xl text-slate-800 group-hover:text-indigo-600 transition-colors tracking-tight line-clamp-1">
                          {client.companyName || client.projectName || client.email || 'Unnamed Client'}
                        </h3>
                        {client.email && (
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1 line-clamp-1">
                            <Mail className="w-3 h-3" /> {client.email}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge statusName={client.status} />
                        <button onClick={e => { e.preventDefault(); e.stopPropagation(); handleDeleteClient(client.id); }} title="Delete client" className="ml-2 p-1.5 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>

                                <div className="space-y-4 relative z-10">
                      <div className="flex items-center gap-3 text-sm text-slate-600 bg-white/50 p-3 rounded-2xl border border-white/40">
                        <div className="p-1.5 bg-indigo-50 text-indigo-500 rounded-lg"><Globe className="w-4 h-4" /></div>
                        <span className="truncate font-medium">{client.website || (language === 'es' ? 'Sin sitio web' : 'No website')}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-3 text-sm text-slate-600 bg-white/50 p-3 rounded-2xl border border-white/40">
                          <div className="p-1.5 bg-cyan-50 text-cyan-500 rounded-lg"><Activity className="w-4 h-4" /></div>
                          <div className="flex flex-col">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-slate-400">{language === 'es' ? 'Última Actividad' : 'Last Activity'}</span>
                            <span className="truncate font-medium">{client.lastActivity || (language === 'es' ? 'Aún sin actividades' : 'No activities yet')}</span>
                          </div>
                        </div>
                        {(client.services_requested || client.services_offered) && (
                          <div className="flex flex-col gap-2 text-sm text-slate-600 bg-white/50 p-3 rounded-2xl border border-white/40">
                            {client.services_requested && (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-sky-100 text-sky-700 rounded-full text-[11px] font-bold">{language === 'es' ? 'Solicitado' : 'Requested'}</span>
                                <span className="truncate font-medium">{client.services_requested}</span>
                              </div>
                            )}
                            {client.services_offered && (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-bold">{language === 'es' ? 'Ofrecido' : 'Offered'}</span>
                                <span className="truncate font-medium">{client.services_offered}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-white/60 flex justify-between items-center relative z-10">
                      <div className="flex flex-wrap gap-1.5">
                        {client.keywords && client.keywords.slice(0, 2).map((kw, i) => (
                          <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                            {kw}
                          </span>
                        ))}
                        {client.keywords && client.keywords.length > 2 && (
                          <span className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-md text-[10px] font-bold uppercase tracking-wider">
                            +{client.keywords.length - 2}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>

                  {/* Hover Activity Tooltip */}
                  <AnimatePresence>
                    {hoveredId === client.id && client.lastActivity && client.lastActivity !== 'No activities yet' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute bottom-full left-0 right-0 mb-3 z-50 pointer-events-none px-1"
                      >
                        <div className="bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl shadow-2xl p-4 border border-white/10">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">{language === 'es' ? 'Actividad Reciente' : 'Recent Activity'}</p>
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-indigo-500/20 rounded-lg shrink-0 mt-0.5">
                              <Activity className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-white leading-snug line-clamp-2">{client.lastActivity}</p>
                              {client.lastActivityDate && (
                                <p className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(client.lastActivityDate).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Arrow pointing down */}
                          <div className="absolute -bottom-2 left-8 w-4 h-4 bg-slate-900/90 rotate-45 border-r border-b border-white/10"></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {filteredClients.length === 0 && (
              <div className="col-span-1 md:col-span-2 xl:col-span-3 py-20 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-white/60 rounded-full flex items-center justify-center mb-4 shadow-sm">
                   <Search className="w-10 h-10 text-indigo-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700">{language === 'es' ? 'No se encontraron clientes' : 'No clients found'}</h3>
                <p className="text-slate-500 mt-2 font-medium max-w-sm">{language === 'es' ? 'Intente ajustar su búsqueda o filtros para encontrar lo que busca.' : 'Try adjusting your search query or filters to find what you\'re looking for.'}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {(totalCount > 0 || clients.length > 0) && (
        <div className="flex flex-col gap-2 md:flex-row items-center justify-between px-4 py-3 rounded-3xl bg-white/80 border border-white/70 shadow-sm">
          <p className="text-sm text-slate-500">
            {language === 'es' ? 'Mostrando' : 'Showing'} {(page - 1) * perPage + 1} - {Math.min(page * perPage, totalCount || clients.length)} {language === 'es' ? 'de' : 'of'} {totalCount || clients.length} {language === 'es' ? 'clientes' : 'clients'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 transition-all"
            >
              {language === 'es' ? 'Anterior' : 'Previous'}
            </button>
            <span className="text-sm font-bold text-slate-700">{language === 'es' ? 'Página' : 'Page'} {page} {language === 'es' ? 'de' : 'of'} {Math.max(1, Math.ceil((totalCount || clients.length) / perPage))}</span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil((totalCount || clients.length) / perPage), p + 1))}
              disabled={page >= Math.ceil((totalCount || clients.length) / perPage)}
              className="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 transition-all"
            >
              {language === 'es' ? 'Siguiente' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {/* Modals remain structurally similar, but updated with glassmorphism */}
      <AnimatePresence>
        {isOCRModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white/80 backdrop-blur-2xl border border-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 text-center relative overflow-hidden"
            >
               <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
               <div className="flex justify-between items-center mb-8">
                 <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800">
                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><FileScan className="w-6 h-6" /></div>
                    {language === 'es' ? 'Escaneo Inteligente' : 'Smart Scan'}
                 </h2>
                 <button onClick={() => setIsOCRModalOpen(false)} className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors">&times;</button>
               </div>
               
               <div className="border-2 border-dashed border-indigo-200/50 rounded-3xl p-12 flex flex-col items-center justify-center bg-white/50 relative hover:bg-white/80 hover:border-indigo-400 transition-all group">
                   <input 
                     type="file" 
                     accept="image/*"
                     onChange={handleFileUpload}
                     disabled={ocrLoading}
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                   />
                   
                   {ocrLoading ? (
                     <div className="flex flex-col items-center justify-center text-indigo-600">
                       <Loader2 className="w-12 h-12 animate-spin mb-4" />
                       <p className="font-bold text-lg">{language === 'es' ? 'Extrayendo Datos...' : 'Extracting Data...'}</p>
                       <p className="text-xs text-indigo-400 mt-1 font-medium">{language === 'es' ? 'El motor neuronal está procesando la imagen' : 'Neural engine is processing the image'}</p>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-indigo-600 transition-colors">
                       <UploadCloud className="w-12 h-12 mb-4" />
                       <p className="font-bold text-lg text-slate-700">{language === 'es' ? 'Suelte la Tarjeta de Visita Aquí' : 'Drop Visiting Card Here'}</p>
                       <p className="text-xs mt-2 font-medium">{language === 'es' ? 'Extrae Nombre, Email, Sitio Web automáticamente' : 'Auto-extracts Name, Email, Website'}</p>
                     </div>
                   )}
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <motion.div 
               initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
               className="bg-white/90 backdrop-blur-2xl rounded-[2rem] border border-white shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/50">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">{language === 'es' ? 'Agregar Nuevo Cliente' : 'Add New Client'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors">&times;</button>
              </div>
              <div className="overflow-y-auto p-8 custom-scrollbar">
                <form onSubmit={handleAddClient} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Nombre de Empresa' : 'Company Name'}</label>
                      <input required className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'URL del Sitio Web' : 'Website URL'}</label>
                      <input required className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.websiteUrl} onChange={e => setFormData({...formData, websiteUrl: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">Email</label>
                      <input required type="email" className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Nombre del Proyecto' : 'Project Name'}</label>
                      <input className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Nombre GMB' : 'GMB Name'}</label>
                      <input className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.gmbName} onChange={e => setFormData({...formData, gmbName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Estrategia SEO' : 'SEO Strategy'}</label>
                      <input className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.seoStrategy} onChange={e => setFormData({...formData, seoStrategy: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Lema' : 'Tagline'}</label>
                    <input className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium" value={formData.tagline} onChange={e => setFormData({...formData, tagline: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">{language === 'es' ? 'Palabras Clave Objetivo (separadas por coma)' : 'Target Keywords (comma separated)'}</label>
                    <textarea className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm font-medium min-h-[100px]" value={formData.targetKeywords} onChange={e => setFormData({...formData, targetKeywords: e.target.value})} />
                  </div>
                  
                  <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">{language === 'es' ? 'Cancelar' : 'Cancel'}</button>
                    <button type="submit" className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl font-bold hover:shadow-[0_8px_30px_rgba(79,70,229,0.3)] shadow-[0_4px_15px_rgba(79,70,229,0.2)] hover:-translate-y-0.5 transition-all">{language === 'es' ? 'Crear Cliente' : 'Create Client'}</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>

      {/* Activity Sidebar */}
      <motion.div
        initial="hidden" animate="show" variants={itemVariants}
        className="w-full xl:w-96 shrink-0 space-y-6"
      >
        <div className="bg-white/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.05)] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Activity className="w-5 h-5" /></div>
            <h3 className="text-lg font-black text-slate-800">{language === 'es' ? 'Actividad Reciente' : 'Recent Activity'}</h3>
          </div>
          <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">{language === 'es' ? 'No hay actividad.' : 'No activity yet.'}</p>
            ) : (
              activities.map(act => (
                <Link href={act.clientId ? `/admin/clients/${act.clientId}` : '#'} key={act.id} className="block p-4 bg-white/60 hover:bg-white rounded-2xl border border-white/80 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">{act.action}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{new Date(act.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors line-clamp-2">{act.content}</p>
                  {act.details && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-1">{act.details}</p>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      </motion.div>

    </div>
  );
}
