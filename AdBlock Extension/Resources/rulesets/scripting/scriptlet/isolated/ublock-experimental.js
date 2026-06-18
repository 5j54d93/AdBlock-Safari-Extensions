/*******************************************************************************

    AdBlock

    Generated scriptlet data for compiled filter-list rules.

*/

// ruleset: ublock-experimental
// world: ISOLATED

(function adblockGeneratedScriptlets() {

if ( self.__adblockSkipGoogleSearch === true ) { return; }

'use strict';

self.adblockRunScriptlets?.({
    rulesetId: "ublock-experimental",
    world: "ISOLATED",
    functions: ["replaceNodeText"],
    args: ["script","(function serverContract()","(()=>{if(\"YOUTUBE_PREMIUM_LOGO\"===ytInitialData?.topbar?.desktopTopbarRenderer?.logo?.topbarLogoRenderer?.iconImage?.iconType||location.href.startsWith(\"https://www.youtube.com/tv#/\")||location.href.startsWith(\"https://www.youtube.com/embed/\"))return;const e=ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent,t=t=>{ytcfg.data_.INNERTUBE_CONTEXT.client.userAgent=t?e.replace?.(/(Mozilla\\/5\\.0 \\([^)]+)/,\"$1; \"+t):e},o=[\"adunit\",\"lactmilli\",\"channel\",\"instream\",\"eafg\"];let r=!1,n=o;document.addEventListener(\"DOMContentLoaded\",(function(){const e=()=>{const e=document.getElementById(\"movie_player\");if(!e||!window.location.href.includes(\"/watch?\"))return void(n=o);const a=e.getPlayerResponse?.(),i=e.getProgressState?.(),s=e.getStatsForNerds?.();if(i&&i.duration>0&&(i.loaded<i.duration||i.duration-i.current>1)||a?.videoDetails?.isLive){if(!s?.debug_info?.startsWith?.(\"SSAP, AD\")){const o=a.videoDetails?.videoId,i=a.playerConfig?.playbackStartConfig?.startSeconds??0,l=e.getPlayerStateObject?.()?.isBuffering,d=JSON.stringify(a.playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.subreason?.runs);return void(\"UNPLAYABLE\"===a?.playabilityStatus?.status&&!a?.playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.playerCaptchaViewModel&&d?.includes?.(\"WEB_PAGE_TYPE_UNKNOWN\")&&d?.includes?.(\"https://support.google.com/youtube/answer/3037019\")?(n=n.slice(1),n.length>0?t(n[0]):t(\"\"),r=!1,e.loadVideoById(o,i)):0===n.length?(r=!1,t(\"\")):l&&\"0.00 s\"===s?.buffer_health_seconds&&\"0x0\"===s?.resolution&&r&&(t(n[0]),r=!1,e.loadVideoById(o,i)))}i.duration>0&&e.seekTo?.(i.duration)}};e(),new MutationObserver((()=>{e()})).observe(document,{childList:!0,subtree:!0})})),window.Map.prototype.has=new Proxy(window.Map.prototype.has,{apply:(e,t,o)=>{if(\"onSnackbarMessage\"===o?.[0]&&!r){const a=document.getElementById(\"movie_player\");if(!a)return Reflect.apply(e,t,o);const i=a.getStatsForNerds?.(),s=a.getPlayerStateObject?.()?.isBuffering,l=a.getPlayerResponse?.()?.playbackTracking?.videostatsPlaybackUrl?.baseUrl;s&&\"0.00 s\"===i?.buffer_health_seconds&&\"0x0\"===i?.resolution&&n.length>0&&(l.includes(\"reloadxhr\")&&(n=n.slice(1)),r=!0)}return Reflect.apply(e,t,o)}});const a={apply:(e,t,o)=>{const r=o[0];return\"function\"==typeof r&&r.toString().includes(\"onAbnormalityDetected\")&&(o[0]=function(){}),Reflect.apply(e,t,o)}};window.Promise.prototype.then=new Proxy(window.Promise.prototype.then,a)})();(function serverContract()","sedCount","1"],
    arglists: "0,0,1,2,3,4",
    arglistRefs: "0",
    hostnames: ["www.youtube.com"],
    regexes: [],
});

})();

void 0;
