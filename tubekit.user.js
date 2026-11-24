// ==UserScript==
// @name         Tubekit
// @namespace    oince.tubekit
// @version      0.7.5
// @author       Oince
// @description  개인용 YouTube 편의 기능 모음.
// @downloadURL  https://raw.githubusercontent.com/Oince/tubekit/main/tubekit.user.js
// @updateURL    https://raw.githubusercontent.com/Oince/tubekit/main/tubekit.user.js
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @exclude      https://www.youtube.com/live_chat*
// @grant        window.onurlchange
// @run-at       document-start
// ==/UserScript==

(function() {
	"use strict";
	var PLAYER_ID = "movie_player";
	var AD_CLASSES = ["ad-showing", "ad-interrupting"];
	var WATCH_SELECTOR = "ytd-watch-flexy";
	var VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
	var SHORTS_PATH = /^\/shorts\/([^/]+)\/?$/;
	var EMBED_SHORTS_OR_CHAT_PATH = /^\/(embed|shorts|live_chat)(\/|$)/;
	var PLAYING_STATE = 1;
	var STOPPED_STATES = [
		-1,
		0,
		5
	];
	var PLAYER_SELECTOR = `#${PLAYER_ID}`;
	var NOT_AD_SELECTOR = AD_CLASSES.map((name) => `:not(.${name})`).join("");
	var AD_PLAYER_SELECTORS = AD_CLASSES.map((name) => `${PLAYER_SELECTOR}.${name}`);
	var PLAYER_AREA_SELECTOR = `${PLAYER_SELECTOR}, ytd-player`;
	var PRIMARY_SELECTOR = "#primary";
	var SECONDARY_SELECTOR = "#secondary";
	var SECONDARY_INNER_SELECTOR = "#secondary-inner";
	var RELATED_SELECTORS = ["#related", "ytd-watch-next-secondary-results-renderer#related"];
	var COMMENTS_SELECTOR = "ytd-comments#comments";
	var COMMENTS_HOME_SELECTOR = `${PRIMARY_SELECTOR} #below`;
	var COMMENTS_LOADED_SELECTOR = "ytd-comments-header-renderer, ytd-comment-thread-renderer, ytd-message-renderer, #header #count";
	var PAGE_VIDEO_ID_ATTRIBUTE = "video-id";
	var FULLSCREEN_ATTRIBUTE = "fullscreen";
	var TWO_COLUMN_PRESENT = ["is-two-columns_"];
	var TWO_COLUMN_ABSENT = ["theater", FULLSCREEN_ATTRIBUTE];
	var TWO_COLUMN_SELECTOR = [
		WATCH_SELECTOR,
		...TWO_COLUMN_PRESENT.map((name) => `[${name}]`),
		...TWO_COLUMN_ABSENT.map((name) => `:not([${name}])`)
	].join("");
	var NOT_TWO_COLUMN_SELECTORS = [...TWO_COLUMN_PRESENT.map((name) => `${WATCH_SELECTOR}:not([${name}])`), ...TWO_COLUMN_ABSENT.map((name) => `${WATCH_SELECTOR}[${name}]`)];
	var SCREEN_ATTRIBUTES = [
		...TWO_COLUMN_PRESENT,
		...TWO_COLUMN_ABSENT,
		PAGE_VIDEO_ID_ATTRIBUTE
	];
	var CHAT_FRAME_SELECTOR = "ytd-live-chat-frame";
	var CHAT_COLLAPSED_ATTRIBUTE = "collapsed";
	var PANEL_SELECTOR = "ytd-engagement-panel-section-list-renderer";
	var PANEL_VISIBILITY_ATTRIBUTE = "visibility";
	var PANEL_EXPANDED_VALUE = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
	var PANEL_COMMENTS_TARGET_ID = "engagement-panel-comments-section";
	var YOUTUBE_PANEL_ATTRIBUTES = [
		PANEL_VISIBILITY_ATTRIBUTE,
		"hidden",
		CHAT_COLLAPSED_ATTRIBUTE
	];
	function isDesktopSite() {
		return location.hostname === "www.youtube.com";
	}
	function urlVideoId() {
		try {
			return new URL(location.href).searchParams.get("v") || null;
		} catch {
			return null;
		}
	}
	function isVideoPage() {
		return location.pathname === "/watch" && Boolean(urlVideoId());
	}
	function isVideoId(value) {
		return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
	}
	function shortsVideoId() {
		const match = SHORTS_PATH.exec(location.pathname);
		return match && isVideoId(match[1]) ? match[1] : null;
	}
	function isEmbedShortsOrChatPage() {
		return EMBED_SHORTS_OR_CHAT_PATH.test(location.pathname);
	}
	function findPlayer() {
		return document.getElementById(PLAYER_ID);
	}
	function playerContaining(node) {
		if (!node || typeof node.closest !== "function") return null;
		return node.closest(PLAYER_SELECTOR);
	}
	function playerOfMediaEvent(event) {
		const target = event?.target;
		if (!target || target.tagName !== "VIDEO") return null;
		return playerContaining(target);
	}
	function isPlayerArea(node) {
		return Boolean(node && typeof node.closest === "function" && node.closest(PLAYER_AREA_SELECTOR));
	}
	function isAdShowing(player) {
		return Boolean(player) && AD_CLASSES.some((name) => player.classList.contains(name));
	}
	function findWatch(player) {
		const holder = player && typeof player.closest === "function" ? player.closest(WATCH_SELECTOR) : null;
		if (holder) return holder;
		const watches = [...document.querySelectorAll(WATCH_SELECTOR)];
		if (watches.length <= 1) return watches[0] || null;
		return watches.find((watch) => !watch.hidden && watch.getClientRects().length > 0) || watches.at(-1) || null;
	}
	function call(player, method, ...args) {
		if (!player || typeof player[method] !== "function") throw new TypeError(`player.${method} is unavailable`);
		return player[method](...args);
	}
	function playerVideoId(player) {
		try {
			return call(player, "getVideoData").video_id || null;
		} catch {
			return null;
		}
	}
	function currentVideoId(player = findPlayer()) {
		if (isVideoPage()) return urlVideoId();
		return isAdShowing(player) ? null : playerVideoId(player);
	}
	function playerFollowsVideo(player, videoId) {
		if (!videoId || playerVideoId(player) !== videoId) return false;
		try {
			const responseId = call(player, "getPlayerResponse")?.videoDetails?.videoId;
			return !responseId || responseId === videoId;
		} catch {
			return true;
		}
	}
	function pageFollowsUrl(watch) {
		const videoId = urlVideoId();
		const pageVideoId = watch?.getAttribute(PAGE_VIDEO_ID_ATTRIBUTE);
		return Boolean(videoId && pageVideoId && videoId === pageVideoId);
	}
	function findApp() {
		return document.querySelector("ytd-app");
	}
	function isBrowserFullscreen() {
		return Boolean(document.fullscreenElement);
	}
	function isFullscreen(watch) {
		return isBrowserFullscreen() || Boolean(watch?.hasAttribute(FULLSCREEN_ATTRIBUTE));
	}
	function isTwoColumnScreen(watch) {
		if (!watch || !isVideoPage() || isBrowserFullscreen()) return false;
		return TWO_COLUMN_PRESENT.every((name) => watch.hasAttribute(name)) && TWO_COLUMN_ABSENT.every((name) => !watch.hasAttribute(name));
	}
	function findSecondaryInner(watch) {
		return watch?.querySelector("#secondary-inner") || null;
	}
	function findCommentsHome(watch) {
		return watch?.querySelector(COMMENTS_HOME_SELECTOR) || watch?.querySelector("#primary") || null;
	}
	function isYoutubePanelOpen(watch) {
		const inner = findSecondaryInner(watch);
		if (!inner) return false;
		const chat = inner.querySelector(`${CHAT_FRAME_SELECTOR}:not([${CHAT_COLLAPSED_ATTRIBUTE}])`);
		if (chat && chat.getClientRects().length > 0) return true;
		return [...inner.querySelectorAll(`${PANEL_SELECTOR}[${PANEL_VISIBILITY_ATTRIBUTE}="${PANEL_EXPANDED_VALUE}"]`)].some((panel) => (panel.getAttribute("target-id") || "") !== PANEL_COMMENTS_TARGET_ID && panel.getClientRects().length > 0);
	}
	function videoAspectRatio(player) {
		try {
			const ratio = Number(call(player, "getVideoAspectRatio"));
			return Number.isFinite(ratio) && ratio > 0 ? ratio : NaN;
		} catch {
			return NaN;
		}
	}
	function videoContentRect(player) {
		try {
			const rect = call(player, "getVideoContentRect");
			return rect && rect.width > 0 && rect.height > 0 ? rect : null;
		} catch {
			return null;
		}
	}
	function playerState(player) {
		try {
			return call(player, "getPlayerState");
		} catch {
			return null;
		}
	}
	function isPlaying(player) {
		return playerState(player) === PLAYING_STATE;
	}
	function isStopped(player) {
		return STOPPED_STATES.includes(playerState(player));
	}
	function videoKeywords(player) {
		try {
			const keywords = call(player, "getPlayerResponse").videoDetails.keywords;
			return Array.isArray(keywords) ? keywords.filter((keyword) => typeof keyword === "string") : [];
		} catch {
			return [];
		}
	}
	function setVideoKeywords(player, keywords) {
		try {
			call(player, "updateVideoData", { keywords });
			return true;
		} catch {
			return false;
		}
	}
	function availableQualities(player) {
		try {
			const data = call(player, "getAvailableQualityData");
			return Array.isArray(data) ? data : [];
		} catch {
			return [];
		}
	}
	function setPlaybackQuality(player, quality, ...format) {
		try {
			call(player, "setPlaybackQualityRange", quality, quality, ...format);
			return true;
		} catch {
			return false;
		}
	}
	function requestLayout() {
		window.dispatchEvent(new Event("resize"));
	}
	var COMMENTS_OFF_BY_UPLOADER = "uploader";
	var COMMENTS_OFF_LIVE_LOOK = "live-look";
	function findNativeComments(watch, ignoreInside = null) {
		if (!watch) return null;
		return [...watch.querySelectorAll("ytd-comments#comments")].find((node) => !(ignoreInside && node.closest(ignoreInside)) && node.closest("#primary")) || null;
	}
	function findNativeRelated(watch) {
		const secondaryInner = findSecondaryInner(watch);
		if (!secondaryInner) return null;
		return [...secondaryInner.children].find((child) => child.matches(RELATED_SELECTORS.join(", "))) || null;
	}
	function commentsHaveLoaded(node) {
		if (!node) return false;
		return Boolean(node.querySelector(COMMENTS_LOADED_SELECTOR));
	}
	function commentsOffCandidate(node, watch) {
		if (!node) return null;
		if (node.querySelector("ytd-message-renderer, #message") && !node.querySelector("ytd-comments-header-renderer, ytd-comment-thread-renderer")) return COMMENTS_OFF_BY_UPLOADER;
		if (node.hasAttribute("hidden") && !node.firstElementChild && watch?.querySelector(`#secondary-inner ${CHAT_FRAME_SELECTOR}`)) return COMMENTS_OFF_LIVE_LOOK;
		return null;
	}
	var QUALITY_HEIGHT = {
		highres: 4320,
		hd2160: 2160,
		hd1440: 1440,
		hd1080: 1080,
		hd720: 720,
		large: 480,
		medium: 360,
		small: 240,
		tiny: 144
	};
	var MAX_HEIGHT = 2160;
	var applied = new WeakMap();
	function pickBest(entries) {
		let best = null;
		for (const entry of entries) {
			if (!entry || !entry.isPlayable) continue;
			const height = QUALITY_HEIGHT[entry.quality];
			if (!height || height > MAX_HEIGHT) continue;
			const bestHeight = best ? QUALITY_HEIGHT[best.quality] : 0;
			if (height > bestHeight) best = entry;
			else if (height === bestHeight && !best.paygatedQualityDetails && entry.paygatedQualityDetails) best = entry;
		}
		return best;
	}
	function applyMaxQuality(player) {
		const best = pickBest(availableQualities(player));
		if (!best) return false;
		return setPlaybackQuality(player, best.quality, ...best.paygatedQualityDetails ? [best.formatId] : []);
	}
	function handlePlaying(player) {
		if (isAdShowing(player)) return;
		const id = currentVideoId(player);
		if (!id || !playerFollowsVideo(player, id)) return;
		if (id === applied.get(player)) return;
		if (applyMaxQuality(player)) applied.set(player, id);
	}
	function start$2() {
		const controller = new AbortController();
		const stop = () => controller.abort();
		document.addEventListener("playing", (event) => {
			const player = playerOfMediaEvent(event);
			if (player) handlePlaying(player);
		}, {
			capture: true,
			signal: controller.signal
		});
		const existing = findPlayer();
		if (existing && isPlaying(existing)) handlePlaying(existing);
		return stop;
	}
	var max_quality_default = {
		id: "max-quality",
		frames: true,
		start: start$2
	};
	var SCRIPT_ID = "tubekit";
	function createBorrowedRegion({ pane, root, find, markerName, fallbackHome, yieldsToYouTubeMoves = false }) {
		let node = null;
		let marker = null;
		let home = null;
		const isOutsidePanel = (target) => Boolean(target?.isConnected) && !root.contains(target);
		function forgetMemory() {
			node = null;
			marker = null;
			home = null;
		}
		return {
			pane,
			get node() {
				return node;
			},
			contains(target) {
				return Boolean(node && target && node.contains(target));
			},
			take(watch, beforeMove) {
				const found = find(watch);
				if (!found) return null;
				if (node && node !== found && node.parentNode === pane) node.remove();
				if (!marker) {
					home = found.parentNode;
					marker = document.createComment(`${SCRIPT_ID}:${markerName}`);
					found.parentNode.insertBefore(marker, found);
				}
				beforeMove?.(found);
				pane.appendChild(found);
				node = found;
				return found;
			},
			replaced(watch) {
				const replacement = find(watch);
				return Boolean(replacement) || Boolean(node && node.parentNode !== pane);
			},
			forget() {
				if (node?.parentNode === pane) node.remove();
				marker?.remove();
				forgetMemory();
			},
			restore(watch, { videoId, before = null }) {
				const held = node;
				const homeMarker = marker;
				const homeParent = home;
				forgetMemory();
				if (!held || !watch?.isConnected || watch.getAttribute("video-id") !== videoId) {
					homeMarker?.remove();
					return;
				}
				if (find(watch)) {
					homeMarker?.remove();
					return;
				}
				if (held.parentNode !== pane) {
					if (yieldsToYouTubeMoves && isOutsidePanel(held) && watch.contains(held)) {
						homeMarker?.remove();
						return;
					}
					if (isOutsidePanel(before) && watch.contains(before)) {
						before.before(held);
						homeMarker?.remove();
						return;
					}
				}
				if (homeMarker?.isConnected && watch.contains(homeMarker)) {
					homeMarker.replaceWith(held);
					return;
				}
				fallbackHome(watch, homeParent)?.appendChild(held);
				homeMarker?.remove();
			}
		};
	}
	function createCommentsRegion(pane, root) {
		return createBorrowedRegion({
			pane,
			root,
			find: (watch) => findNativeComments(watch, `#${SCRIPT_ID}-root`),
			markerName: "comments-home",
			fallbackHome: (watch, home) => home?.isConnected && watch.contains(home) ? home : findCommentsHome(watch)
		});
	}
	function createRelatedRegion(pane, root) {
		return createBorrowedRegion({
			pane,
			root,
			find: findNativeRelated,
			markerName: "related-home",
			fallbackHome: findSecondaryInner,
			yieldsToYouTubeMoves: true
		});
	}
	var COMMENTS_WAIT_MS = 2e4;
	var LIVE_COMMENTS_GRACE_MS = 3e3;
	var COMMENTS_CHECK_MS = 250;
	var LOADING = "loading";
	var LOADED = "loaded";
	var FAILED = "failed";
	function createCommentsLoader({ region, watch, videoId, onChange }) {
		let state = LOADING;
		let disposed = false;
		let observer = null;
		let findTimer = 0;
		let checkTimer = 0;
		let uploaderOff = false;
		const frames = new Set();
		const isDecided = () => state === "loaded" || state === "off";
		function emit(next) {
			state = next;
			onChange(next);
		}
		function settle(next) {
			window.clearTimeout(findTimer);
			if (state !== next) emit(next);
		}
		function nextFrame(callback) {
			const frame = requestAnimationFrame(() => {
				frames.delete(frame);
				if (!disposed) callback();
			});
			frames.add(frame);
		}
		function check() {
			const node = region.node;
			if (disposed || !node || videoId !== urlVideoId()) return;
			if (commentsOffCandidate(node, watch) === "uploader") {
				if (!uploaderOff) {
					uploaderOff = true;
					window.clearTimeout(findTimer);
					emit("off");
				} else settle("off");
				return;
			}
			uploaderOff = false;
			if (commentsHaveLoaded(node) || state === "off") settle(LOADED);
		}
		function observe() {
			observer?.disconnect();
			window.clearTimeout(checkTimer);
			checkTimer = 0;
			uploaderOff = false;
			const node = region.node;
			if (!node) return;
			observer = new MutationObserver(() => {
				if (checkTimer) return;
				checkTimer = window.setTimeout(() => {
					checkTimer = 0;
					check();
				}, COMMENTS_CHECK_MS);
			});
			observer.observe(node, {
				childList: true,
				subtree: true
			});
			check();
		}
		function adopt() {
			if (disposed || !region.pane.isConnected) return true;
			if (region.node) return isDecided();
			if (!region.take(watch)) return false;
			observe();
			nextFrame(() => {
				region.pane.dispatchEvent(new Event("scroll"));
				window.dispatchEvent(new Event("scroll"));
			});
			return isDecided();
		}
		function wait(startedAt = performance.now()) {
			window.clearTimeout(findTimer);
			if (adopt() || isDecided()) return;
			if (disposed || !region.pane.isConnected) return;
			const elapsed = performance.now() - startedAt;
			if (elapsed >= LIVE_COMMENTS_GRACE_MS && commentsOffCandidate(region.node, watch) === "live-look") {
				settle("off");
				return;
			}
			if (elapsed >= COMMENTS_WAIT_MS) {
				emit(FAILED);
				return;
			}
			findTimer = window.setTimeout(() => wait(startedAt), COMMENTS_CHECK_MS);
		}
		return {
			get state() {
				return state;
			},
			start() {
				wait();
			},
			retry() {
				if (disposed || state !== "failed") return;
				emit(LOADING);
				if (region.node) {
					const pane = region.pane;
					pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight - 1);
					pane.dispatchEvent(new Event("scroll"));
					nextFrame(() => {
						pane.scrollTop = 0;
					});
				}
				window.dispatchEvent(new Event("scroll"));
				wait();
			},
			refresh() {
				if (disposed || !region.replaced(watch)) return;
				observer?.disconnect();
				window.clearTimeout(checkTimer);
				checkTimer = 0;
				window.clearTimeout(findTimer);
				region.forget();
				emit(LOADING);
				wait();
			},
			dispose() {
				disposed = true;
				observer?.disconnect();
				observer = null;
				window.clearTimeout(findTimer);
				window.clearTimeout(checkTimer);
				checkTimer = 0;
				frames.forEach((frame) => cancelAnimationFrame(frame));
				frames.clear();
			}
		};
	}
	var ACTIVE_CLASS = `${SCRIPT_ID}-active`;
	var HELD_CLASS = `${SCRIPT_ID}-suspended`;
	var SHOWN_SCOPE = `html.${ACTIVE_CLASS}:not(.${HELD_CLASS})`;
	var HELD_STYLES = `#${SCRIPT_ID}-root[data-suspended='true'] {
      display: none !important;
    }`;
	var RELEASED = "released";
	var SHOWN = "shown";
	var HELD = "held";
	var initialLifecycle = Object.freeze({
		phase: RELEASED,
		rememberedTab: null
	});
	var effect = (type, fields = {}) => ({
		type,
		...fields
	});
	function keepsPanel(observation) {
		if (observation.wrongGeneration || observation.brokenRoot) return false;
		return observation.fullscreen || observation.twoColumn;
	}
	function step(state, observation) {
		const effects = [];
		if (observation.navigating) {
			if (state.phase !== "released") effects.push(effect("teardown"));
			return {
				state: {
					phase: RELEASED,
					rememberedTab: null
				},
				effects
			};
		}
		let { phase, rememberedTab } = state;
		if (phase !== "released" && !keepsPanel(observation)) {
			effects.push(effect("teardown"));
			phase = RELEASED;
			rememberedTab = observation.currentTab ?? null;
		}
		if (rememberedTab && rememberedTab.videoId !== observation.videoId) rememberedTab = null;
		if (phase === "released") {
			if (!observation.twoColumn) return {
				state: {
					phase,
					rememberedTab
				},
				effects
			};
			effects.push(effect("mount", { tab: rememberedTab?.tab ?? "comments" }));
			phase = SHOWN;
		}
		const held = Boolean(observation.fullscreen || observation.youtubePanel);
		if (phase === "shown" && held) {
			effects.push(effect("saveScroll"), effect("hide"));
			phase = HELD;
		} else if (phase === "held" && !held) {
			effects.push(effect("unhide"), effect("restoreTab"));
			phase = SHOWN;
		}
		return {
			state: {
				phase,
				rememberedTab
			},
			effects
		};
	}
	function mountFailed(state) {
		return {
			...state,
			phase: RELEASED
		};
	}
	var TWO_COLUMN_SCOPE = `${SHOWN_SCOPE} ${TWO_COLUMN_SELECTOR}`;
	var ROOT_SELECTOR = `#${SCRIPT_ID}-root`;
	function addStyles() {
		if (document.getElementById(`tubekit-styles`)) return;
		const style = document.createElement("style");
		style.id = `${SCRIPT_ID}-styles`;
		style.textContent = `
    ${TWO_COLUMN_SCOPE} ${SECONDARY_SELECTOR} {
      position: sticky !important;
      top: calc(var(--ytd-masthead-height, 56px) + 12px) !important;
      align-self: flex-start !important;
      height: calc(100vh - var(--ytd-masthead-height, 56px) - 24px) !important;
      max-height: calc(100vh - var(--ytd-masthead-height, 56px) - 24px) !important;
      min-height: 280px !important;
      margin-top: 12px !important;
      padding-top: 0 !important;
      overflow-x: clip !important;
      overflow-y: clip !important;
    }

    ${TWO_COLUMN_SCOPE} ${SECONDARY_INNER_SELECTOR} {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow-x: clip !important;
      overflow-y: clip !important;
    }

    ${RELATED_SELECTORS.map((selector) => `${TWO_COLUMN_SCOPE} ${SECONDARY_INNER_SELECTOR} > ${selector}`).join(",\n    ")} {
      display: none !important;
    }

    #${SCRIPT_ID}-root {
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #fff));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #0f0f0f));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #606060));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .1)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .05)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .1)));
      --${SCRIPT_ID}-toast-bg: var(--yt-sys-color-baseline--inverted-background, #0f0f0f);
      --${SCRIPT_ID}-toast-text: var(--yt-sys-color-baseline--text-primary-inverse, var(--yt-spec-text-primary-inverse, #fff));
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 180px;
      overflow: hidden;
      color: var(--${SCRIPT_ID}-text);
      background: var(--${SCRIPT_ID}-bg);
    }

    html[dark] #${SCRIPT_ID}-root {
      color-scheme: dark;
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #0f0f0f));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #f1f1f1));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #aaa));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .2)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .1)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(255, 255, 255, .2)));
      --${SCRIPT_ID}-toast-bg: var(--yt-sys-color-baseline--inverted-background, #f1f1f1);
      --${SCRIPT_ID}-toast-text: var(--yt-sys-color-baseline--text-primary-inverse, var(--yt-spec-text-primary-inverse, #0f0f0f));
    }

    ${HELD_STYLES}

    #${SCRIPT_ID}-tabs {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 0 0 auto;
      gap: 4px;
      padding: 0 0 8px;
      margin-right: var(--${SCRIPT_ID}-content-inset, 0px);
      background: var(--${SCRIPT_ID}-bg);
      border-bottom: 1px solid var(--${SCRIPT_ID}-outline);
    }

    .${SCRIPT_ID}-tab {
      box-sizing: border-box;
      min-width: 0;
      height: 38px;
      padding: 0 12px;
      overflow: hidden;
      color: var(--${SCRIPT_ID}-text-secondary);
      font: 500 14px/38px Roboto, Arial, sans-serif;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: 8px;
    }

    .${SCRIPT_ID}-tab:hover {
      background: var(--${SCRIPT_ID}-hover);
    }

    .${SCRIPT_ID}-tab[aria-selected='true'] {
      color: var(--${SCRIPT_ID}-text);
      background: var(--${SCRIPT_ID}-selected);
      font-weight: 600;
    }

    #${SCRIPT_ID}-body {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    .${SCRIPT_ID}-pane {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: none;
      overflow-x: hidden;
      overflow-y: auto;
      padding-right: var(--${SCRIPT_ID}-pane-gutter, 0px);
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .${SCRIPT_ID}-pane[data-active='true'] {
      display: block;
    }

    #${SCRIPT_ID}-comments-pane ytd-comment-thread-renderer,
    #${SCRIPT_ID}-related-pane ytd-compact-video-renderer,
    #${SCRIPT_ID}-related-pane yt-lockup-view-model {
      content-visibility: auto;
      contain-intrinsic-size: auto 150px;
    }

    #${SCRIPT_ID}-comments-pane ytd-comment-thread-renderer:has(ytd-commentbox[is-emoji-picker-displayed]) {
      content-visibility: visible;
    }

    #${SCRIPT_ID}-comments-pane ytd-commentbox #emojis {
      box-sizing: border-box !important;
      width: auto !important;
      max-width: 100% !important;
      right: 0 !important;
    }

    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #categories-wrapper,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #category-buttons,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #search-panel {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    #${SCRIPT_ID}-comments-pane > ${COMMENTS_SELECTOR} {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 0 24px !important;
    }

    ${RELATED_SELECTORS.map((selector) => `#${SCRIPT_ID}-related-pane > ${selector}`).join(",\n    ")} {
      box-sizing: border-box !important;
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 0 24px !important;
    }

    .${SCRIPT_ID}-status {
      box-sizing: border-box;
      display: grid;
      min-height: 140px;
      place-content: center;
      gap: 12px;
      padding: 24px;
      color: var(--${SCRIPT_ID}-text-secondary);
      font: 400 14px/20px Roboto, Arial, sans-serif;
      text-align: center;
    }

    .${SCRIPT_ID}-retry {
      justify-self: center;
      height: 36px;
      padding: 0 16px;
      color: var(--${SCRIPT_ID}-text);
      font: 500 14px/36px Roboto, Arial, sans-serif;
      cursor: pointer;
      background: var(--${SCRIPT_ID}-selected);
      border: 0;
      border-radius: 18px;
    }

    #${SCRIPT_ID}-toast {
      position: absolute;
      z-index: 5;
      right: calc(12px + var(--${SCRIPT_ID}-content-inset, 0px));
      bottom: 12px;
      left: 12px;
      box-sizing: border-box;
      padding: 12px 14px;
      color: var(--${SCRIPT_ID}-toast-text);
      font: 400 13px/18px Roboto, Arial, sans-serif;
      pointer-events: none;
      background: var(--${SCRIPT_ID}-toast-bg);
      border-radius: 8px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .18s ease, transform .18s ease;
    }

    #${SCRIPT_ID}-toast[data-visible='true'] {
      opacity: 1;
      transform: translateY(0);
    }

    ${NOT_TWO_COLUMN_SELECTORS.map((selector) => `${selector} ${ROOT_SELECTOR}`).join(",\n    ")} {
      display: none !important;
    }
  `;
		(document.head || document.documentElement).appendChild(style);
	}
	var SCROLLBAR_AREA_WIDTH = 14;
	var SCROLL_IDLE_MS = 150;
	var state = {
		generation: 0,
		videoId: null,
		watch: null,
		root: null,
		commentsPane: null,
		relatedPane: null,
		commentsRegion: null,
		relatedRegion: null,
		commentsLoader: null,
		unavailableTimer: 0,
		activeTab: "comments",
		scrollTop: {
			comments: 0,
			related: 0
		},
		lifecycle: initialLifecycle,
		youtubePanelOpen: false,
		evaluationTimer: 0,
		lastPaneScrollAt: 0,
		statusShown: false,
		retryTimer: 0,
		specialObserver: null,
		appObserver: null,
		observerTarget: null
	};
	var labels = () => {
		return (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("ko") ? {
			comments: "댓글",
			related: "관련 동영상",
			loading: "댓글을 불러오는 중…",
			loadFailed: "댓글을 불러오지 못했습니다.",
			retry: "다시 시도",
			unavailable: "이 영상에서는 댓글을 사용할 수 없어 관련 동영상을 표시합니다."
		} : {
			comments: "Comments",
			related: "Related videos",
			loading: "Loading comments…",
			loadFailed: "Comments could not be loaded.",
			retry: "Retry",
			unavailable: "Comments are unavailable for this video. Showing related videos."
		};
	};
	function isEligible(watch) {
		return isTwoColumnScreen(watch) && pageFollowsUrl(watch);
	}
	function isRootBroken(watch) {
		return !state.root.isConnected || state.root.parentNode !== findSecondaryInner(watch) || !state.root.contains(state.commentsPane) || !state.root.contains(state.relatedPane);
	}
	function isWrongGeneration(watch) {
		return state.watch !== watch || state.videoId !== urlVideoId() || !pageFollowsUrl(watch);
	}
	function observe(measurePanel) {
		const watch = findWatch();
		const mounted = Boolean(state.root);
		const twoColumn = isEligible(watch);
		const fullscreen = isFullscreen(watch);
		const wrongGeneration = mounted && isWrongGeneration(watch);
		const brokenRoot = mounted && isRootBroken(watch);
		const phase = state.lifecycle.phase;
		const mayReveal = twoColumn && (phase === "released" || wrongGeneration || brokenRoot || phase === "held" && !fullscreen && !state.youtubePanelOpen);
		if (measurePanel || mayReveal) state.youtubePanelOpen = isYoutubePanelOpen(watch);
		return {
			watch,
			observation: {
				navigating: false,
				videoId: urlVideoId(),
				twoColumn,
				fullscreen,
				youtubePanel: state.youtubePanelOpen,
				wrongGeneration,
				brokenRoot,
				currentTab: mounted && state.videoId ? {
					videoId: state.videoId,
					tab: state.activeTab
				} : null
			}
		};
	}
	function statusElement(kind) {
		const text = labels();
		const box = document.createElement("div");
		box.className = `${SCRIPT_ID}-status`;
		box.dataset.kind = kind;
		const message = document.createElement("div");
		message.textContent = kind === "error" ? text.loadFailed : text.loading;
		box.appendChild(message);
		if (kind === "error") {
			const retry = document.createElement("button");
			retry.type = "button";
			retry.className = `${SCRIPT_ID}-retry`;
			retry.textContent = text.retry;
			retry.addEventListener("click", retryComments);
			box.appendChild(retry);
		}
		return box;
	}
	function setCommentsStatus(kind) {
		if (!state.commentsPane) return;
		if (!kind && !state.statusShown) return;
		state.commentsPane.querySelectorAll(`:scope > .${SCRIPT_ID}-status`).forEach((node) => node.remove());
		state.statusShown = Boolean(kind);
		if (kind) state.commentsPane.prepend(statusElement(kind));
	}
	function buildRoot() {
		const text = labels();
		const root = document.createElement("section");
		root.id = `${SCRIPT_ID}-root`;
		root.setAttribute("aria-label", `${text.comments} / ${text.related}`);
		const tabs = document.createElement("div");
		tabs.id = `${SCRIPT_ID}-tabs`;
		tabs.setAttribute("role", "tablist");
		for (const tabName of ["comments", "related"]) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `${SCRIPT_ID}-tab`;
			button.dataset.tab = tabName;
			button.id = `${SCRIPT_ID}-${tabName}-tab`;
			button.setAttribute("role", "tab");
			button.setAttribute("aria-controls", `${SCRIPT_ID}-${tabName}-pane`);
			button.textContent = text[tabName];
			button.addEventListener("click", () => switchTab(tabName));
			tabs.appendChild(button);
		}
		tabs.addEventListener("keydown", (event) => {
			const buttons = [...tabs.querySelectorAll("[role=\"tab\"]")];
			const index = buttons.indexOf(document.activeElement);
			if (index < 0) return;
			let next;
			if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
			else if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = buttons.length - 1;
			else return;
			event.preventDefault();
			switchTab(buttons[next].dataset.tab);
			buttons[next].focus();
		});
		const body = document.createElement("div");
		body.id = `${SCRIPT_ID}-body`;
		const commentsPane = document.createElement("div");
		commentsPane.id = `${SCRIPT_ID}-comments-pane`;
		commentsPane.className = `${SCRIPT_ID}-pane`;
		commentsPane.dataset.tab = "comments";
		commentsPane.setAttribute("role", "tabpanel");
		commentsPane.setAttribute("aria-labelledby", `${SCRIPT_ID}-comments-tab`);
		commentsPane.addEventListener("scroll", recordPaneScroll, { passive: true });
		const relatedPane = document.createElement("div");
		relatedPane.id = `${SCRIPT_ID}-related-pane`;
		relatedPane.className = `${SCRIPT_ID}-pane`;
		relatedPane.dataset.tab = "related";
		relatedPane.setAttribute("role", "tabpanel");
		relatedPane.setAttribute("aria-labelledby", `${SCRIPT_ID}-related-tab`);
		relatedPane.addEventListener("scroll", recordPaneScroll, { passive: true });
		const toast = document.createElement("div");
		toast.id = `${SCRIPT_ID}-toast`;
		toast.setAttribute("role", "status");
		toast.setAttribute("aria-live", "polite");
		body.append(commentsPane, relatedPane, toast);
		root.append(tabs, body);
		state.root = root;
		state.commentsPane = commentsPane;
		state.relatedPane = relatedPane;
		setCommentsStatus("loading");
		return root;
	}
	function refreshLabels() {
		if (!state.root) return;
		const text = labels();
		const commentsTab = state.root.querySelector(`[data-tab='comments'].${SCRIPT_ID}-tab`);
		const relatedTab = state.root.querySelector(`[data-tab='related'].${SCRIPT_ID}-tab`);
		if (commentsTab && commentsTab.textContent !== text.comments) commentsTab.textContent = text.comments;
		if (relatedTab && relatedTab.textContent !== text.related) relatedTab.textContent = text.related;
		const label = `${text.comments} / ${text.related}`;
		if (state.root.getAttribute("aria-label") !== label) state.root.setAttribute("aria-label", label);
	}
	function isHidden() {
		return state.lifecycle.phase === HELD;
	}
	function isPaneShown(pane) {
		return Boolean(pane) && !isHidden() && pane.getClientRects().length > 0;
	}
	function saveActiveScrollTop() {
		const pane = state.activeTab === "comments" ? state.commentsPane : state.relatedPane;
		if (isPaneShown(pane)) state.scrollTop[state.activeTab] = pane.scrollTop;
	}
	function recordPaneScroll(event) {
		const pane = event.currentTarget;
		const tab = pane.dataset.tab;
		if (!isPaneShown(pane) || pane.scrollTop === state.scrollTop[tab]) return;
		state.lastPaneScrollAt = performance.now();
		state.scrollTop[tab] = pane.scrollTop;
	}
	function syncScrollbarInsets() {
		const pane = state.activeTab === "comments" ? state.commentsPane : state.relatedPane;
		if (!state.root || !pane || pane.offsetWidth === 0) return;
		const scrollbar = Math.max(0, pane.offsetWidth - pane.clientWidth);
		setRootVariable("pane-gutter", `${Math.max(0, SCROLLBAR_AREA_WIDTH - scrollbar)}px`);
		setRootVariable("content-inset", `${Math.max(scrollbar, SCROLLBAR_AREA_WIDTH)}px`);
	}
	function setRootVariable(name, value) {
		const property = `--${SCRIPT_ID}-${name}`;
		if (state.root.style.getPropertyValue(property) === value) return;
		state.root.style.setProperty(property, value);
	}
	function switchTab(tabName, options = {}) {
		if (!state.root || !["comments", "related"].includes(tabName)) return;
		if (!options.keepSaved) saveActiveScrollTop();
		state.activeTab = tabName;
		state.root.querySelectorAll(`.${SCRIPT_ID}-tab`).forEach((button) => {
			const selected = button.dataset.tab === tabName;
			button.setAttribute("aria-selected", String(selected));
			button.tabIndex = selected ? 0 : -1;
		});
		state.root.querySelectorAll(`.${SCRIPT_ID}-pane`).forEach((pane) => {
			pane.dataset.active = String(pane.dataset.tab === tabName);
		});
		const activePane = tabName === "comments" ? state.commentsPane : state.relatedPane;
		const generation = state.generation;
		const target = options.reset ? 0 : state.scrollTop[tabName];
		requestAnimationFrame(() => {
			if (generation !== state.generation || !activePane?.isConnected || state.activeTab !== tabName) return;
			activePane.scrollTop = target;
			activePane.dispatchEvent(new Event("scroll"));
			syncScrollbarInsets();
		});
	}
	function showToast(message) {
		const toast = state.root?.querySelector(`#${SCRIPT_ID}-toast`);
		if (!toast) return;
		clearTimeout(state.retryTimer);
		toast.textContent = message;
		toast.dataset.visible = "true";
		state.retryTimer = window.setTimeout(() => {
			toast.dataset.visible = "false";
		}, 4500);
	}
	function showCommentsUnavailable() {
		setCommentsStatus(null);
		showToast(labels().unavailable);
		state.unavailableTimer = window.setTimeout(() => {
			if (state.commentsLoader?.state === "off" && state.videoId === urlVideoId()) switchTab("related");
		}, 900);
	}
	function reactToComments(commentsState) {
		clearTimeout(state.unavailableTimer);
		if (commentsState === "loading") setCommentsStatus("loading");
		else if (commentsState === "failed") setCommentsStatus("error");
		else if (commentsState === "loaded") setCommentsStatus(null);
		else if (commentsState === "off") showCommentsUnavailable();
	}
	function retryComments() {
		if (!state.root) return;
		switchTab("comments");
		state.commentsLoader.retry();
	}
	function observeSpecialPanels() {
		state.specialObserver?.disconnect();
		const inner = findSecondaryInner(state.watch);
		if (!inner) return;
		const generation = state.generation;
		let pending = false;
		state.specialObserver = new MutationObserver((records) => {
			if (pending || state.root && records.every((record) => !record.target.isConnected || state.root.contains(record.target))) return;
			pending = true;
			requestAnimationFrame(() => {
				pending = false;
				if (generation === state.generation) advanceLifecycle();
			});
		});
		state.specialObserver.observe(inner, {
			attributes: true,
			attributeFilter: YOUTUBE_PANEL_ATTRIBUTES,
			childList: true,
			subtree: true
		});
	}
	function syncReplacedRelated() {
		if (!state.root?.isConnected || !state.relatedPane) return;
		const region = state.relatedRegion;
		if (!region.replaced(state.watch)) return;
		const savedScrollTop = state.activeTab === "related" && isPaneShown(state.relatedPane) ? state.relatedPane.scrollTop : state.scrollTop.related;
		if (!region.take(state.watch)) return;
		state.scrollTop.related = savedScrollTop;
		const generation = state.generation;
		requestAnimationFrame(() => {
			if (generation === state.generation && state.activeTab === "related" && state.relatedPane) state.relatedPane.scrollTop = savedScrollTop;
		});
	}
	function applyHeld(held) {
		document.documentElement.classList.toggle(HELD_CLASS, held);
		state.root.dataset.suspended = String(held);
	}
	function mount(watch, initialTab) {
		if (!findSecondaryInner(watch) || !findNativeRelated(watch)) return false;
		state.generation += 1;
		state.watch = watch;
		state.videoId = urlVideoId();
		state.activeTab = initialTab;
		state.scrollTop = {
			comments: 0,
			related: 0
		};
		const root = buildRoot();
		state.relatedRegion = createRelatedRegion(state.relatedPane, root);
		state.commentsRegion = createCommentsRegion(state.commentsPane, root);
		state.commentsLoader = createCommentsLoader({
			region: state.commentsRegion,
			watch,
			videoId: state.videoId,
			onChange: reactToComments
		});
		state.relatedRegion.take(watch, (related) => related.before(root));
		document.documentElement.classList.add(ACTIVE_CLASS);
		applyHeld(false);
		switchTab(initialTab, { reset: true });
		observeSpecialPanels();
		state.commentsLoader.start();
		return true;
	}
	function teardown() {
		clearTimeout(state.unavailableTimer);
		clearTimeout(state.retryTimer);
		state.specialObserver?.disconnect();
		state.specialObserver = null;
		state.commentsLoader?.dispose();
		const comments = state.commentsRegion;
		const related = state.relatedRegion;
		const relatedBeforeComments = related?.node && related.node.nextElementSibling === comments?.node ? comments.node : null;
		comments?.restore(state.watch, { videoId: state.videoId });
		related?.restore(state.watch, {
			videoId: state.videoId,
			before: relatedBeforeComments
		});
		state.root?.remove();
		document.documentElement.classList.remove(ACTIVE_CLASS, HELD_CLASS);
		state.generation += 1;
		state.root = null;
		state.commentsPane = null;
		state.relatedPane = null;
		state.commentsRegion = null;
		state.relatedRegion = null;
		state.commentsLoader = null;
		state.videoId = null;
		state.watch = null;
	}
	var reflectors = {
		teardown,
		mount: (effect, watch) => mount(watch, effect.tab),
		saveScroll: () => saveActiveScrollTop(),
		hide: () => applyHeld(true),
		unhide: () => applyHeld(false),
		restoreTab: () => switchTab(state.activeTab, { keepSaved: true })
	};
	function advanceLifecycle(facts = {}, { measurePanel = true } = {}) {
		const { watch, observation } = observe(measurePanel);
		const { state: next, effects } = step(state.lifecycle, {
			...observation,
			...facts
		});
		for (const effect of effects) if (reflectors[effect.type](effect, watch) === false) {
			state.lifecycle = mountFailed(next);
			return;
		}
		state.lifecycle = next;
	}
	function evaluate() {
		addStyles();
		refreshLabels();
		advanceLifecycle();
		if (state.root) {
			state.commentsLoader.refresh();
			syncReplacedRelated();
			syncScrollbarInsets();
		}
	}
	function isInsideAdoptedContent(node) {
		return Boolean(state.commentsRegion?.contains(node) || state.relatedRegion?.contains(node));
	}
	var isIrrelevantTarget = (node) => !node.isConnected || isInsideAdoptedContent(node) || isPlayerArea(node);
	var isIdleOffWatch = () => !state.root && !isVideoPage();
	var onlyIrrelevantChanges = (records) => records.every((record) => isIrrelevantTarget(record.target));
	function onAppMutations(records) {
		if (isIdleOffWatch() || onlyIrrelevantChanges(records)) return;
		advanceLifecycle({}, { measurePanel: false });
		scheduleEvaluation();
	}
	function scheduleEvaluation(delay = 80) {
		clearTimeout(state.evaluationTimer);
		const run = () => {
			const wait = SCROLL_IDLE_MS - (performance.now() - state.lastPaneScrollAt);
			if (state.lastPaneScrollAt > 0 && wait > 0) {
				state.evaluationTimer = window.setTimeout(run, wait);
				return;
			}
			evaluate();
		};
		state.evaluationTimer = window.setTimeout(run, delay);
	}
	function retargetObserver() {
		const target = findApp() || document.documentElement;
		if (!target || target === state.observerTarget) return;
		state.appObserver?.disconnect();
		state.observerTarget = target;
		state.appObserver = new MutationObserver(onAppMutations);
		state.appObserver.observe(target, {
			attributes: true,
			attributeFilter: SCREEN_ATTRIBUTES,
			childList: true,
			subtree: true
		});
	}
	function onNavigateStart() {
		advanceLifecycle({ navigating: true });
		scheduleEvaluation(150);
	}
	function onFullscreenChange() {
		if (isBrowserFullscreen()) advanceLifecycle({ fullscreen: true });
		scheduleEvaluation(0);
	}
	function onUrlChanged() {
		advanceLifecycle();
		scheduleEvaluation(0);
	}
	function boot() {
		if (!isDesktopSite()) return () => {};
		addStyles();
		state.appObserver = new MutationObserver((records) => {
			retargetObserver();
			onAppMutations(records);
		});
		state.observerTarget = document.documentElement;
		state.appObserver.observe(document.documentElement, {
			childList: true,
			subtree: true
		});
		retargetObserver();
		const controller = new AbortController();
		const { signal } = controller;
		const capture = {
			capture: true,
			signal
		};
		document.addEventListener("yt-navigate-start", onNavigateStart, capture);
		document.addEventListener("yt-navigate-finish", () => scheduleEvaluation(0), capture);
		document.addEventListener("yt-page-data-updated", () => scheduleEvaluation(0), capture);
		window.addEventListener("fullscreenchange", onFullscreenChange, capture);
		window.addEventListener("popstate", onUrlChanged, capture);
		window.addEventListener("urlchange", onUrlChanged, capture);
		window.addEventListener("resize", () => scheduleEvaluation(180), {
			passive: true,
			signal
		});
		document.addEventListener("DOMContentLoaded", () => {
			retargetObserver();
			scheduleEvaluation(0);
		}, {
			once: true,
			signal
		});
		scheduleEvaluation(0);
		return () => {
			controller.abort();
			state.appObserver?.disconnect();
			state.commentsLoader?.dispose();
			state.specialObserver?.disconnect();
		};
	}
	var right_rail_comments_default = {
		id: "right-rail-comments",
		start: boot
	};
	function redirectTo(url) {
		location.replace(url);
	}
	function redirectIfShorts() {
		const id = shortsVideoId();
		if (!id) return;
		const rest = new URLSearchParams(location.search).toString();
		redirectTo(`/watch?v=${id}${rest ? `&${rest}` : ""}${location.hash}`);
	}
	function watchEndpointFor(endpoint) {
		const id = endpoint && endpoint.reelWatchEndpoint && endpoint.reelWatchEndpoint.videoId;
		if (!isVideoId(id)) return null;
		return {
			id,
			endpoint: {
				clickTrackingParams: endpoint.clickTrackingParams,
				commandMetadata: { webCommandMetadata: {
					url: `/watch?v=${id}`,
					webPageType: "WEB_PAGE_TYPE_WATCH",
					rootVe: 3832
				} },
				watchEndpoint: { videoId: id }
			}
		};
	}
	function rewriteEndpoint(event) {
		const detail = event.detail;
		const watch = detail && watchEndpointFor(detail.endpoint);
		if (!watch) return;
		detail.endpoint = watch.endpoint;
		if ("href" in detail) detail.href = `/watch?v=${watch.id}`;
	}
	function start$1() {
		const controller = new AbortController();
		const { signal } = controller;
		redirectIfShorts();
		document.addEventListener("yt-navigate", rewriteEndpoint, {
			capture: true,
			signal
		});
		document.addEventListener("yt-navigate-finish", redirectIfShorts, { signal });
		window.addEventListener("popstate", redirectIfShorts, { signal });
		window.addEventListener("navigate", rewriteEndpoint, {
			capture: true,
			signal
		});
		window.addEventListener("state-navigateend", redirectIfShorts, { signal });
		return () => controller.abort();
	}
	var shorts_to_watch_default = {
		id: "shorts-to-watch",
		start: start$1
	};
	var PREFIX = "tubekit-video-rotation";
	var STYLE_ID = `${PREFIX}-styles`;
	var player = (angle) => `${PLAYER_SELECTOR}.${PREFIX}-${angle}${NOT_AD_SELECTOR}`;
	var video = (angle) => `${player(angle)}:not(.ended-mode) video.html5-main-video`;
	var storyboard = (angle) => `${player(angle)} .ytp-tooltip-bg[style*="/sb/"]`;
	var css = `
  ${video(90)}, ${video(270)} {
    left: var(--${PREFIX}-left) !important;
    top: var(--${PREFIX}-top) !important;
    width: var(--${PREFIX}-width) !important;
    height: var(--${PREFIX}-height) !important;
    transform: none !important;
  }
  ${video(90)} { rotate: 90deg !important; }
  ${video(180)} { rotate: 180deg !important; }
  ${video(270)} { rotate: 270deg !important; }
  ${storyboard(90)} { transform: rotate(90deg) scale(var(--${PREFIX}-preview-scale, 1)) !important; }
  ${storyboard(180)} { transform: rotate(180deg) !important; }
  ${storyboard(270)} { transform: rotate(270deg) scale(var(--${PREFIX}-preview-scale, 1)) !important; }
  ${storyboard(90)}, ${storyboard(270)} {
    box-shadow: 0 0 0 calc(1px / var(--${PREFIX}-preview-scale, 1)) #fff !important;
  }
  ${player(90)} .ytp-tooltip:has(> .ytp-tooltip-bg[style*="/sb/"]),
  ${player(270)} .ytp-tooltip:has(> .ytp-tooltip-bg[style*="/sb/"]) {
    background-color: transparent !important;
  }
  ${AD_PLAYER_SELECTORS.map((selector) => `${selector} .${PREFIX}-button`).join(",\n  ")} {
    display: none !important;
  }
`;
	function addRotationStyles() {
		if (document.getElementById(STYLE_ID)) return;
		const parent = document.head || document.documentElement;
		if (!parent) return;
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = css;
		parent.appendChild(style);
	}
	var SVG_NS = "http://www.w3.org/2000/svg";
	var LABEL = "영상 회전";
	var BUTTON_CLASS = `${PREFIX}-button`;
	var ANGLES = [
		90,
		180,
		270
	];
	var STRETCH = "yt:stretch=";
	var BOX_PROPERTIES = [
		"left",
		"top",
		"width",
		"height"
	];
	var TOOLTIP_GAP = 11;
	var rotation = {
		angle: 0,
		videoId: null,
		originalRatio: NaN,
		originalKeywords: [],
		stretched: false,
		cleanupPending: false,
		ad: false,
		player: null,
		playerObserver: null,
		video: null,
		videoObserver: null,
		controls: null,
		controlsObserver: null,
		boxFrame: 0,
		relayoutFrame: 0,
		relayoutPending: false,
		tooltip: null
	};
	function isQuarterTurn() {
		return rotation.angle % 180 === 90;
	}
	function playerShowsCurrentVideo(player) {
		return playerFollowsVideo(player, rotation.videoId);
	}
	function keywordsWithStretch(value) {
		const original = rotation.originalKeywords;
		const rest = original.filter((keyword) => !keyword.startsWith(STRETCH));
		const own = original.find((keyword) => keyword.startsWith(STRETCH));
		return [...rest, value === null ? own || STRETCH : `${STRETCH}${value}`].join(",");
	}
	function nearlyEqual(a, b) {
		return Math.abs(a - b) <= Math.max(a, b) * 1e-6;
	}
	function createIcon() {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("fill", "none");
		svg.setAttribute("height", "24");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("width", "24");
		const stroke = {
			stroke: "white",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		};
		for (const [tag, attributes] of [
			["rect", {
				x: "3.2",
				y: "7",
				width: "10.5",
				height: "13",
				rx: "1.5"
			}],
			["path", { d: "M13.2 2.5A7.5 7.5 0 0 1 20.7 10" }],
			["path", { d: "M18.4 7.9L20.7 10.2L23 7.9" }]
		]) {
			const shape = document.createElementNS(SVG_NS, tag);
			for (const [name, value] of Object.entries({
				...attributes,
				...stroke
			})) shape.setAttribute(name, value);
			svg.appendChild(shape);
		}
		return svg;
	}
	function createButton() {
		const button = document.createElement("button");
		button.className = `ytp-button ${BUTTON_CLASS}`;
		button.setAttribute("aria-label", LABEL);
		button.setAttribute("data-tooltip-title", LABEL);
		button.setAttribute("data-title-no-tooltip", LABEL);
		button.appendChild(createIcon());
		button.addEventListener("click", rotateClockwise);
		button.addEventListener("click", hideTooltip);
		button.addEventListener("mouseenter", showTooltip);
		button.addEventListener("focus", showTooltip);
		button.addEventListener("mouseleave", hideTooltip);
		button.addEventListener("blur", hideTooltip);
		return button;
	}
	function createTooltip() {
		const tooltip = document.createElement("div");
		tooltip.className = `ytp-tooltip ytp-bottom ${PREFIX}-tooltip`;
		tooltip.setAttribute("aria-hidden", "true");
		const wrapper = document.createElement("div");
		wrapper.className = "ytp-tooltip-text-wrapper";
		wrapper.setAttribute("aria-hidden", "true");
		const bottom = document.createElement("div");
		bottom.className = "ytp-tooltip-bottom-text";
		const text = document.createElement("span");
		text.className = "ytp-tooltip-text";
		text.textContent = LABEL;
		bottom.appendChild(text);
		wrapper.appendChild(bottom);
		tooltip.appendChild(wrapper);
		return tooltip;
	}
	function showTooltip(event) {
		const button = event.currentTarget;
		const player = playerContaining(button);
		if (!player || button.disabled) return;
		if (!rotation.tooltip) rotation.tooltip = createTooltip();
		const tooltip = rotation.tooltip;
		if (tooltip.parentElement !== player) player.appendChild(tooltip);
		const playerRect = player.getBoundingClientRect();
		const buttonRect = button.getBoundingClientRect();
		const chrome = player.querySelector(".ytp-chrome-bottom");
		const anchorTop = chrome ? chrome.getBoundingClientRect().top : buttonRect.top;
		const width = tooltip.offsetWidth;
		const centered = buttonRect.left - playerRect.left + buttonRect.width / 2 - width / 2;
		tooltip.style.left = `${Math.min(Math.max(centered, 12), playerRect.width - width - 12)}px`;
		tooltip.style.top = `${Math.round(anchorTop - playerRect.top - TOOLTIP_GAP - tooltip.offsetHeight)}px`;
		tooltip.removeAttribute("aria-hidden");
	}
	function hideTooltip() {
		rotation.tooltip?.setAttribute("aria-hidden", "true");
	}
	function ensureButton(player) {
		const settings = player.querySelector(".ytp-right-controls-left .ytp-settings-button") || player.querySelector(".ytp-right-controls .ytp-settings-button");
		if (!settings) {
			observeControls(player.querySelector(".ytp-chrome-bottom") || player);
			return;
		}
		const buttons = [...document.querySelectorAll(`.${BUTTON_CLASS}`)];
		const button = buttons.find((node) => player.contains(node)) || createButton();
		for (const extra of buttons) if (extra !== button) extra.remove();
		if (button.nextElementSibling !== settings) settings.before(button);
		button.disabled = rotation.ad;
		observeControls(settings.closest(".ytp-right-controls") || settings.parentElement);
	}
	function observeControls(controls) {
		if (rotation.controls === controls) return;
		rotation.controlsObserver?.disconnect();
		rotation.controls = controls;
		rotation.controlsObserver = new MutationObserver(() => {
			const player = findPlayer();
			if (player && isVideoPage()) ensureButton(player);
		});
		rotation.controlsObserver.observe(controls, {
			childList: true,
			subtree: true
		});
	}
	function observePlayer(player) {
		if (rotation.player === player) return;
		rotation.playerObserver?.disconnect();
		rotation.player = player;
		rotation.playerObserver = new MutationObserver(() => {
			if (isAdShowing(player) !== rotation.ad) syncRotation();
			else endViewingWhenPlayerClosed();
		});
		rotation.playerObserver.observe(player, {
			attributes: true,
			attributeFilter: ["class"]
		});
	}
	function observeVideo(player) {
		const video = player.querySelector("video.html5-main-video") || player.querySelector("video");
		if (video === rotation.video) return;
		rotation.videoObserver?.disconnect();
		rotation.video = video;
		rotation.videoObserver = null;
		if (!video) return;
		rotation.videoObserver = new MutationObserver(scheduleBoxUpdate);
		rotation.videoObserver.observe(video, {
			attributes: true,
			attributeFilter: ["style"]
		});
	}
	function updateBox(player) {
		if (!isQuarterTurn()) return;
		const rect = videoContentRect(player);
		if (!rect) return;
		const box = {
			left: Math.round(rect.left) + (rect.width - rect.height) / 2,
			top: Math.round(rect.top) + (rect.height - rect.width) / 2,
			width: rect.height,
			height: rect.width
		};
		for (const name of BOX_PROPERTIES) {
			const property = `--${PREFIX}-${name}`;
			const value = `${box[name]}px`;
			if (player.style.getPropertyValue(property) !== value) player.style.setProperty(property, value);
		}
	}
	function scheduleBoxUpdate() {
		if (rotation.boxFrame || !rotation.angle) return;
		rotation.boxFrame = requestAnimationFrame(() => {
			rotation.boxFrame = 0;
			const player = findPlayer();
			if (player) updateBox(player);
		});
	}
	function syncWatchRatio(player) {
		const watch = findWatch(player);
		const ratio = videoAspectRatio(player);
		if (!watch || !Number.isFinite(ratio) || !("videoHeightToWidthRatio_" in watch)) return;
		const heightToWidth = 1 / ratio;
		if (!nearlyEqual(Number(watch.videoHeightToWidthRatio_), heightToWidth)) watch.videoHeightToWidthRatio_ = heightToWidth;
	}
	function scheduleRelayout(followPlayer = true) {
		if (followPlayer) rotation.relayoutPending = true;
		cancelAnimationFrame(rotation.relayoutFrame);
		rotation.relayoutFrame = requestAnimationFrame(() => {
			rotation.relayoutFrame = 0;
			const player = findPlayer();
			if (!player) return;
			if (rotation.relayoutPending && !isAdShowing(player)) {
				syncWatchRatio(player);
				rotation.relayoutPending = false;
			}
			requestLayout();
			updateBox(player);
		});
	}
	function reportAspect(player) {
		if (isQuarterTurn()) {
			const target = 1 / rotation.originalRatio;
			if (rotation.stretched && nearlyEqual(videoAspectRatio(player), target)) return;
			if (!setVideoKeywords(player, keywordsWithStretch(`1:${rotation.originalRatio}`))) return;
			rotation.stretched = true;
			scheduleRelayout();
			return;
		}
		if (!rotation.stretched) return;
		if (!setVideoKeywords(player, keywordsWithStretch(null))) return;
		rotation.stretched = false;
		scheduleRelayout();
	}
	function applyRotation(player) {
		const active = rotation.angle !== 0 && !rotation.ad;
		if (!rotation.ad && playerShowsCurrentVideo(player)) reportAspect(player);
		if (active) updateBox(player);
		if (active && isQuarterTurn()) player.style.setProperty(`--${PREFIX}-preview-scale`, String(1 / rotation.originalRatio));
		for (const angle of ANGLES) player.classList.toggle(`${PREFIX}-${angle}`, active && rotation.angle === angle);
	}
	function resetForVideo(videoId) {
		const wasStretched = rotation.stretched;
		rotation.videoId = videoId;
		rotation.angle = 0;
		rotation.originalRatio = NaN;
		rotation.originalKeywords = [];
		rotation.stretched = false;
		if (wasStretched) rotation.cleanupPending = true;
	}
	function clearLeftoverStretch(player) {
		if (!rotation.cleanupPending) return;
		if (rotation.ad || !playerShowsCurrentVideo(player)) {
			scheduleRelayout(false);
			return;
		}
		rotation.originalKeywords = videoKeywords(player);
		if (setVideoKeywords(player, keywordsWithStretch(null))) {
			rotation.cleanupPending = false;
			scheduleRelayout();
		}
		rotation.originalKeywords = [];
	}
	function syncRotation() {
		if (!isDesktopSite()) return;
		const player = findPlayer();
		if (!player || !isVideoPage() && rotation.player !== player) return;
		addRotationStyles();
		observePlayer(player);
		observeVideo(player);
		const ad = isAdShowing(player);
		const adStarted = ad && !rotation.ad;
		const adEnded = !ad && rotation.ad;
		rotation.ad = ad;
		if (isVideoPage()) ensureButton(player);
		const button = player.querySelector(`.${BUTTON_CLASS}`);
		if (button) button.disabled = rotation.ad;
		if (rotation.ad) hideTooltip();
		const videoId = currentVideoId(player);
		if (videoId && videoId !== rotation.videoId) resetForVideo(videoId);
		if (adStarted && rotation.stretched) scheduleRelayout(false);
		if (adEnded && (rotation.relayoutPending || rotation.angle !== 0)) scheduleRelayout();
		clearLeftoverStretch(player);
		applyRotation(player);
	}
	function isPlayerShown(player) {
		const rect = player.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}
	function endViewingWhenPlayerClosed() {
		const player = rotation.player;
		if (isVideoPage() || !player || isPlayerShown(player) || !isStopped(player)) return;
		if (rotation.angle === 0 && !rotation.stretched) return;
		resetForVideo(null);
		applyRotation(player);
	}
	function rotateClockwise() {
		const player = findPlayer();
		if (!player) return;
		syncRotation();
		if (rotation.ad || !rotation.videoId || rotation.cleanupPending || !playerShowsCurrentVideo(player)) return;
		if (!rotation.stretched && !Number.isFinite(rotation.originalRatio)) {
			rotation.originalRatio = videoAspectRatio(player);
			rotation.originalKeywords = videoKeywords(player);
		}
		if (!Number.isFinite(rotation.originalRatio)) return;
		rotation.angle = (rotation.angle + 90) % 360;
		applyRotation(player);
	}
	function onMediaEvent(event) {
		if (playerOfMediaEvent(event)) syncRotation();
	}
	function start() {
		if (!isDesktopSite() || isEmbedShortsOrChatPage()) return () => {};
		const controller = new AbortController();
		const capture = {
			capture: true,
			signal: controller.signal
		};
		for (const type of [
			"loadstart",
			"loadedmetadata",
			"playing"
		]) document.addEventListener(type, onMediaEvent, capture);
		document.addEventListener("yt-navigate-start", endViewingWhenPlayerClosed, capture);
		document.addEventListener("yt-navigate-finish", syncRotation, capture);
		document.addEventListener("yt-player-updated", syncRotation, capture);
		document.addEventListener("yt-page-data-updated", syncRotation, capture);
		window.addEventListener("resize", scheduleBoxUpdate, {
			passive: true,
			signal: controller.signal
		});
		document.addEventListener("fullscreenchange", scheduleBoxUpdate, capture);
		syncRotation();
		return () => {
			controller.abort();
			rotation.controlsObserver?.disconnect();
			rotation.playerObserver?.disconnect();
			rotation.videoObserver?.disconnect();
		};
	}
	var features_default = [
		right_rail_comments_default,
		shorts_to_watch_default,
		max_quality_default,
		{
			id: "video-rotation",
			start
		}
	];
	function inFrame() {
		try {
			return window.top !== window;
		} catch {
			return true;
		}
	}
	var framed = inFrame();
	for (const feature of features_default) if (!framed || feature.frames) feature.start();
})();
