import { useState, useEffect } from "react";
import { Plus, X, AlignLeft, Calendar, User, GitBranch, Link as LinkIcon } from "lucide-react";
import { API_BASE_URL } from "@/config";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

type ProjectTicket = {
  id?: number;
  competitor?: string;
  category?: string;
  task: string;
  github_link?: string;
  production_url?: string;
  current_state: string;
  requested_date?: string;
  requested_by?: string;
  current_owner_role?: string;
  current_owner?: string;
  date_dev_start?: string;
  date_dev_complete?: string;
  date_qa_start?: string;
  date_qa_complete?: string;
  date_release_prod?: string;
};

const KANBAN_COLUMNS = ["Planning", "In Dev", "Given to QA", "Prod Release"];

export default function KanbanTab({ projectId }: { projectId: string }) {
  const [tickets, setTickets] = useState<ProjectTicket[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<ProjectTicket | null>(null);

  // Form state
  const [form, setForm] = useState<ProjectTicket>({
    task: "",
    current_state: "Planning",
    competitor: "",
    category: "",
    github_link: "",
    production_url: "",
    requested_date: "",
    requested_by: "",
    current_owner_role: "",
    current_owner: "",
    date_dev_start: "",
    date_dev_complete: "",
    date_qa_start: "",
    date_qa_complete: "",
    date_release_prod: "",
  });

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/tickets`);
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [projectId]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return; // Same column

    const ticketId = Number(draggableId);
    const newStatus = destination.droppableId;
    
    // Optimistic UI update
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, current_state: newStatus } : t));

    try {
      await fetch(`${API_BASE_URL}/projects/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_state: newStatus })
      });
    } catch (e) {
      console.error("Failed to update status", e);
      fetchTickets(); // Revert on failure
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = selectedTicket?.id 
      ? `${API_BASE_URL}/projects/tickets/${selectedTicket.id}`
      : `${API_BASE_URL}/projects/${projectId}/tickets`;
    const method = selectedTicket?.id ? "PUT" : "POST";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    
    setShowModal(false);
    setSelectedTicket(null);
    setForm({ task: "", current_state: "Planning" });
    fetchTickets();
  };

  const openTicket = (t: ProjectTicket) => {
    setSelectedTicket(t);
    setForm(t);
    setShowModal(true);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">Project Board</h3>
        <button 
          onClick={() => {
            setSelectedTicket(null);
            setForm({ task: "", current_state: "Planning" });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} /> New Ticket
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map(col => (
            <Droppable key={col} droppableId={col}>
              {(provided) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className="bg-slate-100 dark:bg-zinc-900/50 p-4 rounded-3xl min-h-[500px] min-w-[300px]"
                >
                  <h4 className="text-sm font-black text-slate-500 dark:text-zinc-400 mb-4 px-2 uppercase tracking-widest flex items-center justify-between">
                    {col}
                    <span className="bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-2 py-0.5 rounded-full text-[10px]">
                      {tickets.filter(t => t.current_state === col).length}
                    </span>
                  </h4>
                  
                  <div className="space-y-3">
                    {tickets.filter(t => t.current_state === col).map((ticket, index) => (
                      <Draggable key={ticket.id} draggableId={String(ticket.id)} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => openTicket(ticket)}
                            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 cursor-pointer hover:shadow-md transition-all group"
                          >
                            {ticket.category && (
                              <span className="inline-block px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-md mb-2">
                                {ticket.category}
                              </span>
                            )}
                            <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm mb-2">{ticket.task}</h5>
                            
                            {ticket.competitor && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2 truncate">
                                Competitor: {ticket.competitor}
                              </p>
                            )}
                            
                            <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                              <span className="flex items-center gap-1">
                                <User size={12} /> {ticket.current_owner || 'Unassigned'}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* Ticket Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800 p-6 flex items-center justify-between z-10">
              <h2 className="text-xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">
                {selectedTicket ? "Edit Ticket" : "New Ticket"}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Left Column */}
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Ticket Title (Task)</label>
                    <input required type="text" value={form.task} onChange={e => setForm({...form, task: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Category</label>
                      <input type="text" value={form.category || ''} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Competitor</label>
                      <input type="text" value={form.competitor || ''} onChange={e => setForm({...form, competitor: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">GitHub Link</label>
                      <input type="url" value={form.github_link || ''} onChange={e => setForm({...form, github_link: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Prod URL</label>
                      <input type="url" value={form.production_url || ''} onChange={e => setForm({...form, production_url: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Requested By</label>
                      <input type="text" value={form.requested_by || ''} onChange={e => setForm({...form, requested_by: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Requested Date</label>
                      <input type="date" value={form.requested_date || ''} onChange={e => setForm({...form, requested_date: e.target.value})} className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>
                
                {/* Right Column */}
                <div className="space-y-5 bg-slate-50/50 dark:bg-zinc-900/30 p-6 rounded-3xl border border-slate-100 dark:border-zinc-800/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Owner Name</label>
                      <input type="text" value={form.current_owner || ''} onChange={e => setForm({...form, current_owner: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Owner Role</label>
                      <input type="text" value={form.current_owner_role || ''} onChange={e => setForm({...form, current_owner_role: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Dev Start</label>
                      <input type="date" value={form.date_dev_start || ''} onChange={e => setForm({...form, date_dev_start: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Dev Complete</label>
                      <input type="date" value={form.date_dev_complete || ''} onChange={e => setForm({...form, date_dev_complete: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">QA Start</label>
                      <input type="date" value={form.date_qa_start || ''} onChange={e => setForm({...form, date_qa_start: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">QA Complete</label>
                      <input type="date" value={form.date_qa_complete || ''} onChange={e => setForm({...form, date_qa_complete: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Prod Release Date</label>
                    <input type="date" value={form.date_release_prod || ''} onChange={e => setForm({...form, date_release_prod: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-3">
                {selectedTicket?.id && (
                  <button 
                    type="button" 
                    className="mr-auto px-5 py-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                    onClick={async () => {
                      if (confirm("Delete this ticket?")) {
                        await fetch(`${API_BASE_URL}/projects/tickets/${selectedTicket.id}`, { method: "DELETE" });
                        setShowModal(false);
                        fetchTickets();
                      }
                    }}
                  >
                    Delete Ticket
                  </button>
                )}
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-md">
                  Save Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
