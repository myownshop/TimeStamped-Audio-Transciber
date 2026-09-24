import React, { useEffect, useRef } from 'react';
import {
  Radio,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  CheckCircle2,
  SlidersHorizontal,
  FileAudio,
  Play,
  Copy,
  Check,
} from 'lucide-react';
import { TranscriptSegment } from '../types';

interface RealtimeStreamViewProps {
  segments: TranscriptSegment[];
  interimText: string;
  interimTimestamp?: string;
  fileName: string;
  modelUsed?: string;
  elapsedSeconds: number;
  onSeek?: (seconds: number) => void;
  currentTime?: number;
}

export const RealtimeStreamView: React.FC<RealtimeStreamViewProps> = ({
  segments,
  interimText,
  interimTimestamp,
  fileName,
  modelUsed = 'gemini-3.5-transcribe',
  elapsedSeconds,
  onSeek,
  currentTime = 0,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Calculate total words streamed so far
  const totalWords =
    segments.reduce((acc, s) => acc + (s.text ? s.text.split(/\s+/).filter(Boolean).length : 0), 0) +
    (interimText ? interimText.split(/\s+/).filter(Boolean).length : 0);

  // Auto-scroll to the bottom as new segments and interim words stream in
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [segments, interimText]);

  const handleCopy = () => {
    const full = segments
      .map((s) => `[${s.startTimeFormatted} - ${s.endTimeFormatted}] ${s.speaker}: ${s.text}`)
      .join('\n');
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-amber-200/90 shadow-md overflow-hidden animate-in fade-in duration-300">
      {/* Real-time Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 via-stone-50 to-amber-50/40 border-b border-amber-200/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-stone-900">
                  Real-time Audio Transcription
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-900 border border-amber-500/30">
                  {modelUsed}
                </span>
              </div>
              <p className="text-xs text-stone-600 truncate max-w-sm sm:max-w-md mt-0.5">
                Listening to <span className="font-semibold text-stone-800">{fileName}</span> & generating verbatim segments with timestamps
              </p>
            </div>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-2 text-xs">
            <div className="px-2.5 py-1 rounded-lg bg-white border border-stone-200/80 font-mono text-stone-700 shadow-2xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{elapsedSeconds}s elapsed</span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-white border border-stone-200/80 font-mono text-stone-700 shadow-2xs">
              <span className="font-bold text-amber-700">{segments.length}</span> segments
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-white border border-stone-200/80 font-mono text-stone-700 shadow-2xs hidden sm:block">
              <span className="font-bold text-stone-900">{totalWords}</span> words
            </div>

            {segments.length > 0 && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Copy current transcript"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
                <span className="text-[11px] font-medium">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Waveform Activity Bar */}
        <div className="mt-3 w-full bg-amber-100/60 h-1.5 rounded-full overflow-hidden">
          <div className="bg-gradient-to-r from-amber-400 via-amber-600 to-amber-400 h-full w-full animate-pulse" />
        </div>
      </div>

      {/* Live Segments Feed */}
      <div
        ref={scrollContainerRef}
        className="p-4 sm:p-6 max-h-[480px] overflow-y-auto space-y-3 bg-stone-50/50"
      >
        {segments.length === 0 && !interimText && (
          <div className="text-center py-12 text-stone-400 space-y-2">
            <Radio className="w-8 h-8 mx-auto text-amber-500 animate-pulse" />
            <p className="text-sm font-semibold text-stone-700">
              {modelUsed?.includes('deepgram')
                ? 'Processing audio with Deepgram Nova-2 (2-second exact chunking)...'
                : 'Connecting to gemini-3.5-transcribe stream...'}
            </p>
            <p className="text-xs text-stone-500">Audio frames are being processed. Words and timestamps will appear below in real-time.</p>
          </div>
        )}

        {segments.map((segment) => {
          const isActive =
            currentTime >= segment.start && currentTime <= segment.end;
          const isSilent = segment.isSilent || segment.text === '[Silence]' || segment.speaker === 'Silence';

          return (
            <div
              key={segment.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isActive
                  ? 'bg-amber-100/60 border-amber-400 shadow-xs ring-1 ring-amber-300'
                  : isSilent
                  ? 'bg-stone-50/70 border-stone-200 hover:border-stone-300'
                  : 'bg-white border-stone-200/90 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSeek?.(segment.start)}
                    className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-200 text-stone-800 hover:text-amber-950 text-xs font-mono font-bold transition-colors cursor-pointer border border-stone-200/60 hover:border-amber-300"
                    title={`Jump audio to ${segment.startTimeFormatted}`}
                  >
                    <Play className="w-2.5 h-2.5 text-amber-600 group-hover:scale-110 transition-transform fill-amber-600" />
                    <span>
                      {segment.startTimeFormatted} - {segment.endTimeFormatted}
                    </span>
                  </button>
                  {isSilent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 px-2 py-0.5 rounded bg-stone-200/60 border border-stone-200">
                      <VolumeX className="w-3 h-3 text-stone-400" />
                      Silence
                    </span>
                  ) : (
                    segment.speaker && (
                      <span className="text-[11px] font-semibold text-stone-500 px-1.5 py-0.5 rounded bg-stone-100/80">
                        {segment.speaker}
                      </span>
                    )
                  )}
                  {segment.end - segment.start <= 2.1 && segment.end - segment.start >= 1.5 && (
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                      2s chunk
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-stone-400 font-mono">#{segment.id}</span>
              </div>
              <p
                className={`text-sm leading-relaxed font-sans pl-0.5 ${
                  isSilent ? 'italic text-stone-500 font-mono' : 'text-stone-800'
                }`}
              >
                {segment.text}
              </p>
            </div>
          );
        })}

        {/* Interim In-flight Segment (Active token typing) */}
        {interimText && (
          <div className="p-3.5 rounded-xl border border-amber-400/90 bg-amber-50/70 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500 text-stone-950 text-xs font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  {interimTimestamp || 'Transcribing'}
                </span>
                <span className="text-[11px] font-bold text-amber-800">
                  Streaming live...
                </span>
              </div>
            </div>
            <p className="text-sm text-stone-900 leading-relaxed font-sans font-medium pl-0.5">
              {interimText}
              <span className="inline-block w-2 h-4 ml-1 bg-amber-600 animate-pulse align-middle" />
            </p>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="px-4 py-2.5 bg-stone-100/90 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 font-sans">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Click any timestamp pill above to jump playback to that moment</span>
        </div>
        <span className="font-mono text-[11px] text-stone-600 font-medium">
          Receiving live segments...
        </span>
      </div>
    </div>
  );
};
