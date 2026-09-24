import React from 'react';
import { X, Trash2, Clock, Calendar, FileAudio, ExternalLink, ArrowRight } from 'lucide-react';
import { SavedTranscript } from '../types';
import { formatSecondsToTime } from '../utils/time';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  savedTranscripts: SavedTranscript[];
  onSelectTranscript: (transcript: SavedTranscript) => void;
  onDeleteTranscript: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  savedTranscripts,
  onSelectTranscript,
  onDeleteTranscript,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-stone-900">Transcription History</h2>
            <p className="text-xs text-stone-500">
              {savedTranscripts.length} saved {savedTranscripts.length === 1 ? 'session' : 'sessions'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of saved transcripts */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {savedTranscripts.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <FileAudio className="w-10 h-10 mx-auto mb-2 text-stone-300" />
              <p className="text-sm font-medium">No saved transcripts yet</p>
              <p className="text-xs text-stone-400 mt-1">
                Transcriptions you run will be saved here automatically.
              </p>
            </div>
          ) : (
            savedTranscripts.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/20 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-semibold text-stone-900 truncate">
                      {item.title || item.sourceName}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                      <span className="capitalize px-1.5 py-0.2 bg-stone-100 rounded text-stone-600 font-medium">
                        {item.sourceType}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTranscript(item.id);
                    }}
                    className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete saved transcript"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-stone-600 line-clamp-2 mb-3">
                  {item.data.summary || item.data.fullTranscript}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <span className="text-[11px] text-stone-400 font-mono">
                    {item.data.segments?.length || 0} segments
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTranscript(item);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 group-hover:underline cursor-pointer"
                  >
                    <span>Load Transcript</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {savedTranscripts.length > 0 && (
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-red-600 hover:text-red-700 hover:underline cursor-pointer"
            >
              Clear all history
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
