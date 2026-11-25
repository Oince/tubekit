import { SCRIPT_ID } from './constants.js';
import { initialPanelSelection, nextPanelSelection } from './panel-selection.js';
import {
  CHAT_PANEL,
  findChatFrame,
  findSecondaryInner,
  panelOfRequest,
  watchChatTitle,
  youtubePanelTitle,
} from '../../core/youtube.js';

export const FILL_CLASS = `${SCRIPT_ID}-youtube-panels`;
export const PANEL_ATTRIBUTE = `data-${SCRIPT_ID}-panel`;
export const YOUTUBE_TABS_ID = `${SCRIPT_ID}-youtube-tabs`;
const TAB_CLASS = `${SCRIPT_ID}-tab`;

export function handleTabKeys(event, tablist, select) {
  const buttons = [...tablist.querySelectorAll('[role="tab"]')];
  const index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
  else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  select(buttons[next]);
  buttons[next].focus();
}

export function createYoutubePanels({ labels, onTitleChange }) {
  let selection = initialPanelSelection;
  let panels = [];
  let row = null;
  let chatWatch = null;
  let watchedFrame = null;
  let tabButtons = new Map();
  let marked = new Set();

  const titleOf = (panel) => youtubePanelTitle(panel) || (panel.kind === CHAT_PANEL ? labels().chat : labels().panel);

  function stopChatWatch() {
    chatWatch?.();
    chatWatch = null;
    watchedFrame = null;
  }

  function watchChat(chat) {
    const frame = findChatFrame(chat?.element);
    if (frame === watchedFrame) return;
    stopChatWatch();
    if (!frame) return;
    watchedFrame = frame;
    chatWatch = watchChatTitle(frame, onTitleChange);
  }

  function removeRow() {
    row?.remove();
    row = null;
    tabButtons = new Map();
  }

  function clearMarks() {
    marked.forEach((node) => node.removeAttribute(PANEL_ATTRIBUTE));
    marked = new Set();
  }

  function select(panel) {
    selection = nextPanelSelection(selection, panels.map((entry) => entry.element), panel?.element || null);
    mark();
    refreshRow();
  }

  function mark() {
    for (const node of marked) {
      if (!panels.some((panel) => panel.element === node)) {
        node.removeAttribute(PANEL_ATTRIBUTE);
        marked.delete(node);
      }
    }
    for (const panel of panels) {
      marked.add(panel.element);
      const value = panel.element === selection.selected ? 'shown' : 'hidden';
      if (panel.element.getAttribute(PANEL_ATTRIBUTE) !== value) panel.element.setAttribute(PANEL_ATTRIBUTE, value);
    }
  }

  function buildRow() {
    const tablist = document.createElement('div');
    tablist.id = YOUTUBE_TABS_ID;
    tablist.setAttribute('role', 'tablist');
    tablist.addEventListener('keydown', (event) => handleTabKeys(event, tablist, (button) => {
      const panel = panels.find((entry) => tabButtons.get(entry.element) === button);
      if (panel) select(panel);
    }));
    return tablist;
  }

  function buildTab(panel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = TAB_CLASS;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(panel));
    return button;
  }

  function refreshRow() {
    if (!row) return;
    for (const panel of panels) {
      const button = tabButtons.get(panel.element);
      if (!button) continue;
      const title = titleOf(panel);
      if (button.textContent !== title) button.textContent = title;
      if (button.title !== title) button.title = title;
      const selected = panel.element === selection.selected;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }

  function syncRow(inner) {
    if (panels.length < 2) {
      removeRow();
      return;
    }
    if (!row) row = buildRow();
    for (const [element, button] of tabButtons) {
      if (!panels.some((panel) => panel.element === element)) {
        button.remove();
        tabButtons.delete(element);
      }
    }
    let cursor = row.firstElementChild;
    for (const panel of panels) {
      let button = tabButtons.get(panel.element);
      if (!button) {
        button = buildTab(panel);
        tabButtons.set(panel.element, button);
      }
      if (button !== cursor) row.insertBefore(button, cursor);
      cursor = button.nextElementSibling;
    }
    if (row.parentNode !== inner || inner.firstElementChild !== row) inner.prepend(row);
    refreshRow();
  }

  function detach() {
    stopChatWatch();
    removeRow();
    clearMarks();
    selection = { ...selection, previous: null };
  }

  return {
    get row() {
      return row;
    },

    contains(node) {
      return Boolean(row && node && row.contains(node));
    },

    sync(watch, found, { filling, fullscreen, request }) {
      const inner = findSecondaryInner(watch);
      panels = found;
      if (!filling || !inner) {
        detach();
        if (found.length === 0 && !fullscreen) selection = initialPanelSelection;
        return;
      }
      const requested = request ? panelOfRequest(found, request)?.element || null : null;
      selection = nextPanelSelection(selection, found.map((panel) => panel.element), requested);
      watchChat(found.find((panel) => panel.kind === CHAT_PANEL));
      mark();
      syncRow(inner);
    },

    refreshTitles() {
      refreshRow();
    },

    release() {
      detach();
      panels = [];
    },

    forget() {
      selection = initialPanelSelection;
    },
  };
}
