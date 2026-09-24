import { TranscriptionData } from '../types';
import { formatSecondsToSrtTime, formatSecondsToVttTime } from './time';

export function generateSrt(data: TranscriptionData): string {
  return data.segments
    .map((seg, idx) => {
      const srtStart = formatSecondsToSrtTime(seg.start);
      const srtEnd = formatSecondsToSrtTime(seg.end);
      const speakerTag = seg.speaker ? `${seg.speaker}: ` : '';
      return `${idx + 1}\n${srtStart} --> ${srtEnd}\n${speakerTag}${seg.text}\n`;
    })
    .join('\n');
}

export function generateVtt(data: TranscriptionData): string {
  const header = 'WEBVTT\n\n';
  const body = data.segments
    .map((seg, idx) => {
      const vttStart = formatSecondsToVttTime(seg.start);
      const vttEnd = formatSecondsToVttTime(seg.end);
      const speakerTag = seg.speaker ? `<v ${seg.speaker}>` : '';
      const closeTag = seg.speaker ? `</v>` : '';
      return `${idx + 1}\n${vttStart} --> ${vttEnd}\n${speakerTag}${seg.text}${closeTag}\n`;
    })
    .join('\n');
  return header + body;
}

export function generateTextWithTimestamps(data: TranscriptionData): string {
  return data.segments
    .map((seg) => `[${seg.startTimeFormatted} - ${seg.endTimeFormatted}] ${seg.speaker ? `${seg.speaker}: ` : ''}${seg.text}`)
    .join('\n\n');
}

export function generatePlainText(data: TranscriptionData): string {
  if (data.fullTranscript) return data.fullTranscript;
  return data.segments.map((s) => s.text).join(' ');
}

export function generateMarkdown(data: TranscriptionData, title: string = 'Transcript'): string {
  let md = `# ${title}\n\n`;
  if (data.summary) {
    md += `> **Summary:** ${data.summary}\n\n`;
  }
  if (data.language) {
    md += `- **Detected Language:** ${data.language}\n`;
  }
  if (data.durationSeconds) {
    md += `- **Duration:** ~${Math.round(data.durationSeconds)} seconds\n`;
  }
  md += `\n---\n\n### Segments with Timestamps\n\n`;

  data.segments.forEach((seg) => {
    md += `**[${seg.startTimeFormatted}]** *${seg.speaker}*: ${seg.text}\n\n`;
  });

  return md;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
