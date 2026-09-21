import React, { useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  chatInput,
  chatMessages,
  isGenerating,
  appendMessage,
  updateLastMessage,
  flushParser,
  persistCurrentChat,
  currentChatId,
  type ChatMessage,
} from '~/stores/chat';
import { activeModel, activeProvider, apiKeys, customProviders, customSystemPrompt } from '~/stores/settings';
import { terminalErrorAtom, files, workspaceViewMode, previewUrl, loadProjectFiles } from '~/stores/workspace';
import { triggerHiveMindSwarm } from '~/stores/hive';
import { userProfileStore } from '~/stores/profile';
import { ModelPicker } from './ModelPicker';
import { GlowButton } from '~/components/ui/GlowButton';
import { ArrowUp, Sparkles, StopCircle, Github, Loader2, Image as ImageIcon, X, Wrench } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const input = useStore(chatInput);
  const generating = useStore(isGenerating);
  const model = useStore(activeModel);
  const provider = useStore(activeProvider);
  const keys = useStore(apiKeys);
  const customs = useStore(customProviders);
  const termError = useStore(terminalErrorAtom);
  const workspaceFiles = useStore(files);
  const customPrompt = useStore(customSystemPrompt);
  const [swarmMode, setSwarmMode] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [attachedImages, setAttachedImages] = React.useState<string[]>([]);
  const [shouldAutoSend, setShouldAutoSend] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [isEnhancing, setIsEnhancing] = React.useState(false);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (typeof event.target?.result === 'string') {
            setAttachedImages((prev) => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (typeof event.target?.result === 'string') {
            setAttachedImages((prev) => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnhancePrompt = async () => {
    const raw = input.trim();
    if (!raw || isEnhancing || generating) return;

    try {
      setIsEnhancing(true);
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: raw,
          provider,
          model,
          apiKey: keys[provider],
          customProviders: customs,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.enhancedPrompt) {
          chatInput.set(data.enhancedPrompt);
        }
      }
    } catch (e) {
      console.error('Enhance failed:', e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGithubImport = async () => {
    const repoUrl = prompt('Enter a GitHub repository URL to clone (e.g., https://github.com/facebook/react):');
    if (!repoUrl) return;

    if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+/.test(repoUrl) && !/^[\w-]+\/[\w.-]+$/.test(repoUrl)) {
      alert('Invalid GitHub URL. Use format: https://github.com/owner/repo or owner/repo');
      return;
    }

    try {
      setIsImporting(true);
      const response = await fetch('/api/local/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId.get(), repoUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import repository');
      }

      await loadProjectFiles(currentChatId.get());
      workspaceViewMode.set('code');

      // Notify the Code Summary Agent to suggest initial commands
      const promptText = `I have just cloned a new repository into the workspace. Please read the README.md and package.json files (if they exist) and suggest initial setup commands to run.`;
      window.dispatchEvent(new CustomEvent('trigger-chat', { detail: promptText }));
    } catch (err: any) {
      console.error(err);
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (termError && !generating) {
      setTimeout(() => {
        chatInput.set(termError);
        terminalErrorAtom.set(null);
        setShouldAutoSend(true);
      }, 100);
    }
  }, [termError, generating]);

  useEffect(() => {
    if (shouldAutoSend) {
      setShouldAutoSend(false);
      handleSend();
    }
  }, [shouldAutoSend]);

  useEffect(() => {
    const handleTriggerChat = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        chatInput.set(customEvent.detail);
        setShouldAutoSend(true);
      }
    };
    window.addEventListener('trigger-chat', handleTriggerChat);
    return () => window.removeEventListener('trigger-chat', handleTriggerChat);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedImages.length === 0) || generating) return;

    // Check if user specifically requested live preview
    const isPreviewRequest = /^(?:show\s+(?:on\s+)?live\s+preview|show\s+preview|open\s+(?:live\s+)?preview|preview|run\s+preview)$/i.test(trimmed) ||
      /\b(show\s+(?:on\s+)?live\s+preview|switch\s+to\s+preview)\b/i.test(trimmed);

    if (isPreviewRequest) {
      if (!previewUrl.get()) {
        previewUrl.set('http://localhost:5173');
      }
      workspaceViewMode.set('preview');
    }

    const messageImages = [...attachedImages];
    const finalPrompt = trimmed || (messageImages.length > 0 ? 'Please analyze the attached image/screenshot and build a complete web application matching it.' : '');

    chatInput.set('');
    setAttachedImages([]);
    isGenerating.set(true);

    // 1. Add User Message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: finalPrompt,
      images: messageImages.length > 0 ? messageImages : undefined,
      createdAt: Date.now(),
    };
    appendMessage(userMsg);

    // 2. Trigger 100-Bot Hive Mind Swarm to deliberate
    let consensusPlan = '';
    if (swarmMode) {
      try {
        consensusPlan = await triggerHiveMindSwarm(finalPrompt);
      } catch (err) {
        console.error('Swarm error', err);
      }
    }

    // 3. Prepare Assistant Message
    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantText = swarmMode 
      ? '🧠 **100-Bot Hive Mind Consensus established.** Synthesizing architecture and generating codebase...\n'
      : '';

    appendMessage({
      id: assistantMsgId,
      role: 'assistant' as const,
      content: initialAssistantText,
      createdAt: Date.now(),
    });

    // 4. Stream Code Generation from API
    try {
      abortControllerRef.current = new AbortController();

        const prevMessages = chatMessages.get()
          .filter((m: ChatMessage) => m.id !== assistantMsgId)
          .map((m: ChatMessage) => {
            let content = m.rawContent || m.content;
            // Never let raw UI placeholder tags leak into LLM conversation history
            content = content
              .replace(/<div\s+class=["']__boltArtifact__["'][^>]*><\/div>/gi, '')
              .replace(/<div\s+class=["']__boltThought__["'][^>]*><\/div>/gi, '')
              .trim();
            return {
              role: m.role,
              content,
              images: m.images,
            };
          });

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            messages: [...prevMessages, { role: userMsg.role, content: userMsg.content, images: userMsg.images }],
            model,
            provider,
            apiKey: keys[provider],
            customProviders: customs,
            hiveMindPlan: consensusPlan,
            files: workspaceFiles,          // Formula 2: send current workspace files for context buffer
            customSystemPrompt: customPrompt, // User-defined system prompt extension
            chatId: currentChatId.get(),
            userProfile: userProfileStore.get(),
          }),
        });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        updateLastMessage(assistantMsgId, `⚠️ Generation Error: ${errorText || response.statusText}`);
        isGenerating.set(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = initialAssistantText;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        updateLastMessage(assistantMsgId, fullText);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Streaming error', err);
        updateLastMessage(assistantMsgId, `⚠️ Failed to stream response: ${err.message}`);
      }
    } finally {
      flushParser(assistantMsgId);
      persistCurrentChat();
      isGenerating.set(false);
      abortControllerRef.current = null;
      loadProjectFiles(currentChatId.get()).catch(console.error);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      isGenerating.set(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-2.5 sm:p-3 bg-[#080816]/95 backdrop-blur-xl flex flex-col gap-2.5 relative z-10 border-t border-white/[0.06]">
      {/* Hidden file input for Photo upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* Top row: Model label & Swarm Toggle */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <ModelPicker />
        </div>
        <div className="flex items-center gap-2">
          <label 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] cursor-pointer transition-all select-none"
            title="Hive-Mind Multi-Agent Swarm Mode (Autonomous Architecture & Code Generation)"
          >
            <div className="relative">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={swarmMode}
                onChange={(e) => setSwarmMode(e.target.checked)}
              />
              <div className={`block w-7 h-4 rounded-full transition-colors ${swarmMode ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-700/80'}`}></div>
              <div className={`absolute left-[2px] top-[2px] bg-white w-3 h-3 rounded-full transition-transform ${swarmMode ? 'translate-x-3' : 'translate-x-0'}`}></div>
            </div>
            <span className={`text-[10px] font-mono tracking-wider font-semibold transition-colors ${swarmMode ? 'text-emerald-400' : 'text-slate-400'}`}>
              SWARM
            </span>
          </label>
        </div>
      </div>

      {/* Attached Images Preview Strip */}
      {attachedImages.length > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-2 overflow-x-auto no-scrollbar bg-[#0f0f23]/90 border border-purple-500/25 rounded-xl">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative group shrink-0">
              <img
                src={img}
                alt={`Attachment ${idx + 1}`}
                className="w-12 h-12 object-cover rounded-lg border border-purple-500/40 group-hover:border-purple-400 transition-colors shadow-md"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-0.5 shadow-md transition-colors cursor-pointer"
                title="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="text-[11px] text-purple-300 font-medium ml-1">
            🖼️ {attachedImages.length} photo{attachedImages.length > 1 ? 's' : ''} attached for Vision analysis
          </div>
        </div>
      )}

      {/* Unified Input Card with Integrated Send Button & Tools */}
      <div className="relative flex flex-col rounded-2xl bg-[#0f0f24]/90 border border-white/[0.08] hover:border-white/[0.12] focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => chatInput.set(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={attachedImages.length > 0 ? "Describe how to build this UI or press Enter for automatic synthesis..." : "Initialize synthesis protocol... (Paste Ctrl+V screenshots or type)"}
          rows={1}
          className="w-full bg-transparent resize-none outline-none text-[13px] leading-relaxed text-slate-100 placeholder-slate-500 max-h-48 px-3.5 pt-3 pb-2 transition-all font-sans"
        />

        {/* Card Bottom Toolbar */}
        <div className="px-2.5 pb-2 pt-1 flex items-center justify-between gap-2">
          {/* Action Tools */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleGithubImport}
              disabled={isImporting || generating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              title="Clone & import a GitHub repository"
            >
              {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Github className="w-3.5 h-3.5 text-slate-400" />}
              <span className="hidden sm:inline">{isImporting ? 'Cloning...' : 'GitHub'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/25 text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.12)]"
              title="Upload mockup, UI screenshot or photo for AI code generation"
            >
              <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Photo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                chatInput.set("⚡ Auto-Fix: Please inspect project errors, terminal logs, and broken dependencies, then rewrite and fix the affected code.");
                setShouldAutoSend(true);
              }}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/25 text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.12)]"
              title="Analyze project files and auto-repair errors"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xs:inline sm:inline">Auto-Fix</span>
            </button>

            <button
              type="button"
              onClick={handleEnhancePrompt}
              disabled={!input.trim() || isEnhancing || generating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.12)]"
              title="Expand prompt into full technical architecture specification"
            >
              {isEnhancing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span className="hidden md:inline">{isEnhancing ? 'Enhancing...' : 'Enhance'}</span>
            </button>
          </div>

          {/* Integrated Send / Stop Button */}
          <div>
            {generating ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-8 h-8 rounded-xl bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.4)] transition-all cursor-pointer"
                title="Stop generation"
              >
                <StopCircle className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() && attachedImages.length === 0}
                className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:from-white/5 disabled:to-white/5 text-[#0a0a1a] disabled:text-slate-500 flex items-center justify-center shadow-[0_0_16px_rgba(16,185,129,0.35)] disabled:shadow-none transition-all cursor-pointer disabled:cursor-not-allowed"
                title="Send prompt (Enter)"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Chips & Shortcuts Row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button 
            type="button"
            onClick={() => {
              chatInput.set("⚡ Auto-Fix: Please analyze the project and terminal logs to resolve all issues.");
              setShouldAutoSend(true);
            }}
            className="px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Analyze errors and auto-repair codebase"
          >
            ⚡ /fix
          </button>
          <button 
            type="button"
            onClick={() => {
              chatInput.set("Create a modern, full-featured Flutter mobile application with Material 3 design, responsive screens, animations, pubspec.yaml, and clean state management.");
            }}
            className="px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Scaffold a Flutter cross-platform mobile app"
          >
            🎯 /flutter
          </button>
          <button 
            type="button"
            onClick={() => {
              chatInput.set("Create a production-grade web application with responsive UI, sleek animations, and modern components.");
            }}
            className="px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Scaffold a modern web application"
          >
            🌐 /web
          </button>
          <button 
            type="button"
            onClick={() => {
              chatInput.set("Create a Python backend application with FastAPI, clean endpoints, and modular structure.");
            }}
            className="px-2.5 py-1 rounded-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Scaffold a Python application"
          >
            🐍 /python
          </button>
          <button 
            type="button"
            onClick={() => chatInput.set("/component Create a modular, responsive component with polished UI")}
            className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Generate a reusable component"
          >
            /component
          </button>
          <button 
            type="button"
            onClick={() => chatInput.set("/refactor Optimize code structure, remove redundancy, and enhance performance")}
            className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-[10px] font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer"
            title="Refactor and optimize code"
          >
            /refactor
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-slate-500 shrink-0 font-medium select-none">
          <span>Ctrl+V image</span>
          <span>•</span>
          <span>↵ send</span>
          <span>•</span>
          <span>Shift+↵ line</span>
        </div>
      </div>
    </div>
  );
};

