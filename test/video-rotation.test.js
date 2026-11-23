import { expect, test } from 'vitest';
import { advance, fakePlayer, fire, loadPage, startFeature } from './helpers.js';

const ROTATION_CLASSES = ['tubekit-video-rotation-90', 'tubekit-video-rotation-180', 'tubekit-video-rotation-270'];
const ROTATION_CONTROLS = `<div class="ytp-right-controls"><div class="ytp-right-controls-left">
  <button class="ytp-subtitles-button ytp-button"></button>
  <button class="ytp-button ytp-settings-button"></button>
</div></div>`;

const near = (a, b) => Math.abs(a - b) < 1e-9;

function playerMarkup({ ad = false, controls = true } = {}) {
  return `<div id="movie_player" class="html5-video-player${ad ? ' ad-showing' : ''}">
      <div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>
      <div class="ytp-chrome-bottom">${controls ? ROTATION_CONTROLS : ''}</div>
    </div>`;
}

async function rotationPage({
  url = 'https://www.youtube.com/watch?v=A',
  aspect = 16 / 9,
  keywords = ['blender', 'short'],
  ad = false,
  controls = true,
} = {}) {
  loadPage({ url, body: `<ytd-app><ytd-watch-flexy video-id="A">${playerMarkup({ ad, controls })}</ytd-watch-flexy></ytd-app>` });
  const player = document.querySelector('#movie_player');
  const watch = document.querySelector('ytd-watch-flexy');
  const state = fakePlayer(player, { aspect, keywords, watch });
  await startFeature('video-rotation');
  const button = () => document.querySelectorAll('.tubekit-video-rotation-button');
  const classes = () => ROTATION_CLASSES.filter(name => player.classList.contains(name));
  const go = (id, playerId = id) => {
    history.pushState({}, '', `/watch?v=${id}`);
    state.videoId = playerId;
    fire('loadstart');
  };
  return { state, player, watch, button, classes, go };
}

test('one button is placed right before the settings button and never duplicated', async () => {
  const { button } = await rotationPage();
  expect(button().length).toBe(1);
  const settings = document.querySelector('.ytp-settings-button');
  expect(button()[0].nextElementSibling).toBe(settings);
  expect(button()[0].previousElementSibling.classList.contains('ytp-subtitles-button')).toBe(true);
  expect(button()[0].classList.contains('ytp-button')).toBe(true);
  expect(button()[0].getAttribute('aria-label')).toBe('영상 회전');
  expect(button()[0].querySelectorAll('svg > rect, svg > path').length).toBe(3);
  for (const type of ['loadstart', 'loadedmetadata', 'playing']) fire(type);
  fire('yt-navigate-finish', document);
  document.querySelector('.ytp-right-controls-left').append(settings);
  await advance(20);
  expect(button().length).toBe(1);
  expect(button()[0].nextElementSibling).toBe(settings);
});

test('each click turns 90° clockwise, quarter turns report the swapped ratio, and four clicks return to 0°', async () => {
  const { state, watch, player, button, classes } = await rotationPage();
  const click = () => button()[0].click();
  click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(state.updates.length).toBe(1);
  expect(state.updates[0]).toMatch(/^blender,short,yt:stretch=1:1\.777/);
  expect(near(state.aspect, 9 / 16)).toBe(true);
  expect(player.style.getPropertyValue('--tubekit-video-rotation-width')).toBe('784px');
  expect(player.style.getPropertyValue('--tubekit-video-rotation-height')).toBe('441px');
  expect(player.style.getPropertyValue('--tubekit-video-rotation-left')).toBe('-171.5px');
  expect(player.style.getPropertyValue('--tubekit-video-rotation-top')).toBe('171.5px');
  await advance(50);
  expect(near(watch.videoHeightToWidthRatio_, 16 / 9)).toBe(true);
  expect(state.resizes).toBeGreaterThan(0);
  click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-180']);
  expect(state.updates[1]).toBe('blender,short,yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
  click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-270']);
  expect(state.updates[2]).toMatch(/yt:stretch=1:1\.777/);
  click();
  expect(classes()).toStrictEqual([]);
  expect(state.updates.length).toBe(4);
  expect(near(state.aspect, 16 / 9)).toBe(true);
  await advance(50);
  expect(near(watch.videoHeightToWidthRatio_, 9 / 16)).toBe(true);
});

test('an uploader yt:stretch keyword is kept when the rotation is undone', async () => {
  const { state, button } = await rotationPage({ keywords: ['yt:stretch=4:3', 'tag'] });
  button()[0].click();
  expect(state.updates[0].split(',').filter(k => k.startsWith('yt:stretch=')).length).toBe(1);
  button()[0].click();
  expect(state.updates[1]).toBe('tag,yt:stretch=4:3');
});

test('pause, seeking and same-video media reloads keep the rotation', async () => {
  const { state, button, classes } = await rotationPage();
  button()[0].click();
  for (const type of ['emptied', 'loadstart', 'loadedmetadata', 'playing']) fire(type);
  await advance(20);
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(state.updates.length).toBe(1);
});

test('a video whose data lost the reported ratio gets it back on the next media event', async () => {
  const { state, button, classes } = await rotationPage();
  button()[0].click();
  state.aspect = state.mediaAspect;
  fire('loadedmetadata');
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(state.updates.length).toBe(2);
  expect(near(state.aspect, 9 / 16)).toBe(true);
});

test('a new video resets to 0° and clears the rotated ratio YouTube carried over', async () => {
  const { state, button, classes, go } = await rotationPage();
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  state.keywords = undefined;
  go('B');
  expect(classes()).toStrictEqual([]);
  expect(state.updates.at(-1)).toBe('yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
  const updates = state.updates.length;
  fire('playing');
  expect(state.updates.length).toBe(updates);
  go('A');
  expect(classes()).toStrictEqual([]);
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
});

test('the button is disabled and rotation is not applied during an ad, then comes back after it', async () => {
  const { state, player, button, classes } = await rotationPage({ ad: true });
  expect(button()[0].disabled).toBe(true);
  button()[0].click();
  expect(classes()).toStrictEqual([]);
  expect(state.updates.length).toBe(0);
  player.classList.remove('ad-showing');
  await advance(20);
  expect(button()[0].disabled).toBe(false);
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  const updates = state.updates.length;
  player.classList.add('ad-showing');
  state.aspect = state.mediaAspect;
  await advance(20);
  fire('playing');
  expect(classes()).toStrictEqual([]);
  expect(button()[0].disabled).toBe(true);
  expect(state.updates.length).toBe(updates);
  player.classList.remove('ad-showing');
  await advance(20);
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(button()[0].disabled).toBe(false);
  expect(near(state.aspect, 9 / 16)).toBe(true);
});

test('no button on m.youtube.com, embeds, youtube-nocookie or pages other than /watch', async () => {
  for (const url of [
    'https://m.youtube.com/watch?v=A',
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://www.youtube.com/',
  ]) {
    const { button } = await rotationPage({ url });
    fire('loadstart');
    fire('yt-navigate-finish', document);
    await advance(20);
    expect(button().length, url).toBe(0);
  }
});

test('going back to the rotated video during the next video preroll ad shows it at 0°', async () => {
  const { state, player, button, classes, go } = await rotationPage();
  button()[0].click();
  player.classList.add('ad-showing');
  go('B', 'AD');
  await advance(20);
  expect(classes()).toStrictEqual([]);
  expect(state.updates.length).toBe(1);
  player.classList.remove('ad-showing');
  go('A');
  await advance(20);
  expect(classes()).toStrictEqual([]);
  expect(state.updates.at(-1)).toBe('blender,short,yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
});

test('passing through a video without a video id still resets the rotated video to 0°', async () => {
  const { state, button, classes, go } = await rotationPage();
  button()[0].click();
  go('B', '');
  expect(classes()).toStrictEqual([]);
  expect(state.updates.length).toBe(1);
  button()[0].click();
  expect(classes()).toStrictEqual([]);
  go('A');
  expect(classes()).toStrictEqual([]);
  expect(state.updates.at(-1)).toBe('blender,short,yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
});

test('a midroll ad that reports its own video id does not reset the rotation', async () => {
  const { state, player, button, classes } = await rotationPage();
  button()[0].click();
  const updates = state.updates.length;
  player.classList.add('ad-showing');
  state.videoId = 'AD';
  state.aspect = state.mediaAspect;
  fire('loadstart');
  await advance(20);
  expect(classes()).toStrictEqual([]);
  expect(button()[0].disabled).toBe(true);
  expect(state.updates.length).toBe(updates);
  player.classList.remove('ad-showing');
  await advance(20);
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(state.updates.length).toBe(updates);
  state.videoId = 'A';
  fire('playing');
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(near(state.aspect, 9 / 16)).toBe(true);
});

test('leftover cleanup waits for the new video response and keeps its own yt:stretch', async () => {
  const { state, button, go } = await rotationPage({ keywords: ['tagA'] });
  state.responseId = 'A';
  button()[0].click();
  const updates = state.updates.length;
  go('B');
  fire('playing');
  expect(state.updates.length).toBe(updates);
  button()[0].click();
  expect(state.updates.length).toBe(updates);
  state.responseId = 'B';
  state.keywords = ['yt:stretch=4:3', 'tagB'];
  state.mediaAspect = 4 / 3;
  fire('loadedmetadata');
  expect(state.updates.at(-1)).toBe('tagB,yt:stretch=4:3');
  expect(near(state.aspect, 4 / 3)).toBe(true);
});

test('a failed leftover cleanup is retried on the next event', async () => {
  const { state, player, button, go } = await rotationPage();
  button()[0].click();
  const update = player.updateVideoData;
  let failures = 1;
  player.updateVideoData = data => {
    if (failures-- > 0) throw new Error('not ready');
    update(data);
  };
  go('B');
  expect(near(state.aspect, 9 / 16)).toBe(true);
  fire('playing');
  expect(state.updates.at(-1)).toBe('blender,short,yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
});

test('a relayout skipped by an ad runs once the ad ends', async () => {
  const { watch, player, button } = await rotationPage();
  button()[0].click();
  await advance(50);
  expect(near(watch.videoHeightToWidthRatio_, 16 / 9)).toBe(true);
  button()[0].click();
  player.classList.add('ad-showing');
  await advance(50);
  expect(near(watch.videoHeightToWidthRatio_, 16 / 9)).toBe(true);
  player.classList.remove('ad-showing');
  await advance(50);
  expect(near(watch.videoHeightToWidthRatio_, 9 / 16)).toBe(true);
});

test('the ratio goes to the ytd-watch-flexy that holds the player, not a hidden one before it', async () => {
  loadPage({
    body: `<ytd-app>
    <ytd-watch-flexy id="stale" hidden></ytd-watch-flexy>
    <ytd-watch-flexy id="live">${playerMarkup()}</ytd-watch-flexy></ytd-app>`,
  });
  const stale = document.querySelector('#stale');
  const live = document.querySelector('#live');
  fakePlayer(document.querySelector('#movie_player'), { watch: live });
  stale.videoHeightToWidthRatio_ = 9 / 16;
  await startFeature('video-rotation');
  document.querySelector('.tubekit-video-rotation-button').click();
  await advance(50);
  expect(near(live.videoHeightToWidthRatio_, 16 / 9)).toBe(true);
  expect(near(stale.videoHeightToWidthRatio_, 9 / 16)).toBe(true);
});

test('the button comes back after YouTube replaces the controls group or mounts the controls late', async () => {
  const replaced = await rotationPage();
  const fresh = document.createElement('div');
  fresh.className = 'ytp-right-controls-left';
  fresh.innerHTML = '<button class="ytp-subtitles-button ytp-button"></button><button class="ytp-button ytp-settings-button"></button>';
  document.querySelector('.ytp-right-controls-left').replaceWith(fresh);
  await advance(20);
  expect(replaced.button().length).toBe(1);
  expect(replaced.button()[0].nextElementSibling).toBe(fresh.querySelector('.ytp-settings-button'));

  const late = await rotationPage({ controls: false });
  expect(late.button().length).toBe(0);
  document.querySelector('.ytp-chrome-bottom').innerHTML = ROTATION_CONTROLS;
  await advance(20);
  expect(late.button().length).toBe(1);
  expect(late.button()[0].nextElementSibling.classList.contains('ytp-settings-button')).toBe(true);
  document.querySelector('.ytp-right-controls-left').append(document.createElement('span'));
  await advance(20);
  expect(late.button().length).toBe(1);
});

test('an ended video is left where YouTube hides it so its last frame does not show behind the end screen', async () => {
  const { player, button } = await rotationPage();
  const video = document.querySelector('video');
  const sheet = document.querySelector('#tubekit-video-rotation-styles').sheet;
  const videoRules = () => [...sheet.cssRules].filter(rule => rule.selectorText && rule.selectorText.split(',').some(selector => video.matches(selector)));
  for (const angle of [90, 180, 270]) {
    button()[0].click();
    expect(player.classList.contains(`tubekit-video-rotation-${angle}`)).toBe(true);
    expect(videoRules().length, `${angle}° rotates the playing video`).toBeGreaterThan(0);
    player.classList.add('ended-mode');
    expect(videoRules(), `${angle}° leaves the ended video alone`).toStrictEqual([]);
    player.classList.remove('ended-mode');
  }
});

test('embeds, shorts and other non-watch pages get no rotation styles', async () => {
  for (const url of [
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://www.youtube.com/',
  ]) {
    await rotationPage({ url });
    fire('loadstart');
    fire('yt-player-updated', document);
    await advance(20);
    expect(document.querySelector('#tubekit-video-rotation-styles'), url).toBe(null);
    expect(document.querySelector('.tubekit-video-rotation-button'), url).toBe(null);
  }
});

test('moving from the home page to /watch adds the button, and the miniplayer keeps the rotation', async () => {
  const { button, classes } = await rotationPage({ url: 'https://www.youtube.com/' });
  expect(document.querySelector('#tubekit-video-rotation-styles')).toBe(null);
  history.pushState({}, '', '/watch?v=A');
  fire('yt-navigate-finish', document);
  expect(button().length).toBe(1);
  expect(document.querySelector('#tubekit-video-rotation-styles')).toBeTruthy();
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  history.pushState({}, '', '/');
  fire('yt-navigate-finish', document);
  fire('playing');
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  expect(button().length).toBe(1);
  history.pushState({}, '', '/watch?v=A');
  fire('yt-navigate-finish', document);
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
});

test('closing the miniplayer ends the viewing, so opening the same video again starts at 0°', async () => {
  const { state, player, button, classes } = await rotationPage();
  let size = { width: 888, height: 784 };
  player.getBoundingClientRect = () => ({ left: 0, top: 0, ...size });
  state.playerState = 1;
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  history.pushState({}, '', '/');
  size = { width: 0, height: 0 };
  player.classList.add('ytp-player-minimized');
  await advance(20);
  fire('yt-navigate-finish', document);
  size = { width: 192, height: 341 };
  fire('yt-navigate-start', document);
  history.pushState({}, '', '/watch?v=A');
  fire('yt-navigate-finish', document);
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
  history.pushState({}, '', '/');
  fire('yt-navigate-finish', document);
  size = { width: 0, height: 0 };
  state.playerState = 5;
  state.aspect = state.mediaAspect;
  player.classList.add('unstarted-mode');
  await advance(20);
  expect(classes()).toStrictEqual([]);
  history.pushState({}, '', '/watch?v=A');
  fire('yt-navigate-finish', document);
  fire('loadstart');
  expect(classes()).toStrictEqual([]);
  expect(state.updates.at(-1)).toBe('blender,short,yt:stretch=');
  expect(near(state.aspect, 16 / 9)).toBe(true);
  button()[0].click();
  expect(classes()).toStrictEqual(['tubekit-video-rotation-90']);
});
