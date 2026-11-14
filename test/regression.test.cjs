const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../tubekit.user.js'), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t, {
  disabled = false,
  disabledText = 'Comments are turned off',
  innerWidth = 1440,
  primary = { width: 900, left: 0, right: 900 },
  secondary = { width: 400, left: 920, right: 1320 },
  expectRoot = true,
  htmlAttrs = '',
} = {}) {
  const content = disabled
    ? `<ytd-message-renderer>${disabledText}</ytd-message-renderer>`
    : '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
  const dom = new JSDOM(`<html lang="en" ${htmlAttrs}><head></head><body><ytd-app>
    <ytd-watch-flexy video-id="A"><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
      <ytd-comments id="comments">${content}</ytd-comments>
    </div></div><div id="secondary"><div id="secondary-inner">
      <div id="related">related</div>
    </div></div></ytd-watch-flexy></ytd-app></body></html>`, {
    url: 'https://www.youtube.com/watch?v=A',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.innerWidth = innerWidth;
  // jsdom has no layout engine: supply the supported two-column geometry.
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.id === 'primary'
      ? primary
      : secondary;
  };
  // Count evaluations without changing the production script's behavior.
  w.eval(script.replace('function evaluate() {', 'function evaluate() { window.evaluationCount = (window.evaluationCount || 0) + 1;'));
  await sleep(200);
  if (expectRoot) assert.ok(w.document.querySelector('#tubekit-root'));
  return { w, document: w.document, watch: w.document.querySelector('ytd-watch-flexy') };
}

function newComments(document) {
  const node = document.createElement('ytd-comments');
  node.id = 'comments';
  node.innerHTML = '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
  return node;
}

function removeMarkers(document) {
  const walker = document.createTreeWalker(document, 128);
  const markers = [];
  while (walker.nextNode()) {
    if (walker.currentNode.data.startsWith('tubekit:')) markers.push(walker.currentNode);
  }
  markers.forEach(node => node.remove());
}

function selected(document) {
  return document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
}

async function theater(watch) {
  watch.setAttribute('theater', '');
  await sleep(200);
}

test('iPad Pro 11-inch Sidecar landscape creates the panel at 1194px', async t => {
  const { document } = await setup(t, {
    innerWidth: 1194,
    primary: { width: 780, left: 16, right: 796 },
    secondary: { width: 398, left: 796, right: 1194 },
  });
  assert.ok(document.querySelector('#tubekit-root'));
});

test('viewport below 1000px does not create the panel', async t => {
  const { document } = await setup(t, { innerWidth: 999, expectRoot: false });
  assert.equal(document.querySelector('#tubekit-root'), null);
});

test('idle DOM settles instead of repeatedly evaluating', async t => {
  const { w } = await setup(t);
  const count = w.evaluationCount;
  await sleep(400);
  assert.equal(w.evaluationCount, count);
});

test('detached panel is recreated and retains native content', async t => {
  const { document } = await setup(t);
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  const root = document.querySelector('#tubekit-root');
  root.remove();
  await sleep(200);
  assert.notEqual(document.querySelector('#tubekit-root'), root);
  assert.equal(document.querySelector('#tubekit-comments-pane #comments'), comments);
  assert.equal(document.querySelector('#tubekit-related-pane #related'), related);
});

test('secondary container replacement recovers with the new related content', async t => {
  const { document } = await setup(t);
  const comments = document.querySelector('#comments');
  const inner = document.createElement('div');
  inner.id = 'secondary-inner';
  inner.innerHTML = '<div id="related">new related</div>';
  document.querySelector('#secondary-inner').replaceWith(inner);
  await sleep(200);
  assert.ok(inner.querySelector('#tubekit-root'));
  assert.equal(document.querySelector('#tubekit-comments-pane #comments'), comments);
  assert.equal(document.querySelector('#related').textContent, 'new related');
  assert.equal(document.querySelectorAll('#related').length, 1);
});

test('replacement comments are adopted and observed', async t => {
  const { document } = await setup(t);
  document.querySelector('#comments').remove();
  const replacement = newComments(document);
  replacement.replaceChildren();
  document.querySelector('#below').append(replacement);
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-comments-pane #comments'), replacement);
  assert.ok(document.querySelector('.tubekit-status'));
  replacement.append(document.createElement('ytd-comments-header-renderer'));
  await sleep(350);
  assert.equal(document.querySelector('.tubekit-status'), null);
});

test('native reparenting of the existing comments is repaired', async t => {
  const { document } = await setup(t);
  const comments = document.querySelector('#comments');
  document.querySelector('#below').append(comments);
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-comments-pane #comments'), comments);
  assert.equal(document.querySelectorAll('#comments').length, 1);
});

test('missing markers restore both native nodes on teardown', async t => {
  const { document, watch } = await setup(t);
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  removeMarkers(document);
  await theater(watch);
  assert.equal(document.querySelector('#below #comments'), comments);
  assert.equal(document.querySelector('#secondary-inner > #related'), related);
  assert.equal(document.querySelector('#tubekit-root'), null);
});

test('lost original parent falls back to the current primary content area', async t => {
  const { document, watch } = await setup(t);
  const comments = document.querySelector('#comments');
  const below = document.createElement('div');
  below.id = 'below';
  document.querySelector('#below').replaceWith(below);
  await theater(watch);
  assert.equal(below.querySelector('#comments'), comments);
});

test('teardown preserves fresh native content without restoring duplicates', async t => {
  const { document, watch } = await setup(t);
  const freshComments = newComments(document);
  const freshRelated = document.createElement('div');
  freshRelated.id = 'related';
  document.querySelector('#below').append(freshComments);
  document.querySelector('#secondary-inner').append(freshRelated);
  await theater(watch);
  assert.equal(document.querySelector('#comments'), freshComments);
  assert.equal(document.querySelector('#related'), freshRelated);
  assert.equal(document.querySelectorAll('#comments').length, 1);
  assert.equal(document.querySelectorAll('#related').length, 1);
});

test('old video content is not restored into a reused watch renderer', async t => {
  const { w, document, watch } = await setup(t);
  const oldComments = document.querySelector('#comments');
  w.history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  await sleep(200);
  assert.equal(oldComments.isConnected, false);
  assert.equal(document.querySelector('#primary #comments'), null);
});

test('unavailable timer from the previous video cannot switch the new tab', async t => {
  const { w, document, watch } = await setup(t, { disabled: true });
  document.dispatchEvent(new w.Event('yt-navigate-start'));
  w.history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.querySelector('#comments').replaceWith(newComments(document));
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  await sleep(1000);
  assert.equal(selected(document), 'comments');
});

test('unavailable comments still switch to related on the current video', async t => {
  const { document } = await setup(t, { disabled: true });
  await sleep(850);
  assert.equal(selected(document), 'related');
});

test('unavailable comments are detected structurally in any language', async t => {
  const { document } = await setup(t, { disabled: true, disabledText: 'コメントはオフになっています。' });
  await sleep(850);
  assert.equal(selected(document), 'related');
});

test('comments with a header are not unavailable even when a message is present', async t => {
  const { document } = await setup(t);
  document.querySelector('#comments').insertAdjacentHTML('beforeend', '<ytd-message-renderer>Kommentare sind deaktiviert.</ytd-message-renderer>');
  await sleep(1200);
  assert.equal(selected(document), 'comments');
});

test('DOM changes off the watch page skip evaluation, and returning to /watch restores the panel', async t => {
  const { w, document } = await setup(t);
  document.dispatchEvent(new w.Event('yt-navigate-start'));
  w.history.pushState({}, '', '/');
  await sleep(400);
  assert.equal(document.querySelector('#tubekit-root'), null);
  const count = w.evaluationCount;
  document.querySelector('ytd-app').appendChild(document.createElement('div'));
  await sleep(400);
  assert.equal(w.evaluationCount, count);
  w.history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  await sleep(500);
  assert.ok(document.querySelector('#tubekit-root'));
});

test('thread-only comments without a header are not unavailable', async t => {
  const { document } = await setup(t);
  const comments = document.querySelector('#comments');
  comments.innerHTML = '<ytd-message-renderer>Kommentare sind deaktiviert.</ytd-message-renderer><ytd-comment-thread-renderer></ytd-comment-thread-renderer>';
  await sleep(1300);
  assert.equal(selected(document), 'comments');
});

test('booting off the watch page ignores DOM changes, then builds the panel on /watch', async t => {
  const dom = new JSDOM('<html lang="en"><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const document = w.document;
  w.innerWidth = 1440;
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.id === 'primary' ? { width: 900, left: 0, right: 900 } : { width: 400, left: 920, right: 1320 };
  };
  w.eval(script.replace('function evaluate() {', 'function evaluate() { window.evaluationCount = (window.evaluationCount || 0) + 1;'));
  await sleep(400);
  let count = w.evaluationCount || 0;
  document.body.appendChild(document.createElement('div'));
  await sleep(400);
  assert.equal(w.evaluationCount || 0, count);
  const app = document.createElement('ytd-app');
  document.body.appendChild(app);
  await sleep(400);
  count = w.evaluationCount || 0;
  app.appendChild(document.createElement('div'));
  await sleep(400);
  assert.equal(w.evaluationCount || 0, count);
  w.history.pushState({}, '', '/watch?v=A');
  app.innerHTML = `<ytd-watch-flexy video-id="A"><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
    <ytd-comments id="comments"><ytd-comments-header-renderer></ytd-comments-header-renderer></ytd-comments></div></div>
    <div id="secondary"><div id="secondary-inner"><div id="related">related</div></div></div></ytd-watch-flexy>`;
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  await sleep(500);
  assert.ok(document.querySelector('#tubekit-root'));
});

test('keyboard arrows wrap and Home/End activate and focus the target tab', async t => {
  const { w, document } = await setup(t);
  document.querySelector('#tubekit-comments-tab').focus();
  for (const [key, expected] of [['ArrowRight', 'related'], ['ArrowRight', 'comments'],
    ['ArrowLeft', 'related'], ['Home', 'comments'], ['End', 'related']]) {
    const event = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(selected(document), expected);
    assert.equal(document.activeElement.dataset.tab, expected);
    assert.equal(document.querySelectorAll('[role="tab"][tabindex="0"]').length, 1);
  }
});

test('special panels release rail clipping and closing them restores the panel', async t => {
  const { w, document } = await setup(t);
  const secondary = document.querySelector('#secondary');
  assert.equal(w.getComputedStyle(secondary).overflow, 'hidden');
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  document.querySelector('#secondary-inner').append(panel);
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'true');
  assert.notEqual(w.getComputedStyle(secondary).overflow, 'hidden');
  panel.remove();
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
  assert.equal(w.getComputedStyle(secondary).overflow, 'hidden');
});

test('selected tab survives leaving and re-entering the layout on the same video', async t => {
  const { document, watch } = await setup(t);
  document.querySelector('#tubekit-related-tab').click();
  await theater(watch);
  assert.equal(document.querySelector('#tubekit-root'), null);
  watch.removeAttribute('theater');
  await sleep(200);
  assert.ok(document.querySelector('#tubekit-root'));
  assert.equal(selected(document), 'related');
});

test('related moved by YouTube into the one-column layout stays before the restored comments', async t => {
  const { w, document } = await setup(t);
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  // One-column YouTube puts related right before comments, which now live inside the panel.
  comments.before(related);
  w.innerWidth = 800;
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), null);
  assert.equal(document.querySelector('#below').children[0], related);
  assert.equal(related.nextElementSibling, comments);
  assert.equal(document.querySelector('#secondary-inner #related'), null);
  assert.equal(document.querySelectorAll('#related').length, 1);
  assert.equal(document.querySelectorAll('#comments').length, 1);

  // Back to two columns: YouTube returns related to the secondary column and the panel is reapplied.
  w.innerWidth = 1440;
  document.querySelector('#secondary-inner').append(related);
  document.querySelector('ytd-watch-flexy').setAttribute('is-two-columns_', '');
  await sleep(300);
  assert.ok(document.querySelector('#tubekit-root'));
  assert.equal(document.querySelector('#tubekit-comments-pane #comments'), comments);
  assert.equal(document.querySelector('#tubekit-related-pane #related'), related);
});

test('related moved outside the panel by YouTube is not pulled back into the hidden secondary column', async t => {
  const { w, document } = await setup(t);
  const related = document.querySelector('#related');
  document.querySelector('#below').append(related);
  w.innerWidth = 800;
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), null);
  assert.equal(document.querySelector('#below > #related'), related);
  assert.equal(document.querySelector('#secondary-inner #related'), null);
});

test('navigating to another video resets the selected tab to comments', async t => {
  const { w, document, watch } = await setup(t);
  document.querySelector('#tubekit-related-tab').click();
  document.dispatchEvent(new w.Event('yt-navigate-start'));
  w.history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.querySelector('#below').append(newComments(document));
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  await sleep(300);
  assert.ok(document.querySelector('#tubekit-root'));
  assert.equal(selected(document), 'comments');
});

const SYS = n => `var(--yt-sys-color-baseline--${n}, `;
function expectedTokens(d) {
  return new Map([
    ['bg', `${SYS('base-background')}var(--yt-spec-base-background, ${d.bg}))`],
    ['text', `${SYS('text-primary')}var(--yt-spec-text-primary, ${d.text}))`],
    ['text-secondary', `${SYS('text-secondary')}var(--yt-spec-text-secondary, ${d.secondary}))`],
    ['outline', `${SYS('outline')}var(--yt-spec-10-percent-layer, ${d.outline}))`],
    ['hover', `${SYS('additive-background')}var(--yt-spec-10-percent-layer, ${d.hover}))`],
    ['selected', `${SYS('button-chip-background-hover')}var(--yt-spec-badge-chip-background, ${d.selected}))`],
    ['toast-bg', `${SYS('inverted-background')}${d.toastBg})`],
    ['toast-text', `${SYS('text-primary-inverse')}var(--yt-spec-text-primary-inverse, ${d.toastText}))`],
  ]);
}
const LIGHT = { bg: '#fff', text: '#0f0f0f', secondary: '#606060', outline: 'rgba(0, 0, 0, .1)', hover: 'rgba(0, 0, 0, .05)', selected: 'rgba(0, 0, 0, .1)', toastBg: '#0f0f0f', toastText: '#fff' };
const DARK = { bg: '#0f0f0f', text: '#f1f1f1', secondary: '#aaa', outline: 'rgba(255, 255, 255, .2)', hover: 'rgba(255, 255, 255, .1)', selected: 'rgba(255, 255, 255, .2)', toastBg: '#f1f1f1', toastText: '#0f0f0f' };

function parseTokens(block) {
  const map = new Map();
  for (const m of block.matchAll(/--tubekit-([\w-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function checkStyles(css) {
  const lightRule = css.match(/#tubekit-root \{[^}]*\}/);
  const darkRule = css.match(/html\[dark\] #tubekit-root \{[^}]*\}/);
  assert.ok(lightRule && darkRule, 'light and dark rules exist');
  assert.match(darkRule[0], /color-scheme: dark;/);
  const light = parseTokens(lightRule[0]);
  const dark = parseTokens(darkRule[0]);
  assert.deepEqual([...light.keys()].sort(), [...dark.keys()].sort());
  assert.deepEqual(light, expectedTokens(LIGHT));
  assert.deepEqual(dark, expectedTokens(DARK));
  assert.match(lightRule[0], /color: var\(--tubekit-text\);/);
  assert.match(lightRule[0], /background: var\(--tubekit-bg\);/);
  assert.match(css.match(/#tubekit-tabs \{[^}]*\}/)[0], /background: var\(--tubekit-bg\);/);
  assert.match(css.match(/#tubekit-toast \{[^}]*\}/)[0], /background: var\(--tubekit-toast-bg\);/);
  const rest = css.replace(lightRule[0], '').replace(darkRule[0], '');
  assert.doesNotMatch(rest, /--yt-spec-|--yt-sys-/);
}

test('dark mode: panel tokens have exact light/dark fallbacks and elements use them', async t => {
  const { document } = await setup(t, { htmlAttrs: 'dark' });
  checkStyles(document.getElementById('tubekit-styles').textContent);
});

test('mutations inside adopted comments do not trigger evaluation', async t => {
  const { w, document } = await setup(t);
  const count = w.evaluationCount;
  const comments = document.querySelector('#comments');
  for (let i = 0; i < 5; i++) {
    comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
    await sleep(30);
  }
  await sleep(300);
  assert.equal(w.evaluationCount, count);
});

test('evaluation is deferred while the pane is scrolling', async t => {
  const { w, document } = await setup(t);
  const count = w.evaluationCount;
  document.querySelector('#tubekit-comments-pane').dispatchEvent(new w.Event('scroll'));
  document.querySelector('#below').appendChild(document.createElement('div'));
  await sleep(100);
  assert.equal(w.evaluationCount, count);
  await sleep(200);
  assert.ok(w.evaluationCount > count);
});

test('removing comments from the pane is still detected', async t => {
  const { document } = await setup(t);
  assert.equal(document.querySelector('.tubekit-status'), null);
  document.querySelector('#comments').remove();
  await sleep(300);
  assert.ok(document.querySelector('.tubekit-status'));
});

test('mutations on nodes removed within the same batch do not trigger evaluation', async t => {
  const { w, document } = await setup(t);
  const count = w.evaluationCount;
  const comments = document.querySelector('#comments');
  const div = document.createElement('div');
  comments.appendChild(div);
  div.appendChild(document.createElement('span'));
  div.remove();
  await sleep(300);
  assert.equal(w.evaluationCount, count);
});

test('comment mutation bursts are checked at most once per throttle window', async t => {
  const { w, document } = await setup(t);
  const comments = document.querySelector('#comments');
  let calls = 0;
  const original = comments.querySelector;
  comments.querySelector = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  for (let i = 0; i < 10; i++) comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => w.requestAnimationFrame(resolve));
    comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
  }
  assert.equal(calls, 0);
  await sleep(400);
  assert.ok(calls > 0 && calls <= 4, `querySelector calls: ${calls}`);
});

test('mutations inside the player do not trigger evaluation', async t => {
  const { w, document } = await setup(t);
  const count = w.evaluationCount;
  const player = document.querySelector('#movie_player');
  for (let i = 0; i < 5; i++) {
    player.appendChild(document.createElement('div'));
    await sleep(30);
  }
  await sleep(300);
  assert.equal(w.evaluationCount, count);
});

test('mutations outside the player still trigger evaluation', async t => {
  const { w, document } = await setup(t);
  const count = w.evaluationCount;
  document.querySelector('#below').appendChild(document.createElement('div'));
  await sleep(300);
  assert.ok(w.evaluationCount > count);
});

test('scroll events do not read scrollTop and tab switching restores each position', async t => {
  const { w, document } = await setup(t);
  const spy = pane => {
    const spyState = { reads: 0, value: 0 };
    Object.defineProperty(pane, 'scrollTop', {
      configurable: true,
      get() { spyState.reads++; return spyState.value; },
      set(v) { spyState.value = v; },
    });
    return spyState;
  };
  const commentsPane = document.querySelector('#tubekit-comments-pane');
  const relatedPane = document.querySelector('#tubekit-related-pane');
  const comments = spy(commentsPane);
  const related = spy(relatedPane);
  const raf = () => new Promise(resolve => w.requestAnimationFrame(resolve));

  comments.value = 300;
  comments.reads = 0;
  commentsPane.dispatchEvent(new w.Event('scroll'));
  relatedPane.dispatchEvent(new w.Event('scroll'));
  assert.equal(comments.reads, 0);
  assert.equal(related.reads, 0);

  const tab = name => document.querySelector(`[role="tab"][data-tab="${name}"]`);
  tab('related').click();
  await raf();
  await raf();
  related.value = 700;
  tab('comments').click();
  await raf();
  await raf();
  assert.equal(comments.value, 300);
  tab('related').click();
  await raf();
  await raf();
  assert.equal(related.value, 700);
});

test('long comment and related lists skip off-screen rendering', async t => {
  const { document } = await setup(t);
  const css = document.getElementById('tubekit-styles').textContent;
  assert.match(css, /ytd-comment-thread-renderer[^{]*\{[^}]*content-visibility: auto;/);
  assert.match(css, /yt-lockup-view-model[^{]*\{[^}]*content-visibility: auto;/);
});

test('emoji picker is not clipped inside the comments pane', async t => {
  const { document } = await setup(t);
  const css = document.getElementById('tubekit-styles').textContent;
  assert.match(css, /ytd-comment-thread-renderer:has\(ytd-commentbox\[is-emoji-picker-displayed\]\)[^{]*\{[^}]*content-visibility: visible;/);
  assert.match(css, /ytd-commentbox #emojis[^{]*\{[^}]*width: auto !important;[^}]*max-width: 100% !important;/);
  assert.match(css, /yt-emoji-picker-renderer #search-panel[^{]*\{[^}]*width: 100% !important;/);
});

function spyScrollTop(pane) {
  const spyState = { value: 0, hidden: false };
  Object.defineProperty(pane, 'scrollTop', {
    configurable: true,
    get() { return spyState.hidden ? 0 : spyState.value; },
    set(v) { spyState.value = v; },
  });
  return spyState;
}

test('re-selecting the same tab keeps the scroll position', async t => {
  const { w, document } = await setup(t);
  const comments = spyScrollTop(document.querySelector('#tubekit-comments-pane'));
  const raf = () => new Promise(resolve => w.requestAnimationFrame(resolve));
  comments.value = 300;
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  await raf();
  await raf();
  assert.equal(comments.value, 300);
});

test('scroll position survives opening and closing a special panel on both tabs', async t => {
  const { w, document } = await setup(t);
  const raf = () => new Promise(resolve => w.requestAnimationFrame(resolve));
  const panes = {
    comments: spyScrollTop(document.querySelector('#tubekit-comments-pane')),
    related: spyScrollTop(document.querySelector('#tubekit-related-pane')),
  };
  for (const tab of ['comments', 'related']) {
    document.querySelector(`[role="tab"][data-tab="${tab}"]`).click();
    await raf();
    await raf();
    panes[tab].value = 300;
    const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    document.querySelector('#secondary-inner').append(panel);
    await sleep(200);
    assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'true');
    panes[tab].hidden = true;
    panel.remove();
    await sleep(200);
    panes[tab].hidden = false;
    await raf();
    await raf();
    assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
    assert.equal(panes[tab].value, 300, `${tab} scroll restored`);
  }
});

function shortsPage(t, url) {
  const dom = new JSDOM('<html><head></head><body><ytd-app><div id="x"></div></ytd-app></body></html>', {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const target = 'function redirectTo(url) {';
  assert.ok(script.includes(target), 'redirectTo instrumentation target exists in the build');
  w.redirects = [];
  w.eval(script.replace(target, 'function redirectTo(url) { window.redirects.push(url); return;'));
  return w;
}

function shortsEvent(w, endpoint) {
  const event = new w.CustomEvent('yt-navigate', { bubbles: true, detail: { endpoint } });
  w.document.querySelector('#x').dispatchEvent(event);
  return event;
}

test('shorts: yt-navigate with reelWatchEndpoint is rewritten to a watch endpoint', t => {
  const w = shortsPage(t, 'https://www.youtube.com/results?search_query=a');
  const event = shortsEvent(w, {
    clickTrackingParams: 'ctp',
    commandMetadata: { webCommandMetadata: { url: '/shorts/abcdefghijk', webPageType: 'WEB_PAGE_TYPE_SHORTS', rootVe: 37414 } },
    reelWatchEndpoint: { videoId: 'abcdefghijk' },
  });
  const ep = event.detail.endpoint;
  assert.equal(ep.watchEndpoint.videoId, 'abcdefghijk');
  assert.equal(ep.commandMetadata.webCommandMetadata.url, '/watch?v=abcdefghijk');
  assert.equal(ep.commandMetadata.webCommandMetadata.webPageType, 'WEB_PAGE_TYPE_WATCH');
  assert.equal(ep.clickTrackingParams, 'ctp');
  assert.equal(ep.reelWatchEndpoint, undefined);
});

test('shorts: yt-navigate without reelWatchEndpoint is left alone', t => {
  const w = shortsPage(t, 'https://www.youtube.com/results?search_query=a');
  const endpoint = { watchEndpoint: { videoId: 'abcdefghijk' } };
  const event = shortsEvent(w, endpoint);
  assert.equal(event.detail.endpoint, endpoint);
  assert.deepEqual(event.detail.endpoint, { watchEndpoint: { videoId: 'abcdefghijk' } });
});

test('shorts: opening /shorts/<id> redirects to /watch keeping other params and hash', t => {
  const w = shortsPage(t, 'https://www.youtube.com/shorts/abcdefghijk?t=5&tubekit-dev=1#x');
  assert.deepEqual(w.redirects, ['/watch?v=abcdefghijk&t=5&tubekit-dev=1#x']);
});

test('shorts: SPA arrival at /shorts/<id> redirects on yt-navigate-finish and popstate', t => {
  const w = shortsPage(t, 'https://www.youtube.com/results');
  w.history.pushState({}, '', '/shorts/abcdefghijk');
  w.document.dispatchEvent(new w.CustomEvent('yt-navigate-finish'));
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.deepEqual(w.redirects, ['/watch?v=abcdefghijk', '/watch?v=abcdefghijk']);
});

test('shorts: normal pages and invalid ids do not redirect', t => {
  const w = shortsPage(t, 'https://www.youtube.com/watch?v=A');
  w.document.dispatchEvent(new w.CustomEvent('yt-navigate-finish'));
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  w.history.pushState({}, '', '/shorts/');
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  w.history.pushState({}, '', '/shorts/bad');
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.deepEqual(w.redirects, []);
});

test('shorts mobile: navigate event is rewritten (endpoint and href)', t => {
  const w = shortsPage(t, 'https://m.youtube.com/results?search_query=a');
  const fire = detail => {
    const event = new w.CustomEvent('navigate', { detail });
    w.dispatchEvent(event);
    return event;
  };
  const event = fire({
    href: '/shorts/abcdefghijk',
    endpoint: {
      clickTrackingParams: 'ctp',
      commandMetadata: { webCommandMetadata: { url: '/shorts/abcdefghijk', webPageType: 'WEB_PAGE_TYPE_SHORTS' } },
      reelWatchEndpoint: { videoId: 'abcdefghijk' },
    },
  });
  const ep = event.detail.endpoint;
  assert.equal(ep.watchEndpoint.videoId, 'abcdefghijk');
  assert.equal(ep.commandMetadata.webCommandMetadata.webPageType, 'WEB_PAGE_TYPE_WATCH');
  assert.equal(ep.reelWatchEndpoint, undefined);
  assert.equal(event.detail.href, '/watch?v=abcdefghijk');

  const endpoint = { watchEndpoint: { videoId: 'abcdefghijk' } };
  const other = fire({ href: '/watch?v=abcdefghijk', endpoint });
  assert.equal(other.detail.endpoint, endpoint);
  assert.equal(other.detail.href, '/watch?v=abcdefghijk');
});

test('shorts mobile: opening /shorts/<id> redirects to /watch', t => {
  const w = shortsPage(t, 'https://m.youtube.com/shorts/abcdefghijk?ra=m');
  assert.deepEqual(w.redirects, ['/watch?v=abcdefghijk&ra=m']);
});

test('shorts mobile: SPA arrival redirects on state-navigateend', t => {
  const w = shortsPage(t, 'https://m.youtube.com/results');
  w.history.pushState({}, '', '/shorts/abcdefghijk');
  w.dispatchEvent(new w.CustomEvent('state-navigateend'));
  assert.deepEqual(w.redirects, ['/watch?v=abcdefghijk']);
});

test('shorts mobile: right rail comments panel does not run on m.youtube.com', t => {
  const w = shortsPage(t, 'https://m.youtube.com/watch?v=A');
  assert.equal(w.document.querySelector('#tubekit-styles'), null);
  assert.equal(w.document.querySelector('#tubekit-root'), null);
});

const QUALITY_DATA = [
  { quality: 'auto', isPlayable: true },
  { quality: 'hd2160', isPlayable: false, formatId: { itag: 313 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 137 } },
  { quality: 'hd1080', isPlayable: true, formatId: { itag: 999 }, paygatedQualityDetails: { name: 'Premium' } },
  { quality: 'hd720', isPlayable: true, formatId: { itag: 136 } },
];

function qualityPage(t, {
  url = 'https://www.youtube.com/watch?v=A',
  data = QUALITY_DATA,
  state = -1,
  inPlayer = true,
  withPlayer = true,
  videoId = 'v1',
} = {}) {
  const dom = new JSDOM(`<html><head></head><body><div id="movie_player">${inPlayer ? '<video></video>' : ''}</div>${inPlayer ? '' : '<video id="outside"></video>'}</body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const player = w.document.querySelector('#movie_player');
  w.calls = [];
  if (withPlayer) {
    player.getAvailableQualityData = () => data;
    player.setPlaybackQualityRange = (...args) => { w.calls.push(args); w.order && w.order.push('set'); };
    player.getPlayerState = () => state;
    w.quality = 'hd720';
    w.order = [];
    w.time = 42;
    player.getCurrentTime = () => w.time;
    player.stopVideo = () => w.order.push('stop');
    player.seekTo = (...a) => w.order.push(['seek', ...a]);
    player.playVideo = () => w.order.push('play');
    player.getPlaybackQuality = () => w.quality;
    w.videoId = videoId;
    player.getVideoData = () => ({ video_id: w.videoId });
  }
  w.eval(script);
  const fire = (type, el = w.document.querySelector('video')) => el.dispatchEvent(new w.Event(type));
  return { w, fire };
}

test('max-quality: picks the highest playable quality and prefers the premium format', t => {
  const { w, fire } = qualityPage(t);
  fire('playing');
  assert.deepEqual(w.calls, [['hd1080', 'hd1080', { itag: 999 }]]);
});

test('max-quality: normal entry gets no formatId; unplayable and unknown entries are skipped', t => {
  const { w, fire } = qualityPage(t, {
    data: [
      { quality: 'auto', isPlayable: true },
      { quality: 'hd2160', isPlayable: false },
      { quality: 'hd1080', isPlayable: true, formatId: { itag: 137 } },
      { quality: 'hd720', isPlayable: true },
    ],
  });
  fire('playing');
  assert.deepEqual(w.calls, [['hd1080', 'hd1080']]);
});

test('max-quality: pause/resume and same-video media reloads do not re-apply; a new video id does', t => {
  const { w, fire } = qualityPage(t);
  fire('playing');
  fire('playing');
  assert.equal(w.calls.length, 1);
  // Quality change makes YouTube reload the media of the same video.
  fire('emptied');
  fire('loadstart');
  fire('playing');
  assert.equal(w.calls.length, 1);
  w.videoId = 'v2';
  fire('emptied');
  fire('loadstart');
  fire('playing');
  assert.equal(w.calls.length, 2);
});

test('max-quality: ad-showing is skipped and the main video applies after the ad', t => {
  const { w, fire } = qualityPage(t);
  const player = w.document.querySelector('#movie_player');
  player.classList.add('ad-showing');
  w.videoId = 'ad';
  fire('playing');
  assert.equal(w.calls.length, 0);
  player.classList.remove('ad-showing');
  w.videoId = 'main';
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: empty quality data is not recorded so a later playing retries', t => {
  const data = [];
  const { w, fire } = qualityPage(t, { data });
  fire('playing');
  assert.equal(w.calls.length, 0);
  data.push({ quality: 'hd720', isPlayable: true });
  fire('playing');
  assert.deepEqual(w.calls, [['hd720', 'hd720']]);
});

test('max-quality: an already playing player is applied at start', t => {
  const { w } = qualityPage(t, { state: 1 });
  assert.equal(w.calls.length, 1);
});

test('max-quality: an existing player that is not playing waits for playing', t => {
  const { w, fire } = qualityPage(t, { state: -1 });
  assert.equal(w.calls.length, 0);
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: works on m.youtube.com and youtube-nocookie embeds', t => {
  for (const url of ['https://m.youtube.com/watch?v=A', 'https://www.youtube-nocookie.com/embed/abcdefghijk']) {
    const { w, fire } = qualityPage(t, { url });
      fire('playing');
    assert.equal(w.calls.length, 1, url);
  }
});

test('max-quality: a video outside #movie_player is ignored', t => {
  const { w, fire } = qualityPage(t, { inPlayer: false });
  const outside = w.document.querySelector('#outside');
  fire('playing', outside);
  assert.equal(w.calls.length, 0);
});

test('max-quality: missing player API or empty data stays quiet', t => {
  const a = qualityPage(t, { withPlayer: false });
  a.fire('playing');
  const b = qualityPage(t, { data: [] });
  b.fire('playing');
  assert.equal(b.w.calls.length, 0);
});

const HIGH_DATA = [
  { quality: 'highres', isPlayable: true, formatId: { itag: 1 } },
  { quality: 'hd2160', isPlayable: true, formatId: { itag: 2 } },
  { quality: 'hd1440', isPlayable: true },
  { quality: 'small', isPlayable: true },
];

function failAt(w, fire, quality, el) {
  w.quality = quality;
  fire('error', el);
}

test('max-quality: playback failure falls back one step below the failed quality, step by step', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  assert.deepEqual(w.calls, [['highres', 'highres']]);
  failAt(w, fire, 'highres');
  fire('emptied');
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.calls[1], ['hd2160', 'hd2160']);
  failAt(w, fire, 'hd2160');
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.calls[2], ['hd1440', 'hd1440']);
  assert.equal(w.calls.length, 3);
});

test('max-quality: manual quality change without an error is not overridden', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  w.quality = 'small';
  fire('emptied');
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: no re-call when the fallback already is the best below the failed quality', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  failAt(w, fire, 'highres');
  w.quality = 'hd2160';
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: no re-call when the same quality recovered', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  failAt(w, fire, 'highres');
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: manual selection that fails is also stepped down', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  w.quality = 'hd1440';
  fire('playing');
  w.quality = 'highres';
  fire('error');
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.calls[1], ['hd2160', 'hd2160']);
});

test('max-quality: errors during ads or with unknown quality are ignored', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  const player = w.document.querySelector('#movie_player');
  fire('playing');
  player.classList.add('ad-showing');
  failAt(w, fire, 'highres');
  player.classList.remove('ad-showing');
  failAt(w, fire, 'unknown');
  w.quality = 'small';
  fire('playing');
  assert.equal(w.calls.length, 1);
});

test('max-quality: failure record resets on a new video id', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  failAt(w, fire, 'highres');
  w.videoId = 'v2';
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.calls[1], ['highres', 'highres']);
});

test('max-quality: events from a replaced video element are handled', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  const fresh = w.document.createElement('video');
  w.document.querySelector('#movie_player').appendChild(fresh);
  failAt(w, fire, 'highres', fresh);
  w.quality = 'small';
  fire('playing', fresh);
  assert.deepEqual(w.calls[1], ['hd2160', 'hd2160']);
});

test('max-quality: recovery is stop, set, play; position is restored on the next playing only', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  assert.deepEqual(w.order, ['set']);
  failAt(w, fire, 'highres');
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.order, ['set', 'stop', 'set', 'play']);
  w.time = 0;
  w.quality = 'hd2160';
  fire('playing');
  assert.deepEqual(w.order, ['set', 'stop', 'set', 'play', ['seek', 42, true]]);
  fire('playing');
  assert.equal(w.order.length, 5);
});

test('max-quality: no position is restored near the start or when already close', t => {
  for (const [start, after] of [[1, 0], [42, 41.5]]) {
    const { w, fire } = qualityPage(t, { data: HIGH_DATA });
    fire('playing');
    failAt(w, fire, 'highres');
    w.quality = 'small';
    w.time = start;
    fire('playing');
    w.time = after;
    w.quality = 'hd2160';
    fire('playing');
    assert.deepEqual(w.order, ['set', 'stop', 'set', 'play']);
  }
});

test('max-quality: recovery without stop/seek/play API only sets the quality', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  const player = w.document.querySelector('#movie_player');
  player.stopVideo = undefined;
  fire('playing');
  failAt(w, fire, 'highres');
  w.quality = 'small';
  fire('playing');
  assert.deepEqual(w.order, ['set', 'set']);
});

test('frames: inside an iframe only frames:true features run', async t => {
  const outer = new JSDOM('<html><body><iframe id="f"></iframe></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => outer.window.close());
  const fw = outer.window.document.querySelector('#f').contentWindow;
  assert.notEqual(fw.top, fw);
  fw.document.open();
  fw.document.write('<html><head></head><body><ytd-app></ytd-app><div id="movie_player"><video></video></div></body></html>');
  fw.document.close();
  const player = fw.document.querySelector('#movie_player');
  fw.calls = [];
  player.getAvailableQualityData = () => QUALITY_DATA;
  player.setPlaybackQualityRange = (...args) => fw.calls.push(args);
  player.getPlayerState = () => -1;
  player.getVideoData = () => ({ video_id: 'v1' });
  fw.eval(script.replace('function redirectTo(url) {', 'function redirectTo(url) { window.redirectCount = (window.redirectCount || 0) + 1; return;'));
  const video = fw.document.querySelector('video');
  video.dispatchEvent(new fw.Event('playing'));
  await sleep(50);
  assert.equal(fw.calls.length, 1);
  assert.equal(fw.document.querySelector('#tubekit-styles'), null);
  assert.equal(fw.document.querySelector('#tubekit-root'), null);
});

test('frames: shorts-to-watch does not start inside an iframe but does in the top frame', t => {
  const hook = 'function redirectIfShorts() {';
  assert.ok(script.includes(hook), 'redirectIfShorts instrumentation target exists in the build');
  const instrumented = script.replace(hook, hook + ' window.shortsChecks = (window.shortsChecks || 0) + 1;');
  const outer = new JSDOM('<html><body><iframe id="f"></iframe></body></html>', {
    url: 'https://www.youtube.com/watch?v=A',
    runScripts: 'outside-only',
  });
  t.after(() => outer.window.close());
  const fw = outer.window.document.querySelector('#f').contentWindow;
  fw.eval(instrumented);
  assert.equal(fw.shortsChecks, undefined);
  outer.window.eval(instrumented);
  assert.ok(outer.window.shortsChecks > 0);
});
