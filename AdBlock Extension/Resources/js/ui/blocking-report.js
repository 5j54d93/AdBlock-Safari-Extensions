/*******************************************************************************

    AdBlock

    Detailed recent blocking report page.

*/

import {
    browser,
} from '../shared/ext.js';

import { qs$ } from '../shared/dom.js';
import { toUnicode } from '../shared/idn.js';

import {
    RECENT_MATCH_WINDOW_MS,
    RECENT_MATCH_WINDOW_LABEL,
    contentScriptSourceName,
    formatClock,
    getRecentContentScriptActivity,
    getRecentBlockingMatches,
    rulesetDisplayName,
    summarizeContentScriptActivity,
    summarizeBlockingMatches,
} from '../shared/blocking-stats.js';

/******************************************************************************/

const params = new URLSearchParams(location.search);
const tabId = Number.parseInt(params.get('tabId') || '', 10);
const sourceURL = parseSourceURL(params.get('url'));

/******************************************************************************/

function parseSourceURL(value) {
    if ( typeof value !== 'string' || value === '' ) { return; }
    try {
        return new URL(value);
    } catch {
    }
}

function setText(selector, value) {
    const element = qs$(selector);
    if ( element !== null ) {
        element.textContent = value;
    }
}

function setHidden(selector, hidden) {
    const element = qs$(selector);
    if ( element !== null ) {
        element.hidden = hidden;
    }
}

function appendCell(row, text, className = '') {
    const cell = document.createElement('td');
    if ( className !== '' ) {
        cell.className = className;
    }
    cell.textContent = text;
    row.append(cell);
    return cell;
}

function formatRuleId(match) {
    return match.ruleId === undefined
        ? 'Safari 未提供'
        : String(match.ruleId);
}

function formatCount(value) {
    return Number.isFinite(value) ? String(value) : '—';
}

async function currentReportURL() {
    if ( Number.isInteger(tabId) === false ) {
        return sourceURL;
    }
    try {
        const tab = await browser.tabs.get(tabId);
        return parseSourceURL(tab?.url) || sourceURL;
    } catch {
        return sourceURL;
    }
}

async function renderContext() {
    const url = await currentReportURL();
    const hostname = url?.hostname ? toUnicode(url.hostname) : '';
    setText(
        '#reportContext',
        hostname === ''
            ? '顯示 Safari 目前可讀取的近期封鎖紀錄。'
            : `正在查看 ${hostname} 的近期封鎖紀錄。`
    );
}

function renderRows(matches) {
    const rows = qs$('#reportRows');
    if ( rows === null ) { return; }
    rows.textContent = '';

    const sorted = matches.slice().sort((a, b) =>
        (b.timeStamp || 0) - (a.timeStamp || 0)
    );

    for ( const match of sorted ) {
        const row = document.createElement('tr');
        appendCell(row, formatClock(match.timeStamp));

        const rulesetCell = appendCell(row, '', 'ruleset-cell');
        const rulesetName = document.createElement('strong');
        rulesetName.textContent = rulesetDisplayName(match.rulesetId);
        rulesetCell.append(rulesetName);

        appendCell(
            row,
            formatRuleId(match),
            match.ruleId === undefined
                ? 'rule-id missing-rule-id'
                : 'rule-id'
        );
        rows.append(row);
    }
}

function renderActivityRows(activities) {
    const rows = qs$('#activityRows');
    if ( rows === null ) { return; }
    rows.textContent = '';

    const sorted = activities.slice().sort((a, b) =>
        (b.timeStamp || 0) - (a.timeStamp || 0)
    );

    for ( const activity of sorted ) {
        const row = document.createElement('tr');
        appendCell(row, formatClock(activity.timeStamp));

        const sourceCell = appendCell(row, '', 'ruleset-cell');
        const sourceName = document.createElement('strong');
        sourceName.textContent = contentScriptSourceName(activity.source);
        sourceCell.append(sourceName);

        if ( activity.label !== '' ) {
            const label = document.createElement('span');
            label.textContent = activity.label;
            sourceCell.append(label);
        }

        appendCell(row, String(activity.count || 0), 'rule-id');
        rows.append(row);
    }
}

function renderSummary(result, activityResult) {
    const dnrSummary = summarizeBlockingMatches(result.matches);
    const activitySummary = summarizeContentScriptActivity(activityResult.activities);
    const dnrCount = result.available === false
        ? undefined
        : result.summaryOnly === true
            ? result.totalCount || 0
            : dnrSummary.matchCount;
    const pageCount = activityResult.available === false
        ? undefined
        : activitySummary.activityCount;
    const latest = Math.max(
        dnrSummary.latestTimeStamp || 0,
        activitySummary.latestTimeStamp || 0
    );

    setText(
        '#summaryMatches',
        dnrCount === undefined && pageCount === undefined
            ? '—'
            : String((dnrCount || 0) + (pageCount || 0))
    );
    setText('#summaryDnrMatches', formatCount(dnrCount));
    setText('#summaryPageActivity', formatCount(pageCount));
    setText('#summaryLatest', formatClock(latest));
}

function renderDnrUnavailable(result) {
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `讀取失敗 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('Safari 尚未提供可顯示的封鎖明細');
    emptyState?.querySelector('span')?.replaceChildren('封鎖功能仍會運作；這裡只顯示 Safari 允許延伸功能讀取的紀錄。');
}

function renderDnrSummaryOnly(result) {
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('目前只能顯示 DNR 封鎖數量');
    emptyState?.querySelector('span')?.replaceChildren('Safari 回傳了本頁 DNR 處理數量，但尚未提供逐筆封鎖明細。');
}

function renderDnrEmpty(result) {
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('最近沒有 DNR 封鎖紀錄');
    emptyState?.querySelector('span')?.replaceChildren('此網站最近沒有觸發 Safari 可顯示的 DNR 封鎖規則。');
}

function renderDnrAvailable(result) {
    if ( result.summaryOnly === true ) {
        renderDnrSummaryOnly(result);
        return;
    }

    const summary = summarizeBlockingMatches(result.matches);
    if ( summary.matchCount === 0 ) {
        renderDnrEmpty(result);
        return;
    }

    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#emptyState', true);
    setHidden('#reportTableWrap', false);
    renderRows(result.matches);
}

function renderActivityUnavailable(result) {
    setText('#activityWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#activityUpdated', `讀取失敗 ${formatClock(result.capturedAt)}`);
    setHidden('#activityTableWrap', true);
    setHidden('#activityEmptyState', false);

    const emptyState = qs$('#activityEmptyState');
    emptyState?.querySelector('strong')?.replaceChildren('頁面處理紀錄暫不可讀');
    emptyState?.querySelector('span')?.replaceChildren('DNR 封鎖仍會照常顯示；這裡只顯示 content script 回報的處理紀錄。');
}

function renderActivityEmpty(result) {
    setText('#activityWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#activityUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#activityTableWrap', true);
    setHidden('#activityEmptyState', false);

    const emptyState = qs$('#activityEmptyState');
    emptyState?.querySelector('strong')?.replaceChildren('最近沒有頁面處理紀錄');
    emptyState?.querySelector('span')?.replaceChildren('這裡會顯示由 content script 直接清理的廣告版位或贊助內容。');
}

function renderActivityAvailable(result) {
    const summary = summarizeContentScriptActivity(result.activities);
    if ( summary.activityCount === 0 ) {
        renderActivityEmpty(result);
        return;
    }

    setText('#activityWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#activityUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#activityEmptyState', true);
    setHidden('#activityTableWrap', false);
    renderActivityRows(result.activities);
}

async function refreshReport() {
    const button = qs$('#refreshReport');
    button?.setAttribute('disabled', '');
    try {
        await renderContext();
        const minTimeStamp = Date.now() - RECENT_MATCH_WINDOW_MS;
        const query = {
            tabId: Number.isInteger(tabId) ? tabId : undefined,
            minTimeStamp,
        };
        const [ result, activityResult ] = await Promise.all([
            getRecentBlockingMatches(query),
            getRecentContentScriptActivity(query),
        ]);
        renderSummary(result, activityResult);
        if ( result.available === false ) {
            renderDnrUnavailable(result);
        } else {
            renderDnrAvailable(result);
        }
        if ( activityResult.available === false ) {
            renderActivityUnavailable(activityResult);
        } else {
            renderActivityAvailable(activityResult);
        }
    } finally {
        button?.removeAttribute('disabled');
    }
}

qs$('#refreshReport')?.addEventListener('click', refreshReport);
refreshReport();
