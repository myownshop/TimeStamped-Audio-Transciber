import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();

  // Increase payload limit for base64 audio files
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Audio proxy for external URLs (allows HTML5 audio player seeking & CORS bypass)
  app.get('/api/proxy-audio', async (req: Request, res: Response) => {
    const audioUrl = req.query.url as string;
    if (!audioUrl) {
      res.status(400).send('Missing url query parameter');
      return;
    }

    try {
      const parsedUrl = new URL(audioUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        res.status(400).send('Only HTTP and HTTPS URLs are supported');
        return;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await fetch(audioUrl, { headers });
      if (!response.ok && response.status !== 206) {
        res.status(response.status).send(`Failed to fetch audio from source: ${response.statusText}`);
        return;
      }

      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', contentType);
      const contentLength = response.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = response.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const acceptRanges = response.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      res.status(response.status);

      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Audio proxy error:', err);
      res.status(500).send(`Error proxying audio: ${err.message}`);
    }
  });

  // Fetch audio link to base64 for direct transcription
  app.post('/api/fetch-audio-link', async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Valid URL is required' });
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        res.status(400).json({ error: 'URL must use HTTP or HTTPS protocol' });
        return;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/*, video/*, */*',
        },
      });

      if (!response.ok) {
        res.status(response.status).json({
          error: `Failed to download audio from URL: ${response.status} ${response.statusText}`,
        });
        return;
      }

      const contentTypeHeader = response.headers.get('content-type') || '';
      let mimeType = 'audio/mp3';
      if (contentTypeHeader.includes('audio/wav') || url.endsWith('.wav')) {
        mimeType = 'audio/wav';
      } else if (contentTypeHeader.includes('audio/ogg') || url.endsWith('.ogg')) {
        mimeType = 'audio/ogg';
      } else if (contentTypeHeader.includes('audio/webm') || url.endsWith('.webm')) {
        mimeType = 'audio/webm';
      } else if (contentTypeHeader.includes('audio/m4a') || url.endsWith('.m4a')) {
        mimeType = 'audio/m4a';
      } else if (contentTypeHeader.includes('audio/flac') || url.endsWith('.flac')) {
        mimeType = 'audio/flac';
      } else if (contentTypeHeader.includes('audio/aac') || url.endsWith('.aac')) {
        mimeType = 'audio/aac';
      } else if (contentTypeHeader.startsWith('audio/') || contentTypeHeader.startsWith('video/')) {
        mimeType = contentTypeHeader.split(';')[0];
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const maxSize = 45 * 1024 * 1024; // 45MB max
      if (buffer.length > maxSize) {
        res.status(413).json({ error: 'Audio file exceeds the 45MB size limit. Please use a shorter clip.' });
        return;
      }

      const base64Audio = buffer.toString('base64');
      const filename = path.basename(parsedUrl.pathname) || 'audio_from_link';

      res.json({
        audioBase64: base64Audio,
        mimeType,
        filename,
        size: buffer.length,
      });
    } catch (err: any) {
      console.error('Error fetching audio from link:', err);
      res.status(500).json({ error: `Failed to fetch audio from link: ${err.message}` });
    }
  });

// Helper to format seconds to MM:SS
function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper to parse MM:SS or HH:MM:SS to seconds
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return parseFloat(clean) || 0;
}

// Helper to parse plaintext with timestamps into structured segments
function parsePlainTextWithTimestamps(rawText: string, fallbackDuration = 0) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const segments: any[] = [];
  let currentId = 1;

  // Pattern: [00:00 - 00:04] Speaker 1: Spoken text
  // or: [00:00] Speaker 1: Spoken text
  const timestampRegex = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[-–—to]+\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]?\s*(?:([^:\n]+):\s*)?(.*)/i;

  for (const line of lines) {
    // Ignore markdown code blocks or summary headers
    if (line.startsWith('```') || line.toLowerCase().startsWith('summary:')) continue;

    const match = line.match(timestampRegex);
    if (match && (match[1] || match[4])) {
      const startTimeStr = match[1];
      const endTimeStr = match[2];
      let speaker = match[3]?.trim() || 'Speaker 1';
      let text = match[4]?.trim() || line.replace(/\[\d{1,2}:\d{2}.*?\]/, '').trim();

      const isSilentLine =
        /^(?:\[?\s*(?:silence|silent|no speech|pause|quiet|ambient)\s*\]?)$/i.test(text) ||
        /^(?:silence|ambient)$/i.test(speaker);

      if (isSilentLine) {
        text = '[Silence]';
        speaker = 'Silence';
      }

      if (text) {
        const start = startTimeStr ? parseTimeToSeconds(startTimeStr) : (segments.length > 0 ? segments[segments.length - 1].end : 0);
        const end = endTimeStr ? parseTimeToSeconds(endTimeStr) : start + 3;

        segments.push({
          id: currentId++,
          start,
          end,
          startTimeFormatted: formatSeconds(start),
          endTimeFormatted: formatSeconds(end),
          speaker,
          text,
          isSilent: isSilentLine,
        });
      }
    } else if (line.length > 0) {
      const isSilentLine = /^(?:\[?\s*(?:silence|silent|no speech|pause|quiet|ambient)\s*\]?)$/i.test(line);
      const start = segments.length > 0 ? segments[segments.length - 1].end : 0;
      const end = start + 4;
      segments.push({
        id: currentId++,
        start,
        end,
        startTimeFormatted: formatSeconds(start),
        endTimeFormatted: formatSeconds(end),
        speaker: isSilentLine ? 'Silence' : 'Speaker 1',
        text: isSilentLine ? '[Silence]' : line,
        isSilent: isSilentLine,
      });
    }
  }

  // If no segments were detected (e.g. completely silent audio with no speech), do NOT return empty or erase!
  if (segments.length === 0) {
    const end = Math.max(2, Math.ceil(fallbackDuration || 2));
    segments.push({
      id: 1,
      start: 0,
      end,
      startTimeFormatted: formatSeconds(0),
      endTimeFormatted: formatSeconds(end),
      speaker: 'Silence',
      text: '[Silence]',
      isSilent: true,
    });
  }

  const durationSeconds = segments.length > 0 ? segments[segments.length - 1].end : fallbackDuration;
  const isSilentAudio = segments.every((s) => s.isSilent);
  const fullTranscript = isSilentAudio ? '[Silence - No speech detected]' : segments.map((s) => s.text).join(' ');

  return {
    language: isSilentAudio ? 'Ambient / Silence' : 'Detected speech',
    summary: isSilentAudio
      ? 'Silent audio recording. No spoken words detected; timestamped silent intervals preserved.'
      : fullTranscript.slice(0, 150) + (fullTranscript.length > 150 ? '...' : ''),
    durationSeconds,
    fullTranscript,
    segments,
    hasSilence: segments.some((s) => s.isSilent),
    isSilentAudio,
  };
}

// Deepgram API Configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'b812669aff8187f71b7a11b47a03ec1e3800110c';

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

// Transcribe audio using Deepgram Nova-2 with exact 2-second timestamp chunking
async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  mimeType: string,
  options: { chunkSeconds?: number; customInstructions?: string } = {}
) {
  const chunkSeconds = options.chunkSeconds || 2;
  const deepgramUrl =
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true';

  let cleanMime = (mimeType || 'audio/mp3').split(';')[0].trim();
  if (!cleanMime.startsWith('audio/') && !cleanMime.startsWith('video/')) {
    cleanMime = 'audio/mp3';
  }

  const response = await fetch(deepgramUrl, {
    method: 'POST',
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': cleanMime,
      'User-Agent': 'AudioTranscriber/1.0',
    },
    body: new Uint8Array(audioBuffer) as unknown as BodyInit,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const result: any = await response.json();
  const alt = result?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) {
    throw new Error('Deepgram returned no transcript alternatives.');
  }

  const words: DeepgramWord[] = alt.words || [];
  const totalDuration =
    Number(result?.metadata?.duration) || (words.length > 0 ? words[words.length - 1].end : 0);
  const fullTranscript =
    alt.transcript || words.map((w) => w.punctuated_word || w.word).join(' ');

  // Group words into exact 2-second intervals
  // Every chunk represents an exact [k * chunkSeconds, (k + 1) * chunkSeconds] timestamp window
  const numChunks = Math.max(1, Math.ceil((totalDuration || chunkSeconds) / chunkSeconds));
  const chunkBuckets: Map<number, DeepgramWord[]> = new Map();

  for (const w of words) {
    const bucketIndex = Math.floor(w.start / chunkSeconds);
    if (!chunkBuckets.has(bucketIndex)) {
      chunkBuckets.set(bucketIndex, []);
    }
    chunkBuckets.get(bucketIndex)!.push(w);
  }

  const segments: any[] = [];
  let currentId = 1;

  for (let k = 0; k < numChunks; k++) {
    const bucketWords = chunkBuckets.get(k) || [];
    const start = k * chunkSeconds;
    const end = (k + 1) * chunkSeconds;

    if (bucketWords.length > 0) {
      // Find predominant speaker in this 2-second window
      const speakerCounts: Record<number, number> = {};
      for (const bw of bucketWords) {
        if (bw.speaker !== undefined) {
          speakerCounts[bw.speaker] = (speakerCounts[bw.speaker] || 0) + 1;
        }
      }
      let topSpeaker = 0;
      let maxCount = 0;
      for (const [spk, count] of Object.entries(speakerCounts)) {
        if (count > maxCount) {
          maxCount = count;
          topSpeaker = Number(spk);
        }
      }

      const text = bucketWords.map((w) => w.punctuated_word || w.word).join(' ');

      segments.push({
        id: currentId++,
        start,
        end,
        startTimeFormatted: formatSeconds(start),
        endTimeFormatted: formatSeconds(end),
        speaker: `Speaker ${topSpeaker + 1}`,
        text,
        isSilent: false,
        words: bucketWords.map((w) => ({
          word: w.punctuated_word || w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker !== undefined ? w.speaker + 1 : undefined,
        })),
      });
    } else {
      // Silent 2-second interval: return it as it is and DO NOT erase it!
      segments.push({
        id: currentId++,
        start,
        end,
        startTimeFormatted: formatSeconds(start),
        endTimeFormatted: formatSeconds(end),
        speaker: 'Silence',
        text: '[Silence]',
        isSilent: true,
        words: [],
      });
    }
  }

  // If no words were detected in any bucket, make sure we have at least one valid silent chunk
  if (segments.length === 0) {
    const duration = Math.max(chunkSeconds, Math.ceil(totalDuration || chunkSeconds));
    segments.push({
      id: 1,
      start: 0,
      end: duration,
      startTimeFormatted: formatSeconds(0),
      endTimeFormatted: formatSeconds(duration),
      speaker: 'Silence',
      text: '[Silence]',
      isSilent: true,
      words: [],
    });
  }

  const detectedLanguage = result?.results?.channels?.[0]?.detected_language || 'English';
  const hasSpokenWords = words.length > 0;
  const isSilentAudio = segments.every((s) => s.isSilent);
  const finalFullTranscript = hasSpokenWords
    ? (alt.transcript || words.map((w) => w.punctuated_word || w.word).join(' '))
    : '[Silence - No speech detected]';

  return {
    language: isSilentAudio ? 'Ambient / Silence' : detectedLanguage,
    summary: isSilentAudio
      ? 'Silent audio recording. No spoken words detected; timestamped silent intervals preserved.'
      : finalFullTranscript.slice(0, 160) + (finalFullTranscript.length > 160 ? '...' : ''),
    durationSeconds: totalDuration || segments[segments.length - 1]?.end || chunkSeconds,
    fullTranscript: finalFullTranscript,
    segments,
    engine: 'deepgram',
    chunkInterval: chunkSeconds,
    totalWords: words.length,
    hasSilence: segments.some((s) => s.isSilent),
    isSilentAudio,
  };
}

// Call Gemini with retry on 503/429
async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 2) {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      const errStr = String(err?.message || '');
      const isTransient =
        err?.status === 503 ||
        errStr.includes('503') ||
        errStr.includes('high demand') ||
        errStr.includes('UNAVAILABLE') ||
        err?.status === 429 ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        const delay = (attempt + 1) * 1200;
        console.warn(`Transient Gemini error on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms:`, errStr);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

  // Audio transcription endpoint
  app.post('/api/transcribe', async (req: Request, res: Response) => {
    const {
      audioBase64,
      mimeType = 'audio/mp3',
      filename = 'recording',
      customInstructions,
      engine = 'deepgram',
    } = req.body;

    if (!audioBase64) {
      res.status(400).json({ success: false, error: 'Audio data (audioBase64) is required.' });
      return;
    }

    // Normalize mimeType
    let cleanMimeType = mimeType.split(';')[0].trim();
    if (!cleanMimeType.startsWith('audio/') && !cleanMimeType.startsWith('video/')) {
      cleanMimeType = 'audio/mp3';
    }
    if (cleanMimeType === 'audio/webm' || cleanMimeType === 'video/webm') {
      cleanMimeType = 'audio/webm';
    }

    // Deepgram 2-second timestamp chunking engine
    if (engine === 'deepgram') {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const deepgramData = await transcribeWithDeepgram(audioBuffer, cleanMimeType, {
          chunkSeconds: 2,
          customInstructions,
        });

        res.setHeader('Content-Type', 'application/json');
        res.json({
          success: true,
          filename,
          modelUsed: 'Deepgram Nova-2 (2s Exact Chunking)',
          engine: 'deepgram',
          data: deepgramData,
        });
        return;
      } catch (dgErr: any) {
        console.warn('Deepgram transcription failed, falling back to Gemini:', dgErr.message);
        // Fall back to Gemini if Deepgram encountered an error
      }
    }

    try {
      const ai = getGeminiClient();

      const promptText = `You are a professional audio transcriber. Transcribe this audio recording verbatim and with high precision.
Crucially, you must accurately segment the audio speech into consecutive, chronological segments with exact timestamps.

Requirements:
1. Transcribe EXACT words spoken without skipping words or summarizing.
2. Break the transcription into small, natural segments (typically between 2 and 8 seconds each, or per spoken sentence/clause).
3. For each segment, provide:
   - "id": integer starting from 1
   - "start": start time in seconds (float or integer, e.g. 0.0 or 4.5)
   - "end": end time in seconds (float or integer, e.g. 4.5 or 9.2)
   - "startTimeFormatted": string in "MM:SS" format (or "HH:MM:SS" if > 1 hour)
   - "endTimeFormatted": string in "MM:SS" format (or "HH:MM:SS" if > 1 hour)
   - "speaker": identifier for the speaker (e.g. "Speaker 1", "Speaker 2", or detected name if mentioned, or "Speaker" if single speaker)
   - "text": exact spoken transcript for this specific segment
4. Also provide:
   - "fullTranscript": the complete combined transcript
   - "language": the detected spoken language (e.g. "English", "Spanish", etc.)
   - "summary": a concise 1-2 sentence overview of the conversation or speech
   - "durationSeconds": estimated audio duration in seconds
${customInstructions ? `\nAdditional user notes: ${customInstructions}` : ''}

Output strictly valid JSON matching the schema.`;

      // Primary model: gemini-3.5-transcribe (Speech-to-Text model)
      let parsedData: any = null;
      let usedModel = 'gemini-3.5-transcribe';

      const textPrompt = `Transcribe this audio recording verbatim and with high precision.
Crucially, you must accurately segment the audio speech into consecutive, chronological segments with exact timestamps.
For every phrase, sentence, or natural pause (typically between 2 and 8 seconds each), output a line formatted with exact timestamps and speaker:
[00:00 - 00:04] Speaker 1: exact spoken dialogue here
[00:04 - 00:08] Speaker 2: next spoken dialogue here

Requirements:
1. Transcribe EXACT words spoken without skipping words or summarizing.
2. Ensure every line starts with [MM:SS - MM:SS] timestamp range.
3. Identify distinct speakers if multiple voices are present.
${customInstructions ? `Additional notes: ${customInstructions}` : ''}`;

      try {
        // First try gemini-3.5-transcribe (primary model for speech transcription)
        const result = await generateContentWithRetry(ai, {
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: audioBase64,
                },
              },
              {
                text: textPrompt,
              },
            ],
          },
        });

        const responseText = result.text || '';
        parsedData = parsePlainTextWithTimestamps(responseText);
      } catch (transcribeErr: any) {
        console.warn('Primary gemini-3.5-transcribe error, trying gemini-3.8-flash:', transcribeErr.message);

        // Fallback tier 1: gemini-3.8-flash with JSON mode
        try {
          usedModel = 'gemini-3.8-flash';
          const result = await generateContentWithRetry(ai, {
            model: 'gemini-3.8-flash',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: textPrompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  language: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  durationSeconds: { type: Type.NUMBER },
                  fullTranscript: { type: Type.STRING },
                  segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.INTEGER },
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        startTimeFormatted: { type: Type.STRING },
                        endTimeFormatted: { type: Type.STRING },
                        speaker: { type: Type.STRING },
                        text: { type: Type.STRING },
                      },
                      required: ['id', 'start', 'end', 'startTimeFormatted', 'endTimeFormatted', 'text'],
                    },
                  },
                },
                required: ['fullTranscript', 'segments'],
              },
            },
          });

          const responseText = result.text || '';
          try {
            parsedData = JSON.parse(responseText);
          } catch {
            const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedData = JSON.parse(cleanJson);
          }
        } catch (flashErr: any) {
          console.warn('Fallback gemini-3.8-flash failed, trying gemini-3.1-flash-lite:', flashErr.message);

          // Fallback tier 2: gemini-3.1-flash-lite
          usedModel = 'gemini-3.1-flash-lite';
          const result = await generateContentWithRetry(ai, {
            model: 'gemini-3.1-flash-lite',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: textPrompt,
                },
              ],
            },
          });

          const responseText = result.text || '';
          parsedData = parsePlainTextWithTimestamps(responseText);
        }
      }

      if (!parsedData) {
        throw new Error('Could not parse transcription output from model.');
      }

      // Ensure segment IDs and formatted times are normalized
      if (Array.isArray(parsedData.segments)) {
        parsedData.segments = parsedData.segments.map((seg: any, idx: number) => {
          const start = typeof seg.start === 'number' ? seg.start : 0;
          const end = typeof seg.end === 'number' ? seg.end : start + 3;

          return {
            id: seg.id || idx + 1,
            start,
            end,
            startTimeFormatted: seg.startTimeFormatted || formatSeconds(start),
            endTimeFormatted: seg.endTimeFormatted || formatSeconds(end),
            speaker: seg.speaker || 'Speaker 1',
            text: seg.text ? seg.text.trim() : '',
          };
        });
      } else {
        parsedData.segments = [];
      }

      if (!parsedData.fullTranscript && parsedData.segments.length > 0) {
        parsedData.fullTranscript = parsedData.segments.map((s: any) => s.text).join(' ');
      }

      res.setHeader('Content-Type', 'application/json');
      res.json({
        success: true,
        filename,
        modelUsed: usedModel,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('Transcription final error:', err);
      const statusCode =
        err.status && typeof err.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : 500;

      res.setHeader('Content-Type', 'application/json');
      res.status(statusCode).json({
        success: false,
        error: err.message || 'An unexpected error occurred during audio transcription. Please try again.',
      });
    }
  });

  // Streaming audio transcription endpoint (SSE) supporting Deepgram 2s chunking & Gemini 3.5
  app.post('/api/transcribe-stream', async (req: Request, res: Response) => {
    const {
      audioBase64,
      mimeType = 'audio/mp3',
      filename = 'audio',
      customInstructions,
      engine = 'deepgram',
    } = req.body;

    if (!audioBase64) {
      res.status(400).json({ success: false, error: 'Audio data is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let cleanMimeType = (mimeType || 'audio/mp3').split(';')[0].trim();
    if (!cleanMimeType.startsWith('audio/') && !cleanMimeType.startsWith('video/')) {
      cleanMimeType = 'audio/mp3';
    }
    if (cleanMimeType === 'audio/webm' || cleanMimeType === 'video/webm') {
      cleanMimeType = 'audio/webm';
    }

    // Handle Deepgram Nova-2 with exact 2-second chunking
    if (engine === 'deepgram') {
      sendEvent('init', {
        model: 'Deepgram Nova-2 (2s Exact Chunking)',
        engine: 'deepgram',
        filename,
      });
      sendEvent('interim', {
        text: 'Transcribing speech with Deepgram Nova-2 and computing exact 2-second timestamp intervals...',
      });

      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const deepgramData = await transcribeWithDeepgram(audioBuffer, cleanMimeType, {
          chunkSeconds: 2,
          customInstructions,
        });

        // Stream each exact 2-second segment with smooth interval
        for (let i = 0; i < deepgramData.segments.length; i++) {
          const seg = deepgramData.segments[i];
          sendEvent('segment', seg);
          if (i < deepgramData.segments.length - 1) {
            await new Promise((r) => setTimeout(r, 40));
          }
        }

        sendEvent('complete', {
          success: true,
          modelUsed: 'Deepgram Nova-2 (2s Exact Chunking)',
          engine: 'deepgram',
          filename,
          data: deepgramData,
        });
        res.end();
        return;
      } catch (dgErr: any) {
        console.warn('Deepgram streaming failed, falling back to Gemini 3.5 transcribe:', dgErr.message);
        sendEvent('model_switch', {
          model: 'gemini-3.5-transcribe',
          note: 'Deepgram service unavailable, continuing with Gemini Speech model',
        });
      }
    }

    const textPrompt = `Transcribe this audio recording verbatim and with high precision.
Crucially, you must accurately segment the audio speech into consecutive, chronological segments with exact timestamps.
For every phrase, sentence, or natural pause (typically between 2 and 8 seconds each), output a line formatted with exact timestamps and speaker:
[00:00 - 00:04] Speaker 1: exact spoken dialogue here
[00:04 - 00:08] Speaker 2: next spoken dialogue here

Requirements:
1. Transcribe EXACT words spoken without skipping words or summarizing.
2. Ensure every line starts with [MM:SS - MM:SS] timestamp range.
3. Identify distinct speakers if multiple voices are present.
${customInstructions ? `Additional notes: ${customInstructions}` : ''}`;

    let usedModel = 'gemini-3.5-transcribe';
    sendEvent('init', { model: usedModel, filename });

    try {
      const ai = getGeminiClient();

      let stream: any;
      try {
        stream = await ai.models.generateContentStream({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: audioBase64,
                },
              },
              {
                text: textPrompt,
              },
            ],
          },
        });
      } catch (streamInitErr: any) {
        console.warn('gemini-3.5-transcribe stream init failed, falling back to gemini-3.8-flash:', streamInitErr.message);
        usedModel = 'gemini-3.8-flash';
        sendEvent('model_switch', { model: usedModel });
        stream = await ai.models.generateContentStream({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: audioBase64,
                },
              },
              {
                text: textPrompt,
              },
            ],
          },
        });
      }

      let accumulatedRawText = '';
      let buffer = '';
      const emittedSegments: any[] = [];
      let currentSegmentId = 1;

      const timestampRegex = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[-–—to]+\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]?\s*(?:([^:\n]+):\s*)?(.*)/i;

      for await (const chunk of stream) {
        const textChunk = chunk.text || '';
        accumulatedRawText += textChunk;
        buffer += textChunk;

        if (buffer.includes('\n')) {
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('```') || trimmed.toLowerCase().startsWith('summary:')) continue;

            const match = trimmed.match(timestampRegex);
            if (match && (match[1] || match[4])) {
              const startTimeStr = match[1];
              const endTimeStr = match[2];
              const speaker = match[3]?.trim() || 'Speaker 1';
              const text = match[4]?.trim() || trimmed.replace(/\[\d{1,2}:\d{2}.*?\]/, '').trim();

              if (text) {
                const start = startTimeStr
                  ? parseTimeToSeconds(startTimeStr)
                  : (emittedSegments.length > 0 ? emittedSegments[emittedSegments.length - 1].end : 0);
                const end = endTimeStr ? parseTimeToSeconds(endTimeStr) : start + 3;

                const seg = {
                  id: currentSegmentId++,
                  start,
                  end,
                  startTimeFormatted: formatSeconds(start),
                  endTimeFormatted: formatSeconds(end),
                  speaker,
                  text,
                };
                emittedSegments.push(seg);
                sendEvent('segment', seg);
              }
            } else if (trimmed.length > 0) {
              const start = emittedSegments.length > 0 ? emittedSegments[emittedSegments.length - 1].end : 0;
              const end = start + 3;
              const seg = {
                id: currentSegmentId++,
                start,
                end,
                startTimeFormatted: formatSeconds(start),
                endTimeFormatted: formatSeconds(end),
                speaker: 'Speaker 1',
                text: trimmed,
              };
              emittedSegments.push(seg);
              sendEvent('segment', seg);
            }
          }
        }

        if (buffer.trim()) {
          sendEvent('interim', { text: buffer.trim() });
        }
      }

      // Handle trailing buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        const match = trimmed.match(timestampRegex);
        if (match && (match[1] || match[4])) {
          const startTimeStr = match[1];
          const endTimeStr = match[2];
          const speaker = match[3]?.trim() || 'Speaker 1';
          const text = match[4]?.trim() || trimmed.replace(/\[\d{1,2}:\d{2}.*?\]/, '').trim();
          if (text) {
            const start = startTimeStr
              ? parseTimeToSeconds(startTimeStr)
              : (emittedSegments.length > 0 ? emittedSegments[emittedSegments.length - 1].end : 0);
            const end = endTimeStr ? parseTimeToSeconds(endTimeStr) : start + 3;
            const seg = {
              id: currentSegmentId++,
              start,
              end,
              startTimeFormatted: formatSeconds(start),
              endTimeFormatted: formatSeconds(end),
              speaker,
              text,
            };
            emittedSegments.push(seg);
            sendEvent('segment', seg);
          }
        } else if (trimmed.length > 0 && !trimmed.startsWith('```')) {
          const start = emittedSegments.length > 0 ? emittedSegments[emittedSegments.length - 1].end : 0;
          const end = start + 3;
          const seg = {
            id: currentSegmentId++,
            start,
            end,
            startTimeFormatted: formatSeconds(start),
            endTimeFormatted: formatSeconds(end),
            speaker: 'Speaker 1',
            text: trimmed,
          };
          emittedSegments.push(seg);
          sendEvent('segment', seg);
        }
      }

      let finalSegments = emittedSegments;
      if (finalSegments.length === 0 && accumulatedRawText.trim()) {
        const parsed = parsePlainTextWithTimestamps(accumulatedRawText);
        finalSegments = parsed.segments;
        for (const s of finalSegments) {
          sendEvent('segment', s);
        }
      }

      const durationSeconds = finalSegments.length > 0 ? finalSegments[finalSegments.length - 1].end : 0;
      const fullTranscript = finalSegments.map((s: any) => s.text).join(' ');
      const finalData = {
        language: 'Detected speech',
        summary: fullTranscript.slice(0, 150) + (fullTranscript.length > 150 ? '...' : ''),
        durationSeconds,
        fullTranscript,
        segments: finalSegments,
      };

      sendEvent('complete', {
        success: true,
        modelUsed: usedModel,
        filename,
        data: finalData,
      });

      res.write('event: done\ndata: {}\n\n');
      res.end();
    } catch (streamErr: any) {
      console.error('SSE Stream error in /api/transcribe-stream:', streamErr);
      sendEvent('error', {
        error: streamErr.message || 'Stream transcription error occurred',
      });
      res.end();
    }
  });

  // Real-time live audio chunk transcription endpoint using Deepgram 2s or Gemini 3.5
  app.post('/api/transcribe-live-chunk', async (req: Request, res: Response) => {
    const {
      audioBase64,
      mimeType = 'audio/webm',
      startOffsetSeconds = 0,
      engine = 'deepgram',
    } = req.body;

    if (!audioBase64) {
      res.status(400).json({ success: false, error: 'audioBase64 required' });
      return;
    }

    let cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim();

    // Deepgram Nova-2 for ultra-fast 2s chunk transcription
    if (engine === 'deepgram') {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const dgUrl =
          'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true';
        const dgRes = await fetch(dgUrl, {
          method: 'POST',
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': cleanMimeType,
          },
          body: new Uint8Array(audioBuffer) as unknown as BodyInit,
        });

        if (dgRes.ok) {
          const dgJson: any = await dgRes.json();
          const alt = dgJson?.results?.channels?.[0]?.alternatives?.[0];
          const rawText = (alt?.transcript || '').trim();
          const isSilent = !rawText || /^(?:\[?\s*(?:silence|silent|no speech)\s*\]?)$/i.test(rawText);
          const text = isSilent ? '[Silence]' : rawText;
          const start = Number(startOffsetSeconds) || 0;
          const end = start + 2;

          res.setHeader('Content-Type', 'application/json');
          res.json({
            success: true,
            text,
            isSilent,
            speaker: isSilent ? 'Silence' : 'Speaker 1',
            start,
            end,
            startTimeFormatted: formatSeconds(start),
            endTimeFormatted: formatSeconds(end),
            engine: 'deepgram',
          });
          return;
        }
      } catch (dgErr: any) {
        console.warn('Live chunk Deepgram failed, falling back to Gemini:', dgErr.message);
      }
    }

    try {
      const ai = getGeminiClient();

      const chunkPrompt = `Transcribe this short audio clip verbatim. Output ONLY the words spoken in this clip. Do not add intro, timestamps, or commentary. If silence or no speech, output nothing.`;

      const result = await generateContentWithRetry(ai, {
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: audioBase64,
              },
            },
            {
              text: chunkPrompt,
            },
          ],
        },
      });

      const rawText = (result.text || '').trim();
      const isSilent = !rawText || /^(?:\[?\s*(?:silence|silent|no speech)\s*\]?)$/i.test(rawText);
      const text = isSilent ? '[Silence]' : rawText;
      const start = Number(startOffsetSeconds) || 0;
      const end = start + 3;

      res.setHeader('Content-Type', 'application/json');
      res.json({
        success: true,
        text,
        isSilent,
        speaker: isSilent ? 'Silence' : 'Speaker 1',
        start,
        end,
        startTimeFormatted: formatSeconds(start),
        endTimeFormatted: formatSeconds(end),
      });
    } catch (err: any) {
      console.warn('Realtime chunk transcription error:', err.message);
      res.status(200).json({
        success: false,
        text: '',
        error: err.message,
      });
    }
  });

  // Vite development vs production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audio Transcriber server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
