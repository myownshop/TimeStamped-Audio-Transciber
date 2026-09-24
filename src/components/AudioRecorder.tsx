import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Radio,
  Clock,
  Volume2,
  Copy,
  Check,
} from 'lucide-react';
import { formatSecondsToTime } from '../utils/time';
import { TranscriptionData, TranscriptSegment } from '../types';

interface AudioRecorderProps {
  onRecordingComplete: (
    audioBlob: Blob,
    base64: string,
    mimeType: string,
    durationSecs: number,
    liveTranscriptionData?: TranscriptionData
  ) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Real-time speech transcription state
  const [realtimeSegments, setRealtimeSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [interimStartTime, setInterimStartTime] = useState<number>(0);
  const [isLiveSpeechActive, setIsLiveSpeechActive] = useState<boolean>(false);
  const [copiedLive, setCopiedLive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const recordingTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const liveScrollRef = useRef<HTMLDivElement | null>(null);
  const segmentIdCounterRef = useRef<number>(1);
  const segmentStartRef = useRef<number>(0);

  // Keep ref synchronized with recordingTime state
  useEffect(() => {
    recordingTimeRef.current = recordingTime;
  }, [recordingTime]);

  // Auto-scroll the live transcript view as new words or segments arrive
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [realtimeSegments, interimText]);

  // Start recording and real-time transcription
  const startRecording = async () => {
    setError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    audioChunksRef.current = [];
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    setRealtimeSegments([]);
    setInterimText('');
    segmentIdCounterRef.current = 1;
    segmentStartRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio API visualizer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Determine supported MIME type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setRecordedUrl(url);
      };

      mediaRecorder.start(250); // chunk every 250ms
      setIsRecording(true);
      setIsPaused(false);

      // Start duration timer
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start canvas visualizer
      drawVisualizer();

      // Initialize real-time speech recognition
      startRealtimeSpeechRecognition();
    } catch (err: any) {
      console.error('Microphone access failed:', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access in your browser settings to record audio.'
          : `Could not access microphone: ${err.message || 'Unknown error'}`
      );
    }
  };

  // Real-time Web Speech Recognition setup
  const startRealtimeSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.info('SpeechRecognition API not natively supported in this browser. Live captions will use fallback.');
      setIsLiveSpeechActive(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsLiveSpeechActive(true);
        segmentStartRef.current = 0;
      };

      recognition.onresult = (event: any) => {
        let liveInterim = '';
        const nowSec = recordingTimeRef.current;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const trimmed = transcript.trim();
            if (trimmed) {
              const start = segmentStartRef.current;
              const end = Math.max(nowSec, start + 1);

              const newSegment: TranscriptSegment = {
                id: segmentIdCounterRef.current++,
                start,
                end,
                startTimeFormatted: formatSecondsToTime(start),
                endTimeFormatted: formatSecondsToTime(end),
                speaker: 'You (Speaker 1)',
                text: trimmed,
              };

              setRealtimeSegments((prev) => [...prev, newSegment]);
              segmentStartRef.current = end;
              setInterimText('');
            }
          } else {
            liveInterim += transcript;
            setInterimStartTime(segmentStartRef.current);
          }
        }

        if (liveInterim) {
          setInterimText(liveInterim);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Live speech recognition warning:', e.error);
        if (e.error === 'not-allowed') {
          setIsLiveSpeechActive(false);
        }
      };

      recognition.onend = () => {
        // If still actively recording, restart speech recognition to keep it continuous
        if (isRecording && mediaRecorderRef.current?.state === 'recording') {
          try {
            recognition.start();
          } catch {
            // ignore if already starting
          }
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (speechErr) {
      console.warn('Could not start live speech recognition:', speechErr);
      setIsLiveSpeechActive(false);
    }
  };

  // Stop real-time speech recognition
  const stopRealtimeSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
    setIsLiveSpeechActive(false);

    // If there is any trailing interim text, commit it as a final segment
    if (interimText.trim()) {
      const start = interimStartTime || segmentStartRef.current;
      const end = Math.max(recordingTimeRef.current, start + 1);
      const finalSeg: TranscriptSegment = {
        id: segmentIdCounterRef.current++,
        start,
        end,
        startTimeFormatted: formatSecondsToTime(start),
        endTimeFormatted: formatSecondsToTime(end),
        speaker: 'You (Speaker 1)',
        text: interimText.trim(),
      };
      setRealtimeSegments((prev) => [...prev, finalSeg]);
      setInterimText('');
    }
  };

  // Draw real-time audio waveform/levels on canvas
  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

        // Warm aesthetic gradient for waveform
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(1, '#ef4444');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 1, Math.max(barHeight, 3));

        x += barWidth;
      }
    };

    render();
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch {}
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopRealtimeSpeechRecognition();
    cleanupStream();
    setIsRecording(false);
    setIsPaused(false);
  };

  const cleanupStream = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Deliver audio payload to parent with optional live data
  const handleUseRecording = (useRealtimeDataOnly = false) => {
    if (!recordedBlob) return;
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];

        let liveData: TranscriptionData | undefined = undefined;
        if (useRealtimeDataOnly) {
          const segmentsToUse =
            realtimeSegments.length > 0
              ? realtimeSegments
              : [
                  {
                    id: 1,
                    start: 0,
                    end: Math.max(recordingTime, 1),
                    startTimeFormatted: formatSecondsToTime(0),
                    endTimeFormatted: formatSecondsToTime(Math.max(recordingTime, 1)),
                    speaker: 'Silence',
                    text: '[Silence]',
                    isSilent: true,
                  },
                ];

          const isSilentAudio = segmentsToUse.every((s) => s.isSilent);
          const fullText = isSilentAudio
            ? '[Silence - No speech detected]'
            : segmentsToUse.map((s) => s.text).join(' ');

          liveData = {
            language: isSilentAudio ? 'Ambient / Silence' : 'English (Detected)',
            summary: isSilentAudio
              ? 'Silent audio recording. No spoken words detected; timestamped silent intervals preserved.'
              : fullText.slice(0, 150) + (fullText.length > 150 ? '...' : ''),
            durationSeconds: recordingTime,
            fullTranscript: fullText,
            segments: segmentsToUse,
            hasSilence: segmentsToUse.some((s) => s.isSilent),
            isSilentAudio,
          };
        }

        onRecordingComplete(
          recordedBlob,
          base64Data,
          recordedBlob.type || 'audio/webm',
          recordingTime,
          liveData
        );
        setIsProcessing(false);
      };
      reader.readAsDataURL(recordedBlob);
    } catch (err: any) {
      setError(`Failed to convert recorded audio: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // Copy live transcript to clipboard
  const handleCopyLiveTranscript = () => {
    const text = realtimeSegments
      .map((s) => `[${s.startTimeFormatted} - ${s.endTimeFormatted}] ${s.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLive(true);
    setTimeout(() => setCopiedLive(false), 2000);
  };

  useEffect(() => {
    return () => {
      cleanupStream();
      stopRealtimeSpeechRecognition();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, []);

  return (
    <div className="bg-stone-900 text-stone-100 rounded-2xl p-5 sm:p-6 shadow-xl border border-stone-800 flex flex-col max-h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-stone-100">Live Microphone Transcription</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                gemini-3.5-transcribe
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Captures audio & displays real-time words with timestamps as you speak
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            cleanupStream();
            stopRealtimeSpeechRecognition();
            onCancel();
          }}
          className="text-xs text-stone-400 hover:text-stone-200 transition-colors p-1"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="my-3 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Waveform / Visualizer Bar */}
      <div className="relative h-20 bg-stone-950/80 rounded-xl border border-stone-800 flex items-center justify-center overflow-hidden my-3 shrink-0">
        {isRecording ? (
          <canvas ref={canvasRef} width={420} height={80} className="w-full h-full block" />
        ) : recordedUrl ? (
          <div className="flex flex-col items-center gap-1 text-stone-300">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-medium">Recording saved ({formatSecondsToTime(recordingTime)})</span>
          </div>
        ) : (
          <div className="text-xs text-stone-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-stone-600" />
            Ready. Click Start Recording to speak with real-time timestamps.
          </div>
        )}

        {isRecording && (
          <div className="absolute top-2 right-3 flex items-center gap-2 bg-stone-900/90 px-2.5 py-0.5 rounded-full border border-stone-700 shadow-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-red-500 animate-ping'
              }`}
            />
            <span className="text-xs font-mono font-semibold text-stone-200">
              {formatSecondsToTime(recordingTime)}
            </span>
          </div>
        )}
      </div>

      {/* Real-time Transcription View */}
      <div className="flex-1 min-h-[160px] max-h-[260px] bg-stone-950 rounded-xl border border-stone-800 p-3 flex flex-col overflow-hidden mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-800/80 text-[11px] text-stone-400">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-3.5 h-3.5 ${
                isRecording && !isPaused ? 'text-emerald-400 animate-pulse' : 'text-stone-500'
              }`}
            />
            <span className="font-semibold text-stone-300">Real-time Transcribed Text & Timestamps</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-stone-400">
              {realtimeSegments.length} {realtimeSegments.length === 1 ? 'segment' : 'segments'}
            </span>
            {realtimeSegments.length > 0 && (
              <button
                type="button"
                onClick={handleCopyLiveTranscript}
                className="flex items-center gap-1 hover:text-stone-200 transition-colors cursor-pointer"
                title="Copy live text"
              >
                {copiedLive ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLive ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live segments feed */}
        <div
          ref={liveScrollRef}
          className="flex-1 overflow-y-auto pt-2 space-y-2 font-mono text-xs pr-1"
        >
          {realtimeSegments.length === 0 && !interimText && (
            <div className="h-full flex flex-col items-center justify-center text-center text-stone-600 py-6">
              <Clock className="w-6 h-6 mb-1 text-stone-700" />
              <p className="text-xs text-stone-500 font-sans">
                {isRecording
                  ? 'Listening for speech... Words and timestamps will appear here live.'
                  : 'Start recording and start speaking to see real-time text and timestamps.'}
              </p>
            </div>
          )}

          {realtimeSegments.map((seg) => (
            <div
              key={seg.id}
              className="flex items-start gap-2.5 p-1.5 rounded-lg bg-stone-900/70 border border-stone-800/60 hover:border-amber-500/40 transition-colors"
            >
              <span className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                [{seg.startTimeFormatted} - {seg.endTimeFormatted}]
              </span>
              <p className="text-stone-200 font-sans text-xs leading-relaxed flex-1">
                {seg.text}
              </p>
            </div>
          ))}

          {/* Active in-flight speech segment */}
          {interimText && (
            <div className="flex items-start gap-2.5 p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/40 animate-pulse">
              <span className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-400/40">
                [{formatSecondsToTime(interimStartTime)}] Live
              </span>
              <p className="text-amber-100 font-sans text-xs leading-relaxed flex-1">
                {interimText}
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-amber-400 animate-ping align-middle" />
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audio Playback preview if stopped */}
      {recordedUrl && !isRecording && (
        <div className="mb-4 bg-stone-800/50 p-2.5 rounded-xl border border-stone-700/50 flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-stone-400 shrink-0" />
          <audio src={recordedUrl} controls className="w-full h-8" />
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="flex items-center gap-2">
          {!isRecording && !recordedBlob && (
            <button
              id="start-mic-recording-btn"
              type="button"
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </button>
          )}

          {isRecording && (
            <>
              <button
                id="stop-mic-recording-btn"
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-white text-stone-900 text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4 text-red-600 fill-red-600" />
                Stop Recording
              </button>

              {isPaused ? (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  Pause
                </button>
              )}
            </>
          )}

          {recordedBlob && !isRecording && (
            <button
              id="re-record-btn"
              type="button"
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-record
            </button>
          )}
        </div>

        {/* Finalize options when audio has been recorded */}
        {recordedBlob && !isRecording && (
          <div className="flex items-center gap-2 ml-auto">
            {realtimeSegments.length > 0 && (
              <button
                id="use-live-transcript-btn"
                type="button"
                disabled={isProcessing}
                onClick={() => handleUseRecording(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                Use Live Transcript
              </button>
            )}

            <button
              id="use-recording-gemini-btn"
              type="button"
              disabled={isProcessing}
              onClick={() => handleUseRecording(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isProcessing ? 'Processing...' : 'Transcribe with gemini-3.5-transcribe'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
