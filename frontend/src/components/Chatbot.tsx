"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Users, UserPlus, Mail, ChevronRight, Send, ShoppingBag, MessageCircle, Settings, Loader2, Mic, MicOff } from 'lucide-react';
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

  const [liveChatStatus, setLiveChatStatus] = useState<'inactive' | 'pending' | 'active'>('inactive');
  
  // Persist session ID
  const [sessionId, setSessionId] = useState<string>('');
  
  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);
  
  useEffect(() => {
    let storedSession = localStorage.getItem('chatbot_session_id');
    if (!storedSession) {
      storedSession = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('chatbot_session_id', storedSession);
    }
    setSessionId(storedSession);
    
    // Fetch History
    fetch(`${API_BASE_URL}/chatbot/history/${storedSession}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.history && data.history.length > 0) {
          setMessages(data.history);
        }
      })
      .catch(console.error);
  }, []);

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

  useEffect(() => {
    if (liveChatStatus === 'inactive') return;

    let timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/chatbot/live-chat/${sessionId}/sync`);
        const data = await res.json();
        
        if (data.status === 'active' && liveChatStatus !== 'active') {
          setLiveChatStatus('active');
        } else if (data.status === 'ended' && liveChatStatus !== 'inactive') {
          setLiveChatStatus('inactive');
          setMessages(prev => [...prev, { role: 'bot', text: 'Live chat ended by the agent.' }]);
        }

        if (data.messages && data.messages.length > 0) {
          // Re-sync messages from admin that we don't have yet.
          // For simplicity, we just count admin messages vs what's in local state
          const adminMsgs = data.messages.filter((m: any) => m.sender === 'admin');
          setMessages(prev => {
            const localAdminCount = prev.filter(m => m.role === 'bot' && m.action === 'live_chat').length;
            if (adminMsgs.length > localAdminCount) {
              const newMsgs = adminMsgs.slice(localAdminCount).map((m: any) => ({
                role: 'bot' as const,
                text: m.message,
                action: 'live_chat'
              }));
              return [...prev, ...newMsgs];
            }
            return prev;
          });
        }
      } catch (e) {
        console.error("Live chat sync error", e);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [liveChatStatus, sessionId]);

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
      if (liveChatStatus === 'active') {
        const res = await fetch(`${API_BASE_URL}/chatbot/live-chat/${sessionId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        if (!data.ok) {
           setMessages(prev => [...prev, { role: 'bot', text: "Failed to send message. Live chat might have ended." }]);
           setLiveChatStatus('inactive');
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/chatbot/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            client_id: currentClientId,
            current_route: pathname,
            chat_history: messages.map(m => `${m.role}: ${m.text}`).join('\n') + `\nuser: ${text}`,
            session_id: sessionId
          })
        });
        const data = await res.json();
        
        setMessages(prev => [...prev, { role: 'bot', text: data.reply || "I've processed your request.", action: data.action_taken }]);
        
        if (data.action_taken === 'trigger_whatsapp') {
          setLiveChatStatus('pending');
        }

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

  const toggleListening = useCallback(() => {
    if (isListening) {
      setIsListening(false);
      return;
    }
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support speech recognition.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      setIsListening(true);
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => (prev ? prev + " " : "") + transcript);
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognition.start();
  }, [isListening]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 w-80 lg:w-96 mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5" style={{ height: '520px' }}>
          {/* Header */}
          <div className="bg-indigo-600 p-4 flex justify-between items-start shrink-0 rounded-t-2xl">
            <div className="flex gap-3 items-center">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm shadow-inner shrink-0 relative">
                <MessageSquare className="w-5 h-5 text-white" />
                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-indigo-600 ${liveChatStatus === 'active' ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
              </div>
              <div className="flex flex-col">
                <h3 className="font-bold text-white text-base leading-tight">
                  {liveChatStatus === 'active' ? "Live Support" : "AI Assistant"}
                </h3>
                <p className="text-[11px] font-medium text-emerald-100 flex items-center gap-1.5 opacity-90">
                  <span className={`w-1.5 h-1.5 rounded-full ${liveChatStatus === 'active' ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse ring-2 ring-white/20`} />
                  {liveChatStatus === 'active' ? "Agent Connected" : liveChatStatus === 'pending' ? "Connecting to agent..." : "Online · Replies instantly"}
                </p>
              </div>
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
                      href="https://wa.me/919502901416" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-3 block text-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-sm"
                    >
                      Chat on WhatsApp (+91 9502901416)
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
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2.5 rounded-xl transition-colors shadow-md flex items-center justify-center shrink-0 ${isListening ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : 'bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700'}`}
              title={isListening ? "Stop listening" : "Voice input"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={currentClientId ? "e.g., Log a call about pricing..." : "Type a message..."}
              className="flex-1 min-w-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shrink-0"
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
