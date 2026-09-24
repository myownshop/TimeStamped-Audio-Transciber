import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Gauge, Music } from 'lucide-react';
import { formatSecondsToTime } from '../utils/time';

interface AudioPlayerProps {
  src: string;
  title?: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  currentTime,
  onTimeUpdate,
  audioRef,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // Sync state with HTMLAudioElement
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        onTimeUpdate(audio.currentTime);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioRef, isSeeking, onTimeUpdate]);

  // Global keyboard shortcuts (Space to toggle, arrows to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skip(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skip(5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((err) => console.log('Audio playback prevented:', err));
    } else {
      audio.pause();
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
    onTimeUpdate(audio.currentTime);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = newTime;
      onTimeUpdate(newTime);
    }
  };

  const handleSpeedChange = (speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = val;
      setVolume(val);
      if (val === 0) setIsMuted(true);
      else if (isMuted) setIsMuted(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-stone-900 text-stone-100 rounded-2xl p-4 sm:p-5 border border-stone-800 shadow-sm sticky top-20 z-20 transition-all">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Title & Info Bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Music className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-stone-300 truncate">
            {title || 'Current Audio Track'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs font-mono text-stone-400">
            <span className="text-amber-400 font-semibold">{formatSecondsToTime(currentTime)}</span>
            <span className="mx-1">/</span>
            <span>{formatSecondsToTime(duration)}</span>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-stone-800 rounded-lg p-1 border border-stone-700/60">
            <Gauge className="w-3 h-3 text-stone-400 ml-1" />
            {[0.75, 1, 1.25, 1.5].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  playbackRate === speed
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Timeline Scrubber */}
      <div className="relative flex items-center mb-3">
        <input
          id="audio-scrubber"
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onMouseDown={() => setIsSeeking(true)}
          onMouseUp={() => setIsSeeking(false)}
          onChange={handleSeekChange}
          aria-label="Audio playback scrub timeline"
          className="w-full h-2 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 transition-all focus:outline-none"
          style={{
            background: `linear-gradient(to right, #f59e0b ${progressPercent}%, #292524 ${progressPercent}%)`,
          }}
        />
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Skip Back 5s */}
          <button
            id="audio-skip-back-btn"
            type="button"
            onClick={() => skip(-5)}
            className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            title="Rewind 5 seconds (Left Arrow)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play / Pause Primary Button */}
          <button
            id="audio-play-pause-btn"
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 flex items-center justify-center font-bold shadow-xs transition-transform active:scale-95 cursor-pointer"
            title="Play / Pause (Spacebar)"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-stone-950" />
            ) : (
              <Play className="w-5 h-5 fill-stone-950 ml-0.5" />
            )}
          </button>

          {/* Skip Forward 5s */}
          <button
            id="audio-skip-forward-btn"
            type="button"
            onClick={() => skip(5)}
            className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            title="Fast forward 5 seconds (Right Arrow)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Keyboard hint */}
          <span className="hidden lg:inline-flex text-[11px] text-stone-400 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700/50">
            Tip: Press <kbd className="font-mono text-stone-300 mx-1">Space</kbd> to toggle, click timestamps to jump
          </span>

          {/* Volume Slider */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume slider"
              className="w-16 sm:w-20 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-stone-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
