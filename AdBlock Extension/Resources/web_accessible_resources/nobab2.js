/*******************************************************************************

    AdBlock

    Compatibility shim for redirected anti-adblock scripts.

*/

(function adblockNoBabShim() {

'use strict';

const script = document.currentScript;
const src = typeof script?.src === 'string' ? script.src : '';

if ( /^https?:\/\/[\w-]+\.(adclixx\.net|adnetasia\.com|adtrackers\.net|bannertrack\.net)\//.test(src) ) {
    window.nH7eXzOsG = 858;
}

})();
