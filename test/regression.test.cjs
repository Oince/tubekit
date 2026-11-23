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
  twoColumns = true,
  primary = { width: 900, left: 0, right: 900 },
  secondary = { width: 400, left: 920, right: 1320 },
  expectRoot = true,
  htmlAttrs = '',
  liveStream = false,
} = {}) {
  const content = disabled
    ? `<ytd-message-renderer>${disabledText}</ytd-message-renderer>`
    : liveStream ? '' : '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
  const dom = new JSDOM(`<html lang="en" ${htmlAttrs}><head></head><body><ytd-app>
    <ytd-watch-flexy video-id="A"${twoColumns ? ' is-two-columns_' : ''}><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
      <ytd-comments id="comments"${liveStream ? ' hidden disable-upgrade' : ''}>${content}</ytd-comments>
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
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.id === 'primary'
      ? primary
      : secondary;
  };
  w.eval(script.replace('function evaluate() {', 'function evaluate() { window.evaluationCount = (window.evaluationCount || 0) + 1;'));
  await sleep(200);
  if (expectRoot) assert.ok(w.document.querySelector('#tubekit-root'));
  return { w, document: w.document, watch: w.document.querySelector('ytd-watch-flexy') };
}

function collapseToOneColumn(w, document) {
  w.innerWidth = 800;
  document.querySelector('ytd-watch-flexy').removeAttribute('is-two-columns_');
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

const THEATER_ATTRIBUTES = ['theater', 'full-bleed-player'];

async function theater(watch) {
  for (const name of THEATER_ATTRIBUTES) watch.setAttribute(name, '');
  await sleep(200);
}

async function leaveTheater(watch) {
  for (const name of THEATER_ATTRIBUTES) watch.removeAttribute(name);
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

test('overlay scrollbar two-column layout below 1015px still creates the panel', async t => {
  const { document } = await setup(t, {
    innerWidth: 1014,
    primary: { width: 656, left: 16, right: 672 },
    secondary: { width: 336, left: 672, right: 1008 },
  });
  assert.ok(document.querySelector('#tubekit-root'));
});

test('one-column layout does not create the panel', async t => {
  const { document } = await setup(t, { innerWidth: 999, twoColumns: false, expectRoot: false });
  assert.equal(document.querySelector('#tubekit-root'), null);
});

test('two-column attribute without side-by-side columns does not create the panel', async t => {
  const { document } = await setup(t, {
    secondary: { width: 400, left: 0, right: 400 },
    expectRoot: false,
  });
  assert.equal(document.querySelector('#tubekit-root'), null);
});

test('CSS hides the panel while YouTube is not in the two-column layout', async t => {
  const { document } = await setup(t);
  const css = document.querySelector('#tubekit-styles').textContent;
  assert.match(css, /ytd-watch-flexy:not\(\[is-two-columns_\]\) #tubekit-root\s*\{[^}]*display: none !important;/);
  assert.doesNotMatch(css, /max-width: 1014px/);
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
  app.innerHTML = `<ytd-watch-flexy video-id="A" is-two-columns_><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
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
  assert.equal(w.getComputedStyle(secondary).overflowY, 'clip');
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  document.querySelector('#secondary-inner').append(panel);
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'true');
  assert.notEqual(w.getComputedStyle(secondary).overflowY, 'clip');
  panel.remove();
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
  assert.equal(w.getComputedStyle(secondary).overflowY, 'clip');
});

test('panel root keeps a 14px scrollbar area regardless of the right column padding', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  let offset = 320;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get() { return this.classList.contains('tubekit-pane') ? offset : 0; } });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return this.classList.contains('tubekit-pane') ? 320 : 0; } });
  for (const padding of ['16px', '0px']) {
    document.querySelector('#secondary').style.paddingRight = padding;
    for (const [scrollbar, gutter, inset] of [[0, 14, 14], [12, 2, 14], [15, 0, 15], [17, 0, 17]]) {
      offset = 320 + scrollbar;
      w.dispatchEvent(new w.Event('resize'));
      await sleep(300);
      assert.equal(root.style.getPropertyValue('--tubekit-rail-overhang'), '');
      assert.equal(root.style.getPropertyValue('--tubekit-pane-gutter'), `${gutter}px`);
      assert.equal(root.style.getPropertyValue('--tubekit-content-inset'), `${inset}px`);
    }
  }
});

test('panel root recomputes the scrollbar area when switching tabs', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get() { return this.classList.contains('tubekit-pane') ? (this.id.includes('related') ? 320 : 332) : 0; } });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return this.classList.contains('tubekit-pane') ? 320 : 0; } });
  w.dispatchEvent(new w.Event('resize'));
  await sleep(300);
  assert.equal(root.style.getPropertyValue('--tubekit-pane-gutter'), '2px');
  document.querySelector('#tubekit-related-tab').click();
  await sleep(100);
  assert.equal(root.style.getPropertyValue('--tubekit-pane-gutter'), '14px');
  assert.equal(root.style.getPropertyValue('--tubekit-content-inset'), '14px');
});

test('selected tab survives leaving and re-entering the layout on the same video', async t => {
  const { document, watch } = await setup(t);
  document.querySelector('#tubekit-related-tab').click();
  await theater(watch);
  assert.equal(document.querySelector('#tubekit-root'), null);
  await leaveTheater(watch);
  assert.ok(document.querySelector('#tubekit-root'));
  assert.equal(selected(document), 'related');
});

test('related moved by YouTube into the one-column layout stays before the restored comments', async t => {
  const { w, document } = await setup(t);
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  comments.before(related);
  collapseToOneColumn(w, document);
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), null);
  assert.equal(document.querySelector('#below').children[0], related);
  assert.equal(related.nextElementSibling, comments);
  assert.equal(document.querySelector('#secondary-inner #related'), null);
  assert.equal(document.querySelectorAll('#related').length, 1);
  assert.equal(document.querySelectorAll('#comments').length, 1);

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
  collapseToOneColumn(w, document);
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

test('scroll events record the shown pane position and tab switching restores each position', async t => {
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
  commentsPane.dispatchEvent(new w.Event('scroll'));
  assert.ok(comments.reads > 0, 'the shown pane position is recorded on scroll');

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

test('panes do not contain fixed-position menus such as the comment sort dropdown', async t => {
  const { document } = await setup(t);
  const css = document.getElementById('tubekit-styles').textContent;
  const pane = css.match(/\.tubekit-pane \{([^}]*)\}/)[1];
  assert.doesNotMatch(pane, /\bcontain:/);
});

test('secondary column offsets its top with margin, not padding, so a short left column still keeps it level with the player', async t => {
  const { document } = await setup(t);
  const css = document.getElementById('tubekit-styles').textContent;
  const rule = css.match(/ytd-watch-flexy #secondary \{([^}]*)\}/)[1];
  assert.match(rule, /margin-top: 12px !important;/);
  assert.match(rule, /padding-top: 0 !important;/);
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

test('a scroll event fired while a pane reappears does not change the position it is restored to', async t => {
  const { w, document } = await setup(t);
  const raf = () => new Promise(resolve => w.requestAnimationFrame(resolve));
  const commentsPane = document.querySelector('#tubekit-comments-pane');
  const comments = spyScrollTop(commentsPane);
  comments.value = 300;
  commentsPane.dispatchEvent(new w.Event('scroll'));
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await raf();
  await raf();
  comments.value = 0;
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  commentsPane.dispatchEvent(new w.Event('scroll'));
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

test('live streams with hidden comments beside the chat fall back to related', async t => {
  const { document } = await setup(t, { liveStream: true });
  await sleep(3400);
  assert.equal(selected(document), 'comments');
  assert.ok(document.querySelector('#tubekit-comments-pane .tubekit-status'));
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  chat.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
  document.querySelector('#secondary-inner').prepend(chat);
  await sleep(1400);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'true');
  assert.equal(selected(document), 'related');
  assert.equal(document.querySelector('#tubekit-comments-pane .tubekit-status'), null);
  chat.firstElementChild.setAttribute('collapsed', '');
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
  assert.equal(selected(document), 'related');
});

test('closing a live chat on a video with comments returns to the comments tab', async t => {
  const { document } = await setup(t);
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  chat.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
  document.querySelector('#secondary-inner').prepend(chat);
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'true');
  chat.firstElementChild.setAttribute('collapsed', '');
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
  assert.equal(selected(document), 'comments');
});

function fullscreenStub(w, panes = {}) {
  const document = w.document;
  const watch = document.querySelector('ytd-watch-flexy');
  const proto = w.HTMLElement.prototype;
  const rects = proto.getBoundingClientRect;
  const clientRects = proto.getClientRects;
  let element = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  const hideRightColumn = () => {
    for (const name of ['fullscreen', 'full-bleed-player']) watch.setAttribute(name, '');
    proto.getBoundingClientRect = () => ({ width: 0, left: 0, right: 0 });
    proto.getClientRects = () => [];
    Object.values(panes).forEach(pane => { pane.hidden = true; });
  };
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) hideRightColumn();
  }, true);
  return {
    enter({ hiddenBeforeEvent = false } = {}) {
      if (hiddenBeforeEvent) hideRightColumn();
      element = document.documentElement;
      document.documentElement.dispatchEvent(new w.Event('fullscreenchange', { bubbles: true }));
    },
    exit({ width = 1440, twoColumns = width >= 1000 } = {}) {
      element = null;
      w.innerWidth = width;
      if (!twoColumns) watch.removeAttribute('is-two-columns_');
      document.documentElement.dispatchEvent(new w.Event('fullscreenchange', { bubbles: true }));
      for (const name of ['fullscreen', 'full-bleed-player']) watch.removeAttribute(name);
      proto.getBoundingClientRect = rects;
      proto.getClientRects = clientRects;
      if (twoColumns) Object.values(panes).forEach(pane => { pane.hidden = false; });
    },
  };
}

async function scrollBothTabs(w, document, positions = { comments: 300, related: 700 }) {
  const raf = () => new Promise(resolve => w.requestAnimationFrame(resolve));
  const panes = {
    comments: spyScrollTop(document.querySelector('#tubekit-comments-pane')),
    related: spyScrollTop(document.querySelector('#tubekit-related-pane')),
  };
  for (const tab of ['related', 'comments']) {
    document.querySelector(`[role="tab"][data-tab="${tab}"]`).click();
    await raf();
    await raf();
    panes[tab].value = positions[tab];
    document.querySelector(`#tubekit-${tab}-pane`).dispatchEvent(new w.Event('scroll'));
  }
  return panes;
}

const frames = async w => {
  for (let i = 0; i < 2; i++) await new Promise(resolve => w.requestAnimationFrame(resolve));
};

test('fullscreen holds the panel and restores the tab and both scroll positions on exit', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  await sleep(200);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(root.dataset.suspended, 'true');
  assert.ok(document.documentElement.classList.contains('tubekit-suspended'));
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(document.querySelector('#tubekit-root'), root, 'not torn down');
  assert.equal(root.dataset.suspended, 'false');
  assert.equal(document.documentElement.classList.contains('tubekit-suspended'), false);
  assert.equal(selected(document), 'comments');
  assert.equal(panes.comments.value, 300);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames(w);
  assert.equal(panes.related.value, 700);
});

test('fullscreen keeps the related tab and its scroll position', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames(w);
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  await sleep(200);
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(document.querySelector('#tubekit-root'), root, 'not torn down');
  assert.equal(selected(document), 'related');
  assert.equal(panes.related.value, 700);
});

test('fullscreen noticed only after YouTube hid the right column still restores the active tab position', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter({ hiddenBeforeEvent: true });
  await sleep(200);
  assert.equal(root.dataset.suspended, 'true');
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(selected(document), 'comments');
  assert.equal(panes.comments.value, 300);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames(w);
  assert.equal(panes.related.value, 700);
});

test('fullscreen saves a position not yet reported by a scroll event before YouTube hides the right column in the same fullscreenchange', async t => {
  const { w, document } = await setup(t);
  const panes = await scrollBothTabs(w, document);
  panes.comments.value = 450;
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  await sleep(200);
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(selected(document), 'comments');
  assert.equal(panes.comments.value, 450);
});

test('changing the video during fullscreen tears the panel down and mounts fresh after exit', async t => {
  const { w, document, watch } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const fullscreen = fullscreenStub(w);
  fullscreen.enter();
  await sleep(200);
  document.dispatchEvent(new w.Event('yt-navigate-start'));
  w.history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), null);
  fullscreen.exit();
  await sleep(300);
  const fresh = document.querySelector('#tubekit-root');
  assert.ok(fresh);
  assert.notEqual(fresh, root);
  assert.notEqual(fresh.dataset.suspended, 'true');
  assert.equal(selected(document), 'comments');
});

test('fullscreen ending outside the two-column layout tears the panel down', async t => {
  const { w, document } = await setup(t);
  const comments = document.querySelector('#comments');
  const fullscreen = fullscreenStub(w);
  fullscreen.enter();
  await sleep(200);
  fullscreen.exit({ width: 800 });
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), null);
  assert.equal(document.querySelector('#below #comments'), comments);
  assert.equal(document.documentElement.classList.contains('tubekit-suspended'), false);
});

test('a YouTube panel open before fullscreen keeps the panel held after exit until it closes', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  document.querySelector('#secondary-inner').append(panel);
  await sleep(200);
  assert.equal(root.dataset.suspended, 'true');
  panes.comments.hidden = true;
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  panel.setAttribute('hidden', '');
  panel.removeAttribute('hidden');
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(root.dataset.suspended, 'true');
  fullscreen.exit();
  panes.comments.hidden = true;
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(root.dataset.suspended, 'true', 'still held by the YouTube panel');
  panel.remove();
  await sleep(200);
  panes.comments.hidden = false;
  await frames(w);
  assert.equal(root.dataset.suspended, 'false');
  assert.equal(selected(document), 'comments');
  assert.equal(panes.comments.value, 300);
});

function expandedPanel(document) {
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  return panel;
}

test('a YouTube panel closed during fullscreen keeps its hold until exit, then restores the tab before it', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames(w);
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await sleep(200);
  assert.equal(root.dataset.suspended, 'true');
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  panel.setAttribute('hidden', '');
  await sleep(300);
  assert.equal(selected(document), 'comments', 'the YouTube panel hold is kept during fullscreen');
  panel.remove();
  await sleep(300);
  assert.equal(selected(document), 'comments', 'closing the YouTube panel is not handled during fullscreen');
  assert.equal(root.dataset.suspended, 'true');
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(root.dataset.suspended, 'false');
  assert.equal(selected(document), 'related', 'restored to the tab before the YouTube panel');
  assert.equal(panes.related.value, 700);
});

test('a YouTube panel opened during fullscreen holds the panel after exit until it closes', async t => {
  const { w, document } = await setup(t);
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs(w, document);
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  await sleep(200);
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await sleep(300);
  assert.equal(root.dataset.suspended, 'true');
  fullscreen.exit();
  panes.comments.hidden = true;
  await sleep(300);
  assert.equal(document.querySelector('#tubekit-root'), root);
  assert.equal(root.dataset.suspended, 'true', 'held by the YouTube panel after fullscreen');
  panel.remove();
  await sleep(200);
  panes.comments.hidden = false;
  await frames(w);
  assert.equal(root.dataset.suspended, 'false');
  assert.equal(selected(document), 'comments');
  assert.equal(panes.comments.value, 300);
});

test('comments found off during fullscreen stay on related after exit', async t => {
  const { w, document } = await setup(t);
  const panes = await scrollBothTabs(w, document);
  const fullscreen = fullscreenStub(w, panes);
  fullscreen.enter();
  await sleep(100);
  document.querySelector('#comments').innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
  await sleep(1300);
  assert.equal(selected(document), 'related');
  fullscreen.exit();
  await sleep(200);
  await frames(w);
  assert.equal(document.querySelector('#tubekit-root').dataset.suspended, 'false');
  assert.equal(selected(document), 'related');
  assert.equal(panes.related.value, 700);
});

test('theater mode tears the panel down instead of holding it, although YouTube sets full-bleed-player there as in fullscreen', async t => {
  const { document, watch } = await setup(t);
  await theater(watch);
  assert.equal(document.querySelector('#tubekit-root'), null);
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
    player.setPlaybackQualityRange = (...args) => { w.calls.push(args); };
    player.getPlayerState = () => state;
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
  { quality: 'hd1080', isPlayable: true },
  { quality: 'small', isPlayable: true },
];

test('max-quality: 8K (highres) is never auto-selected; 4K is the cap', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  assert.deepEqual(w.calls, [['hd2160', 'hd2160']]);
});

test('max-quality: a manually chosen 8K is not overridden on the same video', t => {
  const { w, fire } = qualityPage(t, { data: HIGH_DATA });
  fire('playing');
  fire('emptied');
  fire('playing');
  assert.deepEqual(w.calls, [['hd2160', 'hd2160']]);
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

const ROTATION_CLASSES = ['tubekit-video-rotation-90', 'tubekit-video-rotation-180', 'tubekit-video-rotation-270'];
const ROTATION_CONTROLS = `<div class="ytp-right-controls"><div class="ytp-right-controls-left">
  <button class="ytp-subtitles-button ytp-button"></button>
  <button class="ytp-button ytp-settings-button"></button>
</div></div>`;
const STRETCH_PATTERN = /(?:^|,)yt:stretch=([0-9.]*):?([0-9.]*)(?:,|$)/;

function mockRotationPlayer(w, player, watch, aspect = 16 / 9, keywords = ['blender', 'short']) {
  w.state = { videoId: 'A', responseId: undefined, mediaAspect: aspect, aspect, keywords, updates: [], resizes: 0 };
  watch.videoHeightToWidthRatio_ = 1 / aspect;
  player.getVideoData = () => ({ video_id: w.state.videoId });
  player.getVideoAspectRatio = () => w.state.aspect;
  player.getPlayerResponse = () => ({ videoDetails: { videoId: w.state.responseId, keywords: w.state.keywords } });
  player.getVideoContentRect = () => ({ left: 0, top: 0, width: 441, height: 784 });
  player.updateVideoData = data => {
    w.state.updates.push(data.keywords);
    const match = STRETCH_PATTERN.exec(data.keywords || '');
    const ratio = match && match[1] && match[2] ? Number(match[1]) / Number(match[2]) : NaN;
    w.state.aspect = Number.isFinite(ratio) ? ratio : w.state.mediaAspect;
  };
  w.addEventListener('resize', () => { w.state.resizes += 1; });
}

function rotationPage(t, {
  url = 'https://www.youtube.com/watch?v=A',
  aspect = 16 / 9,
  keywords = ['blender', 'short'],
  ad = false,
  controls = true,
} = {}) {
  const dom = new JSDOM(`<html><head></head><body><ytd-app><ytd-watch-flexy video-id="A">
    <div id="movie_player" class="html5-video-player${ad ? ' ad-showing' : ''}">
      <div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>
      <div class="ytp-chrome-bottom">${controls ? ROTATION_CONTROLS : ''}</div>
    </div></ytd-watch-flexy></ytd-app></body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const player = w.document.querySelector('#movie_player');
  const watch = w.document.querySelector('ytd-watch-flexy');
  mockRotationPlayer(w, player, watch, aspect, keywords);
  w.eval(script.replace('function redirectTo(url) {', 'function redirectTo(url) { return;'));
  const document = w.document;
  const button = () => document.querySelectorAll('.tubekit-video-rotation-button');
  const classes = () => ROTATION_CLASSES.filter(name => player.classList.contains(name));
  const fire = type => document.querySelector('video').dispatchEvent(new w.Event(type));
  const go = (id, playerId = id) => {
    w.history.pushState({}, '', `/watch?v=${id}`);
    w.state.videoId = playerId;
    fire('loadstart');
  };
  return { w, document, player, watch, button, classes, fire, go };
}

test('video-rotation: one button is placed right before the settings button and never duplicated', async t => {
  const { document, button, fire } = rotationPage(t);
  assert.equal(button().length, 1);
  const settings = document.querySelector('.ytp-settings-button');
  assert.equal(button()[0].nextElementSibling, settings);
  assert.ok(button()[0].previousElementSibling.classList.contains('ytp-subtitles-button'));
  assert.ok(button()[0].classList.contains('ytp-button'));
  assert.equal(button()[0].getAttribute('aria-label'), '영상 회전');
  assert.equal(button()[0].querySelectorAll('svg > rect, svg > path').length, 3);
  for (const type of ['loadstart', 'loadedmetadata', 'playing']) fire(type);
  document.dispatchEvent(new document.defaultView.Event('yt-navigate-finish'));
  document.querySelector('.ytp-right-controls-left').append(settings);
  await sleep(20);
  assert.equal(button().length, 1);
  assert.equal(button()[0].nextElementSibling, settings);
});

test('video-rotation: each click turns 90° clockwise, quarter turns report the swapped ratio, and four clicks return to 0°', async t => {
  const { w, watch, player, button, classes } = rotationPage(t);
  const click = () => button()[0].click();
  click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(w.state.updates.length, 1);
  assert.match(w.state.updates[0], /^blender,short,yt:stretch=1:1\.777/);
  assert.ok(Math.abs(w.state.aspect - 9 / 16) < 1e-9);
  assert.equal(player.style.getPropertyValue('--tubekit-video-rotation-width'), '784px');
  assert.equal(player.style.getPropertyValue('--tubekit-video-rotation-height'), '441px');
  assert.equal(player.style.getPropertyValue('--tubekit-video-rotation-left'), '-171.5px');
  assert.equal(player.style.getPropertyValue('--tubekit-video-rotation-top'), '171.5px');
  await sleep(50);
  assert.ok(Math.abs(watch.videoHeightToWidthRatio_ - 16 / 9) < 1e-9);
  assert.ok(w.state.resizes > 0);
  click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-180']);
  assert.equal(w.state.updates[1], 'blender,short,yt:stretch=');
  assert.ok(Math.abs(w.state.aspect - 16 / 9) < 1e-9);
  click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-270']);
  assert.match(w.state.updates[2], /yt:stretch=1:1\.777/);
  click();
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.length, 4);
  assert.ok(Math.abs(w.state.aspect - 16 / 9) < 1e-9);
  await sleep(50);
  assert.ok(Math.abs(watch.videoHeightToWidthRatio_ - 9 / 16) < 1e-9);
});

test('video-rotation: an uploader yt:stretch keyword is kept when the rotation is undone', t => {
  const { w, button } = rotationPage(t, { keywords: ['yt:stretch=4:3', 'tag'] });
  button()[0].click();
  assert.equal(w.state.updates[0].split(',').filter(k => k.startsWith('yt:stretch=')).length, 1);
  button()[0].click();
  assert.equal(w.state.updates[1], 'tag,yt:stretch=4:3');
});

test('video-rotation: pause, seeking and same-video media reloads keep the rotation', async t => {
  const { w, button, classes, fire } = rotationPage(t);
  button()[0].click();
  for (const type of ['emptied', 'loadstart', 'loadedmetadata', 'playing']) fire(type);
  await sleep(20);
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(w.state.updates.length, 1);
});

test('video-rotation: a video whose data lost the reported ratio gets it back on the next media event', t => {
  const { w, button, classes, fire } = rotationPage(t);
  button()[0].click();
  w.state.aspect = w.state.mediaAspect;
  fire('loadedmetadata');
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(w.state.updates.length, 2);
  assert.ok(Math.abs(w.state.aspect - 9 / 16) < 1e-9);
});

test('video-rotation: a new video resets to 0° and clears the rotated ratio YouTube carried over', async t => {
  const { w, button, classes, fire, go } = rotationPage(t);
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  w.state.keywords = undefined;
  go('B');
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.at(-1), 'yt:stretch=');
  assert.ok(Math.abs(w.state.aspect - 16 / 9) < 1e-9);
  const updates = w.state.updates.length;
  fire('playing');
  assert.equal(w.state.updates.length, updates);
  go('A');
  assert.deepEqual(classes(), []);
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
});

test('video-rotation: the button is disabled and rotation is not applied during an ad, then comes back after it', async t => {
  const { w, player, button, classes, fire } = rotationPage(t, { ad: true });
  assert.equal(button()[0].disabled, true);
  button()[0].click();
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.length, 0);
  player.classList.remove('ad-showing');
  await sleep(20);
  assert.equal(button()[0].disabled, false);
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  const updates = w.state.updates.length;
  player.classList.add('ad-showing');
  w.state.aspect = w.state.mediaAspect;
  await sleep(20);
  fire('playing');
  assert.deepEqual(classes(), []);
  assert.equal(button()[0].disabled, true);
  assert.equal(w.state.updates.length, updates);
  player.classList.remove('ad-showing');
  await sleep(20);
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(button()[0].disabled, false);
  assert.ok(Math.abs(w.state.aspect - 9 / 16) < 1e-9);
});

test('video-rotation: no button on m.youtube.com, embeds, youtube-nocookie or pages other than /watch', async t => {
  for (const url of [
    'https://m.youtube.com/watch?v=A',
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://www.youtube.com/',
  ]) {
    const { document, button, fire } = rotationPage(t, { url });
    fire('loadstart');
    document.dispatchEvent(new document.defaultView.Event('yt-navigate-finish'));
    await sleep(20);
    assert.equal(button().length, 0, url);
  }
});

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('video-rotation: going back to the rotated video during the next video preroll ad shows it at 0°', async t => {
  const { w, player, button, classes, go } = rotationPage(t);
  button()[0].click();
  player.classList.add('ad-showing');
  go('B', 'AD');
  await sleep(20);
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.length, 1);
  player.classList.remove('ad-showing');
  go('A');
  await sleep(20);
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.at(-1), 'blender,short,yt:stretch=');
  assert.ok(near(w.state.aspect, 16 / 9));
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
});

test('video-rotation: passing through a video without a video id still resets the rotated video to 0°', async t => {
  const { w, button, classes, go } = rotationPage(t);
  button()[0].click();
  go('B', '');
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.length, 1);
  button()[0].click();
  assert.deepEqual(classes(), []);
  go('A');
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.at(-1), 'blender,short,yt:stretch=');
  assert.ok(near(w.state.aspect, 16 / 9));
});

test('video-rotation: a midroll ad that reports its own video id does not reset the rotation', async t => {
  const { w, player, button, classes, fire } = rotationPage(t);
  button()[0].click();
  const updates = w.state.updates.length;
  player.classList.add('ad-showing');
  w.state.videoId = 'AD';
  w.state.aspect = w.state.mediaAspect;
  fire('loadstart');
  await sleep(20);
  assert.deepEqual(classes(), []);
  assert.equal(button()[0].disabled, true);
  assert.equal(w.state.updates.length, updates);
  player.classList.remove('ad-showing');
  await sleep(20);
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(w.state.updates.length, updates);
  w.state.videoId = 'A';
  fire('playing');
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.ok(near(w.state.aspect, 9 / 16));
});

test('video-rotation: leftover cleanup waits for the new video response and keeps its own yt:stretch', async t => {
  const { w, button, go, fire } = rotationPage(t, { keywords: ['tagA'] });
  w.state.responseId = 'A';
  button()[0].click();
  const updates = w.state.updates.length;
  go('B');
  fire('playing');
  assert.equal(w.state.updates.length, updates);
  button()[0].click();
  assert.equal(w.state.updates.length, updates);
  w.state.responseId = 'B';
  w.state.keywords = ['yt:stretch=4:3', 'tagB'];
  w.state.mediaAspect = 4 / 3;
  fire('loadedmetadata');
  assert.equal(w.state.updates.at(-1), 'tagB,yt:stretch=4:3');
  assert.ok(near(w.state.aspect, 4 / 3));
});

test('video-rotation: a failed leftover cleanup is retried on the next event', t => {
  const { w, player, button, go, fire } = rotationPage(t);
  button()[0].click();
  const update = player.updateVideoData;
  let failures = 1;
  player.updateVideoData = data => {
    if (failures-- > 0) throw new Error('not ready');
    update(data);
  };
  go('B');
  assert.ok(near(w.state.aspect, 9 / 16));
  fire('playing');
  assert.equal(w.state.updates.at(-1), 'blender,short,yt:stretch=');
  assert.ok(near(w.state.aspect, 16 / 9));
});

test('video-rotation: a relayout skipped by an ad runs once the ad ends', async t => {
  const { watch, player, button } = rotationPage(t);
  button()[0].click();
  await sleep(50);
  assert.ok(near(watch.videoHeightToWidthRatio_, 16 / 9));
  button()[0].click();
  player.classList.add('ad-showing');
  await sleep(50);
  assert.ok(near(watch.videoHeightToWidthRatio_, 16 / 9));
  player.classList.remove('ad-showing');
  await sleep(50);
  assert.ok(near(watch.videoHeightToWidthRatio_, 9 / 16));
});

test('video-rotation: the ratio goes to the ytd-watch-flexy that holds the player, not a hidden one before it', async t => {
  const dom = new JSDOM(`<html><head></head><body><ytd-app>
    <ytd-watch-flexy id="stale" hidden></ytd-watch-flexy>
    <ytd-watch-flexy id="live"><div id="movie_player" class="html5-video-player">
      <div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>
      <div class="ytp-chrome-bottom">${ROTATION_CONTROLS}</div>
    </div></ytd-watch-flexy></ytd-app></body></html>`, {
    url: 'https://www.youtube.com/watch?v=A',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const stale = w.document.querySelector('#stale');
  const live = w.document.querySelector('#live');
  mockRotationPlayer(w, w.document.querySelector('#movie_player'), live);
  stale.videoHeightToWidthRatio_ = 9 / 16;
  w.eval(script);
  w.document.querySelector('.tubekit-video-rotation-button').click();
  await sleep(50);
  assert.ok(near(live.videoHeightToWidthRatio_, 16 / 9));
  assert.ok(near(stale.videoHeightToWidthRatio_, 9 / 16));
});

test('video-rotation: the button comes back after YouTube replaces the controls group or mounts the controls late', async t => {
  const replaced = rotationPage(t);
  const fresh = replaced.document.createElement('div');
  fresh.className = 'ytp-right-controls-left';
  fresh.innerHTML = '<button class="ytp-subtitles-button ytp-button"></button><button class="ytp-button ytp-settings-button"></button>';
  replaced.document.querySelector('.ytp-right-controls-left').replaceWith(fresh);
  await sleep(20);
  assert.equal(replaced.button().length, 1);
  assert.equal(replaced.button()[0].nextElementSibling, fresh.querySelector('.ytp-settings-button'));

  const late = rotationPage(t, { controls: false });
  assert.equal(late.button().length, 0);
  late.document.querySelector('.ytp-chrome-bottom').innerHTML = ROTATION_CONTROLS;
  await sleep(20);
  assert.equal(late.button().length, 1);
  assert.ok(late.button()[0].nextElementSibling.classList.contains('ytp-settings-button'));
  late.document.querySelector('.ytp-right-controls-left').append(late.document.createElement('span'));
  await sleep(20);
  assert.equal(late.button().length, 1);
});

test('video-rotation: embeds, shorts and other non-watch pages get no rotation styles', async t => {
  for (const url of [
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://www.youtube.com/',
  ]) {
    const { document, fire } = rotationPage(t, { url });
    fire('loadstart');
    document.dispatchEvent(new document.defaultView.Event('yt-player-updated'));
    await sleep(20);
    assert.equal(document.querySelector('#tubekit-video-rotation-styles'), null, url);
    assert.equal(document.querySelector('.tubekit-video-rotation-button'), null, url);
  }
});

test('video-rotation: nothing is added inside an iframe', async t => {
  const outer = new JSDOM('<html><body><iframe id="f"></iframe></body></html>', {
    url: 'https://www.youtube.com/watch?v=A',
    runScripts: 'outside-only',
  });
  t.after(() => outer.window.close());
  const fw = outer.window.document.querySelector('#f').contentWindow;
  fw.document.open();
  fw.document.write(`<html><head></head><body><ytd-watch-flexy><div id="movie_player"><video class="html5-main-video"></video><div class="ytp-chrome-bottom">${ROTATION_CONTROLS}</div></div></ytd-watch-flexy></body></html>`);
  fw.document.close();
  mockRotationPlayer(fw, fw.document.querySelector('#movie_player'), fw.document.querySelector('ytd-watch-flexy'));
  fw.eval(script.replace('function redirectTo(url) {', 'function redirectTo(url) { return;'));
  fw.document.querySelector('video').dispatchEvent(new fw.Event('loadstart'));
  await sleep(20);
  assert.equal(fw.document.querySelector('#tubekit-video-rotation-styles'), null);
  assert.equal(fw.document.querySelector('.tubekit-video-rotation-button'), null);
});

test('video-rotation: moving from the home page to /watch adds the button, and the miniplayer keeps the rotation', async t => {
  const { w, document, button, classes } = rotationPage(t, { url: 'https://www.youtube.com/' });
  assert.equal(document.querySelector('#tubekit-video-rotation-styles'), null);
  w.history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  assert.equal(button().length, 1);
  assert.ok(document.querySelector('#tubekit-video-rotation-styles'));
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  w.history.pushState({}, '', '/');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  document.querySelector('video').dispatchEvent(new w.Event('playing'));
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  assert.equal(button().length, 1);
  w.history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
});

test('video-rotation: closing the miniplayer ends the viewing, so opening the same video again starts at 0°', async t => {
  const { w, document, player, button, classes } = rotationPage(t);
  let size = { width: 888, height: 784 };
  let state = 1;
  player.getBoundingClientRect = () => ({ left: 0, top: 0, ...size });
  player.getPlayerState = () => state;
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  w.history.pushState({}, '', '/');
  size = { width: 0, height: 0 };
  player.classList.add('ytp-player-minimized');
  await sleep(20);
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  size = { width: 192, height: 341 };
  document.dispatchEvent(new w.Event('yt-navigate-start'));
  w.history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
  w.history.pushState({}, '', '/');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  size = { width: 0, height: 0 };
  state = 5;
  w.state.aspect = w.state.mediaAspect;
  player.classList.add('unstarted-mode');
  await sleep(20);
  assert.deepEqual(classes(), []);
  w.history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new w.Event('yt-navigate-finish'));
  document.querySelector('video').dispatchEvent(new w.Event('loadstart'));
  assert.deepEqual(classes(), []);
  assert.equal(w.state.updates.at(-1), 'blender,short,yt:stretch=');
  assert.ok(Math.abs(w.state.aspect - 16 / 9) < 1e-9);
  button()[0].click();
  assert.deepEqual(classes(), ['tubekit-video-rotation-90']);
});

test('video-rotation: rotating beside the comments panel neither tears it down nor holds it', async t => {
  const dom = new JSDOM(`<html lang="en"><head></head><body><ytd-app>
    <ytd-watch-flexy video-id="A" is-two-columns_><div id="primary"><ytd-player><div id="movie_player" class="html5-video-player">
      <div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>
      <div class="ytp-chrome-bottom">${ROTATION_CONTROLS}</div>
    </div></ytd-player><div id="below">
      <ytd-comments id="comments"><ytd-comments-header-renderer></ytd-comments-header-renderer></ytd-comments>
    </div></div><div id="secondary"><div id="secondary-inner">
      <div id="related">related</div>
    </div></div></ytd-watch-flexy></ytd-app></body></html>`, {
    url: 'https://www.youtube.com/watch?v=A',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.innerWidth = 1440;
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.id === 'primary'
      ? { width: 888, left: 0, right: 888, top: 0 }
      : { width: 520, left: 920, right: 1440, top: 0 };
  };
  mockRotationPlayer(w, w.document.querySelector('#movie_player'), w.document.querySelector('ytd-watch-flexy'));
  w.eval(script);
  await sleep(200);
  const root = w.document.querySelector('#tubekit-root');
  assert.ok(root);
  w.document.querySelector('.tubekit-video-rotation-button').click();
  await sleep(400);
  assert.ok(w.state.resizes > 0);
  assert.equal(w.document.querySelector('#tubekit-root'), root);
  assert.ok(root.isConnected);
  assert.notEqual(root.dataset.suspended, 'true');
  assert.ok(w.document.documentElement.classList.contains('tubekit-active'));
  assert.ok(!w.document.documentElement.classList.contains('tubekit-suspended'));
});
