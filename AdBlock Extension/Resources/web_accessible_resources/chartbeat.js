/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Chartbeat scripts.

*/

(function adblockChartbeatShim() {

'use strict';

const noop = function adblockNoop() {};

window.pSUPERFLY = {
    activity: noop,
    virtualPage: noop,
};

for ( const node of document.querySelectorAll('style[id^="chartbeat-flicker-control"]') ) {
    node.remove();
}

})();
