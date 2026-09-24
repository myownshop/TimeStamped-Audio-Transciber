export type TranscriptionEngine = 'gemini' | 'deepgram';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number;
}

export interface TranscriptSegment {
  id: number;
  start: number; // in seconds
  end: number; // in seconds
  startTimeFormatted: string;
  endTimeFormatted: string;
  speaker: string;
  text: string;
  isSilent?: boolean;
  words?: WordTimestamp[];
}

export interface TranscriptionData {
  language?: string;
  summary?: string;
  durationSeconds?: number;
  fullTranscript: string;
  segments: TranscriptSegment[];
  engine?: TranscriptionEngine | string;
  chunkInterval?: number; // e.g. 2 for 2-second intervals
  totalWords?: number;
  hasSilence?: boolean;
  isSilentAudio?: boolean;
}

export interface SavedTranscript {
  id: string;
  title: string;
  sourceType: 'upload' | 'link' | 'recording';
  sourceName: string;
  createdAt: number;
  data: TranscriptionData;
  audioUrl?: string; // object URL or link for playback if available
  audioBase64?: string;
  mimeType?: string;
}

export type InputMode = 'upload' | 'link' | 'record';

