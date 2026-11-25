import { expect, test, vi } from 'vitest';
import {
  CHAT_PANEL,
  COMMENTS_OFF_BY_UPLOADER,
  COMMENTS_OFF_LIVE_LOOK,
  NOT_TWO_COLUMN_SELECTORS,
  SCREEN_ATTRIBUTES,
  TWO_COLUMN_SELECTOR,
  YOUTUBE_PANEL_ATTRIBUTES,
  availableQualities,
  commentsHaveLoaded,
  commentsOffCandidate,
  currentVideoId,
  findNativeComments,
  findApp,
  findChatFrame,
  findCommentsHome,
  findNativeRelated,
  findSecondaryInner,
  findWatch,
  findYoutubePanels,
  isAdShowing,
  isBrowserFullscreen,
  isEmbedShortsOrChatPage,
  isFullscreen,
  isPlayerArea,
  isPlaying,
  isStopped,
  isTwoColumnScreen,
  isTwoColumnScreenLeft,
  isVideoId,
  isVideoPage,
  isWatchHidden,
  isYoutubePanelOpen,
  pageFollowsUrl,
  panelOfRequest,
  pageVideoId,
  playerFollowsVideo,
  playerOfMediaEvent,
  setPlaybackQuality,
  setVideoKeywords,
  shortsVideoId,
  urlVideoId,
  videoAspectRatio,
  videoContentRect,
  videoKeywords,
  watchChatTitle,
  watchPanelRequests,
  youtubePanelTitle,
} from '../src/core/youtube.js';
import { advance, fakePlayer, loadPage, onCleanup, stubProperty } from './helpers.js';

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

test('the page shows the video its watch video-id names, whatever the address says', () => {
  playerPage();
  const watch = document.querySelector('ytd-watch-flexy');
  expect(pageVideoId(watch)).toBe('A');
  history.replaceState(null, '', '/watch?v=B');
  expect(pageVideoId(watch)).toBe('A');
  watch.setAttribute('video-id', '');
  expect(pageVideoId(watch)).toBe(null);
  watch.removeAttribute('video-id');
  expect(pageVideoId(watch)).toBe(null);
  expect(pageVideoId(null)).toBe(null);
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

function watchPage(attributes = '', url = 'https://www.youtube.com/watch?v=A') {
  loadPage({ url, body: `<ytd-watch-flexy video-id="A" ${attributes}></ytd-watch-flexy>` });
  return document.querySelector('ytd-watch-flexy');
}

test('the two-column screen is a video page whose watch has the two-column mark and neither theater nor fullscreen', () => {
  const cases = [
    ['the two-column mark alone', 'is-two-columns_', true],
    ['no two-column mark', '', false],
    ['theater', 'is-two-columns_ theater', false],
    ['theater with full-bleed-player', 'is-two-columns_ theater full-bleed-player', false],
    ['the fullscreen mark', 'is-two-columns_ fullscreen', false],
    ['full-bleed-player alone is not a reason', 'is-two-columns_ full-bleed-player', true],
    ['the miniplayer mark is not a reason', 'is-two-columns_ miniplayer', true],
    ['a hidden watch still counts', 'is-two-columns_ hidden', true],
  ];
  for (const [name, attributes, expected] of cases) {
    const watch = watchPage(attributes);
    expect(isTwoColumnScreen(watch), name).toBe(expected);
    expect(watch.matches(TWO_COLUMN_SELECTOR), `${name}: selector`).toBe(expected);
    expect(NOT_TWO_COLUMN_SELECTORS.some(selector => watch.matches(selector)), `${name}: negated selectors`).toBe(!expected);
  }
  expect(isTwoColumnScreen(null)).toBe(false);
});

test('the two-column screen needs a video page and is not the browser fullscreen', () => {
  const watch = watchPage('is-two-columns_', 'https://www.youtube.com/');
  expect(isTwoColumnScreen(watch)).toBe(false);
  history.replaceState(null, '', '/shorts/abcdefghijk');
  expect(isTwoColumnScreen(watch)).toBe(false);
  history.replaceState(null, '', '/watch?v=A');
  expect(isTwoColumnScreen(watch)).toBe(true);
  stubProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  expect(isTwoColumnScreen(watch)).toBe(false);
});

test('a two-column watch left for another address counts as left only while it is still shown', () => {
  const watch = watchPage('is-two-columns_', 'https://www.youtube.com/');
  expect(isTwoColumnScreen(watch)).toBe(false);
  expect(isTwoColumnScreenLeft(watch)).toBe(true);
  history.replaceState(null, '', '/results?search_query=news');
  expect(isTwoColumnScreenLeft(watch)).toBe(true);
  expect(isWatchHidden(watch)).toBe(false);
  watch.setAttribute('hidden', '');
  expect(isTwoColumnScreenLeft(watch)).toBe(false);
  expect(isWatchHidden(watch)).toBe(true);
  expect(isWatchHidden(null)).toBe(true);
  watch.removeAttribute('hidden');
  watch.setAttribute('theater', '');
  expect(isTwoColumnScreenLeft(watch)).toBe(false);
  watch.removeAttribute('theater');
  watch.removeAttribute('is-two-columns_');
  expect(isTwoColumnScreenLeft(watch)).toBe(false);
  watch.setAttribute('is-two-columns_', '');
  history.replaceState(null, '', '/watch?v=A');
  expect(isTwoColumnScreenLeft(watch)).toBe(false);
  history.replaceState(null, '', '/');
  stubProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  expect(isTwoColumnScreenLeft(watch)).toBe(false);
  expect(isTwoColumnScreenLeft(null)).toBe(false);
});

test('the app element is found by the adapter', () => {
  loadPage({ body: '<ytd-app></ytd-app>' });
  expect(findApp()).toBe(document.querySelector('ytd-app'));
  loadPage({ body: '' });
  expect(findApp()).toBe(null);
});

test('fullscreen is the browser fullscreen or the watch fullscreen mark', () => {
  expect(isBrowserFullscreen()).toBe(false);
  expect(isFullscreen(watchPage('is-two-columns_'))).toBe(false);
  expect(isFullscreen(watchPage('fullscreen'))).toBe(true);
  expect(isFullscreen(null)).toBe(false);
  stubProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  expect(isFullscreen(null)).toBe(true);
  expect(isBrowserFullscreen()).toBe(true);
});

test('the screen attributes hold every attribute the two-column definition, its selectors and the page video read', () => {
  const named = selector => [...selector.matchAll(/\[([^\]=]+)\]/g)].map(match => match[1]);
  const fromSelectors = new Set([TWO_COLUMN_SELECTOR, ...NOT_TWO_COLUMN_SELECTORS].flatMap(named));
  expect(fromSelectors.size).toBeGreaterThan(0);
  for (const name of fromSelectors) expect(SCREEN_ATTRIBUTES, name).toContain(name);
  expect(SCREEN_ATTRIBUTES).toContain('video-id');
  for (const name of SCREEN_ATTRIBUTES.filter(name => name !== 'video-id')) {
    expect(fromSelectors, name).toContain(name);
  }
  for (const name of SCREEN_ATTRIBUTES.filter(name => name !== 'video-id')) {
    const on = watchPage(['is-two-columns_', name].join(' '));
    const off = watchPage(name === 'is-two-columns_' ? '' : 'is-two-columns_');
    expect(isTwoColumnScreen(on) !== isTwoColumnScreen(off), `${name} decides the answer`).toBe(true);
  }
});

function panelPage(inner) {
  loadPage({
    body: `<ytd-watch-flexy video-id="A"><div id="secondary"><div id="secondary-inner">${inner}</div></div></ytd-watch-flexy>`,
    clientRects: true,
  });
  return document.querySelector('ytd-watch-flexy');
}

test('a YouTube panel is an uncollapsed live chat or an expanded engagement panel other than the comments one, and it must be shown', () => {
  const expanded = target => `<ytd-engagement-panel-section-list-renderer target-id="${target}" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"></ytd-engagement-panel-section-list-renderer>`;
  const cases = [
    ['nothing', '', false],
    ['a live chat', '<ytd-live-chat-frame></ytd-live-chat-frame>', true],
    ['a live chat inside its container', '<div id="chat-container"><ytd-live-chat-frame></ytd-live-chat-frame></div>', true],
    ['a collapsed live chat', '<ytd-live-chat-frame collapsed></ytd-live-chat-frame>', false],
    ['an expanded panel', expanded('engagement-panel-structured-description'), true],
    ['the expanded comments panel', expanded('engagement-panel-comments-section'), false],
    ['a hidden panel', '<ytd-engagement-panel-section-list-renderer visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>', false],
  ];
  for (const [name, inner, expected] of cases) {
    expect(isYoutubePanelOpen(panelPage(inner)), name).toBe(expected);
  }
  expect(isYoutubePanelOpen(null)).toBe(false);
  const watch = panelPage('<ytd-live-chat-frame></ytd-live-chat-frame>');
  watch.querySelector('ytd-live-chat-frame').getClientRects = () => [];
  expect(isYoutubePanelOpen(watch)).toBe(false);
  expect(YOUTUBE_PANEL_ATTRIBUTES).toStrictEqual(['visibility', 'hidden', 'collapsed']);
});

test('the secondary column and the comments home are found by the adapter', () => {
  const watch = panelPage('');
  expect(findSecondaryInner(watch)).toBe(document.querySelector('#secondary-inner'));
  expect(findSecondaryInner(null)).toBe(null);
  expect(findCommentsHome(watch)).toBe(null);
  const { watch: full } = commentsPage('');
  expect(findCommentsHome(full)).toBe(document.querySelector('#below'));
  document.querySelector('#below').remove();
  expect(findCommentsHome(full)).toBe(document.querySelector('#primary'));
  expect(findCommentsHome(null)).toBe(null);
});

const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';

function engagement(title, targetId, extra = '') {
  const target = targetId ? ` target-id="${targetId}"` : '';
  return `<ytd-engagement-panel-section-list-renderer${target} visibility="${EXPANDED}"${extra}><ytd-engagement-panel-title-header-renderer><div id="header"><yt-formatted-string id="title-text">${title}</yt-formatted-string><div id="visibility-button"><button>x</button></div></div></ytd-engagement-panel-title-header-renderer></ytd-engagement-panel-section-list-renderer>`;
}

function chatDoc(title, { header = true } = {}) {
  const doc = document.implementation.createHTMLDocument('');
  if (header) {
    doc.body.innerHTML = `<yt-live-chat-header-renderer><span id="title"></span><div id="label-text">${title}</div><div id="close-button"><button>x</button></div></yt-live-chat-header-renderer>`;
  }
  return doc;
}

function chatPage(doc) {
  const watch = panelPage('<div id="chat-container"><ytd-live-chat-frame id="chat"><iframe></iframe></ytd-live-chat-frame></div>');
  const frame = watch.querySelector('iframe');
  const holder = { doc };
  stubProperty(frame, 'contentDocument', { get: () => holder.doc });
  return { watch, chat: watch.querySelector('ytd-live-chat-frame'), frame, holder };
}

test('YouTube panels are found in the order YouTube stacks them with their kind, and a panel that is not shown is left out', () => {
  const watch = panelPage([
    engagement('Video info', null),
    engagement('Comments', 'engagement-panel-comments-section'),
    '<ytd-engagement-panel-section-list-renderer visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>',
    engagement('Questions', 'PAyouchat'),
    '<div id="chat-container"><ytd-live-chat-frame id="chat"></ytd-live-chat-frame></div>',
  ].join(''));
  const found = findYoutubePanels(watch);
  expect(found.map(panel => panel.kind)).toStrictEqual(['engagement', 'engagement', CHAT_PANEL]);
  expect(found.map(panel => panel.element.getAttribute('target-id'))).toStrictEqual([null, 'PAyouchat', null]);
  expect(findYoutubePanels(null)).toStrictEqual([]);
  expect(findYoutubePanels(panelPage('<ytd-live-chat-frame collapsed></ytd-live-chat-frame>'))).toStrictEqual([]);
  const unshown = panelPage(engagement('Video info', null));
  unshown.querySelector('ytd-engagement-panel-section-list-renderer').getClientRects = () => [];
  expect(findYoutubePanels(unshown)).toStrictEqual([]);
});

test('an engagement panel is titled by its header, even among panels that repeat the same ids', () => {
  const watch = panelPage(engagement('Video info', null) + engagement('Questions', 'PAyouchat') + '<ytd-engagement-panel-section-list-renderer visibility="' + EXPANDED + '"></ytd-engagement-panel-section-list-renderer>');
  const found = findYoutubePanels(watch);
  expect(found.map(youtubePanelTitle)).toStrictEqual(['Video info', 'Questions', '']);
});

test('a chat is titled by the header inside its frame, falling back to the plain title, and no title is empty', () => {
  const { chat, holder } = chatPage(chatDoc('Top chat replay'));
  const panel = { element: chat, kind: CHAT_PANEL };
  expect(youtubePanelTitle(panel)).toBe('Top chat replay');
  holder.doc = chatDoc('');
  holder.doc.querySelector('#title').textContent = ' Live  chat ';
  expect(youtubePanelTitle(panel)).toBe('Live chat');
  holder.doc = chatDoc('', { header: false });
  expect(youtubePanelTitle(panel)).toBe('');
  holder.doc = null;
  expect(youtubePanelTitle(panel)).toBe('');
  stubProperty(chat.querySelector('iframe'), 'contentDocument', { get: () => { throw new Error('cross-origin'); } });
  expect(youtubePanelTitle(panel)).toBe('');
});

test('watching a chat title reports header changes, a reloaded frame and a header that shows up late, until stopped', async () => {
  const { frame, holder } = chatPage(chatDoc('Top chat replay'));
  const changed = vi.fn();
  const stop = watchChatTitle(frame, changed);
  holder.doc.querySelector('#label-text').textContent = 'Live chat replay';
  await advance(0);
  expect(changed).toHaveBeenCalledTimes(1);

  changed.mockClear();
  holder.doc = chatDoc('', { header: false });
  frame.dispatchEvent(new Event('load'));
  expect(changed).toHaveBeenCalledTimes(1);
  holder.doc.body.innerHTML = '<yt-live-chat-header-renderer><div id="label-text">Late</div></yt-live-chat-header-renderer>';
  await advance(0);
  expect(changed).toHaveBeenCalledTimes(2);
  holder.doc.querySelector('#label-text').textContent = 'Later';
  await advance(0);
  expect(changed).toHaveBeenCalledTimes(3);

  stop();
  changed.mockClear();
  holder.doc.querySelector('#label-text').textContent = 'After stop';
  frame.dispatchEvent(new Event('load'));
  await advance(0);
  expect(changed).not.toHaveBeenCalled();
});

test('the frame of a chat is found when it exists, and watching a frame without a readable document waits for its load', () => {
  const watch = panelPage('<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>');
  const bare = watch.querySelector('ytd-live-chat-frame');
  expect(findChatFrame(bare)).toBe(null);
  expect(findChatFrame(null)).toBe(null);
  const { chat, frame, holder } = chatPage(null);
  expect(findChatFrame(chat)).toBe(frame);
  const changed = vi.fn();
  const stop = watchChatTitle(frame, changed);
  holder.doc = chatDoc('Chat');
  frame.dispatchEvent(new Event('load'));
  expect(changed).toHaveBeenCalledTimes(1);
  stop();
  const empty = chatPage(null);
  empty.holder.doc = { querySelector: () => null, documentElement: null };
  const stopEmpty = watchChatTitle(empty.frame, vi.fn());
  expect(() => stopEmpty()).not.toThrow();
});

test('requests to open an engagement panel are reported with the panel and its title, and nothing else is', () => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const requests = [];
  watchPanelRequests(request => requests.push(request), controller.signal);
  const send = (actionName, args) => document.dispatchEvent(new CustomEvent('yt-action', { detail: { actionName, args } }));
  send('yt-engagement-panel-visible-changed', [{ targetId: 'info', header: { engagementPanelTitleHeaderRenderer: { title: { runs: [{ text: 'Video ' }, { text: 'info' }] } } } }]);
  send('yt-engagement-panel-visible-changed', [{}]);
  send('yt-engagement-panel-visible-changed', undefined);
  send('yt-navigate', [{ targetId: 'x' }]);
  document.dispatchEvent(new CustomEvent('yt-action'));
  expect(requests).toStrictEqual([
    { targetId: 'info', title: 'Video info' },
    { targetId: '', title: '' },
    { targetId: '', title: '' },
  ]);
  controller.abort();
  send('yt-engagement-panel-visible-changed', [{ targetId: 'later' }]);
  expect(requests).toHaveLength(3);
});

test('a request finds its panel by target id first, then by title, among engagement panels only', () => {
  const watch = panelPage(engagement('Video info', 'info') + engagement('Questions', 'PAyouchat') + engagement('Video info', null) + '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>');
  const panels = findYoutubePanels(watch);
  const [info, questions, untargeted] = panels;
  expect(panelOfRequest(panels, { targetId: 'PAyouchat', title: 'Video info' })).toBe(questions);
  expect(panelOfRequest(panels, { targetId: 'unknown', title: 'Questions' })).toBe(questions);
  expect(panelOfRequest(panels, { targetId: '', title: 'Video info' })).toBe(info);
  expect(untargeted).toBeTruthy();
  expect(panelOfRequest(panels, { targetId: 'unknown', title: 'Nothing' })).toBe(null);
  expect(panelOfRequest(panels, { targetId: '', title: '' })).toBe(null);
  expect(panelOfRequest([], { targetId: 'info', title: '' })).toBe(null);
});
