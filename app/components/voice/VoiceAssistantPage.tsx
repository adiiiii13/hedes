import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { ArrowUp, Mic, MicOff, Volume2, VolumeX, X, Sparkles, Loader2 } from 'lucide-react';
import { chatMessages, isGenerating } from '~/stores/chat';
import { apiKeys, activeProvider } from '~/stores/settings';

type VoiceBridge = {
  voiceRecognize: () => Promise<string>;
  voiceSpeak: (text: string) => Promise<string>;
  voiceStop: () => Promise<void>;
};

const desktopVoice = () => (typeof window !== 'undefined' ? (window as any).hedesDesktop as Partial<VoiceBridge> | undefined : undefined);

export function VoiceAssistantPage({ onClose }: { onClose: () => void }) {
  const messages = useStore(chatMessages);
  const generating = useStore(isGenerating);
  const keys = useStore(apiKeys);
  const provider = useStore(activeProvider);

  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [cloudSpeech, setCloudSpeech] = useState(false);
  const [muted, setMuted] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [offlineInstalled, setOfflineInstalled] = useState(false);
  const [isInstallingModel, setIsInstallingModel] = useState(false);
  const [installMessage, setInstallMessage] = useState('');

  const orbRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  const awaitingRef = useRef(false);
  const previousMessageIdRef = useRef(messages.at(-1)?.id);

  // Check offline Whisper capabilities on mount
  useEffect(() => {
    fetch('/api/local/voice')
      .then((res) => res.json())
      .then((data) => {
        if (data.offlineCapable || data.whisperCpp?.availableModels?.some((m: any) => m.downloaded)) {
          setOfflineInstalled(true);
        }
      })
      .catch(() => undefined);
  }, []);

  // Background floating ambient animation with reduced-motion and visibility awareness
  useEffect(() => {
    let active = true;
    let animation: { pause: () => void; play: () => void } | undefined;
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      void import('animejs').then(({ animate }) => {
        if (active && orbRef.current) {
          animation = animate(orbRef.current, {
            rotate: 360,
            scale: [0.97, 1.03, 0.97],
            duration: 10000,
            ease: 'inOutSine',
            loop: true,
          }) as any;
        }
      });
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        animation?.pause();
      } else if (!prefersReducedMotion) {
        animation?.play();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      animation?.pause();
    };
  }, []);

  // Cleanup audio tracks and speech on unmount
  useEffect(() => {
    return () => {
      stopRecordingTracks();
      recognitionRef.current?.stop();
      void desktopVoice()?.voiceStop?.();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopRecordingTracks = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setAudioLevel(0);
  };

  // Listen for assistant response to speak back
  useEffect(() => {
    const last = messages.at(-1);
    if (!awaitingRef.current || generating || !last || last.id === previousMessageIdRef.current || last.role !== 'assistant') {
      return;
    }

    awaitingRef.current = false;
    previousMessageIdRef.current = last.id;

    // Clean code blocks, bolding, and HTML tags for natural voice synthesis
    const plain = last.content
      .replace(/<div\s+class=["']__boltArtifact["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/```[\s\S]*?```/g, 'Code block completed.')
      .replace(/[*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    setLastReply(plain);
    if (!plain) return;

    speakText(plain.slice(0, 700));
  }, [messages, generating]);

  const speakText = (text: string) => {
    if (!text || muted) return;
    if (desktopVoice()?.voiceSpeak) { fallbackDesktopSpeak(text); return; }

    // 1. Try browser / Electron native SpeechSynthesis (instant, crystal-clear, zero lag)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';

        // Choose best natural voice available for the selected language
        const voices = window.speechSynthesis.getVoices();
        const bestVoice = voices.find(
          (v) => (language === 'hi'
            ? (v.lang.toLowerCase().includes('hi') || v.name.toLowerCase().includes('hindi'))
            : (v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Google') || v.lang.startsWith('en'))
          )
        );
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => {
          setSpeaking(false);
          // Fall back to desktop voice if browser synthesis had an error
          fallbackDesktopSpeak(text);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.warn('SpeechSynthesis error:', err);
      }
    }

    // 2. Fall back to desktop voice IPC
    fallbackDesktopSpeak(text);
  };

  const fallbackDesktopSpeak = (text: string) => {
    const bridge = desktopVoice();
    if (bridge?.voiceSpeak) {
      setSpeaking(true);
      bridge
        .voiceSpeak(text)
        .catch((cause: any) => setError(`Voice output: ${cause.message || cause}`))
        .finally(() => setSpeaking(false));
    }
  };

  const stopVoiceOutput = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    void desktopVoice()?.voiceStop?.();
    setSpeaking(false);
  };

  const send = (inputText?: string) => {
    const text = (typeof inputText === 'string' ? inputText : draft).trim();
    if (!text || generating) return;

    setDraft('');
    setError('');
    setLastReply('');
    stopVoiceOutput();

    previousMessageIdRef.current = messages.at(-1)?.id;
    awaitingRef.current = true;

    // Dispatch direct prompt to Hedes Chat engine
    window.dispatchEvent(new CustomEvent('trigger-chat', { detail: text }));
  };

  // Start real-time audio volume visualizer
  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize volume from 0 to 1
        setAudioLevel(Math.min(1, avg / 60));

        // Barge-in: interrupt speech synthesis when user talks into mic
        if (avg > 25 && speaking) {
          stopVoiceOutput();
        }

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio visualizer setup failed', e);
    }
  };

  // Primary: Record mic stream and transcribe via Whisper
  const startRecording = async () => {
    // Barge-in: immediately stop assistant speech on mic activation
    stopVoiceOutput();

    if (!cloudSpeech && desktopVoice()?.voiceRecognize) {
      setListening(true);
      setError('');
      try {
        const transcript = await desktopVoice()!.voiceRecognize!();
        if (transcript.trim()) setDraft(transcript.trim());
        else setError('No speech detected. Try again or type your message.');
      } catch (error: any) { setError(`Local speech: ${error.message}`); }
      finally { setListening(false); }
      return;
    }
    try {
      setError('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      setupAudioVisualizer(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopRecordingTracks();
        if (audioChunks.length === 0) return;

        const audioBlob = new Blob(audioChunks, { type: mimeType });
        if (audioBlob.size < 500) {
          setError('Audio clip was too short. Please hold to speak.');
          return;
        }

        setIsTranscribing(true);
        setError('');

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'speech.webm');
          formData.append('provider', provider);
          formData.append('allowCloud', String(cloudSpeech));
          formData.append('language', language);
          if (keys[provider]) {
            formData.append('apiKey', keys[provider]);
          } else if (keys['Groq']) {
            formData.append('apiKey', keys['Groq']);
          }

          const response = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: 'Transcription failed' }));
            throw new Error(errData.error || `Server responded with ${response.status}`);
          }

          const data = await response.json();
          const transcript = data.text?.trim() || '';

          if (!transcript) {
            setError('No speech heard. Try speaking louder or typing.');
            return;
          }

          setDraft(transcript);
        } catch (err: any) {
          console.warn('Whisper transcription error, trying fallback:', err);
          setError(`Voice input: ${err.message}. You can also type or use Win+H.`);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start(250);
      setListening(true);
    } catch (err: any) {
      console.warn('getUserMedia error, falling back to desktop/browser recognition:', err);
      setError(err.message || 'Microphone access failed');
    }
  };

  const stopRecording = () => {
    void desktopVoice()?.voiceStop?.();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingTracks();
    }
    setListening(false);
  };

  // Fallback: Web Speech API or Desktop Speech Recognizer
  const fallbackSpeechRecognition = () => {
    // 1. Check browser speech recognition
    const BrowserRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (BrowserRecognition) {
      try {
        const recognition = new BrowserRecognition();
        recognition.lang = navigator.language || 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results as ArrayLike<any>)
            .map((res: any) => res[0]?.transcript || '')
            .join(' ')
            .trim();
          setDraft(transcript);
          if (event.results[event.results.length - 1]?.isFinal) {
            recognition.stop();
            setListening(false);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Web Speech recognition error:', event.error);
          setListening(false);
          // If browser speech fails, try desktop voice bridge
          tryDesktopVoice();
        };

        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
        setError('');
        return;
      } catch (e) {
        console.warn('BrowserRecognition failed to start:', e);
      }
    }

    tryDesktopVoice();
  };

  const tryDesktopVoice = () => {
    const bridge = desktopVoice();
    if (bridge?.voiceRecognize) {
      setListening(true);
      setError('');
      bridge
        .voiceRecognize()
        .then((transcript) => {
          if (!transcript.trim()) {
            setError('No speech heard. Speak clearly or use Windows Dictation (Win + H).');
            return;
          }
          setDraft(transcript);
          send(transcript);
        })
        .catch((cause: any) => {
          setError(`Offline mic: ${cause.message || cause}. Tip: Press Win + H to dictate.`);
        })
        .finally(() => setListening(false));
      return;
    }

    setError('Microphone unavailable. You can type below or press Windows Key + H to dictate.');
    setListening(false);
  };

  const handleInstallWhisper = async () => {
    setIsInstallingModel(true);
    setInstallMessage('Downloading official Whisper GGML model...');
    try {
      const res = await fetch('/api/local/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install_model', modelId: 'ggml-tiny' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to install model');
      setOfflineInstalled(true);
      setInstallMessage('Whisper model installed!');
      setTimeout(() => setInstallMessage(''), 4000);
    } catch (err: any) {
      setInstallMessage(`Install failed: ${err.message}`);
    } finally {
      setIsInstallingModel(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] overflow-hidden bg-[#030713] text-white flex flex-col font-sans"
      role="dialog"
      aria-modal="true"
      aria-label="Hedes Voice Assistant"
    >
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(34,211,238,.14),transparent_38%),radial-gradient(ellipse_at_75%_20%,rgba(132,75,255,.13),transparent_30%),radial-gradient(ellipse_at_25%_85%,rgba(20,184,166,.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70">
        {Array.from({ length: 48 }, (_, index) => (
          <span
            key={index}
            className="absolute rounded-full bg-white"
            style={{
              left: `${(index * 67.3) % 100}%`,
              top: `${(index * 37.1) % 100}%`,
              width: index % 6 === 0 ? 2 : 1,
              height: index % 6 === 0 ? 2 : 1,
              opacity: 0.15 + (index % 5) * 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative flex h-full flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 backdrop-blur-md bg-black/20">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
            <div>
              <h1 className="text-xs font-black tracking-[0.28em] text-cyan-200">HEDES VOICE</h1>
              <p className="mt-0.5 text-[10px] text-slate-400 font-mono tracking-wider">AUDIO SYNTHESIS • WHISPER &amp; NATURAL SPEECH</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  language === 'en'
                    ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="English Speech & Recognition"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  language === 'hi'
                    ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Hindi Speech & Recognition (हिन्दी)"
              >
                HI (हिन्दी)
              </button>
            </div>

            {/* Offline Whisper Status Pill / Installer */}
            {offlineInstalled ? (
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Offline Whisper Ready
              </span>
            ) : (
              <button
                type="button"
                disabled={isInstallingModel}
                onClick={handleInstallWhisper}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-200 font-mono transition-colors disabled:opacity-50"
                title="Download offline GGML Whisper model"
              >
                {isInstallingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-cyan-400" />}
                <span>{isInstallingModel ? 'Installing Whisper...' : 'Install Offline Whisper'}</span>
              </button>
            )}

            {installMessage && (
              <span className="text-xs text-cyan-300 font-mono hidden md:inline">{installMessage}</span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
              aria-label="Close voice page"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Central Orb & Status */}
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-6 text-center">
          {/* Animated Core Orb */}
          <div className="relative flex h-56 w-56 items-center justify-center sm:h-72 sm:w-72">
            <div
              className="absolute inset-0 rounded-full border border-cyan-400/20 transition-transform duration-100 ease-out"
              style={{
                transform: `scale(${1 + audioLevel * 0.3})`,
                boxShadow: listening
                  ? `0 0 ${40 + audioLevel * 90}px rgba(34,211,238,${0.25 + audioLevel * 0.4})`
                  : '0 0 80px rgba(34,211,238,0.15)',
              }}
            />

            <div
              ref={orbRef}
              className={`relative flex h-40 w-40 items-center justify-center rounded-full border transition-all duration-150 ease-out sm:h-48 sm:w-48 ${
                listening
                  ? 'border-cyan-300/80 bg-[conic-gradient(from_0deg,rgba(34,211,238,.4),rgba(139,92,246,.6),rgba(34,211,238,.35),rgba(16,185,129,.5),rgba(34,211,238,.4))] ring-4 ring-cyan-400/50'
                  : speaking
                  ? 'border-emerald-300/60 bg-[conic-gradient(from_0deg,rgba(16,185,129,.4),rgba(34,211,238,.4),rgba(16,185,129,.4))] shadow-[0_0_70px_rgba(16,185,129,.3)]'
                  : 'border-cyan-300/30 bg-[conic-gradient(from_0deg,rgba(34,211,238,.12),rgba(139,92,246,.3),rgba(34,211,238,.1),rgba(16,185,129,.25),rgba(34,211,238,.12))] shadow-[0_0_60px_rgba(34,211,238,.2)]'
              }`}
              style={{
                transform: `scale(${1 + audioLevel * 0.22})`,
              }}
            >
              <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-[#061323]/95 shadow-inner shadow-cyan-500/40 sm:h-32 sm:w-32">
                <span className="text-3xl font-black tracking-tight text-cyan-100 flex items-center justify-center gap-0.5">
                  H<span className="text-cyan-400 font-serif">Σ</span>
                </span>
              </div>
            </div>
          </div>

          {/* Status Text */}
          <div className="max-w-xl space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-slate-300">
              {isTranscribing
                ? 'Processing Speech...'
                : listening
                ? 'Listening to you...'
                : generating
                ? 'Synthesizing Architecture & Code...'
                : speaking
                ? 'Speaking...'
                : 'How can I assist you?'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {listening
                ? 'Speak your request. Hedes listens in real-time and executes actions.'
                : 'Speak, type, or dictate. Hedes has full terminal, coding & file access.'}
            </p>
          </div>

          {/* Assistant Voice Response Display Card */}
          {lastReply && (
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950/70 p-4 text-left shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08] text-[11px] text-cyan-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Hedes Assistant Response
                </span>
                {speaking && (
                  <span className="flex items-center gap-1 text-emerald-400 text-[10px] animate-pulse">
                    <Volume2 className="w-3 h-3" /> Speaking...
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-slate-200 max-h-36 overflow-y-auto pr-1">
                {lastReply}
              </p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div role="alert" className="max-w-xl rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2 text-xs text-rose-300 shadow-sm">
              {error}
            </div>
          )}
        </main>

        {/* Bottom Input & Voice Control Bar */}
        <footer className="relative mx-auto w-full max-w-2xl space-y-2.5 px-4 pb-6">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={cloudSpeech} disabled={listening || isTranscribing} onChange={(e) => setCloudSpeech(e.target.checked)} />
            Use cloud transcription (sends audio to {provider.toLowerCase() === 'openai' ? 'OpenAI' : 'Groq'}; provider charges may apply)
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-2 shadow-[0_0_30px_rgba(34,211,238,.1)] backdrop-blur-xl">
            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={isTranscribing}
              className={`rounded-xl p-3 transition-all cursor-pointer ${
                listening
                  ? 'bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.5)] animate-pulse'
                  : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/30'
              }`}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              title={listening ? 'Stop listening (click to transcribe)' : 'Click to speak to Hedes'}
            >
              {isTranscribing ? (
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
              ) : listening ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            {/* Text Input for Typing / Dictating */}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={listening ? "Listening to your voice..." : "Speak, type prompt, or press Win+H to dictate..."}
              className="min-w-0 flex-1 bg-transparent px-2.5 text-xs sm:text-sm text-white outline-none placeholder:text-slate-500"
            />

            {/* Send Button */}
            <button
              type="button"
              onClick={() => send()}
              disabled={!draft.trim() || generating || isTranscribing}
              className="rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 p-3 text-slate-950 font-bold shadow-[0_0_14px_rgba(34,211,238,0.3)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              aria-label="Send voice request"
              title="Send to Hedes (Enter)"
            >
              <ArrowUp className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Footer Controls & Hints */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {cloudSpeech ? 'Cloud transcription selected' : 'Local speech • Review transcript before sending'}
            </span>

            <button
              type="button"
              onClick={() => { stopVoiceOutput(); setMuted(!muted); }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/[0.05] transition-all cursor-pointer"
            >
              {speaking ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
