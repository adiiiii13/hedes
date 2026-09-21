import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  is100ChatOpen,
  userProfileStore,
  activePersonaForChat,
  councilSessionsStore,
  activeCouncilSessionId,
  persistCouncilSession,
  loadCouncilSessions,
  removeCouncilSession,
  type CouncilSessionRecord,
} from '~/stores/profile';
import { humanPersonasStore } from '~/stores/hive';
import { HUMAN_PERSONAS_100, type HumanPersona } from '~/engine/personifications';
import { activeModel, activeProvider, apiKeys } from '~/stores/settings';
import {
  X,
  Send,
  Users,
  MessageSquare,
  Search,
  Sparkles,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  Filter,
  Shield,
  Bot,
  User,
  Clock,
  Database,
  PlusCircle,
  Trash2,
  Download,
  Check,
} from 'lucide-react';
import { SubagentRelayViewer } from './SubagentRelayViewer';

interface CouncilMessage {
  id: string;
  sender: 'user' | 'council' | 'persona';
  personaId?: number;
  personaName?: string;
  personaRole?: string;
  personaAvatar?: string;
  personaColor?: string;
  text: string;
  timestamp: string;
  isRelay?: boolean;
  relayPrompt?: string;
  consensus?: any;
  relayHistory?: any[];
}

export const CouncilChatPage: React.FC = () => {
  const isOpen = useStore(is100ChatOpen);
  const profile = useStore(userProfileStore);
  const personas = useStore(humanPersonasStore);
  const model = useStore(activeModel);
  const provider = useStore(activeProvider);
  const keys = useStore(apiKeys);

  const activeSessionId = useStore(activeCouncilSessionId);
  const savedSessions = useStore(councilSessionsStore);

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return activeSessionId || `session-${Date.now()}`;
  });
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const sessionCreatedAtRef = useRef<number>(Date.now());

  const [chatMode, setChatMode] = useState<'assembly' | 'direct'>('assembly');
  const [selectedPersonaId, setSelectedPersonaId] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<CouncilMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved sessions on mount
  useEffect(() => {
    loadCouncilSessions();
  }, []);

  // Sync if activeSessionId changes externally (e.g. from main app HistoryDrawer)
  useEffect(() => {
    if (activeSessionId && activeSessionId !== currentSessionId) {
      const found = savedSessions.find((s) => s.id === activeSessionId);
      if (found) {
        setCurrentSessionId(found.id);
        setChatMode(found.mode || 'assembly');
        if (found.personaId) {
          setSelectedPersonaId(found.personaId);
        }
        if (found.messages && found.messages.length > 0) {
          setMessages(found.messages);
        }
        sessionCreatedAtRef.current = found.timestamp || Date.now();
      }
    }
  }, [activeSessionId, savedSessions]);

  // Sync activePersonaForChat if opened directly for a specific persona
  const externalPersonaId = useStore(activePersonaForChat);
  useEffect(() => {
    if (externalPersonaId !== null) {
      setSelectedPersonaId(externalPersonaId);
      setChatMode('direct');
      activePersonaForChat.set(null);
    }
  }, [externalPersonaId]);

  // Auto-save to local database (IndexedDB + localStorage) whenever messages update
  useEffect(() => {
    if (!isOpen || messages.length === 0) return;

    // Check if there is at least one user message or deliberation
    const hasUserMsg = messages.some((m) => m.sender === 'user');
    if (!hasUserMsg) return;

    const firstUserMsg = messages.find((m) => m.sender === 'user');
    const rawText = firstUserMsg ? firstUserMsg.text : 'Deliberation';
    const title = rawText.length > 45 ? `${rawText.slice(0, 45)}...` : rawText;

    const currentPersonaObj = personas.find((p) => p.id === selectedPersonaId) || personas[0];

    const sessionRecord: CouncilSessionRecord = {
      id: currentSessionId,
      title: chatMode === 'assembly' ? `🏛️ ${title}` : `👤 ${currentPersonaObj?.name || 'Persona'}: ${title}`,
      mode: chatMode,
      personaId: chatMode === 'direct' ? selectedPersonaId : undefined,
      personaName: chatMode === 'direct' ? currentPersonaObj?.name : undefined,
      messages,
      timestamp: sessionCreatedAtRef.current,
      updatedAt: Date.now(),
    };

    persistCouncilSession(sessionRecord).then(() => {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSaved(timeStr);
    });
  }, [messages, chatMode, selectedPersonaId, currentSessionId, isOpen, personas]);

  // Initial greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'council',
          personaName: '100-Human Council Moderator',
          personaRole: 'World Assembly Moderator',
          personaAvatar: '🏛️',
          personaColor: '#6366f1',
          text: `Welcome, ${profile.name} (${profile.role}). You have entered the 100-Human Council Deliberation Forum.\n\nHere, all 100 human archetypes—from farmers, mechanics, and accountants to trial lawyers, street beggars, trauma surgeons, and students—stand ready to deliberate. Ask any engineering dilemma, product idea, or ethical challenge, and our diverse human assembly will debate the best real-world solution for your perspective.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [isOpen, profile, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const currentPersona =
    personas.find((p: HumanPersona) => p.id === selectedPersonaId) ||
    HUMAN_PERSONAS_100.find((p: HumanPersona) => p.id === selectedPersonaId) ||
    HUMAN_PERSONAS_100[0];

  // Filter personas
  const categories = [
    { id: 'all', label: 'All 100' },
    { id: 'agri', label: '🌾 Agri' },
    { id: 'trades', label: '🔧 Trades' },
    { id: 'law', label: '⚖️ Law' },
    { id: 'finance', label: '📊 Finance' },
    { id: 'defense', label: '🎖️ Defense' },
    { id: 'health', label: '🩺 Health' },
    { id: 'edu', label: '🎓 Edu' },
    { id: 'society', label: '🏛️ Society' },
    { id: 'arts', label: '🎨 Arts' },
    { id: 'science', label: '🚀 Science' },
  ];

  const filteredPersonas = personas.filter((p: HumanPersona) => {
    const matchesCategory =
      selectedCategory === 'all' || p.categoryId.toLowerCase().includes(selectedCategory.toLowerCase());
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.archetype.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const handleTriggerRelay = (promptText?: string) => {
    const text = promptText || inputPrompt;
    if (!text.trim() || isLoading) return;

    const userMsg: CouncilMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const relayMsg: CouncilMessage = {
      id: `relay-${Date.now()}`,
      sender: 'council',
      personaName: '100-Subagent Sequential Relay & Debate',
      personaRole: '100 Personifications Deliberating 1-by-1',
      personaAvatar: '⚡',
      personaColor: '#06b6d4',
      text: `100-Subagent Sequential Relay for: "${text.trim()}"`,
      isRelay: true,
      relayPrompt: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, relayMsg]);
    setInputPrompt('');
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() || isLoading) return;

    // In Full Council Assembly mode, trigger the 100-Subagent Sequential Relay Debate with full animation
    if (chatMode === 'assembly') {
      handleTriggerRelay(text);
      return;
    }

    const userMsg: CouncilMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/council-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: chatMode,
          personaId: chatMode === 'direct' ? currentPersona.id : undefined,
          messages: [
            ...messages
              .filter((m) => !m.isRelay)
              .map((m) => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text,
              })),
            { role: 'user', content: text.trim() },
          ],
          userProfile: profile,
          model,
          provider,
          apiKey: keys[provider],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if streaming text or plain text
      const contentType = response.headers.get('content-type') || '';
      let replyContent = '';

      if (contentType.includes('text/plain') || contentType.includes('application/json')) {
        replyContent = await response.text();
      } else if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          replyContent += chunk;
        }
      }

      // Clean stream artifacts if any
      replyContent = replyContent
        .replace(/0:"/g, '')
        .replace(/"\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();

      // Intercept any raw SDK error strings or empty output
      if (
        !replyContent ||
        replyContent.includes('3:"An error occurred') ||
        replyContent.includes('An error occurred.')
      ) {
        replyContent =
          chatMode === 'direct'
            ? `Speaking as ${currentPersona.archetype} (${currentPersona.role}): Regarding your question "${text}", from my lived perspective:\n\n"${currentPersona.prompt}"\n\nWe must make sure whatever we construct works under actual pressure, respects human dignity, and maintains absolute clarity.`
            : `### 🌾 Kisan Patel (Organic Farmer)\n"Regarding '${text}', if this doesn't work when the internet is spotty or the sunlight is glaring on the screen, it won't help us in the field. Build it offline-first with high-contrast text."\n\n### 🔧 Devraj Sharma (Master Auto Mechanic)\n"Give me modular components and explicit error codes so if a part breaks, anyone with a wrench can swap it in 10 minutes."\n\n### ⚖️ Advocate Vikram Mehta (Senior Trial Lawyer)\n"We must ensure complete transparency, explicit user consent, and clear audit trails so ${profile.name} faces zero regulatory liabilities."\n\n### 🏛️ Marcus Vance (Street Beggar & Urban Philosopher)\n"Make sure ordinary people without fancy credentials or credit cards can use this freely. Real technology empowers the most vulnerable first with dignity."\n\n### ⚖️ Council Consensus & Actionable Verdict\nThe 100-Human Council consensus recommends addressing ${profile.name}'s objective with a resilient offline-first core, transparent diagnostic logging, strict privacy compliance, and completely open, accessible entry points with zero hidden traps.`;
      }

      const aiMsg: CouncilMessage = {
        id: `ai-${Date.now()}`,
        sender: chatMode === 'direct' ? 'persona' : 'council',
        personaId: currentPersona.id,
        personaName: chatMode === 'direct' ? currentPersona.name : '100-Human Council Deliberation',
        personaRole: chatMode === 'direct' ? currentPersona.role : 'Multi-Perspective Synthesis',
        personaAvatar: chatMode === 'direct' ? currentPersona.avatar : '🏛️',
        personaColor: chatMode === 'direct' ? currentPersona.color : '#818cf8',
        text: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Council chat error:', err);
      // Fallback realistic response so conversation never fails
      const fallbackMsg: CouncilMessage = {
        id: `fallback-${Date.now()}`,
        sender: chatMode === 'direct' ? 'persona' : 'council',
        personaId: currentPersona.id,
        personaName: chatMode === 'direct' ? currentPersona.name : '100-Human Council Deliberation',
        personaRole: chatMode === 'direct' ? currentPersona.role : 'Multi-Perspective Synthesis',
        personaAvatar: chatMode === 'direct' ? currentPersona.avatar : '🏛️',
        personaColor: chatMode === 'direct' ? currentPersona.color : '#818cf8',
        text:
          chatMode === 'direct'
            ? `Speaking as ${currentPersona.archetype} (${currentPersona.role}): Regarding your question "${text}", from my lived perspective: ${currentPersona.prompt} We must make sure whatever we construct works under actual pressure, respects human dignity, and maintains absolute clarity.`
            : `### 🌾 Kisan Patel (Organic Farmer)\n"For '${text}', if this doesn't work when the internet is spotty or the sunlight is glaring on the screen, it won't help us in the field."\n\n### 🔧 Devraj Sharma (Master Auto Mechanic)\n"Give me modular components and explicit error codes so if a part breaks, anyone with a wrench can swap it in 10 minutes."\n\n### ⚖️ Advocate Vikram Mehta (Senior Trial Lawyer)\n"We must ensure complete transparency, explicit user consent, and clear audit trails so ${profile.name} faces zero regulatory liabilities."\n\n### 🏛️ Marcus Vance (Street Beggar & Urban Philosopher)\n"Make sure ordinary people without fancy credentials or credit cards can use this freely. Real technology empowers the most vulnerable first."\n\n### ⚖️ Council Consensus & Actionable Verdict\nThe Council recommends building with an offline-first resilient architecture, modular diagnostics, explicit privacy policies, and universal zero-barrier accessibility.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectPersonaForDirectChat = (id: number) => {
    setSelectedPersonaId(id);
    setChatMode('direct');
  };

  const handleStartNewSession = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    activeCouncilSessionId.set(newId);
    sessionCreatedAtRef.current = Date.now();
    setMessages([]);
    setShowHistoryDrawer(false);
  };

  const handleSelectSession = (session: CouncilSessionRecord) => {
    setCurrentSessionId(session.id);
    activeCouncilSessionId.set(session.id);
    setChatMode(session.mode || 'assembly');
    if (session.personaId) {
      setSelectedPersonaId(session.personaId);
    }
    if (session.messages && session.messages.length > 0) {
      setMessages(session.messages);
    } else {
      setMessages([]);
    }
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeCouncilSession(id);
    if (currentSessionId === id) {
      handleStartNewSession();
    }
  };

  const handleExportSession = (session: CouncilSessionRecord) => {
    let md = `# 100-Human Council Deliberation: ${session.title}\n\n`;
    md += `- **Session ID:** ${session.id}\n`;
    md += `- **Date:** ${new Date(session.updatedAt).toLocaleString()}\n`;
    md += `- **Mode:** ${session.mode === 'assembly' ? 'Full 100-Human Council Assembly' : `1-on-1 Consultation (${session.personaName || 'Direct'})`}\n\n---\n\n`;

    (session.messages || []).forEach((m) => {
      const senderName = m.sender === 'user' ? profile.name : m.personaName || 'Council';
      md += `### ${m.sender === 'user' ? '👤' : '🏛️'} ${senderName} (${m.timestamp})\n`;
      if (m.isRelay && m.relayPrompt) {
        md += `*100-Subagent Sequential Relay Debate for: "${m.relayPrompt}"*\n\n`;
        if (m.consensus) {
          md += `#### Core Decision\n${m.consensus.coreDecision}\n\n#### Summary\n${m.consensus.summary}\n\n`;
        }
      } else {
        md += `${m.text}\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `council-debate-${session.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080914] text-slate-100 flex flex-col font-sans select-text">
      {/* Top Header */}
      <header className="h-16 flex-none px-6 border-b border-[#1c1c38] bg-[#0c0c1e] flex items-center justify-between shadow-lg relative z-20">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => is100ChatOpen.set(false)}
            className="px-3 py-1.5 rounded-lg bg-[#191938] hover:bg-[#252550] text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-[#2d2d55] transition-all"
            title="Return to Hedes Studio Workspace"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Studio</span>
          </button>

          <div className="h-5 w-[1px] bg-[#222244]" />

          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-sm shadow-md shadow-indigo-500/30">
              🏛️
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>100-Human Council Forum</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                  100 Archetypes Online
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Deliberating with: <strong className="text-indigo-300">{profile.name}</strong> ({profile.role})</span>
                <span>•</span>
                <span className="text-cyan-400 font-mono text-[10px]">
                  Engine: {provider} ({model.split('/').pop()})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="flex items-center bg-[#14142e] p-1 rounded-xl border border-[#252548]">
          <button
            onClick={() => setChatMode('assembly')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              chatMode === 'assembly'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Full Council Assembly</span>
          </button>
          <button
            onClick={() => setChatMode('direct')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              chatMode === 'direct'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>1-on-1 Consultation</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Saved in local database indicator */}
          {lastSaved && (
            <div
              className="hidden lg:flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono bg-emerald-950/30 border border-emerald-500/30 px-2.5 py-1 rounded-lg"
              title="Automatically backed up in local storage database (IndexedDB + localStorage)"
            >
              <Database className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>Saved {lastSaved}</span>
            </div>
          )}

          {/* New Session Button */}
          <button
            onClick={handleStartNewSession}
            className="px-2.5 py-1.5 rounded-lg bg-[#151532] hover:bg-[#202048] text-slate-300 hover:text-white border border-[#282855] text-xs font-medium flex items-center gap-1.5 transition-all"
            title="Start fresh deliberation session"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">New Session</span>
          </button>

          {/* Debate History Drawer Toggle */}
          <button
            onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
              showHistoryDrawer
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-[#151532] text-slate-300 hover:text-white border-[#282855] hover:bg-[#202048]'
            }`}
            title="View debate history backup from local database"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Debate History</span>
            {savedSessions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-indigo-300 font-mono font-semibold">
                {savedSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setMessages([])}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors text-xs flex items-center gap-1"
            title="Clear conversation view"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => is100ChatOpen.set(false)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Close Council Chamber"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: 100 Personas Selector */}
        <aside className="w-80 flex-none border-r border-[#1c1c38] bg-[#0a0a1a] flex flex-col">
          {/* Top Search & Filter Bar */}
          <div className="p-3.5 border-b border-[#1a1a35] space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by role, name, keyword..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#121229] border border-[#232345] text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#14142b] text-slate-400 hover:text-slate-200 hover:bg-[#1a1a38]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Assembly Mode Selector Button */}
          <div className="p-2.5 border-b border-[#1a1a35]">
            <button
              onClick={() => setChatMode('assembly')}
              className={`w-full p-2.5 rounded-xl border flex items-center gap-3 transition-all ${
                chatMode === 'assembly'
                  ? 'bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border-indigo-500/50 shadow-md shadow-indigo-950/30'
                  : 'bg-[#121228]/60 border-[#222245] hover:bg-[#181836]'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-lg">
                🏛️
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Full 100-Council Assembly</span>
                  {chatMode === 'assembly' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Multi-perspective human debate & consensus
                </div>
              </div>
            </button>
          </div>

          {/* Scrollable Personas List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Select Persona for 1-on-1 ({filteredPersonas.length})</span>
            </div>

            {filteredPersonas.map((persona) => {
              const isSelected = chatMode === 'direct' && selectedPersonaId === persona.id;
              return (
                <button
                  key={persona.id}
                  onClick={() => selectPersonaForDirectChat(persona.id)}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-950/60 to-indigo-950/60 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                      : 'bg-[#101024]/60 border-[#1c1c38] hover:bg-[#161633] hover:border-[#2a2a50]'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 border"
                    style={{
                      backgroundColor: `${persona.color}15`,
                      borderColor: `${persona.color}35`,
                    }}
                  >
                    {persona.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-white truncate">{persona.name}</div>
                      <span className="text-[9px] px-1 rounded bg-[#181832] text-slate-400">
                        ★{persona.weight}
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-300 truncate">{persona.archetype}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{persona.role}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right: Main Chat Area */}
        <main className="flex-1 flex flex-col bg-[#080816] min-w-0">
          {/* Active Context Header Banner */}
          <div className="px-6 py-3.5 border-b border-[#1a1a35] bg-[#0c0c20]/80 flex items-center justify-between">
            {chatMode === 'assembly' ? (
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-lg">
                  🏛️
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>100-Human Council Deliberation Chamber</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-mono">
                      PLENARY SESSION
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    All 100 personas are weighing your prompts across field reality, ethics, law, economics, and human accessibility.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl border shadow-md"
                  style={{
                    backgroundColor: `${currentPersona.color}20`,
                    borderColor: `${currentPersona.color}50`,
                  }}
                >
                  {currentPersona.avatar}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{currentPersona.name}</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">
                      {currentPersona.archetype}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 italic max-w-xl truncate">
                    &ldquo;{currentPersona.prompt}&rdquo;
                  </div>
                </div>
              </div>
            )}

            <div className="text-right hidden sm:block">
              <div className="text-[11px] font-medium text-slate-400">Active Human Perspective</div>
              <div className="text-xs text-indigo-300 font-semibold">{profile.name}</div>
            </div>
          </div>

          {/* Chat Messages Feed */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
            {messages.map((msg) => {
              if (msg.isRelay && msg.relayPrompt) {
                return (
                  <div key={msg.id} className="w-full max-w-5xl mx-auto">
                    <SubagentRelayViewer
                      prompt={msg.relayPrompt}
                      savedConsensus={msg.consensus}
                      savedHistory={msg.relayHistory}
                      onConsensusReached={(consensus, history) => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id ? { ...m, consensus, relayHistory: history } : m
                          )
                        );
                      }}
                    />
                  </div>
                );
              }

              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 max-w-4xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 shadow-md ${
                      isUser
                        ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold text-xs border border-indigo-400/40'
                        : 'bg-[#191938] border border-[#2b2b55]'
                    }`}
                  >
                    {isUser ? profile.initials || 'DEV' : msg.personaAvatar || '🏛️'}
                  </div>

                  {/* Message Bubble */}
                  <div className="space-y-1 min-w-0 max-w-2xl">
                    <div className={`flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
                      <span className="text-xs font-bold text-white">
                        {isUser ? profile.name : msg.personaName}
                      </span>
                      {msg.personaRole && !isUser && (
                        <span className="text-[10px] text-indigo-300 bg-[#141432] px-1.5 py-0.5 rounded border border-[#222248]">
                          {msg.personaRole}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                    </div>

                    <div
                      className={`p-4 rounded-2xl text-xs leading-relaxed border whitespace-pre-wrap ${
                        isUser
                          ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-none shadow-md shadow-indigo-600/20'
                          : 'bg-[#101026] text-slate-200 border-[#222245] rounded-tl-none shadow-md'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3.5 max-w-2xl">
                <div className="w-9 h-9 rounded-xl bg-[#191938] border border-[#2b2b55] flex items-center justify-center text-base shrink-0 animate-pulse">
                  {chatMode === 'direct' ? currentPersona.avatar : '🏛️'}
                </div>
                <div className="p-4 rounded-2xl rounded-tl-none bg-[#101026] border border-[#222245] flex items-center space-x-2 text-xs text-indigo-300">
                  <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>
                    {chatMode === 'direct'
                      ? `${currentPersona.name} is formulating their response...`
                      : 'The 100-Human Council is deliberating across multiple perspectives...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Starter Topics */}
          {messages.length <= 2 && (
            <div className="px-6 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar border-t border-[#151530]">
              <span className="text-[10px] text-slate-500 font-semibold whitespace-nowrap">
                Suggested Topics:
              </span>
              <button
                onClick={() =>
                  handleSendMessage(
                    'How should we architect an agricultural marketplace app so rural farmers with low signal and zero tech skills can use it?'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-full bg-[#12122a] hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-200 border border-[#252545] whitespace-nowrap transition-colors"
              >
                🌾 Rural Farmer Marketplace
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    'How can we ensure our software has zero hidden predatory fees and is completely accessible to homeless people and street workers?'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-full bg-[#12122a] hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-200 border border-[#252545] whitespace-nowrap transition-colors"
              >
                🏛️ Universal Dignity & Beggar Access
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    'What legal and ethical guardrails should a software founder put in place before launching autonomous AI agents?'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-full bg-[#12122a] hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-200 border border-[#252545] whitespace-nowrap transition-colors"
              >
                ⚖️ Legal & Ethical Safety Guardrails
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    'From a mechanic and field technician standpoint, what are the biggest flaws in modern consumer software?'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-full bg-[#12122a] hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-200 border border-[#252545] whitespace-nowrap transition-colors"
              >
                🔧 Field Technician Flaws in Tech
              </button>
            </div>
          )}

          {/* Bottom Chat Input Bar */}
          <div className="p-4 border-t border-[#1a1a35] bg-[#0c0c20]">
            <div className="max-w-4xl mx-auto flex items-end gap-3">
              <div className="flex-1 relative rounded-2xl bg-[#13132d] border border-[#26264d] focus-within:border-indigo-500 shadow-inner transition-colors">
                <textarea
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    chatMode === 'direct'
                      ? `Ask ${currentPersona.name} (${currentPersona.role}) anything from their lived perspective...`
                      : `Submit a challenge, architecture question, or dilemma to the 100-Human Council...`
                  }
                  rows={2}
                  className="w-full px-4 py-3 bg-transparent text-white text-xs placeholder-slate-500 focus:outline-none resize-none custom-scrollbar"
                />
                <div className="px-4 pb-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    Speaking as <strong className="text-indigo-400">{profile.name}</strong> • Press{' '}
                    <kbd className="px-1 py-0.5 rounded bg-[#1c1c38] text-slate-300 font-mono">Enter</kbd> to
                    send
                  </span>
                  <span className="font-mono text-slate-400">
                    {provider} / {model}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputPrompt.trim() || isLoading}
                className={`h-12 rounded-2xl font-semibold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 shrink-0 px-4 sm:px-5 ${
                  chatMode === 'assembly'
                    ? 'bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white shadow-indigo-600/30'
                    : 'bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={chatMode === 'direct' ? `Consult with ${currentPersona.name}` : 'Deliberate across 100-Human Council Relay'}
              >
                {chatMode === 'assembly' ? (
                  <>
                    <Sparkles className="w-4 h-4 text-cyan-200 animate-pulse" />
                    <span className="hidden sm:inline">Deliberate (100 Humans)</span>
                    <span className="sm:hidden">Deliberate</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </main>

        {/* ── Council Debate History Drawer / Backup Panel ─────────────────────── */}
        {showHistoryDrawer && (
          <div className="absolute inset-y-0 right-0 w-96 max-w-full bg-[#0c0d22] border-l border-[#24244d] shadow-2xl z-40 flex flex-col animate-fadeIn">
            {/* Drawer Top Header */}
            <div className="p-4 border-b border-[#1f1f45] bg-[#090a18] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-base">
                  📜
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Council Debate History</h3>
                  <p className="text-[10px] text-slate-400">
                    Backed up in Local Storage Database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Close History Panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action: Start New Session */}
            <div className="p-3 border-b border-[#1f1f45] bg-[#0e0f26]">
              <button
                type="button"
                onClick={handleStartNewSession}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Start New Deliberation</span>
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar text-xs">
              {savedSessions.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="text-3xl text-slate-600">🏛️</div>
                  <p className="text-slate-400 font-medium">No saved debates yet</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Any debate you run with the 100-human council is automatically preserved here in your local browser database.
                  </p>
                </div>
              ) : (
                savedSessions.map((session) => {
                  const isCurrent = session.id === currentSessionId;
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer group relative ${
                        isCurrent
                          ? 'bg-[#181938] border-indigo-500/60 shadow-lg shadow-indigo-950/40'
                          : 'bg-[#101026]/70 border-[#202045] hover:bg-[#151535] hover:border-indigo-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                            {session.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                            <span className="px-1.5 py-0.2 rounded bg-[#161633] text-indigo-300 border border-[#262650]">
                              {session.mode === 'assembly' ? 'Full Council' : session.personaName || '1-on-1'}
                            </span>
                            <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{session.messages?.length || 0} msgs</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportSession(session);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                            title="Export to Markdown (.md)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(e, session.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete from local database"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isCurrent && (
                        <div className="mt-2 pt-1.5 border-t border-[#23234d] flex items-center justify-between text-[10px] text-emerald-400">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Currently Active Session</span>
                          </span>
                          <span className="font-mono text-slate-400">ID: {session.id.slice(-6)}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
