/*******************************************************************************

    AdBlock

    Recent declarativeNetRequest match summaries for popup and report pages.

*/

import {
    browser,
} from './ext.js';

/******************************************************************************/

export const RECENT_MATCH_WINDOW_MS = 30 * 60 * 1000;
export const RECENT_MATCH_WINDOW_LABEL = '最近 30 分鐘';
const BADGE_SNAPSHOT_DELAY_MS = 80;
const UNKNOWN_RULESET_ID = '__unknown__';

const RULESET_NAMES = new Map([
    [ 'ublock-filters', '基礎防護' ],
    [ 'easylist', 'EasyList' ],
    [ 'easyprivacy', 'EasyPrivacy' ],
    [ 'adguard-mobile', '行動網站防護' ],
    [ 'block-lan', '區域網路保護' ],
    [ 'annoyances-ai', 'AI 干擾內容' ],
    [ 'annoyances-cookies', 'Cookie 提示' ],
    [ 'annoyances-overlays', '覆蓋視窗' ],
    [ 'annoyances-social', '社群元件' ],
    [ 'annoyances-widgets', '網頁小工具' ],
    [ 'annoyances-others', '其他干擾內容' ],
    [ 'annoyances-notifications', '通知提示' ],
    [ 'ublock-experimental', '實驗性防護' ],
]);

/******************************************************************************/

function isObject(value) {
    return typeof value === 'object' && value !== null;
}

function normalizeError(reason) {
    return reason?.message || String(reason || 'unknown error');
}

function normalizeMatch(info) {
    if ( isObject(info) === false ) { return; }

    const rule = isObject(info.rule) ? info.rule : {};
    const ruleId = Number(rule.ruleId ?? rule.id ?? info.ruleId);
    const timeStamp = Number(info.timeStamp ?? info.timestamp ?? Date.now());
    const tabId = Number(info.tabId);
    const rulesetId = String(rule.rulesetId ?? info.rulesetId ?? '').trim();

    return {
        ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
        rulesetId: rulesetId || UNKNOWN_RULESET_ID,
        tabId: Number.isFinite(tabId) ? tabId : undefined,
        timeStamp: Number.isFinite(timeStamp) ? timeStamp : Date.now(),
    };
}

function actionAPI() {
    return browser.action || browser.browserAction;
}

function parseBadgeCount(text) {
    if ( typeof text !== 'string' ) { return; }
    const digits = text.replace(/[^\d]/g, '');
    if ( digits === '' ) { return 0; }
    const count = Number.parseInt(digits, 10);
    return Number.isFinite(count) ? count : undefined;
}

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function getBadgeText(tabId) {
    const action = actionAPI();
    if ( typeof action?.getBadgeText !== 'function' ) { return; }

    const details = {};
    if ( Number.isInteger(tabId) ) {
        details.tabId = tabId;
    }

    try {
        const result = action.getBadgeText(details);
        if ( typeof result?.then === 'function' ) {
            return await result;
        }
        if ( typeof result === 'string' ) {
            return result;
        }
    } catch {
    }

    return new Promise(resolve => {
        let resolved = false;
        const finish = value => {
            if ( resolved ) { return; }
            resolved = true;
            resolve(typeof value === 'string' ? value : '');
        };
        try {
            action.getBadgeText(details, finish);
        } catch {
            finish('');
        }
        setTimeout(finish, 150);
    });
}

async function clearBadgeText(tabId) {
    const action = actionAPI();
    if ( typeof action?.setBadgeText !== 'function' ) { return; }

    const details = { text: '' };
    if ( Number.isInteger(tabId) ) {
        details.tabId = tabId;
    }

    try {
        const result = action.setBadgeText(details);
        if ( typeof result?.then === 'function' ) {
            await result;
        }
    } catch {
    }
}

async function setActionCountBadge(enabled) {
    const api = browser.declarativeNetRequest;
    if ( typeof api?.setExtensionActionOptions !== 'function' ) {
        return false;
    }

    const options = { displayActionCountAsBadgeText: enabled };
    try {
        const result = api.setExtensionActionOptions(options);
        if ( typeof result?.then === 'function' ) {
            await result;
        }
        return true;
    } catch {
    }

    return new Promise(resolve => {
        let resolved = false;
        const finish = value => {
            if ( resolved ) { return; }
            resolved = true;
            resolve(value);
        };
        try {
            api.setExtensionActionOptions(options, () => finish(true));
        } catch {
            finish(false);
        }
        setTimeout(() => finish(false), 200);
    });
}

async function callGetMatchedRules(filter) {
    const api = browser.declarativeNetRequest;
    if ( typeof api?.getMatchedRules !== 'function' ) {
        throw new Error('getMatchedRules is unavailable');
    }

    let maybePromise;
    try {
        maybePromise = api.getMatchedRules(filter);
    } catch {
        maybePromise = undefined;
    }

    if ( typeof maybePromise?.then === 'function' ) {
        return maybePromise;
    }
    if ( maybePromise !== undefined ) {
        return maybePromise;
    }

    return new Promise((resolve, reject) => {
        try {
            api.getMatchedRules(filter, result => {
                const lastError = browser.runtime?.lastError;
                if ( lastError ) {
                    reject(new Error(lastError.message));
                    return;
                }
                resolve(result);
            });
        } catch(reason) {
            reject(reason);
        }
    });
}

async function getActionCountSnapshot(tabId) {
    const existingCount = parseBadgeCount(await getBadgeText(tabId));
    if ( existingCount !== undefined && existingCount > 0 ) {
        await clearBadgeText(tabId);
        return {
            available: true,
            count: existingCount,
        };
    }

    const enabled = await setActionCountBadge(true);
    if ( enabled === false ) {
        return {
            available: existingCount !== undefined,
            count: existingCount,
        };
    }

    try {
        await delay(BADGE_SNAPSHOT_DELAY_MS);
        const count = parseBadgeCount(await getBadgeText(tabId));
        return {
            available: count !== undefined,
            count,
        };
    } finally {
        await setActionCountBadge(false);
        await clearBadgeText(tabId);
    }
}

/******************************************************************************/

export async function getRecentBlockingMatches({
    tabId,
    minTimeStamp = Date.now() - RECENT_MATCH_WINDOW_MS,
} = {}) {
    const filter = { minTimeStamp };
    if ( Number.isInteger(tabId) ) {
        filter.tabId = tabId;
    }

    try {
        const result = await callGetMatchedRules(filter);
        const infos = Array.isArray(result?.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : Array.isArray(result)
                ? result
                : [];
        return {
            available: true,
            capturedAt: Date.now(),
            matches: infos.map(normalizeMatch).filter(Boolean),
            minTimeStamp,
        };
    } catch(reason) {
        const badgeSnapshot = await getActionCountSnapshot(tabId);
        if ( badgeSnapshot.available === true ) {
            return {
                available: true,
                capturedAt: Date.now(),
                error: normalizeError(reason),
                matches: [],
                minTimeStamp,
                summaryOnly: true,
                totalCount: badgeSnapshot.count || 0,
            };
        }
        return {
            available: false,
            capturedAt: Date.now(),
            error: normalizeError(reason),
            matches: [],
            minTimeStamp,
        };
    }
}

export function summarizeBlockingMatches(matches = []) {
    const rulesets = new Map();
    let latestTimeStamp = 0;

    for ( const match of matches ) {
        latestTimeStamp = Math.max(latestTimeStamp, match.timeStamp || 0);
        rulesets.set(
            match.rulesetId,
            (rulesets.get(match.rulesetId) || 0) + 1
        );
    }

    const topRulesets = Array.from(rulesets, ([ id, count ]) => ({
        count,
        id,
        name: rulesetDisplayName(id),
    })).sort((a, b) =>
        b.count - a.count || a.name.localeCompare(b.name)
    );

    return {
        latestTimeStamp,
        matchCount: matches.length,
        rulesetCount: rulesets.size,
        topRulesets,
    };
}

export function rulesetDisplayName(id = '') {
    if ( RULESET_NAMES.has(id) ) {
        return RULESET_NAMES.get(id);
    }
    if ( id === UNKNOWN_RULESET_ID ) {
        return 'Safari 未提供來源';
    }
    if ( id === 'dynamic' || id === '_dynamic' ) {
        return '動態規則';
    }
    if ( id === 'session' || id === '_session' ) {
        return '暫時規則';
    }
    return id.replaceAll('-', ' ');
}

export function formatTopRulesets(summary, limit = 2) {
    const names = summary.topRulesets
        .slice(0, limit)
        .map(ruleset => ruleset.name);

    if ( names.length === 0 ) {
        return '';
    }
    return names.join('、');
}

export function formatClock(timeStamp) {
    if ( Number.isFinite(timeStamp) === false || timeStamp <= 0 ) {
        return '—';
    }
    return new Intl.DateTimeFormat('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date(timeStamp));
}
