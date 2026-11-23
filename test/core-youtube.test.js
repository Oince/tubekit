import { expect, test } from 'vitest';
import {
  availableQualities,
  currentVideoId,
  findWatch,
  isAdShowing,
  isEmbedShortsOrChatPage,
  isPlayerArea,
  isPlaying,
  isStopped,
  isVideoId,
  isVideoPage,
  pageFollowsUrl,
  playerFollowsVideo,
  playerOfMediaEvent,
  setPlaybackQuality,
  setVideoKeywords,
  shortsVideoId,
  urlVideoId,
  videoAspectRatio,
  videoContentRect,
  videoKeywords,
} from '../src/core/youtube.js';
import { fakePlayer, loadPage } from './helpers.js';

function playerPage(url = 'https://www.youtube.com/watch?v=A') {
  loadPage({ url, body: '<ytd-watch-flexy video-id="A"><div id="movie_player"><video></video></div></ytd-watch-flexy>' });
  return document.querySelector('#movie_player');
}

test('a player without methods, or with throwing methods, reads as safe defaults and writes report failure', () => {
  const player = playerPage('https://www.youtube.com/');
  const check = () => {
    expect(currentVideoId(player)).toBe(null);
    expect(playerFollowsVideo(player, 'A')).toBe(false);
    expect(videoAspectRatio(player)).toBeNaN();
    expect(videoContentRect(player)).toBe(null);
    expect(isPlaying(player)).toBe(false);
    expect(isStopped(player)).toBe(false);
    expect(videoKeywords(player)).toStrictEqual([]);
    expect(availableQualities(player)).toStrictEqual([]);
    expect(setVideoKeywords(player, 'x')).toBe(false);
    expect(setPlaybackQuality(player, 'hd720')).toBe(false);
  };
  check();
  for (const name of ['getVideoData', 'getPlayerResponse', 'getVideoAspectRatio', 'getVideoContentRect', 'getPlayerState',
    'updateVideoData', 'getAvailableQualityData', 'setPlaybackQualityRange']) {
    player[name] = () => { throw new Error('not ready'); };
  }
  check();
  expect(currentVideoId(null)).toBe(null);
});

test('odd player values fall back to the same safe defaults', () => {
  const player = playerPage('https://www.youtube.com/');
  const state = fakePlayer(player, { videoId: '', aspect: 0, keywords: ['a', 3, null, 'b'], contentRect: { left: 0, top: 0, width: 0, height: 10 } });
  state.quality = null;
  expect(currentVideoId(player)).toBe(null);
  expect(videoAspectRatio(player)).toBeNaN();
  expect(videoContentRect(player)).toBe(null);
  expect(videoKeywords(player)).toStrictEqual(['a', 'b']);
  expect(availableQualities(player)).toStrictEqual([]);
  expect(setPlaybackQuality(player, 'hd720', { itag: 1 })).toBe(true);
  expect(state.qualityCalls).toStrictEqual([['hd720', 'hd720', { itag: 1 }]]);
});

test('ad-showing or ad-interrupting alone counts as an ad', () => {
  const player = playerPage();
  expect(isAdShowing(player)).toBe(false);
  for (const name of ['ad-showing', 'ad-interrupting']) {
    player.className = `html5-video-player ${name}`;
    expect(isAdShowing(player), name).toBe(true);
  }
  expect(isAdShowing(null)).toBe(false);
});

test('the video page needs /watch with a v; shorts pages need an 11 character id', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=A', true, 'A', null, false],
    ['https://m.youtube.com/watch?v=A&t=3', true, 'A', null, false],
    ['https://www.youtube.com/watch', false, null, null, false],
    ['https://www.youtube.com/watch?v=', false, null, null, false],
    ['https://www.youtube.com/watch/A', false, null, null, false],
    ['https://www.youtube.com/?v=A', false, 'A', null, false],
    ['https://www.youtube.com/shorts/abcdefghijk', false, null, 'abcdefghijk', true],
    ['https://www.youtube.com/shorts/abcdefghijk/', false, null, 'abcdefghijk', true],
    ['https://www.youtube.com/shorts/abcdefghij', false, null, null, true],
    ['https://www.youtube.com/shorts/abcdefghijk/x', false, null, null, true],
    ['https://www.youtube.com/shortsabcdefghijk', false, null, null, false],
    ['https://www.youtube.com/embed/abcdefghijk', false, null, null, true],
    ['https://www.youtube.com/live_chat?v=A', false, 'A', null, true],
    ['https://www.youtube.com/', false, null, null, false],
  ];
  for (const [url, videoPage, urlId, shortsId, special] of cases) {
    loadPage({ url });
    expect(isVideoPage(), url).toBe(videoPage);
    expect(urlVideoId(), url).toBe(urlId);
    expect(shortsVideoId(), url).toBe(shortsId);
    expect(isEmbedShortsOrChatPage(), url).toBe(special);
  }
  expect(isVideoId('abc-_DEF123')).toBe(true);
  expect(isVideoId('abc')).toBe(false);
  expect(isVideoId(12345678901)).toBe(false);
});

test('the current video is the address on the video page, otherwise the player unless an ad is showing', () => {
  const watchPlayer = playerPage();
  fakePlayer(watchPlayer, { videoId: 'P' });
  expect(currentVideoId(watchPlayer)).toBe('A');
  watchPlayer.classList.add('ad-interrupting');
  expect(currentVideoId(watchPlayer)).toBe('A');
  for (const url of ['https://www.youtube.com/', 'https://m.youtube.com/', 'https://www.youtube-nocookie.com/embed/abcdefghijk']) {
    const player = playerPage(url);
    const state = fakePlayer(player, { videoId: 'P' });
    expect(currentVideoId(player), url).toBe('P');
    expect(currentVideoId(), url).toBe('P');
    player.classList.add('ad-interrupting');
    expect(currentVideoId(player), url).toBe(null);
    player.classList.remove('ad-interrupting');
    state.videoId = '';
    expect(currentVideoId(player), url).toBe(null);
  }
});

test('the player has caught up when its video and, if it has one, its response match', () => {
  const player = playerPage();
  const state = fakePlayer(player, { videoId: 'A' });
  expect(playerFollowsVideo(player, 'A')).toBe(true);
  expect(playerFollowsVideo(player, 'B')).toBe(false);
  state.responseId = 'B';
  expect(playerFollowsVideo(player, 'A')).toBe(false);
  state.responseId = 'A';
  expect(playerFollowsVideo(player, 'A')).toBe(true);
  player.getPlayerResponse = () => { throw new Error('not ready'); };
  expect(playerFollowsVideo(player, 'A')).toBe(true);
  player.getPlayerResponse = () => null;
  expect(playerFollowsVideo(player, 'A')).toBe(true);
});

test('a player holding no video never counts as following a video, even when no video is expected', () => {
  const player = playerPage();
  const state = fakePlayer(player, { videoId: '' });
  expect(playerFollowsVideo(player, null)).toBe(false);
  expect(playerFollowsVideo(player, '')).toBe(false);
  expect(playerFollowsVideo(null, null)).toBe(false);
  state.videoId = 'A';
  expect(playerFollowsVideo(player, null)).toBe(false);
});

test('the page has caught up when the watch video-id matches the address', () => {
  playerPage();
  const watch = document.querySelector('ytd-watch-flexy');
  expect(pageFollowsUrl(watch)).toBe(true);
  watch.setAttribute('video-id', 'B');
  expect(pageFollowsUrl(watch)).toBe(false);
  watch.removeAttribute('video-id');
  expect(pageFollowsUrl(watch)).toBe(false);
  expect(pageFollowsUrl(null)).toBe(false);
  history.replaceState(null, '', '/');
  watch.setAttribute('video-id', 'A');
  expect(pageFollowsUrl(watch)).toBe(false);
});

test('the watch holding the player wins; otherwise the first shown watch, otherwise the last one', () => {
  loadPage({
    body: `<ytd-watch-flexy id="first"></ytd-watch-flexy>
      <ytd-watch-flexy id="stale" hidden></ytd-watch-flexy>
      <ytd-watch-flexy id="holder"><div id="movie_player"></div></ytd-watch-flexy>
      <ytd-watch-flexy id="last"></ytd-watch-flexy>`,
  });
  const byId = id => document.getElementById(id);
  const player = byId('movie_player');
  expect(findWatch(player)).toBe(byId('holder'));
  expect(findWatch()).toBe(byId('last'));
  const shown = new Set([byId('stale'), byId('holder')]);
  for (const watch of document.querySelectorAll('ytd-watch-flexy')) watch.getClientRects = () => (shown.has(watch) ? [{}] : []);
  expect(findWatch()).toBe(byId('holder'));
  byId('stale').hidden = false;
  expect(findWatch()).toBe(byId('stale'));
  const outside = document.createElement('div');
  expect(findWatch(outside)).toBe(byId('stale'));
  document.body.innerHTML = '';
  expect(findWatch()).toBe(null);
});

test('media events and mutation targets are matched to the player area', () => {
  loadPage({ body: '<div id="movie_player"><video id="inside"></video><span id="label"></span></div><ytd-player><i id="shell"></i></ytd-player><video id="outside"></video>' });
  const player = document.querySelector('#movie_player');
  const event = target => ({ target });
  expect(playerOfMediaEvent(event(document.querySelector('#inside')))).toBe(player);
  expect(playerOfMediaEvent(event(document.querySelector('#outside')))).toBe(null);
  expect(playerOfMediaEvent(event(document.querySelector('#label')))).toBe(null);
  expect(playerOfMediaEvent(event(null))).toBe(null);
  expect(isPlayerArea(document.querySelector('#label'))).toBe(true);
  expect(isPlayerArea(document.querySelector('#shell'))).toBe(true);
  expect(isPlayerArea(document.querySelector('#outside'))).toBe(false);
  expect(isPlayerArea(document.createTextNode('x'))).toBe(false);
});
