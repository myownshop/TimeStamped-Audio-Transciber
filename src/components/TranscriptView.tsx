import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Clock,
  Play,
  Copy,
  Check,
  Search,
  Filter,
  Download,
  FileText,
  Subtitles,
  Edit2,
  Sparkles,
  AlignLeft,
  List,
  Volume2,
  VolumeX,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { TranscriptionData, TranscriptSegment } from '../types';
import {
  generateSrt,
  generateVtt,
  generateTextWithTimestamps,
  generatePlainText,
  generateMarkdown,
  downloadFile,
} from '../utils/export';

interface TranscriptViewProps {
  data: TranscriptionData;
  currentTime: number;
  onSeek: (seconds: number) => void;
  onUpdateSegment?: (segmentId: number, updatedText: string, updatedSpeaker?: string) => void;
  audioTitle?: string;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  data,
  currentTime,
  onSeek,
  onUpdateSegment,
  audioTitle = 'Audio_Transcript',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'segmented' | 'continuous'>('segmented');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showWordTimestamps, setShowWordTimestamps] = useState(true);
  const [showSilence, setShowSilence] = useState(true);

  const activeSegmentRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Check if transcript has word-level timestamps
  const hasWordTimestamps = useMemo(
    () => data.segments.some((s) => s.words && s.words.length > 0),
    [data.segments]
  );
  const isDeepgramEngine = data.engine === 'deepgram' || (data.chunkInterval && data.chunkInterval <= 2);

  // Extract count of preserved silent intervals
  const silentSegmentsCount = useMemo(
    () => data.segments.filter((s) => s.isSilent || s.text === '[Silence]' || s.speaker === 'Silence').length,
    [data.segments]
  );

  // Extract unique speakers
  const speakers = useMemo(() => {
    const set = new Set<string>();
    data.segments.forEach((seg) => {
      if (seg.speaker && seg.speaker !== 'Silence') set.add(seg.speaker);
    });
    return Array.from(set);
  }, [data.segments]);

  // Identify active segment based on current audio time
  const activeSegmentId = useMemo(() => {
    const active = data.segments.find((s) => currentTime >= s.start && currentTime < s.end);
    return active ? active.id : null;
  }, [currentTime, data.segments]);

  // Auto-scroll to active segment if enabled
  useEffect(() => {
    if (autoScroll && activeSegmentRef.current && listContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSegmentId, autoScroll]);

  // Filter segments by search query and speaker
  const filteredSegments = useMemo(() => {
    return data.segments.filter((seg) => {
      const isSilent = seg.isSilent || seg.text === '[Silence]' || seg.speaker === 'Silence';
      if (!showSilence && isSilent) return false;

      const matchesSpeaker =
        selectedSpeaker === 'all' ||
        seg.speaker === selectedSpeaker ||
        (selectedSpeaker === 'Silence' && isSilent);

      const matchesSearch =
        !searchQuery.trim() ||
        seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        seg.speaker?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (isSilent && 'silence'.includes(searchQuery.toLowerCase()));

      return matchesSpeaker && matchesSearch;
    });
  }, [data.segments, selectedSpeaker, searchQuery, showSilence]);

  // Calculate statistics (spoken words vs silent intervals)
  const stats = useMemo(() => {
    const spokenSegments = data.segments.filter(
      (s) => !s.isSilent && s.text !== '[Silence]' && s.speaker !== 'Silence'
    );
    const totalWords = spokenSegments.reduce(
      (acc, curr) => acc + curr.text.trim().split(/\s+/).filter(Boolean).length,
      0
    );
    const durationMins = (data.durationSeconds || (data.segments[data.segments.length - 1]?.end ?? 60)) / 60;
    const wpm = durationMins > 0 ? Math.round(totalWords / durationMins) : 0;
    return {
      wordCount: totalWords,
      segmentCount: data.segments.length,
      silentCount: silentSegmentsCount,
      wpm,
      isEntirelySilent: data.isSilentAudio || (silentSegmentsCount > 0 && totalWords === 0),
    };
  }, [data, silentSegmentsCount]);

  // Copy helper with feedback
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Start editing a segment
  const startEditing = (seg: TranscriptSegment) => {
    setEditingSegmentId(seg.id);
    setEditText(seg.text);
    setEditSpeaker(seg.speaker || 'Speaker 1');
  };

  // Save edited segment
  const saveEditing = (id: number) => {
    if (onUpdateSegment) {
      onUpdateSegment(id, editText, editSpeaker);
    }
    setEditingSegmentId(null);
  };

  // Highlight search keywords in text
  const renderHighlightedText = (text: string) => {
    if (!searchQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 text-stone-900 rounded-xs px-0.5 font-semibold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
      {/* Top Metadata & Summary Banner */}
      <div className="p-5 sm:p-6 bg-stone-50/70 border-b border-stone-200">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              {isDeepgramEngine ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  Deepgram Nova-2 · Exact 2s Chunking
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Gemini 3.5 Transcribe
                </span>
              )}

              {data.chunkInterval && (
                <span className="text-[11px] font-mono font-medium text-stone-700 bg-white border border-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" />
                  {data.chunkInterval}s exact intervals
                </span>
              )}

              {data.language && (
                <span className="text-xs font-medium text-stone-600 bg-stone-200/70 px-2 py-0.5 rounded-md">
                  Language: <strong className="text-stone-800">{data.language}</strong>
                </span>
              )}

              {silentSegmentsCount > 0 && (
                <span className="text-xs font-medium text-stone-700 bg-stone-100 border border-stone-300 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5">
                  <VolumeX className="w-3 h-3 text-stone-500" />
                  <span>{silentSegmentsCount} silent interval{silentSegmentsCount > 1 ? 's' : ''} preserved</span>
                </span>
              )}
            </div>

            {data.summary && (
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed pt-1">
                <strong className="text-stone-900 font-semibold">Summary:</strong> {data.summary}
              </p>
            )}

            {stats.isEntirelySilent && (
              <div className="mt-2 p-3 rounded-xl bg-amber-50/90 border border-amber-300/80 flex items-start gap-2.5 text-xs text-amber-950">
                <VolumeX className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Silent Audio Preserved:</span> This recording contains no spoken words.
                  All consecutive timestamp intervals are intact and returned as silent segments ([Silence]). They have not been erased or omitted.
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 sm:gap-4 bg-white px-3.5 py-2 rounded-xl border border-stone-200/80 shrink-0 self-start">
            <div className="text-center">
              <span className="block text-[11px] uppercase tracking-wider text-stone-600">Words</span>
              <span className="text-sm font-bold text-stone-900">{stats.wordCount}</span>
            </div>
            <div className="w-px h-6 bg-stone-200" />
            <div className="text-center">
              <span className="block text-[11px] uppercase tracking-wider text-stone-600">Pace</span>
              <span className="text-sm font-bold text-stone-900">{stats.wpm} <span className="text-[10px] text-stone-600 font-normal">wpm</span></span>
            </div>
            <div className="w-px h-6 bg-stone-200" />
            <div className="text-center">
              <span className="block text-[11px] uppercase tracking-wider text-stone-600">Segments</span>
              <span className="text-sm font-bold text-stone-900">{stats.segmentCount}</span>
            </div>
            {silentSegmentsCount > 0 && (
              <>
                <div className="w-px h-6 bg-stone-200" />
                <div className="text-center">
                  <span className="block text-[11px] uppercase tracking-wider text-stone-600">Silence</span>
                  <span className="text-sm font-bold text-stone-700">{silentSegmentsCount} <span className="text-[10px] text-stone-600 font-normal">chunks</span></span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Speaker filter, View toggle, Export */}
      <div className="p-3 sm:p-4 border-b border-stone-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="transcript-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in transcript..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
            />
          </div>

          {/* Speaker Filter */}
          {speakers.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-stone-400" />
              <select
                id="transcript-speaker-filter"
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-lg border border-stone-300 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="all">All Speakers ({speakers.length})</option>
                {speakers.map((spk) => (
                  <option key={spk} value={spk}>
                    {spk}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Silence segments toggle */}
          {silentSegmentsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSilence(!showSilence)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                showSilence
                  ? 'bg-stone-100 text-stone-800 border-stone-300 font-semibold shadow-2xs'
                  : 'bg-white text-stone-400 border-stone-200 hover:bg-stone-50 opacity-80'
              }`}
              title={showSilence ? 'Silence chunks are shown' : 'Click to show silence chunks'}
            >
              <VolumeX className="w-3.5 h-3.5 text-stone-500" />
              <span>{showSilence ? 'Silence on' : 'Silence off'} ({silentSegmentsCount})</span>
            </button>
          )}

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer select-none ml-1">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400 h-3.5 w-3.5 cursor-pointer"
            />
            <span>Auto-scroll sync</span>
          </label>
        </div>

        {/* View Mode & Export Buttons */}
        <div className="flex items-center gap-2">
          {/* Segmented vs Continuous View Toggle */}
          <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setViewMode('segmented')}
              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                viewMode === 'segmented' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
              }`}
              title="Timestamp Segments View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Timestamps</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('continuous')}
              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                viewMode === 'continuous' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
              }`}
              title="Continuous Text View"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Text</span>
            </button>
          </div>

          {/* Word Timestamps Toggle if available */}
          {hasWordTimestamps && (
            <button
              type="button"
              onClick={() => setShowWordTimestamps(!showWordTimestamps)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                showWordTimestamps
                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold shadow-2xs'
                  : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
              }`}
              title="Toggle word-level exact timestamps"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Word Timestamps</span>
              <span className="sm:hidden">Words</span>
            </button>
          )}

          {/* Copy Plain Text */}
          <button
            id="copy-text-btn"
            type="button"
            onClick={() => handleCopy(generatePlainText(data), 'plain')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Copy plain text"
          >
            {copiedType === 'plain' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-stone-500" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              id="export-dropdown-toggle"
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div
                className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-stone-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setShowExportMenu(false)}
              >
                <div className="px-3 py-1 text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                  Copy to Clipboard
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(generateTextWithTimestamps(data), 'timestamps')}
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between cursor-pointer"
                >
                  <span>With Timestamps</span>
                  <Copy className="w-3 h-3 text-stone-400" />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(generatePlainText(data), 'plain')}
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Plain Text Only</span>
                  <Copy className="w-3 h-3 text-stone-400" />
                </button>

                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                  Download File
                </div>
                <button
                  id="export-srt-btn"
                  type="button"
                  onClick={() =>
                    downloadFile(generateSrt(data), `${audioTitle.replace(/\s+/g, '_')}.srt`, 'text/plain')
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-amber-600" />
                    <strong>SRT Subtitles</strong> (.srt)
                  </span>
                </button>
                <button
                  id="export-vtt-btn"
                  type="button"
                  onClick={() =>
                    downloadFile(generateVtt(data), `${audioTitle.replace(/\s+/g, '_')}.vtt`, 'text/vtt')
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-blue-600" />
                    <strong>WebVTT Subtitles</strong> (.vtt)
                  </span>
                </button>
                <button
                  id="export-txt-btn"
                  type="button"
                  onClick={() =>
                    downloadFile(
                      generateTextWithTimestamps(data),
                      `${audioTitle.replace(/\s+/g, '_')}.txt`,
                      'text/plain'
                    )
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-stone-500" />
                    Text Document (.txt)
                  </span>
                </button>
                <button
                  id="export-md-btn"
                  type="button"
                  onClick={() =>
                    downloadFile(
                      generateMarkdown(data, audioTitle),
                      `${audioTitle.replace(/\s+/g, '_')}.md`,
                      'text/markdown'
                    )
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    Markdown (.md)
                  </span>
                </button>
                <button
                  id="export-json-btn"
                  type="button"
                  onClick={() =>
                    downloadFile(
                      JSON.stringify(data, null, 2),
                      `${audioTitle.replace(/\s+/g, '_')}.json`,
                      'application/json'
                    )
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    Full JSON (.json)
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Transcript Content Body */}
      <div ref={listContainerRef} className="p-4 sm:p-6 max-h-[600px] overflow-y-auto space-y-3">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Search className="w-8 h-8 mx-auto mb-2 text-stone-300" />
            <p className="text-sm font-medium">No transcript segments match your search.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSpeaker('all');
              }}
              className="mt-2 text-xs text-amber-600 hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : viewMode === 'continuous' ? (
          /* Continuous Reading View */
          <div className="prose prose-stone max-w-none text-stone-800 leading-relaxed space-y-4">
            {filteredSegments.map((seg) => {
              const isActive = activeSegmentId === seg.id;
              const isSilent = seg.isSilent || seg.text === '[Silence]' || seg.speaker === 'Silence';
              return (
                <span
                  key={seg.id}
                  onClick={() => onSeek(seg.start)}
                  className={`inline mr-1.5 px-1 py-0.5 rounded cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-amber-200 text-stone-950 font-semibold ring-2 ring-amber-400'
                      : isSilent
                      ? 'text-stone-400 italic font-mono text-xs hover:bg-stone-100'
                      : 'hover:bg-stone-100'
                  }`}
                  title={`[${seg.startTimeFormatted}] Click to play`}
                >
                  <sup className="text-[10px] text-stone-500 font-mono mr-0.5">[{seg.startTimeFormatted}]</sup>
                  {isSilent ? '[Silence]' : renderHighlightedText(seg.text)}
                </span>
              );
            })}
          </div>
        ) : (
          /* Segmented Timestamps View */
          filteredSegments.map((seg) => {
            const isActive = activeSegmentId === seg.id;
            const isEditing = editingSegmentId === seg.id;
            const isSilent = seg.isSilent || seg.text === '[Silence]' || seg.speaker === 'Silence';

            return (
              <div
                key={seg.id}
                ref={isActive ? activeSegmentRef : null}
                className={`group relative rounded-xl p-3.5 sm:p-4 border transition-all ${
                  isActive
                    ? 'border-amber-400 bg-amber-50/60 shadow-xs ring-1 ring-amber-300'
                    : isSilent
                    ? 'border-stone-200/90 bg-stone-50/60 hover:border-stone-300'
                    : 'border-stone-200 hover:border-stone-300 bg-white hover:bg-stone-50/40'
                }`}
              >
                {/* Header: Timestamp Pill & Speaker Tag & Actions */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Interactive Timestamp Pill - Click to play */}
                    <button
                      type="button"
                      onClick={() => onSeek(seg.start)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-200'
                      }`}
                      title={`Click to seek audio to ${seg.startTimeFormatted}`}
                    >
                      {isActive ? (
                        <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                      ) : isSilent ? (
                        <VolumeX className="w-3 h-3 text-stone-400" />
                      ) : (
                        <Play className="w-3 h-3 fill-current opacity-70" />
                      )}
                      <span>
                        {seg.startTimeFormatted}
                        <span className="opacity-60 mx-1">-</span>
                        {seg.endTimeFormatted}
                      </span>
                    </button>

                    {/* Speaker or Silence badge */}
                    {isSilent ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                        <VolumeX className="w-3 h-3 text-stone-400" />
                        Silence
                      </span>
                    ) : (
                      seg.speaker && (
                        <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                          {seg.speaker}
                        </span>
                      )
                    )}

                    {/* 2s exact chunk indicator if Deepgram or 2s interval */}
                    {(isDeepgramEngine || (seg.end - seg.start <= 2.1 && seg.end - seg.start >= 1.5)) && (
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                        2.0s interval
                      </span>
                    )}

                    {isActive && (
                      <span className="hidden sm:inline-flex items-center text-[11px] font-medium text-amber-700 animate-pulse">
                        Playing now
                      </span>
                    )}
                  </div>

                  {/* Segment Actions (Play, Copy, Edit) */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onSeek(seg.start)}
                      className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors cursor-pointer"
                      title="Play segment"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(`[${seg.startTimeFormatted}] ${seg.speaker ? `${seg.speaker}: ` : ''}${seg.text}`, `seg-${seg.id}`)
                      }
                      className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors cursor-pointer"
                      title="Copy segment with timestamp"
                    >
                      {copiedType === `seg-${seg.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {onUpdateSegment && !isEditing && !isSilent && (
                      <button
                        type="button"
                        onClick={() => startEditing(seg)}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors cursor-pointer"
                        title="Edit segment text"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Spoken Text or Edit Form */}
                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-stone-500">Speaker:</label>
                      <input
                        type="text"
                        value={editSpeaker}
                        onChange={(e) => setEditSpeaker(e.target.value)}
                        className="text-xs px-2 py-1 border border-stone-300 rounded focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full text-xs sm:text-sm p-2.5 border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSegmentId(null)}
                        className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEditing(seg.id)}
                        className="px-3 py-1 text-xs bg-stone-900 hover:bg-stone-800 text-white rounded font-medium cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {isSilent ? (
                      <p
                        onClick={() => onSeek(seg.start)}
                        className={`text-xs sm:text-sm leading-relaxed cursor-pointer font-mono italic ${
                          isActive ? 'text-amber-900 font-semibold' : 'text-stone-500'
                        }`}
                        title="Click to seek playback to this silent interval"
                      >
                        [Silence / No speech detected]
                      </p>
                    ) : (
                      <p
                        onClick={() => onSeek(seg.start)}
                        className={`text-xs sm:text-sm leading-relaxed cursor-pointer ${
                          isActive ? 'text-stone-950 font-medium' : 'text-stone-800'
                        }`}
                      >
                        {renderHighlightedText(seg.text)}
                      </p>
                    )}

                    {/* Word-level exact timestamps */}
                    {showWordTimestamps && seg.words && seg.words.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-stone-100 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono text-stone-600 uppercase tracking-wider mr-0.5 select-none">
                          2s Words:
                        </span>
                        {seg.words.map((w, wIdx) => {
                          const isWordActive = currentTime >= w.start && currentTime < w.end;
                          return (
                            <button
                              key={wIdx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSeek(w.start);
                              }}
                              className={`group/word px-2 py-0.5 rounded text-xs transition-all cursor-pointer inline-flex items-center gap-1 border ${
                                isWordActive
                                  ? 'bg-amber-400 text-stone-950 font-bold border-amber-500 shadow-2xs scale-105'
                                  : 'bg-stone-50 hover:bg-amber-50 text-stone-700 border-stone-200 hover:border-amber-300'
                              }`}
                              title={`Word: "${w.word}" (${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s)`}
                            >
                              <span>{w.word}</span>
                              <span className="text-[9px] font-mono opacity-65 group-hover/word:text-amber-800">
                                {w.start.toFixed(1)}s
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
