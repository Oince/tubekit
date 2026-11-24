import { expect, test } from 'vitest';
import {
  COMMENTS_OFF_BY_UPLOADER,
  COMMENTS_OFF_LIVE_LOOK,
  availableQualities,
  commentsHaveLoaded,
  commentsOffCandidate,
  currentVideoId,
  findNativeComments,
  findNativeRelated,
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

function commentsPage(commentsHtml, attributes = '', inner = '<div id="related"></div>') {
  loadPage({
    body: `<ytd-watch-flexy video-id="A"><div id="primary"><div id="below"><ytd-comments id="comments"${attributes}>${commentsHtml}</ytd-comments></div></div>
      <div id="secondary"><div id="secondary-inner">${inner}</div></div></ytd-watch-flexy>`,
  });
  return { watch: document.querySelector('ytd-watch-flexy'), node: document.querySelector('ytd-comments') };
}

test('the comments are found in the primary column, skipping any inside the given container', () => {
  const { watch, node } = commentsPage('');
  expect(findNativeComments(watch)).toBe(node);
  expect(findNativeComments(null)).toBe(null);
  const shell = document.createElement('section');
  shell.id = 'shell';
  document.body.append(shell);
  shell.append(node);
  expect(findNativeComments(watch)).toBe(null);
  const elsewhere = document.createElement('ytd-comments');
  elsewhere.id = 'comments';
  watch.querySelector('#below').append(elsewhere);
  expect(findNativeComments(watch)).toBe(elsewhere);
  elsewhere.remove();
  watch.querySelector('#below').append(shell);
  expect(findNativeComments(watch)).toBe(node);
  expect(findNativeComments(watch, '#shell')).toBe(null);
  watch.querySelector('#below').append(elsewhere);
  expect(findNativeComments(watch, '#shell')).toBe(elsewhere);
});

test('the related list is only a direct child of the secondary column', () => {
  const { watch } = commentsPage('', '', '<div id="related">r</div>');
  const related = document.querySelector('#related');
  expect(findNativeRelated(watch)).toBe(related);
  document.querySelector('#below').append(related);
  expect(findNativeRelated(watch)).toBe(null);
  const nested = document.createElement('div');
  nested.innerHTML = '<div id="related"></div>';
  watch.querySelector('#secondary-inner').append(nested);
  expect(findNativeRelated(watch)).toBe(null);
  expect(findNativeRelated(null)).toBe(null);
});

test('comments count as loaded once a header, thread, message or count shows', () => {
  expect(commentsHaveLoaded(null)).toBe(false);
  for (const [html, expected] of [
    ['', false],
    ['<div></div>', false],
    ['<ytd-comments-header-renderer></ytd-comments-header-renderer>', true],
    ['<ytd-comment-thread-renderer></ytd-comment-thread-renderer>', true],
    ['<ytd-message-renderer></ytd-message-renderer>', true],
    ['<div id="header"><span id="count"></span></div>', true],
  ]) {
    const { node } = commentsPage(html);
    expect(commentsHaveLoaded(node), html).toBe(expected);
  }
});

test('a comments off candidate is the uploader turning them off, a live broadcast look, or neither', () => {
  const chat = '<ytd-live-chat-frame></ytd-live-chat-frame>';
  const cases = [
    ['a message with no header or thread is the uploader turning comments off, in any language', '<ytd-message-renderer>コメントはオフです</ytd-message-renderer>', '', '', COMMENTS_OFF_BY_UPLOADER],
    ['a #message element counts like a message renderer', '<div id="message">off</div>', '', '', COMMENTS_OFF_BY_UPLOADER],
    ['a message beside a header is not off', '<ytd-message-renderer>x</ytd-message-renderer><ytd-comments-header-renderer></ytd-comments-header-renderer>', '', '', null],
    ['a message beside only a thread is not off', '<ytd-message-renderer>x</ytd-message-renderer><ytd-comment-thread-renderer></ytd-comment-thread-renderer>', '', '', null],
    ['empty hidden comments beside the live chat look like a live broadcast with comments off', '', ' hidden', chat, COMMENTS_OFF_LIVE_LOOK],
    ['empty hidden comments without a live chat are not off', '', ' hidden', '', null],
    ['empty visible comments beside the live chat are not off', '', '', chat, null],
    ['hidden comments with content beside the live chat are not off', '<div></div>', ' hidden', chat, null],
    ['loaded comments are not off', '<ytd-comments-header-renderer></ytd-comments-header-renderer>', '', '', null],
  ];
  for (const [name, html, attributes, inner, expected] of cases) {
    const { watch, node } = commentsPage(html, attributes, `<div id="related"></div>${inner}`);
    expect(commentsOffCandidate(node, watch), name).toBe(expected);
  }
  expect(commentsOffCandidate(null, null)).toBe(null);
  const { node } = commentsPage('', ' hidden');
  expect(commentsOffCandidate(node, null)).toBe(null);
});
