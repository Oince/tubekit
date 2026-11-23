import { beforeEach, expect, test, vi } from 'vitest';
import { advance, fakePlayer, fire, loadPage, startMain } from './helpers.js';

const redirects = vi.hoisted(() => []);
vi.mock('../src/features/shorts-to-watch/redirect.js', () => ({ redirectTo: url => { redirects.push(url); } }));

beforeEach(() => {
  redirects.length = 0;
});

const QUALITY_DATA = [
  { quality: 'auto', isPlayable: true },
  { quality: 'hd2160', isPlayable: false, formatId: { itag: 313 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 137 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 999 }, paygatedQualityDetails: { name: 'Premium' } },
  { quality: 'hd720', isPlayable: true, formatId: { itag: 136 } },
];

const ROTATION_CONTROLS = `<div class="ytp-right-controls"><div class="ytp-right-controls-left">
  <button class="ytp-subtitles-button ytp-button"></button>
  <button class="ytp-button ytp-settings-button"></button>
</div></div>`;

test('frames: inside an iframe only frames:true features run', async () => {
  loadPage({
    url: 'https://www.youtube.com/embed/abcdefghijk',
    body: '<ytd-app></ytd-app><div id="movie_player"><video></video></div>',
    frame: true,
  });
  expect(window.top).not.toBe(window);
  const player = fakePlayer(document.querySelector('#movie_player'), { quality: QUALITY_DATA, playerState: -1, videoId: 'v1' });
  await startMain();
  fire('playing');
  await advance(50);
  expect(player.qualityCalls.length).toBe(1);
  expect(document.querySelector('#tubekit-styles')).toBe(null);
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('frames: shorts-to-watch does not start inside an iframe but does in the top frame', async () => {
  loadPage({ url: 'https://www.youtube.com/shorts/abcdefghijk', frame: true });
  const framed = await startMain();
  expect(framed.started).not.toContain('shorts-to-watch');
  expect(redirects).toStrictEqual([]);
  loadPage({ url: 'https://www.youtube.com/shorts/abcdefghijk' });
  const top = await startMain();
  expect(top.started).toContain('shorts-to-watch');
  expect(redirects).toStrictEqual(['/watch?v=abcdefghijk']);
});

test('frames: video-rotation adds nothing inside an iframe', async () => {
  loadPage({ body: `<ytd-watch-flexy><div id="movie_player"><video class="html5-main-video"></video><div class="ytp-chrome-bottom">${ROTATION_CONTROLS}</div></div></ytd-watch-flexy>`, frame: true });
  fakePlayer(document.querySelector('#movie_player'));
  const { started } = await startMain();
  fire('loadstart');
  await advance(20);
  expect(started).not.toContain('video-rotation');
  expect(document.querySelector('#tubekit-video-rotation-styles')).toBe(null);
  expect(document.querySelector('.tubekit-video-rotation-button')).toBe(null);
});

test('video-rotation: rotating beside the comments panel neither tears it down nor holds it', async () => {
  loadPage({
    html: `<html lang="en"><head></head><body><ytd-app>
    <ytd-watch-flexy video-id="A" is-two-columns_><div id="primary"><ytd-player><div id="movie_player" class="html5-video-player">
      <div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>
      <div class="ytp-chrome-bottom">${ROTATION_CONTROLS}</div>
    </div></ytd-player><div id="below">
      <ytd-comments id="comments"><ytd-comments-header-renderer></ytd-comments-header-renderer></ytd-comments>
    </div></div><div id="secondary"><div id="secondary-inner">
      <div id="related">related</div>
    </div></div></ytd-watch-flexy></ytd-app></body></html>`,
    innerWidth: 1440,
    clientRects: true,
    rect: element => element.id === 'primary'
      ? { width: 888, left: 0, right: 888, top: 0 }
      : { width: 520, left: 920, right: 1440, top: 0 },
  });
  const player = fakePlayer();
  await startMain();
  await advance(200);
  const root = document.querySelector('#tubekit-root');
  expect(root).toBeTruthy();
  document.querySelector('.tubekit-video-rotation-button').click();
  await advance(400);
  expect(player.resizes).toBeGreaterThan(0);
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.isConnected).toBe(true);
  expect(root.dataset.suspended).not.toBe('true');
  expect(document.documentElement.classList.contains('tubekit-active')).toBe(true);
  expect(document.documentElement.classList.contains('tubekit-suspended')).toBe(false);
});
