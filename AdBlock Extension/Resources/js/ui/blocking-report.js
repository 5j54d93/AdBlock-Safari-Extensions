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
    RECENT_MATCH_WINDOW_LABEL,
    formatClock,
    getRecentBlockingMatches,
    rulesetDisplayName,
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

function renderUnavailable(result) {
    setText('#summaryMatches', '—');
    setText('#summaryRulesets', '—');
    setText('#summaryLatest', '—');
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `讀取失敗 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('Safari 尚未提供可顯示的封鎖明細');
    emptyState?.querySelector('span')?.replaceChildren('封鎖功能仍會運作；這裡只顯示 Safari 允許延伸功能讀取的紀錄。');
}

function renderSummaryOnly(result) {
    setText('#summaryMatches', String(result.totalCount || 0));
    setText('#summaryRulesets', '—');
    setText('#summaryLatest', '—');
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('目前只能顯示封鎖數量');
    emptyState?.querySelector('span')?.replaceChildren('Safari 回傳了本頁處理數量，但尚未提供逐筆封鎖明細。');
}

function renderEmpty(result) {
    setText('#summaryMatches', '0');
    setText('#summaryRulesets', '0');
    setText('#summaryLatest', '—');
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#reportTableWrap', true);
    setHidden('#emptyState', false);

    const emptyState = qs$('#emptyState');
    emptyState?.querySelector('strong')?.replaceChildren('最近沒有封鎖紀錄');
    emptyState?.querySelector('span')?.replaceChildren('此網站最近沒有觸發可顯示的封鎖規則。');
}

function renderAvailable(result) {
    if ( result.summaryOnly === true ) {
        renderSummaryOnly(result);
        return;
    }

    const summary = summarizeBlockingMatches(result.matches);
    if ( summary.matchCount === 0 ) {
        renderEmpty(result);
        return;
    }

    setText('#summaryMatches', String(summary.matchCount));
    setText('#summaryRulesets', String(summary.rulesetCount));
    setText('#summaryLatest', formatClock(summary.latestTimeStamp));
    setText('#reportWindow', RECENT_MATCH_WINDOW_LABEL);
    setText('#reportUpdated', `更新於 ${formatClock(result.capturedAt)}`);
    setHidden('#emptyState', true);
    setHidden('#reportTableWrap', false);
    renderRows(result.matches);
}

async function refreshReport() {
    const button = qs$('#refreshReport');
    button?.setAttribute('disabled', '');
    try {
        await renderContext();
        const result = await getRecentBlockingMatches({
            tabId: Number.isInteger(tabId) ? tabId : undefined,
        });
        if ( result.available === false ) {
            renderUnavailable(result);
            return;
        }
        renderAvailable(result);
    } finally {
        button?.removeAttribute('disabled');
    }
}

qs$('#refreshReport')?.addEventListener('click', refreshReport);
refreshReport();
