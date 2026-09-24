import React, { useState, useRef } from 'react';
import {
  Upload,
  Link2,
  Mic,
  FileAudio,
  Check,
  ArrowRight,
  Loader2,
  Sparkles,
  AlertCircle,
  Radio,
  SlidersHorizontal,
  Clock,
  Zap,
} from 'lucide-react';
import { SAMPLE_AUDIOS, SampleAudio } from '../data/samples';
import { InputMode, TranscriptionData, TranscriptionEngine } from '../types';
import { AudioRecorder } from './AudioRecorder';

interface AudioInputSelectorProps {
  onAudioSelected: (
    payload: {
      base64: string;
      mimeType: string;
      fileName: string;
      sourceType: 'upload' | 'link' | 'recording';
      audioUrl: string;
      customPrompt?: string;
      engine?: TranscriptionEngine;
    },
    liveTranscriptionData?: TranscriptionData
  ) => void;
  onOpenRecorder: () => void;
  isTranscribing: boolean;
  selectedEngine: TranscriptionEngine;
  onSelectEngine: (engine: TranscriptionEngine) => void;
}

export const AudioInputSelector: React.FC<AudioInputSelectorProps> = ({
  onAudioSelected,
  onOpenRecorder,
  isTranscribing,
  selectedEngine,
  onSelectEngine,
}) => {
  const [activeTab, setActiveTab] = useState<InputMode>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [customVocabulary, setCustomVocabulary] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file processing
  const processAudioFile = (file: File) => {
    if (!file) return;
    const maxSize = 45 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size exceeds the 45MB limit. Please provide a shorter audio file.');
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = file.type || 'audio/mp3';

      onAudioSelected({
        base64,
        mimeType,
        fileName: file.name,
        sourceType: 'upload',
        audioUrl,
        customPrompt: customVocabulary.trim() || undefined,
        engine: selectedEngine,
      });
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAudioFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  };

  // Fetch audio link via backend proxy
  const handleFetchLink = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || linkUrl).trim();
    if (!targetUrl) return;

    setIsFetchingLink(true);
    setLinkError(null);

    try {
      const response = await fetch('/api/fetch-audio-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to download audio from this URL.');
      }

      // We can use the server's streaming proxy to play it without CORS restrictions
      const playableProxyUrl = `/api/proxy-audio?url=${encodeURIComponent(targetUrl)}`;

      onAudioSelected({
        base64: resData.audioBase64,
        mimeType: resData.mimeType,
        fileName: resData.filename || 'Audio from Web Link',
        sourceType: 'link',
        audioUrl: playableProxyUrl,
        customPrompt: customVocabulary.trim() || undefined,
        engine: selectedEngine,
      });
    } catch (err: any) {
      console.error('Fetch link failed:', err);
      setLinkError(err.message || 'Could not fetch audio from the provided URL.');
    } finally {
      setIsFetchingLink(false);
    }
  };

  const selectSample = (sample: SampleAudio) => {
    setLinkUrl(sample.url);
    handleFetchLink(sample.url);
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
      {/* Engine Selection: Deepgram Nova-2 (2s chunking) vs Gemini 3.5 */}
      <div className="p-3.5 sm:p-4 bg-stone-50/80 border-b border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div>
            <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
              Transcription Engine & Timestamp Precision
            </span>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Choose Deepgram for exact 2-second timestamp intervals or Gemini for conversational context
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Deepgram API Active
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Deepgram Option */}
          <button
            id="engine-select-deepgram"
            type="button"
            onClick={() => onSelectEngine('deepgram')}
            className={`p-3 rounded-xl text-left border transition-all cursor-pointer relative ${
              selectedEngine === 'deepgram'
                ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                : 'bg-white border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Deepgram Nova-2
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 border border-amber-500/30">
                2s Exact Chunking
              </span>
            </div>
            <p className="text-[11px] text-stone-600 mt-1 leading-snug">
              Every 2 seconds is an exact timestamp interval (<span className="font-mono text-stone-800 font-semibold">[00:00 - 00:02]</span>) with word-level millisecond timing.
            </p>
            {selectedEngine === 'deepgram' && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-800">
                <Check className="w-3 h-3 text-amber-700" />
                <span>Selected: Knowing exactly each 2s timestamp</span>
              </div>
            )}
          </button>

          {/* Gemini Option */}
          <button
            id="engine-select-gemini"
            type="button"
            onClick={() => onSelectEngine('gemini')}
            className={`p-3 rounded-xl text-left border transition-all cursor-pointer relative ${
              selectedEngine === 'gemini'
                ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                : 'bg-white border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-stone-600" />
                Gemini 3.5 Transcribe
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                Context Segments
              </span>
            </div>
            <p className="text-[11px] text-stone-600 mt-1 leading-snug">
              Sentence and clause speech segmentation (2–8s) with speaker recognition and semantic context.
            </p>
            {selectedEngine === 'gemini' && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-stone-700">
                <Check className="w-3 h-3 text-stone-700" />
                <span>Selected: Sentence-level speech chunks</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Mode selection tabs */}
      <div className="flex border-b border-stone-200 bg-stone-50/60 p-1.5 gap-1">
        <button
          id="tab-upload-audio"
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'upload'
              ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
          }`}
        >
          <Upload className="w-4 h-4 text-amber-600" />
          <span>Upload File</span>
        </button>

        <button
          id="tab-link-audio"
          type="button"
          onClick={() => setActiveTab('link')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'link'
              ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
          }`}
        >
          <Link2 className="w-4 h-4 text-blue-600" />
          <span>Audio Link / URL</span>
        </button>

        <button
          id="tab-record-audio"
          type="button"
          onClick={() => setActiveTab('record')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'record'
              ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/80'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
          }`}
        >
          <Mic className="w-4 h-4 text-red-600" />
          <span>Record Mic (Live Transcribe)</span>
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {/* TAB 1: UPLOAD */}
        {activeTab === 'upload' && (
          <div>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
                  : 'border-stone-300 hover:border-stone-400 bg-stone-50/40 hover:bg-stone-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*, video/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload-input"
              />
              <div className="w-14 h-14 rounded-2xl bg-amber-100/80 text-amber-700 flex items-center justify-center mb-3.5 shadow-2xs">
                <FileAudio className="w-7 h-7" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-stone-900 mb-1">
                Drop your audio file here, or <span className="text-amber-600 underline">browse</span>
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mb-4">
                Supports MP3, WAV, M4A, OGG, WEBM, FLAC, and AAC files up to 45MB.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-stone-500">
                {['MP3', 'WAV', 'M4A', 'OGG', 'WEBM', 'FLAC'].map((format) => (
                  <span
                    key={format}
                    className="px-2 py-0.5 rounded-md bg-stone-200/70 border border-stone-300 font-mono text-[10px]"
                  >
                    .{format.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LINK / URL */}
        {activeTab === 'link' && (
          <div className="space-y-5">
            <div>
              <label htmlFor="audio-url-input" className="block text-xs font-semibold text-stone-700 mb-1.5">
                Direct Web Audio URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="audio-url-input"
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://example.com/podcast-audio.mp3"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                  />
                </div>
                <button
                  id="fetch-link-btn"
                  type="button"
                  disabled={!linkUrl.trim() || isFetchingLink}
                  onClick={() => handleFetchLink()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  {isFetchingLink ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <span>Load Audio</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                Paste any direct link to an MP3, WAV, podcast episode, or web audio stream.
              </p>
            </div>

            {linkError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <p>{linkError}</p>
              </div>
            )}

            {/* Quick Sample Audios */}
            <div className="pt-2 border-t border-stone-200">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block mb-2.5">
                Or try one of these ready-to-test historic audio clips:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {SAMPLE_AUDIOS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    disabled={isFetchingLink}
                    onClick={() => selectSample(sample)}
                    className="text-left p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-amber-50/50 hover:border-amber-300 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-stone-900 group-hover:text-amber-900 truncate">
                        {sample.title}
                      </span>
                      <span className="text-[10px] text-stone-600 bg-stone-200 group-hover:bg-amber-200/80 px-1.5 py-0.5 rounded font-mono shrink-0 ml-1">
                        {sample.durationApprox}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                      {sample.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RECORD MIC & REALTIME TRANSCRIPTION */}
        {activeTab === 'record' && (
          <div className="space-y-4">
            <AudioRecorder
              onRecordingComplete={(blob, base64, mimeType, durationSecs, liveData) => {
                const audioUrl = URL.createObjectURL(blob);
                onAudioSelected(
                  {
                    base64,
                    mimeType,
                    fileName: `Microphone_Recording_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
                    sourceType: 'recording',
                    audioUrl,
                    customPrompt: customVocabulary.trim() || undefined,
                  },
                  liveData
                );
              }}
              onCancel={() => setActiveTab('upload')}
            />
          </div>
        )}

        {/* Optional Context / Custom Vocabulary Accordion */}
        <div className="mt-5 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-medium text-stone-600 hover:text-stone-900 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{showAdvanced ? 'Hide additional context / vocabulary' : 'Add custom vocabulary or speaker names (optional)'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3">
              <input
                id="custom-vocab-input"
                type="text"
                value={customVocabulary}
                onChange={(e) => setCustomVocabulary(e.target.value)}
                placeholder="e.g., Speaker names: Dr. Thorne, Sarah; Keywords: Kubernetes, CRISPR, quarterly earnings"
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50"
              />
              <p className="text-[11px] text-stone-600 mt-1">
                Provides Gemini with contextual terms, uncommon proper nouns, or known speakers to improve transcription accuracy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
