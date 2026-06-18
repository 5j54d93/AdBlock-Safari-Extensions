/*******************************************************************************

    AdBlock

    Generated scriptlet data for compiled filter-list rules.

*/

// ruleset: ublock-experimental
// world: MAIN

(function adblockGeneratedScriptlets() {

if ( self.__adblockSkipGoogleSearch === true ) { return; }

'use strict';

self.adblockRunScriptlets?.({
    rulesetId: "ublock-experimental",
    world: "MAIN",
    functions: ["trustedJsonEditXhrRequest","trustedJsonEditXhrResponse"],
    args: ["[?..userAgent*=\"adunit\"]..client[?.clientName==\"WEB\"]+={\"clientScreen\":\"ADUNIT\"}","propsToMatch","/player?","[?..userAgent*=\"instream\"]..playbackContext[?.contentPlaybackContext]+={\"adPlaybackContext\":{\"adType\":\"AD_TYPE_INSTREAM\"}}","[?..userAgent*=\"eafg\"]+={\"params\":\"eAFgAQ\"}","[?..minimumPlaybackRate==100]..playerConfig.granularVariableSpeedConfig+={\"minimumPlaybackRate\":25,\"maximumPlaybackRate\":200,\"defaultPlaybackRateOptions\":[{\"label\":\"1.0\",\"value\":100,\"isPremiumUpsell\":false,\"priority\":5},{\"label\":\"1.25\",\"value\":125,\"isPremiumUpsell\":false,\"priority\":2},{\"label\":\"1.5\",\"value\":150,\"isPremiumUpsell\":false,\"priority\":3},{\"label\":\"1.75\",\"value\":175,\"isPremiumUpsell\":false,\"priority\":0},{\"label\":\"2.0\",\"value\":200,\"isPremiumUpsell\":false,\"priority\":4},{\"label\":\"3.0\",\"value\":300,\"isPremiumUpsell\":true,\"priority\":1}]}"],
    arglists: "0,0,1,2;0,3,1,2;0,4,1,2;1,5,1,2",
    arglistRefs: "0,1,2,3",
    hostnames: ["www.youtube.com"],
    regexes: [],
});

})();

void 0;
