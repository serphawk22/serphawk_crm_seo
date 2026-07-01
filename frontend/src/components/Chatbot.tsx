"use client";

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Users, UserPlus, Mail, ChevronRight, Send, ShoppingBag, MessageCircle, Settings, Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { API_BASE_URL } from '@/config';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  response: string;
  route: string;
}

const ADMIN_ACTIONS: QuickAction[] = [
  { label: 'View Leads', icon: <Users className="w-3.5 h-3.5 text-blue-500" />, response: 'Taking you to the clients list.', route: '/clients' },
  { label: 'New Client', icon: <UserPlus className="w-3.5 h-3.5 text-emerald-500" />, response: 'Navigating to add a new customer.', route: '/clients?action=add' },
  { label: 'Draft Email', icon: <Mail className="w-3.5 h-3.5 text-purple-500" />, response: 'Opening the Email Agent.', route: '/email-agent' },
];

const CLIENT_ACTIONS: QuickAction[] = [
  { label: 'View Services', icon: <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />, response: 'Taking you to the services store.', route: '/store' },
  { label: 'My Messages', icon: <MessageCircle className="w-3.5 h-3.5 text-blue-500" />, response: 'Opening your messages inbox.', route: '/messages' },
  { label: 'Settings', icon: <Settings className="w-3.5 h-3.5 text-gray-500" />, response: 'Navigating to your account settings.', route: '/setup' },
];

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'bot' | 'user', text: string, action?: string }[]>([
    { role: 'bot', text: 'Hi! I am the SERP Hawk Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useRole();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isClientRoute = role === 'Client';
  const quickActions = isClientRoute ? CLIENT_ACTIONS : ADMIN_ACTIONS;

  const match = pathname?.match(/^\/admin\/clients\/(\d+)$/);
  const currentClientId = match ? parseInt(match[1]) : null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const handleCommand = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', text }]);
    
    // Check if it's a quick action first
    const action = quickActions.find(a => a.label === text);
    if (action) {
      setTimeout(() => {
        router.push(action.route);
        setMessages(prev => [...prev, { role: 'bot', text: action.response }]);
      }, 500);
      return;
    }

    setIsTyping(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chatbot/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          client_id: currentClientId,
          current_route: pathname
        })
      });
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || "I've processed your request.", action: data.action_taken }]);

      // Handle navigation actions
      if (data.action_taken === 'navigate' && data.route) {
        setTimeout(() => {
          router.push(data.route);
        }, 1500); // Small delay to read the message before jumping
      }
      
      // If a database mutation happened, trigger a global refresh
      else if (data.action_taken && data.action_taken !== 'trigger_whatsapp') {
        window.dispatchEvent(new Event('refresh-client-data'));
        window.dispatchEvent(new Event('refresh-marketplace-data'));
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I couldn't process that right now. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    handleCommand(input);
    setInput('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 w-80 lg:w-96 mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5" style={{ height: '520px' }}>
          {/* Header */}
          <div className="bg-indigo-600 text-white p-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <span className="font-bold text-sm tracking-wide">SERP Hawk Assistant</span>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-indigo-200 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Context Banner */}
          {currentClientId && (
            <div className="bg-indigo-50 px-4 py-2 flex items-center justify-center border-b border-indigo-100">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                Client Context Active
              </span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 min-h-0 p-4 overflow-y-auto bg-slate-50 dark:bg-zinc-950 flex flex-col gap-3">
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md' 
                      : 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 shadow-sm rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                  {msg.action === 'trigger_whatsapp' && (
                    <a 
                      href="https://wa.me/918519990425" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-3 block text-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-sm"
                    >
                      Chat on WhatsApp (+91 8519990425)
                    </a>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="max-w-[85%] p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-sm rounded-tl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  <span className="text-sm text-slate-500 dark:text-zinc-400">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions (Horizontal Pills) */}
          <div className="px-4 py-3 bg-white dark:bg-zinc-900 shrink-0 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleCommand(action.label)}
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 bg-slate-50 dark:bg-zinc-800/50 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full border border-slate-200/60 dark:border-zinc-700/60 text-[11px] font-bold text-slate-600 dark:text-zinc-300 transition-all hover:scale-105 active:scale-95 shadow-sm"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-700 flex gap-2 shrink-0">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={currentClientId ? "e.g., Log a call about pricing..." : "Type a message..."}
              className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Action Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-indigo-600 text-white p-4 rounded-full shadow-lg shadow-indigo-600/30 hover:shadow-xl hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 flex items-center justify-center group"
        >
          <MessageSquare className="w-6 h-6 group-hover:animate-pulse" />
        </button>
      )}
    </div>
  );
}
