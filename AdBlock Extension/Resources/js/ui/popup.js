/*******************************************************************************

    AdBlock

    Popup controller for the Safari extension toolbar menu.

*/

import {
    browser,
    runtime,
    sendMessage,
} from '../shared/ext.js';

import { dom, qs$ } from '../shared/dom.js';
import { toUnicode } from '../shared/idn.js';

import {
    RECENT_MATCH_WINDOW_MS,
    RECENT_MATCH_WINDOW_LABEL,
    formatTopContentSources,
    formatTopRulesets,
    getRecentContentScriptActivity,
    getRecentBlockingMatches,
    summarizeContentScriptActivity,
    summarizeBlockingMatches,
} from '../shared/blocking-stats.js';

/******************************************************************************/

const RETRY_DELAY_MS = 200;
const START_PAGE_ABOUT_PATHS = new Set([
    '',
    'blank',
    'home',
    'newtab',
    'startpage',
]);
const ELEMENT_REMOVER_FILES = [
    'js/content-scripts/element-remover.js',
];

let currentTab;
let currentURL;
let elementRemoverActive = false;
let overviewRenderId = 0;
let protectionEnabled = true;
let protectionStateRequestId = 0;
let protectionTogglePending = false;
let protectionChannel;

/******************************************************************************/

function isPrimaryTrustedClick(event) {
    return event.isTrusted === true && event.button === 0;
}

function isHttpURL(url) {
    return url?.protocol === 'http:' || url?.protocol === 'https:';
}

function isFileURL(url) {
    return url?.protocol === 'file:';
}

function isStartPageTab(tab, url) {
    const title = String(tab?.title || '').trim();
    if ( /^Start Page$/i.test(title) || title === '起始頁面' ) {
        return true;
    }
    if ( url instanceof URL === false ) {
        return true;
    }
    if ( url.protocol === 'favorites:' ) {
        return true;
    }
    if ( url.protocol !== 'about:' ) {
        return false;
    }

    return START_PAGE_ABOUT_PATHS.has(url.pathname);
}

function tabURL(tab) {
    const href = typeof tab?.url === 'string'
        ? tab.url.trim()
        : '';
    if ( href === '' ) { return; }

    try {
        return new URL(href);
    } catch {
        return;
    }
}

function closePopup() {
    if ( typeof self.close === 'function' ) {
        self.close();
    }
}

function setBusy(state) {
    dom.cl.toggle(dom.body, 'busy', state);
}

function setToolStatus(message = '', type = '') {
    const status = qs$('#toolStatus');
    if ( status === null ) { return; }

    status.hidden = message === '';
    status.textContent = message;
    status.className = type;
}

function renderProtectionToggle(state = {}) {
    if ( typeof state.enabled === 'boolean' ) {
        protectionEnabled = state.enabled;
    } else if ( typeof state.defaultFilteringMode === 'number' ) {
        protectionEnabled = state.defaultFilteringMode !== 0;
    }

    const toggle = qs$('#protectionToggle');
    if ( toggle === null ) { return; }

    const enabled = protectionEnabled === true;
    toggle.setAttribute('aria-checked', String(enabled));
    toggle.title = enabled ? '關閉 AdBlock 防護' : '開啟 AdBlock 防護';
    dom.cl.toggle(dom.root, 'protectionOff', enabled === false);
}

function setProtectionTogglePending(pending) {
    protectionTogglePending = pending;
    const toggle = qs$('#protectionToggle');
    if ( toggle === null ) { return; }
    toggle.disabled = pending;
}

function setOverviewLoading(state) {
    dom.cl.toggle(dom.root, 'overviewLoading', state);
}

function showPanel() {
    dom.cl.remove(dom.body, 'loading', 'busy');
}

function renderHostname(hostname = '') {
    const pretty = toUnicode(hostname);
    if ( pretty === '' ) {
        dom.text('#hostname span:first-of-type', '');
        dom.text('#hostname span:last-of-type', '');
        return;
    }

    const parts = pretty.split('.');
    const suffix = parts.length > 1 ? parts.pop() : pretty;
    const prefix = parts.length !== 0 ? `${parts.join('.')}.` : '';

    dom.text('#hostname span:first-of-type', prefix);
    dom.text('#hostname span:last-of-type', suffix);
}

function renderPanel() {
    if ( isStartPageTab(currentTab, currentURL) ) {
        dom.text('#hostname span:first-of-type', '');
        dom.text('#hostname span:last-of-type', '起始頁面');
    } else if ( isFileURL(currentURL) ) {
        dom.text('#hostname span:first-of-type', '');
        dom.text('#hostname span:last-of-type', '本機檔案');
    } else {
        renderHostname(currentURL?.hostname);
    }
    dom.cl.toggle(dom.root, 'isHTTP', isHttpURL(currentURL));
}

function setOverview(count, unit, detail) {
    dom.text('#overviewCount', count);
    dom.text('#overviewUnit', unit);
    dom.text('#overviewDetail', detail);
}

async function renderBlockingOverview() {
    const renderId = ++overviewRenderId;

    if ( isHttpURL(currentURL) === false ) {
        setOverviewLoading(false);
        return;
    }

    if ( protectionEnabled === false ) {
        setOverviewLoading(false);
        setOverview(
            '',
            '防護關閉',
            '開啟 AdBlock 後才會處理此網站的請求。'
        );
        return;
    }

    setOverviewLoading(true);

    try {
        const minTimeStamp = Date.now() - RECENT_MATCH_WINDOW_MS;
        const [ result, contentResult ] = await Promise.all([
            getRecentBlockingMatches({
                tabId: currentTab?.id,
                minTimeStamp,
            }),
            getRecentContentScriptActivity({
                tabId: currentTab?.id,
                minTimeStamp,
            }),
        ]);

        if ( renderId !== overviewRenderId || protectionEnabled === false ) {
            return;
        }

        const contentSummary = summarizeContentScriptActivity(contentResult.activities);
        const pageActivityCount = contentSummary.activityCount;

        if ( result.available === false && contentResult.available === false ) {
            setOverview(
                '—',
                '防護中',
                'Safari 尚未提供此頁的即時封鎖明細。'
            );
            return;
        }

        const summary = summarizeBlockingMatches(result.matches);
        const dnrCount = result.summaryOnly === true
            ? result.totalCount || 0
            : summary.matchCount;
        const totalCount = dnrCount + pageActivityCount;

        if ( totalCount === 0 ) {
            setOverview(
                '0',
                '近期處理項目',
                `${RECENT_MATCH_WINDOW_LABEL}沒有需要處理的項目。`
            );
            return;
        }

        const unavailableParts = [];
        if ( result.available === false ) {
            unavailableParts.push('DNR 明細');
        }
        if ( contentResult.available === false ) {
            unavailableParts.push('頁面處理');
        }

        const topRulesets = formatTopRulesets(summary);
        const topContentSources = formatTopContentSources(contentSummary);
        const topSources = [ topRulesets, topContentSources ].filter(Boolean).join('、');
        const compactDetailParts = [];

        if ( topSources !== '' ) {
            compactDetailParts.push(`來源：${topSources}`);
        }
        if ( unavailableParts.length > 0 ) {
            compactDetailParts.push(`${unavailableParts.join('、')}暫不可讀`);
        }

        setOverview(
            String(totalCount),
            '近期處理項目',
            compactDetailParts.length > 0
                ? `${compactDetailParts.join('。')}。`
                : '已合併 DNR 與頁面處理。'
        );
    } finally {
        if ( renderId === overviewRenderId ) {
            setOverviewLoading(false);
        }
    }
}

function queueBlockingOverview() {
    renderBlockingOverview().catch(reason => {
        console.log(`renderBlockingOverview/${reason}`);
    });
}

function openBlockingReport(event) {
    if ( isPrimaryTrustedClick(event) === false ) { return; }
    const url = new URL(runtime.getURL('/pages/blocking-report.html'));
    if ( Number.isInteger(currentTab?.id) ) {
        url.searchParams.set('tabId', String(currentTab.id));
    }
    if ( currentURL instanceof URL ) {
        url.searchParams.set('url', currentURL.href);
    }
    browser.tabs.create({ url: url.href });
    closePopup();
}

async function loadProtectionState() {
    const requestId = ++protectionStateRequestId;
    try {
        const state = await sendMessage({ what: 'getProtectionState' });
        if ( requestId !== protectionStateRequestId || protectionTogglePending ) {
            return;
        }
        if ( state?.ok === true ) {
            renderProtectionToggle(state);
            return;
        }
    } catch {
    }
    if ( requestId !== protectionStateRequestId || protectionTogglePending ) {
        return;
    }
    renderProtectionToggle({ enabled: true });
}

async function refreshProtectionState() {
    await loadProtectionState();
    queueBlockingOverview();
}

async function refreshElementRemoverState() {
    try {
        renderElementRemoverState(await isElementRemoverActive(currentTab?.id));
    } catch {
        renderElementRemoverState(false);
    }
}

async function toggleProtection(event) {
    if ( isPrimaryTrustedClick(event) === false ) { return; }
    if ( protectionTogglePending ) { return; }

    const before = protectionEnabled;
    const after = before === false;
    protectionStateRequestId += 1;
    setProtectionTogglePending(true);
    renderProtectionToggle({ enabled: after });
    setToolStatus('');

    try {
        const state = await sendMessage({
            what: 'setProtectionEnabled',
            enabled: after,
        });
        if ( state?.ok !== true ) {
            renderProtectionToggle({ enabled: before });
            setToolStatus('無法更新防護開關。', 'error');
            return;
        }
        renderProtectionToggle(state);
        queueBlockingOverview();
    } catch {
        renderProtectionToggle({ enabled: before });
        setToolStatus('無法更新防護開關。', 'error');
    } finally {
        setProtectionTogglePending(false);
    }
}

function onProtectionMessage(message) {
    if ( typeof message?.defaultFilteringMode !== 'number' ) { return; }
    renderProtectionToggle(message);
    queueBlockingOverview();
}

async function getActiveTab() {
    const [ tab ] = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    if ( tab instanceof Object === false || Number.isInteger(tab.id) === false ) {
        throw new Error('No active tab');
    }
    return tab;
}

async function probeElementRemover(tabId) {
    const [ result ] = await browser.scripting.executeScript({
        target: { tabId },
        func: ( ) => new Promise(resolve => {
            const deadline = Date.now() + 1500;
            const inspect = ( ) => {
                const remover = globalThis.adblockElementRemover;
                const overlay = globalThis.adblockOverlay;
                const frame = overlay?.frame;
                const readyAttribute = typeof overlay?.frameAttribute === 'string'
                    ? `${overlay.frameAttribute}-ready`
                    : '';
                const report = {
                    hasOverlay: overlay !== undefined,
                    hasDirectOverlay: remover !== undefined,
                    file: overlay?.file || '',
                    frameSrc: frame?.src || '',
                    started: remover?.started === true || overlay?.started === true,
                    hostConnected: remover?.host?.isConnected === true,
                    hasFrame: frame !== undefined && frame !== null,
                    frameConnected: frame?.isConnected === true,
                    frameReady: readyAttribute !== '' &&
                        frame?.hasAttribute(readyAttribute) === true,
                    frameVisibility: frame?.style?.visibility || '',
                };

                if (
                    report.started === true &&
                    report.hostConnected === true
                ) {
                    resolve({ ok: true, report });
                    return;
                }

                if ( Date.now() >= deadline ) {
                    resolve({ ok: false, report });
                    return;
                }

                setTimeout(inspect, 50);
            };
            inspect();
        }),
    });
    return result?.result ?? { ok: false, report: { missingProbeResult: true } };
}

async function isElementRemoverActive(tabId) {
    if ( Number.isInteger(tabId) === false || browser.scripting === undefined ) {
        return false;
    }
    try {
        const probe = await probeElementRemover(tabId);
        return probe.ok === true;
    } catch {
        return false;
    }
}

async function stopElementRemover(tabId) {
    if ( Number.isInteger(tabId) === false ) {
        return { ok: false, reason: 'invalid-tab-id' };
    }

    if ( browser.tabs?.sendMessage instanceof Function ) {
        try {
            await browser.tabs.sendMessage(tabId, {
                what: 'leave-element-remover-mode',
            });
            return { ok: true };
        } catch {
        }
    }

    const fallback = await sendMessage({
        what: 'leave-element-remover-mode',
        tabId,
    });
    if ( fallback === true || fallback?.ok === true ) {
        return { ok: true };
    }
    return {
        ok: false,
        reason: 'stop-failed',
        detail: fallback,
    };
}

async function injectElementRemover(tabId) {
    if ( Number.isInteger(tabId) === false ) {
        return { ok: false, reason: 'invalid-tab-id' };
    }
    if ( browser.scripting === undefined ) {
        return { ok: false, reason: 'missing-scripting-api' };
    }

    try {
        await browser.scripting.executeScript({
            files: ELEMENT_REMOVER_FILES,
            target: { tabId },
            injectImmediately: true,
        });
        const probe = await probeElementRemover(tabId);
        if ( probe.ok === true ) {
            return { ok: true };
        }
        return {
            ok: false,
            reason: 'overlay-not-started',
            detail: probe.report,
        };
    } catch (reason) {
        console.log(`injectElementRemover/${reason}`);
    }

    const fallback = await sendMessage({
        what: 'enter-element-remover-mode',
        tabId,
    });
    if ( fallback === true || fallback?.ok === true ) {
        return { ok: true };
    }
    return {
        ok: false,
        reason: 'injection-failed',
        detail: fallback,
    };
}

function renderElementRemoverState(active) {
    elementRemoverActive = active;

    const button = qs$('#gotoElementRemover');
    if ( button === null ) { return; }

    dom.cl.toggle(button, 'active-tool', active);
    dom.text(
        '#gotoElementRemover .tool-title',
        active ? '結束移除元素' : '移除元素'
    );
    dom.text(
        '#gotoElementRemover .tool-detail',
        active
            ? '恢復目前網站的正常點擊與互動。'
            : '選取目前網站上想隱藏的內容。'
    );
}

async function runPageTool(event) {
    if ( isPrimaryTrustedClick(event) === false ) { return; }
    if ( currentTab === undefined || isHttpURL(currentURL) === false ) { return; }

    const tool = event.currentTarget;
    if ( dom.cl.has(tool, 'enabled') === false ) { return; }
    if ( tool.id !== 'gotoElementRemover' ) { return; }

    setBusy(true);
    setToolStatus('');
    try {
        if ( elementRemoverActive ) {
            const result = await stopElementRemover(currentTab.id);
            if ( result.ok === true ) {
                renderElementRemoverState(false);
                closePopup();
                return;
            }
            setToolStatus(`無法結束移除元素：${JSON.stringify(result)}`, 'error');
            return;
        }

        const result = await injectElementRemover(currentTab.id);
        if ( result.ok === true ) {
            closePopup();
            return;
        }
        setToolStatus(`無法啟動移除元素：${JSON.stringify(result)}`, 'error');
    } finally {
        setBusy(false);
    }
}

function bindEvents() {
    qs$('#protectionToggle')?.addEventListener('click', toggleProtection);
    qs$('#gotoElementRemover')?.addEventListener('click', runPageTool);
    qs$('#openBlockingReport')?.addEventListener('click', openBlockingReport);

    try {
        protectionChannel = new BroadcastChannel('AdBlock');
        protectionChannel.onmessage = event => {
            onProtectionMessage(event.data);
        };
    } catch {
    }
}

/******************************************************************************/

async function init() {
    currentTab = await getActiveTab();
    currentURL = tabURL(currentTab);
    renderPanel();
    renderProtectionToggle();
    showPanel();
    queueBlockingOverview();
    void refreshProtectionState();
    void refreshElementRemoverState();
}

async function tryInit() {
    try {
        await init();
    } catch {
        self.setTimeout(tryInit, RETRY_DELAY_MS);
    }
}

bindEvents();
tryInit();
