import { expect, test } from 'vitest';
import { fakePlayer, fire, loadPage, startFeature } from './helpers.js';

const QUALITY_DATA = [
  { quality: 'auto', isPlayable: true },
  { quality: 'hd2160', isPlayable: false, formatId: { itag: 313 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 137 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 999 }, paygatedQualityDetails: { name: 'Premium' } },
  { quality: 'hd720', isPlayable: true, formatId: { itag: 136 } },
];

async function qualityPage({
  url = 'https://www.youtube.com/watch?v=A',
  data = QUALITY_DATA,
  state = -1,
  inPlayer = true,
  withPlayer = true,
  videoId = 'A',
} = {}) {
  loadPage({ url, body: `<div id="movie_player">${inPlayer ? '<video></video>' : ''}</div>${inPlayer ? '' : '<video id="outside"></video>'}` });
  const player = withPlayer ? fakePlayer(document.querySelector('#movie_player'), { quality: data, playerState: state, videoId }) : null;
  await startFeature('max-quality');
  return player;
}

test('picks the highest playable quality and prefers the premium format', async () => {
  const player = await qualityPage();
  fire('playing');
  expect(player.qualityCalls).toStrictEqual([['hd1080', 'hd1080', { itag: 999 }]]);
});

test('normal entry gets no formatId; unplayable and unknown entries are skipped', async () => {
  const player = await qualityPage({
    data: [
      { quality: 'auto', isPlayable: true },
      { quality: 'hd2160', isPlayable: false },
      { quality: 'hd1080', isPlayable: true, formatId: { itag: 137 } },
      { quality: 'hd720', isPlayable: true },
    ],
  });
  fire('playing');
  expect(player.qualityCalls).toStrictEqual([['hd1080', 'hd1080']]);
});

test('pause/resume and same-video media reloads do not re-apply; a new video id does', async () => {
  const player = await qualityPage();
  fire('playing');
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
  fire('emptied');
  fire('loadstart');
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
  history.pushState({}, '', '/watch?v=v2');
  player.videoId = 'v2';
  fire('emptied');
  fire('loadstart');
  fire('playing');
  expect(player.qualityCalls.length).toBe(2);
});

test('ad-showing is skipped and the main video applies after the ad', async () => {
  const player = await qualityPage({ url: 'https://www.youtube.com/watch?v=main' });
  player.element.classList.add('ad-showing');
  player.videoId = 'ad';
  fire('playing');
  expect(player.qualityCalls.length).toBe(0);
  player.element.classList.remove('ad-showing');
  player.videoId = 'main';
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
});

test('empty quality data is not recorded so a later playing retries', async () => {
  const data = [];
  const player = await qualityPage({ data });
  fire('playing');
  expect(player.qualityCalls.length).toBe(0);
  data.push({ quality: 'hd720', isPlayable: true });
  fire('playing');
  expect(player.qualityCalls).toStrictEqual([['hd720', 'hd720']]);
});

test('an already playing player is applied at start', async () => {
  const player = await qualityPage({ state: 1 });
  expect(player.qualityCalls.length).toBe(1);
});

test('an existing player that is not playing waits for playing', async () => {
  const player = await qualityPage({ state: -1 });
  expect(player.qualityCalls.length).toBe(0);
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
});

test('works on m.youtube.com and youtube-nocookie embeds', async () => {
  for (const url of ['https://m.youtube.com/watch?v=A', 'https://www.youtube-nocookie.com/embed/abcdefghijk']) {
    const player = await qualityPage({ url });
    fire('playing');
    expect(player.qualityCalls.length, url).toBe(1);
  }
});

test('a video outside #movie_player is ignored', async () => {
  const player = await qualityPage({ inPlayer: false });
  fire('playing', document.querySelector('#outside'));
  expect(player.qualityCalls.length).toBe(0);
});

test('missing player API or empty data stays quiet', async () => {
  await qualityPage({ withPlayer: false });
  fire('playing');
  const player = await qualityPage({ data: [] });
  fire('playing');
  expect(player.qualityCalls.length).toBe(0);
});

const HIGH_DATA = [
  { quality: 'highres', isPlayable: true, formatId: { itag: 1 } },
  { quality: 'hd2160', isPlayable: true, formatId: { itag: 2 } },
  { quality: 'hd1440', isPlayable: true },
  { quality: 'hd1080', isPlayable: true },
  { quality: 'small', isPlayable: true },
];

test('8K (highres) is never auto-selected; 4K is the cap', async () => {
  const player = await qualityPage({ data: HIGH_DATA });
  fire('playing');
  expect(player.qualityCalls).toStrictEqual([['hd2160', 'hd2160']]);
});

test('a manually chosen 8K is not overridden on the same video', async () => {
  const player = await qualityPage({ data: HIGH_DATA });
  fire('playing');
  fire('emptied');
  fire('playing');
  expect(player.qualityCalls).toStrictEqual([['hd2160', 'hd2160']]);
});

test('an ad marked only by ad-interrupting is skipped and the main video applies after it', async () => {
  const player = await qualityPage();
  player.element.classList.add('ad-interrupting');
  fire('playing');
  expect(player.qualityCalls.length).toBe(0);
  player.element.classList.remove('ad-interrupting');
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
});

test('a midroll ad marked by ad-showing is skipped even while the player still reports the main video', async () => {
  const player = await qualityPage();
  player.element.classList.add('ad-showing');
  fire('playing');
  expect(player.qualityCalls.length).toBe(0);
  player.element.classList.remove('ad-showing');
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
});

test('the quality waits until the player has caught up with the video in the address', async () => {
  const player = await qualityPage();
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
  history.pushState({}, '', '/watch?v=B');
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
  player.videoId = 'B';
  player.responseId = 'A';
  fire('playing');
  expect(player.qualityCalls.length).toBe(1);
  player.responseId = 'B';
  fire('playing');
  expect(player.qualityCalls.length).toBe(2);
});
