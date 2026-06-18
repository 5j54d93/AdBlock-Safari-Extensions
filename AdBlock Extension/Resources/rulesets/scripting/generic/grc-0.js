/*******************************************************************************

    AdBlock

    Generated generic cosmetic-filter data.

*/

// grc-0

(function adblockCssGenericImport() {

if ( self.__adblockSkipGoogleSearch === true ) { return; }

const lowlyGeneric = new Map(/* 3 */[[21195,".adsbox"],[16879,"DIV.agores300"],[39349,"TABLE.advright"]]);
const highlyGeneric = /* 5 */"A[href*=\"adman.otenet.gr/click?\"],\nA[href*=\"http://affiliates.stanjamesaffiliates.com/\"],\nA[href*=\"http://axiabanners.exodus.gr/\"],\nA[href*=\"http://interactive.forthnet.gr/click?\"],\nA[href*=\"serve.williamhill.com/\"]";
const exceptions = /* 3 */[".pub_300x250\n.pub_728x90\n.text-ad\n.textAd\n.text_ad",".adResult",".ad_wrapper"];
const hostnames = /* 3 */["ediva.gr","aggeliestanea.gr","athensmagazine.gr"];
const hasEntities = false;

self.genericSelectorMaps = self.genericSelectorMaps ?? [];
self.genericSelectorMaps.push(lowlyGeneric);
self.genericDetails = self.genericDetails ?? [];
self.genericDetails.push({ highlyGeneric, exceptions, hostnames, hasEntities });

})();

/******************************************************************************/
