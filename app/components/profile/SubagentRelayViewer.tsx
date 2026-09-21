import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  SubagentRelayEngine,
  type RelayProgressState,
  type RelayAgentStep,
  type RelayConsensus,
} from '~/engine/subagent-relay';
import { userProfileStore } from '~/stores/profile';
import { humanPersonasStore } from '~/stores/hive';
import { activeModel, activeProvider, apiKeys } from '~/stores/settings';
import {
  Play,
  Pause,
  FastForward,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Check,
  X,
  Info,
  CheckSquare,
  Square,
  FileDown,
} from 'lucide-react';

interface SubagentRelayViewerProps {
  prompt: string;
  savedHistory?: RelayAgentStep[];
  savedConsensus?: RelayConsensus | null;
  onConsensusReached?: (consensus: RelayConsensus, history: RelayAgentStep[]) => void;
  onClose?: () => void;
}

export const SubagentRelayViewer: React.FC<SubagentRelayViewerProps> = ({
  prompt,
  savedHistory,
  savedConsensus,
  onConsensusReached,
  onClose,
}) => {
  const profile = useStore(userProfileStore);
  const personas = useStore(humanPersonasStore);
  const model = useStore(activeModel);
  const provider = useStore(activeProvider);
  const keys = useStore(apiKeys);

  const [relayState, setRelayState] = useState<RelayProgressState>(() => {
    if (savedConsensus) {
      return {
        isActive: false,
        isPaused: false,
        currentAgentIndex: 99,
        progressPercent: 100,
        currentAgent: personas[99] || null,
        previousAgent: personas[98] || null,
        history: savedHistory && savedHistory.length > 0 ? savedHistory : [],
        accumulatedProposal: savedConsensus.summary,
        finalConsensus: savedConsensus,
      };
    }
    return {
      isActive: true,
      isPaused: false,
      currentAgentIndex: 0,
      progressPercent: 0,
      currentAgent: personas[0] || null,
      previousAgent: null,
      history: [],
      accumulatedProposal: '',
      finalConsensus: null,
    };
  });

  const [speedMs, setSpeedMs] = useState<number>(140);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<RelayAgentStep | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [runIteration, setRunIteration] = useState<number>(savedConsensus ? 0 : 1);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  const engineRef = useRef<SubagentRelayEngine | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation for inspector modal (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAgentDetail) return;
      if (e.key === 'Escape') {
        setSelectedAgentDetail(null);
      } else if (e.key === 'ArrowLeft') {
        handleSelectAgentById(Math.max(1, selectedAgentDetail.agentId - 1));
      } else if (e.key === 'ArrowRight') {
        handleSelectAgentById(Math.min(100, selectedAgentDetail.agentId + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgentDetail, personas, relayState]);

  // Run or re-run the engine
  useEffect(() => {
    if (runIteration === 0) return;

    const engine = new SubagentRelayEngine({
      userPrompt: prompt,
      userProfile: profile,
      customPersonas: personas,
      speedMs,
      model,
      provider,
      apiKey: keys[provider],
      onUpdate: (state) => {
        setRelayState(state);
      },
    });

    engineRef.current = engine;

    engine
      .run()
      .then((consensus) => {
        if (onConsensusReached) {
          onConsensusReached(consensus, engine.getHistory());
        }
      })
      .catch((err) => {
        console.error('Relay error:', err);
      });

    return () => {
      engine.cancel();
    };
  }, [prompt, runIteration]);

  // Auto scroll debate feed to latest sub-agent
  useEffect(() => {
    if (runIteration > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [relayState.history.length, runIteration]);

  const handlePauseResume = () => {
    if (!engineRef.current) return;
    if (relayState.isPaused) {
      engineRef.current.resume();
    } else {
      engineRef.current.pause();
    }
  };

  const handleFastForward = () => {
    if (!engineRef.current) return;
    engineRef.current.fastForward();
    setSpeedMs(5);
  };

  const handleRestartRelay = () => {
    if (engineRef.current) {
      engineRef.current.cancel();
    }
    setSpeedMs(140);
    setRunIteration((prev) => prev + 1);
  };

  const handleSelectAgentById = (agentId: number) => {
    const targetPersona = personas.find((p) => p.id === agentId);
    if (!targetPersona) return;
    const step = relayState.history.find((h) => h.agentId === agentId);
    if (step) {
      setSelectedAgentDetail(step);
    } else {
      const idx = agentId - 1;
      const isCompleted = idx < relayState.currentAgentIndex;
      const isCurrent = idx === relayState.currentAgentIndex && !isFinished;
      setSelectedAgentDetail({
        agentId,
        persona: targetPersona,
        status: isCompleted ? 'completed' : isCurrent ? 'active' : 'pending',
        inputFromPrevious:
          idx === 0
            ? 'User Query'
            : `Sub-Agent #${idx} (${personas[idx - 1]?.name || 'Previous Persona'})`,
        critique: `Evaluating constraints and lived field criteria from ${targetPersona.archetype} viewpoint.`,
        amendment: `Proposing structural enhancements matching ${targetPersona.role} standards.`,
        confidenceScore: 90 + targetPersona.weight,
        timestamp: isCompleted ? 'Deliberated in relay' : isCurrent ? 'Active in relay' : 'Pending in queue',
      });
    }
  };

  const handleCopyConsensus = () => {
    if (!relayState.finalConsensus) return;
    const text = `# 100-Subagent Council Consensus & Verdict\n\n## Core Decision\n${relayState.finalConsensus.coreDecision}\n\n## Summary\n${relayState.finalConsensus.summary}\n\n## 10 Civilizational Pillars\n${relayState.finalConsensus.pillarDecisions.map((p) => `- ${p.avatar} ${p.category}: ${p.consensus}`).join('\n')}\n\n## Action Steps\n${relayState.finalConsensus.actionSteps.join('\n')}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportFullTranscript = () => {
    if (!relayState.finalConsensus) return;
    let md = `# 100-Subagent Council Deliberation & Executive Verdict\n\n`;
    md += `- **Challenge / Objective:** "${prompt}"\n`;
    md += `- **Date:** ${new Date().toLocaleString()}\n`;
    md += `- **Council Status:** 100 / 100 Human Archetypes Ratified Unanimously\n`;
    md += `- **Deliberation Duration:** ${Math.round(relayState.finalConsensus.totalTimeMs / 1000)}s\n\n---\n\n`;
    md += `## 🏆 Definitive Core Decision\n${relayState.finalConsensus.coreDecision}\n\n`;
    md += `## 📋 Executive Summary\n${relayState.finalConsensus.summary}\n\n`;
    md += `## 🏛️ Consensus Across 10 Civilizational Pillars\n\n`;
    relayState.finalConsensus.pillarDecisions.forEach((p) => {
      md += `### ${p.avatar} ${p.category}\n${p.consensus}\n\n`;
    });
    md += `## ✅ Actionable Implementation Checklist\n\n`;
    relayState.finalConsensus.actionSteps.forEach((s) => {
      md += `- [ ] ${s}\n`;
    });
    md += `\n---\n\n## 📜 Full 100-Subagent Sequential Ratification Transcript\n\n`;
    relayState.history.forEach((step) => {
      md += `### #${step.agentId} ${step.persona.name} (${step.persona.archetype})\n`;
      md += `- **Role:** ${step.persona.role} (${step.persona.category})\n`;
      md += `- **Internal Mindset & Worldview:** "${step.persona.prompt}"\n`;
      md += `- **Field Critique & Traps:** ${step.critique}\n`;
      md += `- **Adopted Amendment:** ${step.amendment}\n`;
      md += `- **Confidence Rating:** ${step.confidenceScore}%\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `council-100-deliberation-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getPersonasForPillar = (categoryName: string) => {
    const term = categoryName.toLowerCase();
    return personas.filter((p) => {
      const c = p.category.toLowerCase();
      const cid = p.categoryId.toLowerCase();
      if (term.includes('agri') || term.includes('food')) return cid === 'agri';
      if (term.includes('trade') || term.includes('technician') || term.includes('mechanic')) return cid === 'trades';
      if (term.includes('law') || term.includes('right') || term.includes('justice')) return cid === 'law';
      if (term.includes('finan') || term.includes('account') || term.includes('commerc')) return cid === 'finance';
      if (term.includes('defen') || term.includes('milit') || term.includes('emergency')) return cid === 'defense';
      if (term.includes('health') || term.includes('medic') || term.includes('care')) return cid === 'health';
      if (term.includes('edu') || term.includes('student') || term.includes('academ')) return cid === 'edu';
      if (term.includes('street') || term.includes('beggar') || term.includes('vulnerab') || term.includes('societ')) return cid === 'society';
      if (term.includes('art') || term.includes('humanit') || term.includes('creativ')) return cid === 'arts';
      if (term.includes('scien') || term.includes('front') || term.includes('space')) return cid === 'frontier' || cid === 'science';
      return c.includes(term) || term.includes(cid);
    });
  };

  const currentPersona = relayState.currentAgent || personas[0];
  const isFinished = relayState.progressPercent >= 100 && relayState.finalConsensus !== null;

  return (
    <div className="w-full bg-[#0b0c1e] border border-[#23234d] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 animate-fadeIn">
      {/* ── Top Header & Progress Bar ───────────────────────────────────────── */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-[#12122d] via-[#151538] to-[#101026] border-b border-[#22224d]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  100-Subagent Sequential Relay & Debate
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {isFinished ? 'CONCLUDED (100/100)' : `SUB-AGENT ${relayState.currentAgentIndex + 1} OF 100`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Each human archetype analyzes the accumulating proposal, debates constraints, and passes the baton forward.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            {!isFinished && (
              <>
                <button
                  type="button"
                  onClick={handlePauseResume}
                  className="px-3 py-1.5 rounded-lg bg-[#1a1a3a] hover:bg-[#252550] text-slate-200 border border-[#2d2d5c] text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {relayState.isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{relayState.isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleFastForward}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Fast-forward relay to 100"
                >
                  <FastForward className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Fast Forward</span>
                </button>
              </>
            )}

            {isFinished && (
              <>
                <button
                  type="button"
                  onClick={handleRestartRelay}
                  className="px-3 py-1.5 rounded-lg bg-[#1a1a3a] hover:bg-[#252550] text-slate-300 hover:text-white border border-[#2d2d5c] text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Re-run 100-subagent sequential relay debate"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Re-run</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyConsensus}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied!' : 'Copy Verdict'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Animated Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              {isFinished
                ? 'All 100 Personas Unanimously Signed Off'
                : `Active: #${currentPersona.id} ${currentPersona.name} (${currentPersona.archetype})`}
            </span>
            <span className="text-cyan-400 font-bold">{relayState.progressPercent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-[#171733] overflow-hidden border border-[#25254d]">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 transition-all duration-150 relative"
              style={{ width: `${relayState.progressPercent}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 100-Agent Interactive Visual Matrix (10x10 Grid) ────────────────── */}
      <div className="p-4 bg-[#0d0e22] border-b border-[#1f1f45]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>100-Subagent Pipeline Matrix (1 to 100)</span>
          </span>
          <span className="text-[10px] text-slate-500">
            Hover or click any node to inspect that persona&apos;s contribution
          </span>
        </div>

        <div className="grid grid-cols-10 sm:grid-cols-20 gap-1 sm:gap-1.5 max-h-36 overflow-y-auto p-1 custom-scrollbar">
          {personas.map((p, idx) => {
            const isCompleted = idx < relayState.currentAgentIndex;
            const isCurrent = idx === relayState.currentAgentIndex && !isFinished;
            const isPending = idx > relayState.currentAgentIndex;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  const step = relayState.history.find((h) => h.agentId === p.id);
                  if (step) {
                    setSelectedAgentDetail(step);
                  } else {
                    setSelectedAgentDetail({
                      agentId: p.id,
                      persona: p,
                      status: isCurrent ? 'active' : 'pending',
                      inputFromPrevious: idx === 0 ? 'User Query' : `Sub-Agent #${idx} (${personas[idx - 1]?.name || 'Previous Persona'})`,
                      critique: `Evaluating constraints and lived field criteria from ${p.archetype} viewpoint.`,
                      amendment: `Proposing structural enhancements matching ${p.role} standards.`,
                      confidenceScore: 90 + p.weight,
                      timestamp: isCurrent ? 'Active in relay' : 'Pending in queue',
                    });
                  }
                }}
                className={`group relative aspect-square rounded-lg flex items-center justify-center text-xs transition-all cursor-pointer ${
                  isCurrent
                    ? 'scale-110 bg-gradient-to-tr from-cyan-500 to-indigo-600 border-2 border-white shadow-lg shadow-cyan-500/50 z-10 animate-pulse'
                    : isCompleted
                    ? 'bg-[#151535] border border-emerald-500/40 hover:border-emerald-400 text-slate-200 hover:scale-105'
                    : 'bg-[#101026] border border-[#1d1d3d] text-slate-600 opacity-40 hover:opacity-80'
                }`}
                title={`Click to inspect #${p.id} ${p.name} (${p.archetype})`}
              >
                <span>{p.avatar}</span>
                {isCompleted && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-black font-bold">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Baton Relay Showcase (Click to inspect) ────────────────── */}
      {!isFinished && (
        <div
          onClick={() => {
            const step = relayState.history.find((h) => h.agentId === currentPersona.id);
            setSelectedAgentDetail(
              step || {
                agentId: currentPersona.id,
                persona: currentPersona,
                status: 'active',
                inputFromPrevious:
                  currentPersona.id === 1
                    ? 'User Query'
                    : `Sub-Agent #${currentPersona.id - 1} (${personas[currentPersona.id - 2]?.name || 'Previous'})`,
                critique: `Actively evaluating real-world field constraints for "${prompt}".`,
                amendment: `Injecting ${currentPersona.role} amendments into the accumulating proposal.`,
                confidenceScore: 92,
                timestamp: 'Currently analyzing',
              }
            );
          }}
          className="p-4 bg-gradient-to-r from-indigo-950/40 via-[#13132e] to-purple-950/30 border-b border-[#22224d] flex items-start gap-4 cursor-pointer hover:bg-[#161638] transition-all group"
          title="Click to inspect this sub-agent's live thoughts and debate actions"
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border shadow-lg shrink-0 group-hover:scale-105 transition-transform"
            style={{
              backgroundColor: `${currentPersona.color}20`,
              borderColor: `${currentPersona.color}60`,
            }}
          >
            {currentPersona.avatar}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Sub-Agent #{currentPersona.id}: {currentPersona.name}
                </span>
                <span className="text-[10px] px-2 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentPersona.archetype}
                </span>
                <span className="text-[10px] text-slate-400">({currentPersona.category})</span>
              </div>
              <span className="text-[10px] text-cyan-400 font-medium group-hover:underline flex items-center gap-1">
                <Info className="w-3 h-3" /> Click to Inspect Thought
              </span>
            </div>

            <p className="text-xs text-slate-300 italic line-clamp-2">
              &ldquo;{currentPersona.prompt}&rdquo;
            </p>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-cyan-400 font-mono">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing constraints & debating amendments to pass to Agent #{Math.min(100, currentPersona.id + 1)}...</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Sequential Relay Stream (Sub-Agents 1 to 100) ────────────────────── */}
      <div className="p-4 max-h-72 overflow-y-auto space-y-3 bg-[#080816] custom-scrollbar">
        <div className="flex items-center justify-between pb-1 border-b border-[#1a1a38]">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Live Relay Debate Stream ({relayState.history.length} / 100 Personas Processed)
          </span>
          <button
            type="button"
            onClick={() => setShowFullHistory(!showFullHistory)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>{showFullHistory ? 'Collapse' : 'Show Details'}</span>
            {showFullHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {relayState.history.map((step, idx) => (
          <div
            key={step.agentId}
            onClick={() => setSelectedAgentDetail(step)}
            className="p-3 rounded-xl bg-[#111128]/80 border border-[#202045] hover:border-indigo-500/60 hover:bg-[#141432] transition-all flex items-start gap-3 text-xs cursor-pointer group shadow-sm"
            title={`Click to inspect #${step.agentId} ${step.persona.name}'s thoughts, critique, and debate action`}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 border mt-0.5 group-hover:scale-110 transition-transform shadow"
              style={{
                backgroundColor: `${step.persona.color}15`,
                borderColor: `${step.persona.color}40`,
              }}
            >
              {step.persona.avatar}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white group-hover:text-cyan-300 transition-colors">
                    #{step.agentId} {step.persona.name}
                  </span>
                  <span className="text-[10px] text-indigo-300">({step.persona.role})</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="text-emerald-400 font-mono">Confidence: {step.confidenceScore}%</span>
                  <span className="text-indigo-400 group-hover:text-cyan-300 flex items-center gap-0.5 font-medium transition-colors">
                    <Info className="w-3 h-3" /> Inspect
                  </span>
                </div>
              </div>

              <div className="text-slate-300 leading-relaxed">
                <strong className="text-amber-300">Critique:</strong> {step.critique}
              </div>

              <div className="text-slate-200 leading-relaxed bg-[#151535] p-2 rounded-lg border border-[#26264d]">
                <strong className="text-cyan-400">Amendment Adopted:</strong> {step.amendment}
              </div>

              {idx < 99 && (
                <div className="pt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <ArrowRight className="w-3 h-3 text-indigo-400" />
                  <span>
                    Passed updated proposal forward to Sub-Agent #{idx + 2} ({personas[idx + 1]?.name || 'Next Persona'})
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={historyEndRef} />
      </div>

      {/* ── 🏆 Final 100-Subagent Consensus & Executive Verdict ──────────────── */}
      {isFinished && relayState.finalConsensus && (
        <div className="p-5 sm:p-6 bg-gradient-to-b from-[#121235] via-[#10102b] to-[#0d0d22] border-t border-emerald-500/40 space-y-5 animate-fadeIn">
          {/* Header Banner & Quick Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-[#131435] to-teal-950/40 border border-emerald-500/40 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-2xl shadow-xl shadow-emerald-500/30 border border-emerald-300/40 shrink-0">
                🏆
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-bold text-white tracking-wide">
                    100-Subagent Ratified Consensus & Executive Blueprint
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    UNANIMOUS RATIFICATION (100/100)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  100 human subagents deliberated across 10 societal pillars in {Math.round(relayState.finalConsensus.totalTimeMs / 1000)}s
                </p>
              </div>
            </div>

            {/* Quick Actions Toolbar */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={handleCopyConsensus}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
                title="Copy Executive Verdict & Core Decision to Clipboard"
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied!' : 'Copy Verdict'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportFullTranscript}
                className="px-3 py-1.5 rounded-lg bg-[#191a3a] hover:bg-[#252554] text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                title="Download complete 100-persona deliberation transcript as Markdown file"
              >
                <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export (.md)</span>
              </button>

              <button
                type="button"
                onClick={handleRestartRelay}
                className="px-2.5 py-1.5 rounded-lg bg-[#151532] hover:bg-[#202048] text-slate-300 hover:text-white border border-[#2d2d5c] text-xs font-medium flex items-center gap-1 transition-all"
                title="Re-run 100-Subagent Sequential Relay"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Re-run</span>
              </button>
            </div>
          </div>

          {/* Definitive Core Decision Callout */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#141438] to-cyan-950/40 border border-emerald-500/50 shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Definitive Core Decision for Your Initiative</span>
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                Ratified by 100 Humans
              </span>
            </div>
            <p className="text-sm font-semibold text-white leading-relaxed">
              &ldquo;{relayState.finalConsensus.coreDecision}&rdquo;
            </p>
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {relayState.finalConsensus.summary}
            </p>
          </div>

          {/* 10 Civilizational Pillars Interactive Accordion */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Ratified Consensus Across All 10 Civilizational Pillars</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Click any pillar to inspect consensus & contributing archetypes
              </span>
            </div>

            <div className="space-y-2">
              {relayState.finalConsensus.pillarDecisions.map((pillar, pIdx) => {
                const isExpanded = expandedPillar === pillar.category;
                const pillarPersonas = getPersonasForPillar(pillar.category);

                return (
                  <div
                    key={pillar.category}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isExpanded
                        ? 'bg-[#15153a] border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                        : 'bg-[#11112b] border-[#22224d] hover:border-indigo-500/50 hover:bg-[#141434]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPillar(isExpanded ? null : pillar.category)}
                      className="w-full p-3.5 flex items-center justify-between gap-3 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl shrink-0">{pillar.avatar}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white tracking-wide">
                              {pIdx + 1}. {pillar.category}
                            </span>
                            <span className="text-[10px] px-2 py-0.2 rounded-full font-mono font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {pillarPersonas.length} Archetypes
                            </span>
                          </div>
                          {!isExpanded && (
                            <p className="text-[11px] text-slate-300 truncate mt-0.5 max-w-xl">
                              {pillar.consensus}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-indigo-400 hidden sm:inline">
                          {isExpanded ? 'Collapse' : 'Inspect'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded View */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-[#232352] space-y-3 animate-fadeIn text-xs">
                        <div className="p-3 rounded-lg bg-[#0d0e24] border border-[#252554] text-slate-200 leading-relaxed">
                          <strong className="text-emerald-400">Ratified Pillar Consensus: </strong>
                          {pillar.consensus}
                        </div>

                        {/* Contributing Personas Chips */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <Layers className="w-3 h-3 text-indigo-400" />
                            <span>Key Contributing Archetypes in this Pillar (Click to view full evaluation):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {pillarPersonas.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectAgentById(p.id)}
                                className="px-2.5 py-1 rounded-lg bg-[#1a1a40] hover:bg-indigo-600/40 text-slate-200 hover:text-white border border-[#2e2e60] hover:border-cyan-400/50 text-[11px] font-medium flex items-center gap-1.5 transition-all shadow-sm group"
                                title={`Click to inspect #${p.id} ${p.name} (${p.archetype})`}
                              >
                                <span>{p.avatar}</span>
                                <span className="group-hover:text-cyan-300 font-semibold">{p.name}</span>
                                <span className="text-[9px] text-slate-400">({p.archetype})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Implementation Checklist */}
          {(() => {
            const totalSteps = relayState.finalConsensus.actionSteps.length;
            const completedCount = Object.values(checkedSteps).filter(Boolean).length;
            const pct = Math.round((completedCount / totalSteps) * 100);

            return (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#11122e] border border-[#262654] space-y-3 shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      Actionable Implementation Steps for You, {profile.name}:
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-emerald-300 font-semibold">
                      {completedCount} / {totalSteps} Complete ({pct}%)
                    </span>
                    <div className="w-20 h-1.5 rounded-full bg-[#1b1b3a] overflow-hidden border border-[#2b2b54]">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {relayState.finalConsensus.actionSteps.map((step, idx) => {
                    const isChecked = !!checkedSteps[idx];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setCheckedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-950/25 border-emerald-500/40 text-slate-400'
                            : 'bg-[#151538] border-[#252550] hover:border-indigo-500/50 text-slate-200'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-emerald-400">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </span>
                        <span
                          className={`text-xs leading-relaxed ${
                            isChecked ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          {step}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Subagent Thought & Debate Inspector Modal ────────────────────────────── */}
      {selectedAgentDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedAgentDetail(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] bg-[#0d0e24] border border-[#2d2d60] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div
              className="p-5 border-b border-[#23234d] flex items-center justify-between"
              style={{
                background: `linear-gradient(90deg, ${selectedAgentDetail.persona.color}20 0%, #12122d 60%, #0d0e24 100%)`,
              }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shadow-lg shrink-0"
                  style={{
                    backgroundColor: `${selectedAgentDetail.persona.color}25`,
                    borderColor: `${selectedAgentDetail.persona.color}60`,
                  }}
                >
                  {selectedAgentDetail.persona.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      #{selectedAgentDetail.agentId} {selectedAgentDetail.persona.name}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {selectedAgentDetail.persona.archetype}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedAgentDetail.persona.role} • <span className="text-cyan-400 font-mono">{selectedAgentDetail.persona.category}</span>
                    <span className="hidden sm:inline text-[10px] text-slate-500 ml-2">(Use ← / → keys to navigate)</span>
                  </p>
                </div>
              </div>

              {/* Top Controls: Prev/Next & Close */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectAgentById(Math.max(1, selectedAgentDetail.agentId - 1))}
                  disabled={selectedAgentDetail.agentId <= 1}
                  className="p-1.5 rounded-lg bg-[#191938] hover:bg-[#252550] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-[#2d2d5c] transition-colors"
                  title="Previous Sub-Agent"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono text-slate-400 px-1">
                  {selectedAgentDetail.agentId}/100
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectAgentById(Math.min(100, selectedAgentDetail.agentId + 1))}
                  disabled={selectedAgentDetail.agentId >= 100}
                  className="p-1.5 rounded-lg bg-[#191938] hover:bg-[#252550] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-[#2d2d5c] transition-colors"
                  title="Next Sub-Agent"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="w-[1px] h-5 bg-[#25254d] mx-1" />

                <button
                  type="button"
                  onClick={() => setSelectedAgentDetail(null)}
                  className="p-1.5 rounded-lg bg-[#191938] hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-[#2d2d5c] transition-colors"
                  title="Close Inspector (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs">
              {/* Confidence & Timing Banner */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#131430] border border-[#252550]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-300 font-medium">Deliberation Record Status:</span>
                  <span className="font-semibold text-emerald-400 uppercase tracking-wide text-[10px]">
                    {selectedAgentDetail.status === 'completed' ? 'Ratified Contribution' : selectedAgentDetail.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                  <span>Confidence: <strong className="text-cyan-400">{selectedAgentDetail.confidenceScore}%</strong></span>
                  <span>•</span>
                  <span>{selectedAgentDetail.timestamp}</span>
                </div>
              </div>

              {/* Section 1: 🧠 What They Are Thinking (Worldview & Mindset) */}
              <div className="p-4 rounded-xl bg-[#141434] border border-[#28285a] space-y-2">
                <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
                  <span>🧠</span>
                  <span>What This Sub-Agent Is Thinking (Internal Mindset & Philosophy)</span>
                </div>
                <blockquote className="p-3 rounded-lg bg-[#0d0e24] border-l-4 border-indigo-500 text-slate-200 italic leading-relaxed text-xs">
                  &ldquo;{selectedAgentDetail.persona.prompt}&rdquo;
                </blockquote>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Archetype Lens: <strong className="text-slate-300">{selectedAgentDetail.persona.archetype}</strong></span>
                  <span>Societal Impact Weight: <strong className="text-indigo-400">★{selectedAgentDetail.persona.weight}/5</strong></span>
                </div>
              </div>

              {/* Section 2: 🔍 What the Text Behind It Is (Critique & Field Constraints) */}
              <div className="p-4 rounded-xl bg-[#141434] border border-[#28285a] space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <span>🔍</span>
                  <span>The Text & Critique Behind It (Lived Field Realities)</span>
                </div>
                <div className="p-3 rounded-lg bg-[#0d0e24] border border-[#23234a] text-slate-200 leading-relaxed">
                  {selectedAgentDetail.critique}
                </div>
                <p className="text-[11px] text-slate-400">
                  Why this matters: As a {selectedAgentDetail.persona.archetype}, they flag practical failure points and non-obvious traps that conventional software designs overlook.
                </p>
              </div>

              {/* Section 3: ⚡ What The Thing He/She Did In That Debate Is (Amendment & Concrete Action) */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#121d38] to-[#141438] border border-cyan-500/40 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                  <span>⚡</span>
                  <span>What They Did In That Debate (Adopted Amendment)</span>
                </div>
                <div className="p-3 rounded-lg bg-[#0b1226] border border-cyan-500/30 text-white font-medium leading-relaxed">
                  {selectedAgentDetail.amendment}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Successfully merged into the accumulating 100-subagent collective proposal.</span>
                </div>
              </div>

              {/* Section 4: 🔄 Relay Chain Connection */}
              <div className="p-3.5 rounded-xl bg-[#101026] border border-[#1f1f45] space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Sequential Baton Handoff
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-[#151535] border border-[#24244d]">
                    <span className="text-slate-400 block text-[10px]">📥 Input Received From:</span>
                    <span className="font-semibold text-slate-200">{selectedAgentDetail.inputFromPrevious}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#151535] border border-[#24244d]">
                    <span className="text-slate-400 block text-[10px]">📤 Passed Forward To:</span>
                    <span className="font-semibold text-indigo-300">
                      {selectedAgentDetail.agentId < 100
                        ? `Sub-Agent #${selectedAgentDetail.agentId + 1} (${personas[selectedAgentDetail.agentId]?.name || 'Next Persona'})`
                        : 'Commander Nova Vance (Consensus Ratification)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Footer */}
            <div className="p-4 border-t border-[#23234d] bg-[#0c0c1e] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const copyText = `### #${selectedAgentDetail.agentId} ${selectedAgentDetail.persona.name} (${selectedAgentDetail.persona.archetype})\n- **Role:** ${selectedAgentDetail.persona.role}\n- **What They Are Thinking:** "${selectedAgentDetail.persona.prompt}"\n- **Critique:** ${selectedAgentDetail.critique}\n- **Amendment Adopted:** ${selectedAgentDetail.amendment}\n- **Confidence:** ${selectedAgentDetail.confidenceScore}%`;
                  navigator.clipboard.writeText(copyText);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#191938] hover:bg-[#252550] text-slate-300 hover:text-white border border-[#2d2d5c] text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>Copy Deliberation</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAgentDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/30 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
