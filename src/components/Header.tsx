import React from 'react';
import { Sparkles, History, Mic, Volume2 } from 'lucide-react';

interface HeaderProps {
  historyCount: number;
  onOpenHistory: () => void;
  hasActiveAudio: boolean;
}

export const Header: React.FC<HeaderProps> = ({ historyCount, onOpenHistory, hasActiveAudio }) => {
  return (
    <header className="border-b border-stone-200 bg-stone-50/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs">
            <Volume2 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-stone-900">
                Audio Transcriber
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium bg-stone-200/80 text-stone-700 px-2 py-0.5 rounded-full border border-stone-300">
                <Sparkles className="w-3 h-3 text-amber-600" />
                Gemini 3.5 Transcribe
              </span>
            </div>
            <p className="text-xs text-stone-500 hidden sm:block">
              Verbatim transcription with exact timestamps & speaker tags
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasActiveAudio && (
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Audio Loaded
            </div>
          )}

          <button
            id="history-drawer-toggle"
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="View saved transcription history"
          >
            <History className="w-4 h-4 text-stone-600" />
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-stone-900 text-white rounded-full text-[10px] font-semibold">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
