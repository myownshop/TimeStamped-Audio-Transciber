export interface SampleAudio {
  id: string;
  title: string;
  description: string;
  url: string;
  durationApprox: string;
}

export const SAMPLE_AUDIOS: SampleAudio[] = [
  {
    id: 'sample-apollo',
    title: 'Apollo 11 Moon Landing ("One Giant Leap")',
    description: 'Neil Armstrong iconic Apollo 11 audio transmission from the Moon lunar surface.',
    url: 'https://archive.org/download/Apollo11AudioHighlights/apollo11_giant_leap.mp3',
    durationApprox: '15s',
  },
  {
    id: 'sample-jfk',
    title: 'JFK Moon Speech ("We Choose to Go to the Moon")',
    description: 'John F. Kennedy address at Rice University regarding the space effort.',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/JFK_we_choose_to_go_to_the_moon.ogg',
    durationApprox: '20s',
  },
  {
    id: 'sample-churchill',
    title: 'Winston Churchill Historic Broadcast ("Finest Hour")',
    description: 'Winston Churchill historic speech excerpt to the House of Commons.',
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Winston_Churchill_-_Their_Finest_Hour.ogg',
    durationApprox: '18s',
  },
];
