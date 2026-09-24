import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Volume2,
  FileAudio,
  Loader2,
  AlertCircle,
  RotateCcw,
  Play,
  ArrowRight,
  CheckCircle2,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { Header } from './components/Header';
import { AudioPlayer } from './components/AudioPlayer';
import { AudioInputSelector } from './components/AudioInputSelector';
import { AudioRecorder } from './components/AudioRecorder';
import { TranscriptView } from './components/TranscriptView';
import { HistoryDrawer } from './components/HistoryDrawer';
import { RealtimeStreamView } from './components/RealtimeStreamView';
import { TranscriptionData, SavedTranscript, TranscriptSegment, TranscriptionEngine } from './types';

interface ActiveAudio {
  base64: string;
  mimeType: string;
  fileName: string;
  sourceType: 'upload' | 'link' | 'recording';
  audioUrl: string;
  customPrompt?: string;
  engine?: TranscriptionEngine;
}

const STORAGE_KEY = 'audio_transcriber_saved_history_v1';

export default function App() {
  const [activeAudio, setActiveAudio] = useState<ActiveAudio | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<TranscriptionEngine>('deepgram');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgressStep, setTranscribeProgressStep] = useState<string>('');
  const [transcriptionData, setTranscriptionData] = useState<TranscriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);

  // Real-time streaming transcription states
  const [streamingSegments, setStreamingSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [streamModel, setStreamModel] = useState<string>('gemini-3.5-transcribe');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Elapsed time tracker during transcription
  useEffect(() => {
    let interval: number | null = null;
    if (isTranscribing) {
      setElapsedSeconds(0);
      interval = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTranscribing]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSavedTranscripts(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved transcripts from localStorage', e);
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = (data: TranscriptionData, audio: ActiveAudio) => {
    try {
      const newEntry: SavedTranscript = {
        id: 'trans-' + Date.now(),
        title: audio.fileName,
        sourceType: audio.sourceType,
        sourceName: audio.fileName,
        createdAt: Date.now(),
        data,
        audioUrl: audio.audioUrl,
        audioBase64: audio.base64,
        mimeType: audio.mimeType,
      };

      const updated = [newEntry, ...savedTranscripts.slice(0, 19)]; // keep up to 20
      setSavedTranscripts(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save transcript to localStorage', e);
    }
  };

  const handleDeleteTranscript = (id: string) => {
    const updated = savedTranscripts.filter((t) => t.id !== id);
    setSavedTranscripts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleClearAllHistory = () => {
    setSavedTranscripts([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSelectHistoryTranscript = (item: SavedTranscript) => {
    setTranscriptionData(item.data);
    setError(null);

    if (item.audioBase64 || item.audioUrl) {
      // Restore audio player
      let playUrl = item.audioUrl;
      if (!playUrl && item.audioBase64) {
        const binary = atob(item.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: item.mimeType || 'audio/mp3' });
        playUrl = URL.createObjectURL(blob);
      }

      setActiveAudio({
        base64: item.audioBase64 || '',
        mimeType: item.mimeType || 'audio/mp3',
        fileName: item.title,
        sourceType: item.sourceType,
        audioUrl: playUrl || '',
      });
    }
  };

  // When audio is selected (via upload, link, or mic)
  const handleAudioSelected = (payload: ActiveAudio, liveData?: TranscriptionData) => {
    setActiveAudio(payload);
    setError(null);
    setIsRecorderOpen(false);
    setCurrentTime(0);

    const engineToUse = payload.engine || selectedEngine;
    if (payload.engine && payload.engine !== selectedEngine) {
      setSelectedEngine(payload.engine);
    }

    if (liveData && liveData.segments.length > 0) {
      setTranscriptionData(liveData);
      saveToHistory(liveData, payload);
    } else {
      setTranscriptionData(null);
      // Auto-transcribe using the selected engine
      startTranscription(payload, engineToUse);
    }
  };

  // Mic recording complete
  const handleRecordingComplete = (
    blob: Blob,
    base64: string,
    mimeType: string,
    durationSecs: number,
    liveData?: TranscriptionData
  ) => {
    const audioUrl = URL.createObjectURL(blob);
    const audioPayload: ActiveAudio = {
      base64,
      mimeType,
      fileName: `Microphone_Recording_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
      sourceType: 'recording',
      audioUrl,
      engine: selectedEngine,
    };
    handleAudioSelected(audioPayload, liveData);
  };

  // Fallback non-streaming transcribe
  const runFallbackTranscription = async (targetAudio: ActiveAudio, engineToUse?: TranscriptionEngine) => {
    const chosenEngine = engineToUse || selectedEngine;
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: targetAudio.base64,
        mimeType: targetAudio.mimeType,
        filename: targetAudio.fileName,
        customInstructions: targetAudio.customPrompt,
        engine: chosenEngine,
      }),
    });

    const rawText = await response.text();
    let resJson: any;
    try {
      resJson = JSON.parse(rawText);
    } catch {
      throw new Error(
        response.status === 503
          ? 'The transcription service is temporarily experiencing high traffic. Please wait a moment and try again.'
          : `Server response error (${response.status}): ${rawText.slice(0, 160)}`
      );
    }

    if (!response.ok || !resJson.success) {
      throw new Error(resJson.error || 'Failed to transcribe audio.');
    }

    setTranscriptionData(resJson.data);
    saveToHistory(resJson.data, targetAudio);
  };

  // Trigger transcription request with real-time SSE streaming
  const startTranscription = async (
    audioToTranscribe?: ActiveAudio,
    engineOverride?: TranscriptionEngine
  ) => {
    const targetAudio = audioToTranscribe || activeAudio;
    if (!targetAudio) return;

    const chosenEngine = engineOverride || selectedEngine;
    setIsTranscribing(true);
    setStreamingSegments([]);
    setInterimText('');
    setStreamModel(chosenEngine === 'deepgram' ? 'deepgram-nova-2-2s' : 'gemini-3.5-transcribe');
    setError(null);
    setTranscribeProgressStep(
      chosenEngine === 'deepgram'
        ? 'Connecting to Deepgram Nova-2 (2s chunking)...'
        : 'Connecting to gemini-3.5-transcribe stream...'
    );

    try {
      const response = await fetch('/api/transcribe-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioBase64: targetAudio.base64,
          mimeType: targetAudio.mimeType,
          filename: targetAudio.fileName,
          customInstructions: targetAudio.customPrompt,
          engine: chosenEngine,
        }),
      });

      if (!response.ok || !response.body) {
        console.warn('Streaming endpoint returned non-200, falling back to standard transcribe');
        await runFallbackTranscription(targetAudio, chosenEngine);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedComplete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;
          let eventType = 'message';
          let dataStr = '';

          const lines = rawEvent.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);
            if (eventType === 'init') {
              if (payload.model) setStreamModel(payload.model);
            } else if (eventType === 'model_switch') {
              if (payload.model) setStreamModel(payload.model);
            } else if (eventType === 'segment') {
              setStreamingSegments((prev) => {
                if (prev.some((s) => s.id === payload.id)) return prev;
                return [...prev, payload];
              });
              setInterimText('');
            } else if (eventType === 'interim') {
              setInterimText(payload.text || '');
            } else if (eventType === 'complete') {
              receivedComplete = true;
              if (payload.data) {
                setTranscriptionData(payload.data);
                saveToHistory(payload.data, targetAudio);
              }
            } else if (eventType === 'error') {
              throw new Error(payload.error || 'Transcription stream failed');
            }
          } catch (jsonErr: any) {
            console.warn('Error parsing SSE chunk:', jsonErr);
          }
        }
      }

      // If stream ended without an explicit complete event, assemble final segments
      if (!receivedComplete) {
        setStreamingSegments((currentSegments) => {
          if (currentSegments.length > 0) {
            const fullTranscript = currentSegments.map((s) => s.text).join(' ');
            const finalData: TranscriptionData = {
              language: 'Detected speech',
              summary: fullTranscript.slice(0, 150) + (fullTranscript.length > 150 ? '...' : ''),
              durationSeconds: currentSegments[currentSegments.length - 1].end,
              fullTranscript,
              segments: currentSegments,
            };
            setTranscriptionData(finalData);
            saveToHistory(finalData, targetAudio);
          }
          return currentSegments;
        });
      }
    } catch (err: any) {
      console.error('Transcription stream error, falling back to non-streaming:', err);
      try {
        await runFallbackTranscription(targetAudio);
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || err.message || 'An unexpected error occurred during transcription.');
      }
    } finally {
      setIsTranscribing(false);
      setTranscribeProgressStep('');
    }
  };

  // Seek audio player to time in seconds
  const handleSeek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
      setCurrentTime(seconds);
    }
  };

  // Update a segment text/speaker in-place
  const handleUpdateSegment = (segmentId: number, updatedText: string, updatedSpeaker?: string) => {
    if (!transcriptionData) return;

    const newSegments = transcriptionData.segments.map((seg) =>
      seg.id === segmentId
        ? {
            ...seg,
            text: updatedText,
            speaker: updatedSpeaker !== undefined ? updatedSpeaker : seg.speaker,
          }
        : seg
    );

    const updatedData: TranscriptionData = {
      ...transcriptionData,
      segments: newSegments,
      fullTranscript: newSegments.map((s) => s.text).join(' '),
    };

    setTranscriptionData(updatedData);

    // Also update current item in history if matched
    if (activeAudio) {
      const updatedHistory = savedTranscripts.map((item) => {
        if (item.title === activeAudio.fileName) {
          return { ...item, data: updatedData };
        }
        return item;
      });
      setSavedTranscripts(updatedHistory);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans antialiased selection:bg-amber-200">
      <Header
        historyCount={savedTranscripts.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
        hasActiveAudio={!!activeAudio}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Transcription Error</p>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
            {activeAudio && (
              <button
                type="button"
                onClick={() => startTranscription()}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Modal: Live Microphone Recorder */}
        {isRecorderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
            <div className="w-full max-w-xl animate-in zoom-in-95 duration-150">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                onCancel={() => setIsRecorderOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Active Audio Bar (If an audio source is loaded) */}
        {activeAudio && (
          <div className="space-y-4">
            {/* Audio Player Component */}
            <AudioPlayer
              src={activeAudio.audioUrl}
              title={activeAudio.fileName}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              audioRef={audioRef}
            />

            {/* Audio Source Status Card */}
            <div className="bg-white p-4 rounded-xl border border-stone-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="capitalize px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold text-[11px] border border-amber-200">
                  {activeAudio.sourceType}
                </span>
                <span className="font-medium text-stone-800 truncate max-w-xs sm:max-w-md">
                  {activeAudio.fileName}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Engine Selector for Active Audio */}
                <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedEngine('deepgram')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      selectedEngine === 'deepgram'
                        ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="2s exact chunking with word timestamps"
                  >
                    Deepgram (2s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEngine('gemini')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      selectedEngine === 'gemini'
                        ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Gemini sentence segments"
                  >
                    Gemini 3.5
                  </button>
                </div>

                {!isTranscribing && (
                  <button
                    id="retry-transcribe-btn"
                    type="button"
                    onClick={() => startTranscription(activeAudio, selectedEngine)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {transcriptionData
                      ? `Re-transcribe (${selectedEngine === 'deepgram' ? '2s Deepgram' : 'Gemini'})`
                      : `Transcribe Now (${selectedEngine === 'deepgram' ? '2s' : 'Gemini'})`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveAudio(null);
                    setTranscriptionData(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-medium transition-colors cursor-pointer"
                >
                  Choose Different Audio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Streaming Transcription View */}
        {isTranscribing && activeAudio && (
          <RealtimeStreamView
            segments={streamingSegments}
            interimText={interimText}
            fileName={activeAudio.fileName}
            modelUsed={streamModel}
            elapsedSeconds={elapsedSeconds}
            onSeek={handleSeek}
            currentTime={currentTime}
          />
        )}

        {/* Fallback Transcribing State if activeAudio is loading */}
        {isTranscribing && !activeAudio && (
          <div className="bg-white rounded-2xl border border-amber-200 p-8 sm:p-12 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1.5">
              Transcribing Audio Verbatim
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto mb-6">
              Listening to speech patterns, detecting speaker pauses, and generating exact timestamps...
            </p>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-100 text-stone-700 text-xs font-medium border border-stone-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>{transcribeProgressStep || 'Processing audio stream...'}</span>
            </div>
          </div>
        )}

        {/* Audio Input Selector (Shown when no active audio is selected, or if user wants to replace it) */}
        {!activeAudio && !isTranscribing && (
          <div className="space-y-6">
            <div className="max-w-2xl mx-auto text-center space-y-2 pt-2 pb-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                Exact Audio Transcription with Timestamps
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                Upload any sound file, paste a direct audio link, or record live from your microphone.
                Get verbatim text with clickable timestamp markers.
              </p>
            </div>

            <AudioInputSelector
              onAudioSelected={handleAudioSelected}
              onOpenRecorder={() => setIsRecorderOpen(true)}
              isTranscribing={isTranscribing}
              selectedEngine={selectedEngine}
              onSelectEngine={setSelectedEngine}
            />
          </div>
        )}

        {/* Transcript View Component (When transcription is ready) */}
        {transcriptionData && !isTranscribing && (
          <TranscriptView
            data={transcriptionData}
            currentTime={currentTime}
            onSeek={handleSeek}
            onUpdateSegment={handleUpdateSegment}
            audioTitle={activeAudio?.fileName || 'Audio_Transcript'}
          />
        )}
      </main>

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        savedTranscripts={savedTranscripts}
        onSelectTranscript={handleSelectHistoryTranscript}
        onDeleteTranscript={handleDeleteTranscript}
        onClearAll={handleClearAllHistory}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-stone-500">
          Audio Transcriber • Powered by Gemini speech transcription with verbatim accuracy and segment timestamps
        </div>
      </footer>
    </div>
  );
}
