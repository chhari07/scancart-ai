import{a as j,M as y}from"./constants-DtAPD_rO.js";function _(t=window.location.href){return/amazon\.(in|com).*(\/dp\/|\/gp\/)/.test(t)?"amazon":/flipkart\.com.*\/p\//.test(t)?"flipkart":/myntra\.com.*\/buy/.test(t)?"myntra":/nykaa\.com.*\/p\//.test(t)?"nykaa":/meesho\.com.*\/p\//.test(t)?"meesho":null}function R(t=window.location.href){return[/amazon\.(in|com).*(\/dp\/|\/gp\/)/,/flipkart\.com.*\/p\//,/myntra\.com.*\/.*\/buy/,/nykaa\.com.*\/p\//,/meesho\.com.*\/.*\/p\//].some(e=>e.test(t))}const V={amazon:{name:"#productTitle",price:["#corePriceDisplay_desktop_feature_div .priceToPay .a-price-whole","#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-price-whole","#apex_offerDisplay_desktop .priceToPay .a-price-whole","#corePrice_desktop .priceToPay .a-price-whole","#corePrice_feature_div .priceToPay .a-price-whole","#price_inside_buybox","#price","#priceblock_ourprice","#priceblock_dealprice"],image:"#landingImage",rating:"#acrPopover .a-icon-alt",numRatings:"#acrCustomerReviewText",numReviews:"#acrCustomerReviewText",seller:"#sellerProfileTriggerId, #merchant-info a",sellerLink:"#sellerProfileTriggerId, #merchant-info a",reviewTexts:'[data-hook="review-body"] span.a-size-base, span.review-text-content span, [data-hook="review-body"] > span'},flipkart:{name:".B_NuCI, ._4rR01T, h1",price:"._30jeq3, ._16Jk6d",image:"._396cs4",rating:"._3LWZlK",numRatings:"._2_R_DZ span:first-child",numReviews:"._2_R_DZ span:last-child",seller:"#sellerName span span, .WS7GLi",sellerLink:"#sellerName a, .WS7GLi a",reviewTexts:"._6K-7Co, .t-ZTKy, ._2-N8zT"},myntra:{name:".pdp-name, .pdp-title",price:".pdp-price strong",image:".image-grid-image",rating:".index-overallRating div:first-child",numRatings:".index-ratingsCount",numReviews:".index-reviewsCount",seller:".pdp-sold-by-content a",sellerLink:".pdp-sold-by-content a",reviewTexts:".user-review-main .t1bM8P, .detailed-reviews .t1bM8P, .c1-w-QI"},nykaa:{name:".product-title, h1",price:".product-price, .css-1jczs19",image:".product-image img",rating:".css-m6n3ou, .rating-value",numRatings:".css-1r1e65v",numReviews:".css-1r1e65v",seller:".css-1bz84cs a",sellerLink:".css-1bz84cs a",reviewTexts:".css-7ltm6i, .review-description, .css-1q6p7dz"},meesho:{name:'h1, [data-testid="product-title"]',price:'h4, [data-testid="product-price"]',image:"img[alt]",rating:'[data-testid="rating"]',numRatings:'[data-testid="ratings-count"]',numReviews:'[data-testid="reviews-count"]',seller:'[data-testid="supplier-name"]',sellerLink:'[data-testid="supplier-link"]',reviewTexts:'[data-testid="review-text"], .review-text, [data-testid="user-review"]'}};class q{constructor(){this.platform=null,this.data=null,this.observer=null}init(){return this.platform=_(),!this.platform||!R()?!1:(this.scan(),this.watchNavigation(),!0)}scan(){const e=this.extract();if(e){this.data=e;try{chrome.runtime.sendMessage({type:"PRODUCT_DETECTED",data:e})}catch{console.log("[ScanCart Scanner] Background not ready — scan data cached locally")}}return e}extract(){try{const e=V[this.platform];if(!e)return null;const s=this.text(e.name),r=this.parsePrice(e.price),n=this.attr(e.image,"src"),a=this.parseRating(e.rating),c=this.parseCount(e.numRatings),d=this.parseCount(e.numReviews),l=this.parseSeller(e.seller),u=this.attr(e.sellerLink,"href"),g=this.extractReviews(e.reviewTexts);return console.log(`[ScanCart Scanner] Extracted from ${this.platform}: "${s}" Rs.${r} (${g.length} review texts)`),{productName:s,price:r,image:n,rating:a,numRatings:c,numReviews:d,reviewCount:c,seller:l,sellerProfilePath:u,reviewTexts:g,platform:this.platform,url:window.location.href,extractedAt:new Date().toISOString()}}catch(e){return console.log("[ScanCart Scanner] Extraction error:",e.message),null}}text(e){var s,r;if(!e)return"";try{return((r=(s=document.querySelector(e))==null?void 0:s.textContent)==null?void 0:r.trim())||""}catch{return""}}attr(e,s){var r;if(!e)return"";try{return((r=document.querySelector(e))==null?void 0:r.getAttribute(s))||""}catch{return""}}parsePrice(e){try{const s=Array.isArray(e)?e:[e],r=this.platform==="amazon",n='.a-text-price, .basisPrice, [data-a-color="secondary"], .a-price.a-text-price',a=[n,"#partnerOffers","#dealsAccordionRows","#mir-layout-DELIVERY_BLOCK","#emi-installment-display","#InstallmentCalculator_feature_div","#HLCXComparisonWidget_feature_div","#alternateOfferEligibilityMessaging_feature_div",".reinventPriceBadge",'.buybox-tabpanel:not([aria-selected="true"])',"#mbc"].join(", "),c=r?a:n;for(const d of s){const l=document.querySelector(d);if(!l||l.closest(c))continue;const u=l.textContent.replace(/[^0-9]/g,""),g=parseInt(u);if(!(g<=0)){if(r){const i=this._amazonSanityPrice();if(i>0&&g<i*.6){console.log(`[ScanCart Scanner] Price ${g} rejected (<60% of sanity ${i}), trying next selector`);continue}}return g}}return 0}catch{return 0}}_amazonSanityPrice(){const e=["#corePriceDisplay_desktop_feature_div .priceToPay .a-price-whole","#apex_offerDisplay_desktop .priceToPay .a-price-whole","#corePrice_desktop .priceToPay .a-price-whole","#price_inside_buybox","#price"];for(const s of e)try{const r=document.querySelector(s);if(!r||r.closest('[data-a-color="secondary"], .a-text-price'))continue;const n=parseInt(r.textContent.replace(/[^0-9]/g,""));if(n>0)return n}catch{}return 0}parseRating(e){try{const r=this.text(e).match(/([0-9]+\.?[0-9]*)/);return parseFloat(r==null?void 0:r[1])||0}catch{return 0}}parseCount(e){try{const r=this.text(e).replace(/,/g,"").match(/[0-9]+/);return parseInt(r==null?void 0:r[0])||0}catch{return 0}}parseSeller(e){try{const s=this.text(e);return s||{amazon:"Amazon",flipkart:"Flipkart",myntra:"Myntra",nykaa:"Nykaa",meesho:"Meesho"}[this.platform]||this.platform}catch{return this.platform||"Unknown"}}extractReviews(e){if(!e)return[];try{const s=document.querySelectorAll(e),r=new Set,n=[];return s.forEach(a=>{var d;const c=(d=a.textContent)==null?void 0:d.trim();c&&c.length>=20&&c.length<=400&&!r.has(c)&&(r.add(c),n.push(c))}),n.slice(0,8)}catch{return[]}}watchNavigation(){let e=location.href;this.observer=new MutationObserver(()=>{location.href!==e&&(e=location.href,this.platform=_(),setTimeout(()=>this.scan(),1200))}),this.observer.observe(document.body,{childList:!0,subtree:!0})}getData(){return this.data}destroy(){var e;(e=this.observer)==null||e.disconnect(),this.data=null,this.platform=null}}let $=null;function D(){return $||($=new q),$}const S="scancart-host";let h=null,o=null;function b(t,e=18,s="currentColor",r="none",n=2){return`<svg xmlns="http://www.w3.org/2000/svg" width="${e}" height="${e}" viewBox="0 0 24 24" fill="${r}" stroke="${s}" stroke-width="${n}" stroke-linecap="round" stroke-linejoin="round">${t}</svg>`}const p={cart:'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 001.95 1.58h9.78a2 2 0 001.95-1.67l1.65-9.09H5.12"/>',search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',rupee:'<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 000-8"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',shieldS:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',bulb:'<path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.9 10 19 8 19 6a7 7 0 00-14 0c0 2 1.1 4 2.5 5.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',robot:'<rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/>',extlink:'<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>',x:'<path d="M18 6L6 18M6 6l12 12"/>',chevron:'<path d="m9 18 6-6-6-6"/>',store:'<path d="m2 7 4.41-4.41A2 2 0 017.83 2h8.34a2 2 0 011.42.59L22 7"/><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><path d="M15 22v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4"/><path d="M2 7h20"/>'};function C(t=null){if(h=t,document.getElementById(S)){const s=o==null?void 0:o.getElementById("sc-product-section");s&&(s.innerHTML=O(t));return}const e=document.createElement("div");e.id=S,e.style.cssText="all: initial; position: fixed; z-index: 2147483647;",document.body.appendChild(e),o=e.attachShadow({mode:"open"}),o.innerHTML=`<style>${G}</style>${K(t)}`,o.getElementById("sc-fab").addEventListener("click",ie),o.getElementById("sc-close").addEventListener("click",z),o.getElementById("sc-backdrop").addEventListener("click",z),L(),setTimeout(U,2200)}function N(){var t;(t=document.getElementById(S))==null||t.remove(),o=null}function M(t){const e=o==null?void 0:o.getElementById("sc-fab");e&&(e.classList.remove("fab-green","fab-yellow","fab-red"),t>=70?e.classList.add("fab-green"):t>=40?e.classList.add("fab-yellow"):e.classList.add("fab-red"))}const G=`
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:host { all: initial; }

/* ── FAB ── */
#sc-fab {
  position: fixed; bottom: 28px; right: 28px;
  width: 56px; height: 56px; border-radius: 50%;
  background: #00D4FF; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 24px rgba(0,212,255,0.45);
  z-index: 2147483647; transition: transform .18s, box-shadow .18s;
}
#sc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 32px rgba(0,212,255,0.6); }
#sc-fab.fab-green  { background: #00FF88; box-shadow: 0 4px 24px rgba(0,255,136,0.45); }
#sc-fab.fab-yellow { background: #FFD600; box-shadow: 0 4px 24px rgba(255,214,0,0.45); }
#sc-fab.fab-red    { background: #FF4444; box-shadow: 0 4px 24px rgba(255,68,68,0.45); }
.fab-pulse {
  position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid rgba(0,212,255,0.4);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.2);opacity:0} }

/* ── Backdrop ── */
#sc-backdrop {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(2px);
  z-index: 2147483640;
}
#sc-backdrop.on { display: block; }

/* ── Panel ── */
#sc-panel {
  display: none; position: fixed; bottom: 96px; right: 20px;
  width: 380px; max-height: 580px;
  background: #0A0E1A; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  z-index: 2147483645; overflow: hidden; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  color: #fff;
}
#sc-panel.open { display: flex; }

/* ── Panel header ── */
.sc-ph {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.sc-ph-logo { display: flex; align-items: center; gap: 8px; }
.sc-ph-logo-icon {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(0,212,255,0.15); display: flex; align-items: center; justify-content: center;
}
.sc-ph-name { font-size: 14px; font-weight: 700; color: #fff; }
.sc-ph-name span { color: #00D4FF; }
.sc-ph-badge {
  font-size: 10px; font-weight: 600; color: #00FF88;
  background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.25);
  border-radius: 20px; padding: 2px 8px;
}
.sc-close {
  width: 28px; height: 28px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.07); cursor: pointer; color: #94A3B8;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.sc-close:hover { background: rgba(255,255,255,0.14); }

/* ── Scrollable body ── */
.sc-pb { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
.sc-pb::-webkit-scrollbar { width: 3px; }
.sc-pb::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

/* ── Product card ── */
.sc-prod {
  margin: 12px; background: #111827;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
  padding: 14px; display: flex; gap: 12px; align-items: flex-start;
}
.sc-prod-img-box { width: 64px; height: 64px; flex-shrink: 0; border-radius: 8px; background: #1A2235; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.sc-prod-img { width: 100%; height: 100%; object-fit: contain; }
.sc-prod-info { flex: 1; min-width: 0; }
.sc-prod-name { font-size: 13px; font-weight: 600; color: #fff; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; }
.sc-prod-price { font-size: 16px; font-weight: 800; color: #00FF88; }
.sc-prod-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 11px; color: #94A3B8; }

/* ── Options ── */
.sc-opt-section { padding: 4px 12px 12px; }
.sc-opt-head { font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 10px; }
.sc-opt-list { display: flex; flex-direction: column; gap: 8px; }
.sc-opt-btn {
  display: flex; align-items: center; gap: 12px;
  background: #111827; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 13px; cursor: pointer;
  transition: border-color .15s, background .15s; width: 100%;
  text-align: left;
}
.sc-opt-btn:hover { border-color: #00D4FF; background: rgba(0,212,255,0.04); }
.sc-opt-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-opt-mid { flex: 1; min-width: 0; }
.sc-opt-title { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 2px; }
.sc-opt-desc  { font-size: 11px; color: #94A3B8; }
.sc-opt-arrow { color: #4B5563; flex-shrink: 0; }

/* ── Scan state ── */
.sc-scanning { padding: 28px 16px; text-align: center; }
.sc-scan-ring { position: relative; width: 80px; height: 80px; margin: 0 auto 16px; }
.sc-spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.sc-scan-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
.sc-scan-step  { font-size: 12px; color: #94A3B8; margin-bottom: 14px; }
.sc-scan-dots  { display: flex; justify-content: center; gap: 6px; margin-bottom: 10px; }
.sc-dot { width: 7px; height: 7px; border-radius: 50%; background: #1A2235; transition: background .3s; }
.sc-dot.on { background: #00D4FF; }
.sc-scan-note { font-size: 10px; color: #4B5563; }

/* ── Result cards ── */
.sc-result { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.sc-r-head { display: flex; align-items: center; gap: 10px; background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
.sc-r-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-r-head-text { flex: 1; min-width: 0; }
.sc-r-title { font-size: 13px; font-weight: 700; color: #fff; display: block; }
.sc-r-sub   { font-size: 11px; color: #94A3B8; }
.sc-r-chip  { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; flex-shrink: 0; }

.sc-trust-bar { background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; }
.sc-trust-labels { display: flex; justify-content: space-between; font-size: 11px; color: #94A3B8; margin-bottom: 8px; }
.sc-trust-track { height: 8px; background: #1A2235; border-radius: 4px; overflow: hidden; }
.sc-trust-fill  { height: 100%; border-radius: 4px; transition: width .6s ease; }

.sc-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.sc-stat { background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; text-align: center; }
.sc-stat-v { font-size: 16px; font-weight: 800; color: #fff; display: block; }
.sc-stat-k { font-size: 10px; color: #94A3B8; display: block; margin-top: 2px; }

.sc-ai-box { background: rgba(0,212,255,0.05); border: 1px solid rgba(0,212,255,0.18); border-radius: 12px; padding: 12px; }
.sc-ai-box-title { font-size: 11px; font-weight: 700; color: #00D4FF; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
.sc-ai-box-txt { font-size: 12px; color: #94A3B8; line-height: 1.55; }

.sc-verdict { border-radius: 10px; padding: 10px 14px; font-size: 12px; font-weight: 600; }
.sc-verdict-green  { background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.25); color: #00FF88; }
.sc-verdict-yellow { background: rgba(255,214,0,0.1); border: 1px solid rgba(255,214,0,0.25); color: #FFD600; }
.sc-verdict-red    { background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.25); color: #FF4444; }

/* ── Best price card ── */
.sc-price-vs { display: flex; align-items: center; gap: 10px; background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
.sc-pv-side { flex: 1; }
.sc-pv-label { font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: .05em; }
.sc-pv-val   { font-size: 18px; font-weight: 800; color: #fff; }
.sc-pv-val.best { color: #00FF88; }
.sc-pv-plat  { font-size: 11px; color: #94A3B8; }
.sc-pv-arrow { font-size: 22px; color: #00D4FF; font-weight: 700; }
.sc-savings-banner { background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #00FF88; }
.sc-savings-banner strong { font-weight: 800; }

/* ── Alternatives grid ── */
.sc-alt-grid { display: flex; flex-direction: column; gap: 10px; }
.sc-alt-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: #111827; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 12px; cursor: pointer;
  transition: border-color .15s, background .15s;
}
.sc-alt-item:hover { border-color: #FFD600; background: rgba(255,214,0,0.04); }
.sc-alt-item[data-href] { cursor: pointer; }
.sc-alt-thumb { width: 52px; height: 52px; border-radius: 8px; background: #1A2235; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.sc-alt-thumb img { width: 100%; height: 100%; object-fit: contain; }
.sc-alt-info { flex: 1; min-width: 0; }
.sc-alt-name { font-size: 12px; font-weight: 600; color: #fff; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-alt-price-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.sc-alt-price-val { font-size: 14px; font-weight: 700; color: #00FF88; }
.sc-alt-save { font-size: 10px; color: #00FF88; background: rgba(0,255,136,0.12); border-radius: 10px; padding: 1px 7px; font-weight: 600; }
.sc-alt-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; align-items: center; }
.sc-alt-plat-tag { font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; }
.sc-alt-type-tag { font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.sc-alt-india-tag { font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: 700; background: rgba(255,153,0,0.15); color: #FF9900; }
.sc-alt-reason { font-size: 10px; color: #94A3B8; margin-top: 5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-alt-arrow { color: #4B5563; flex-shrink: 0; padding-top: 2px; }

/* ── Summary badges ── */
.sc-sum-badges { display: flex; flex-wrap: wrap; gap: 7px; }
.sc-sum-badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 4px; }

/* ── Back button ── */
.sc-back-btn {
  width: 100%; padding: 12px; background: rgba(0,212,255,0.1);
  border: 1px solid rgba(0,212,255,0.25); border-radius: 10px;
  color: #00D4FF; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .15s;
}
.sc-back-btn:hover { background: rgba(0,212,255,0.18); }

/* ── Error ── */
.sc-err { text-align: center; padding: 28px; }
.sc-err-msg { font-size: 13px; color: #94A3B8; margin: 12px 0; }

/* ── Section label ── */
.sc-section-lbl { font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: .07em; }
`;function K(t){return`
    <div id="sc-backdrop"></div>

    <div id="sc-panel">
      <div class="sc-ph">
        <div class="sc-ph-logo">
          <div class="sc-ph-logo-icon">${b(p.shieldS,18,"#00D4FF","#00D4FF",0)}</div>
          <span class="sc-ph-name"><span>ScanCart</span>.ai</span>
        </div>
        <span class="sc-ph-badge">AI-Powered</span>
        <button class="sc-close" id="sc-close">${b(p.x,14,"#94A3B8")}</button>
      </div>

      <div class="sc-pb">
        <div id="sc-product-section">${O(t)}</div>
        <div id="sc-content">${A()}</div>
      </div>
    </div>

    <button id="sc-fab" aria-label="ScanCart.ai">
      ${b(p.shieldS,26,"#000","#000",0)}
      <div class="fab-pulse"></div>
    </button>
  `}function O(t){if(!t)return'<div style="padding:14px 16px;font-size:12px;color:#94A3B8;">Product data will appear after scanning.</div>';const e=t.price?`Rs. ${Number(t.price).toLocaleString("en-IN")}`:null,s=t.rating?Number(t.rating).toFixed(1):null,r=t.numRatings||t.reviewCount,n=(t.platform||"store").charAt(0).toUpperCase()+(t.platform||"store").slice(1);return`
    <div class="sc-prod">
      <div class="sc-prod-img-box">
        ${t.image?`<img src="${t.image}" alt="" class="sc-prod-img" onerror="this.style.display='none'">`:b(p.cart,36,"#00D4FF")}
      </div>
      <div class="sc-prod-info">
        <p class="sc-prod-name">${t.productName||t.name||"Unknown Product"}</p>
        ${e?`<p class="sc-prod-price">${e}</p>`:""}
        <div class="sc-prod-meta">
          ${b(p.store,13,"#94A3B8")}
          <span>${t.seller||n}</span>
          ${s?`<span>· ${s}/5</span>`:""}
          ${r?`<span>(${Number(r).toLocaleString("en-IN")})</span>`:""}
        </div>
      </div>
    </div>
  `}const W=[{key:"reviews",icon:p.search,color:"#7C3AED",bg:"rgba(124,58,237,0.15)",label:"Fake Reviews",desc:"Detect bot & paid reviews"},{key:"price",icon:p.rupee,color:"#00FF88",bg:"rgba(0,255,136,0.1)",label:"Best Price",desc:"Compare across platforms"},{key:"seller",icon:p.shield,color:"#00D4FF",bg:"rgba(0,212,255,0.1)",label:"Seller Trust",desc:"Verify seller credibility"},{key:"alternatives",icon:p.bulb,color:"#FFD600",bg:"rgba(255,214,0,0.1)",label:"Alternatives",desc:"Find smarter options"},{key:"summary",icon:p.robot,color:"#FF8C00",bg:"rgba(255,140,0,0.1)",label:"AI Summary",desc:"Full trust score & report"}];function A(){return`
    <div class="sc-opt-section">
      <p class="sc-opt-head">Choose analysis</p>
      <div class="sc-opt-list">
        ${W.map(t=>`
          <button class="sc-opt-btn" data-option="${t.key}">
            <div class="sc-opt-icon" style="background:${t.bg}">${b(t.icon,22,t.color)}</div>
            <div class="sc-opt-mid">
              <div class="sc-opt-title">${t.label}</div>
              <div class="sc-opt-desc">${t.desc}</div>
            </div>
            <span class="sc-opt-arrow">${b(p.chevron,18,"#4B5563")}</span>
          </button>`).join("")}
      </div>
    </div>
  `}function L(){o.querySelectorAll(".sc-opt-btn").forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation(),Z(t.dataset.option)})})}const Y={reviews:["Scanning timestamps…","Detecting bot patterns…","Verifying purchases…","Scoring authenticity…"],price:["Checking Amazon…","Checking Flipkart…","Comparing Meesho & Nykaa…","Finding best deal…"],seller:["Fetching seller history…","Cross-referencing complaints…","Verifying credentials…","Computing trust…"],alternatives:["Mapping category…","Searching Amazon.in…","Searching Flipkart…","Ranking by value…"],summary:["Running all 5 agents…","Aggregating findings…","Computing trust score…","Writing recommendation…"]};async function Z(t){var a,c;const e=o.getElementById("sc-content");if(!e)return;const s=Y[t]||["Analyzing…"];let r=0;e.innerHTML=`
    <div class="sc-scanning">
      <div class="sc-scan-ring">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
          <circle class="sc-spin" cx="40" cy="40" r="32" fill="none" stroke="#00D4FF" stroke-width="5" stroke-dasharray="200 201" stroke-linecap="round" transform-origin="40 40"/>
        </svg>
      </div>
      <p class="sc-scan-title">Analyzing…</p>
      <p class="sc-scan-step" id="sc-step-txt">${s[0]}</p>
      <div class="sc-scan-dots">${s.map((d,l)=>`<div class="sc-dot${l===0?" on":""}"></div>`).join("")}</div>
      <p class="sc-scan-note">5 AI agents running in parallel</p>
    </div>
  `;const n=setInterval(()=>{r=(r+1)%s.length;const d=o.getElementById("sc-step-txt");d&&(d.textContent=s[r]),o.querySelectorAll(".sc-dot").forEach((l,u)=>l.classList.toggle("on",u<=r))},1400);try{const d=await j(window.location.href,h);clearInterval(n),e.innerHTML=X(t,d),(a=o.querySelector(".sc-back-btn"))==null||a.addEventListener("click",l=>{l.stopPropagation(),e.innerHTML=A(),L()}),t==="alternatives"&&se(),e.querySelectorAll("[data-href]").forEach(l=>{l.addEventListener("click",()=>{const u=l.dataset.href;u&&window.open(u,"_blank","noopener")})}),d.trustScore!==void 0&&M(d.trustScore)}catch{clearInterval(n),e.innerHTML=`
      <div class="sc-result">
        <div class="sc-err" style="padding:24px 16px;text-align:center">
          ${b(p.x,36,"#FF4444")}
          <p class="sc-err-msg">Analysis failed. Check your connection.</p>
        </div>
        <button class="sc-back-btn">Back</button>
      </div>`,(c=o.querySelector(".sc-back-btn"))==null||c.addEventListener("click",l=>{l.stopPropagation(),e.innerHTML=A(),L()})}}function X(t,e){return`<div class="sc-result">${{reviews:J(e),price:Q(e),seller:ee(e),alternatives:te(e),summary:re(e)}[t]||'<p class="sc-err-msg">Unknown option.</p>'}<button class="sc-back-btn">Analyze Something Else</button></div>`}function w(t,e,s,r,n,a,c){return`<div class="sc-r-head"><div class="sc-r-icon" style="background:${s}">${b(t,24,e)}</div><div class="sc-r-head-text"><span class="sc-r-title">${r}</span><br><span class="sc-r-sub">${n}</span></div><span class="sc-r-chip" style="color:${c};background:${c}22">${a}</span></div>`}function P(t){const e=Math.min(100,Math.max(0,t||0)),s=e>=70?"#00FF88":e>=40?"#FFD600":"#FF4444",r=e>=70?"AUTHENTIC":e>=40?"CAUTION":"HIGH RISK";return`<div class="sc-trust-bar"><div class="sc-trust-labels"><span style="color:#94A3B8;font-size:11px">Trust Score</span><span style="color:${s};font-size:11px;font-weight:700">${e}/100 — ${r}</span></div><div class="sc-trust-track"><div class="sc-trust-fill" style="width:${e}%;background:${s}"></div></div></div>`}function B(...t){return`<div class="sc-stats">${t.map(([e,s,r])=>`<div class="sc-stat"><span class="sc-stat-v"${r?` style="color:${r}"`:""}>${e}</span><span class="sc-stat-k">${s}</span></div>`).join("")}</div>`}function k(t){return`<div class="sc-ai-box"><div class="sc-ai-box-title">${b(p.robot,13,"#00D4FF")} AI Insight</div><p class="sc-ai-box-txt">${t}</p></div>`}function m(t,e){return`<div class="sc-verdict ${e==="green"?"sc-verdict-green":e==="red"?"sc-verdict-red":"sc-verdict-yellow"}">${t}</div>`}function J(t){const e=t.fakeReviewPercent||0,s=t.totalReviews||0,r=e<20?"#00FF88":e<50?"#FFD600":"#FF4444",n=e<20?"LOW RISK":e<50?"MEDIUM":"HIGH RISK",a=e<20?`Our AI scanned all ${s.toLocaleString("en-IN")} ratings. Only ${e}% appear suspicious — the star rating is reliable.`:e<50?`${e}% of ${s.toLocaleString("en-IN")} reviews look manipulated. Filter by "Verified Purchase" before deciding.`:`ALERT: ${e}% of reviews are likely fake. The star rating is heavily inflated — do not trust it.`;return`
    ${w(p.search,"#7C3AED","rgba(124,58,237,0.15)","Fake Review Analysis","AI authenticity detection",n,r)}
    ${P(t.trustScore)}
    ${B([s.toLocaleString("en-IN"),"Total",null],[`${e}%`,"Suspicious",r],[`${100-e}%`,"Genuine","#00FF88"])}
    ${k(a)}
    ${m(e<20?"Reviews authentic — rating trustworthy":e<50?"Partially inflated — read carefully":"Reviews unreliable — do not trust rating",e<20?"green":e<50?"yellow":"red")}
  `}function Q(t){var i,f,x;const e=(h==null?void 0:h.price)||t.productPrice||0,s=((i=t.bestPrice)==null?void 0:i.price)||0,r=((f=t.bestPrice)==null?void 0:f.platform)||"—",n=((x=t.bestPrice)==null?void 0:x.url)||null,a=e>0&&s>0&&s<e,c=a?s:0,d=a?e-c:0,l=a?`Same product available on ${r} for Rs. ${c.toLocaleString("en-IN")}, saving you Rs. ${d.toLocaleString("en-IN")}.`:`Checked all major Indian platforms — you already have the best available price of Rs. ${e.toLocaleString("en-IN")}.`,u=a?`Rs. ${c.toLocaleString("en-IN")}`:"Best Price",g=a?`${r}${n?" ↗":""}`:"Already lowest";return`
    ${w(p.rupee,"#00FF88","rgba(0,255,136,0.1)","Price Comparison","Real-time cross-platform",a?`SAVE Rs.${d.toLocaleString("en-IN")}`:"BEST PRICE","#00FF88")}
    <div class="sc-price-vs">
      <div class="sc-pv-side">
        <div class="sc-pv-label">Current</div>
        <div class="sc-pv-val">Rs. ${e.toLocaleString("en-IN")}</div>
        <div class="sc-pv-plat">${t.platform||"This site"}</div>
      </div>
      <div class="sc-pv-arrow">${a?"→":"✓"}</div>
      <div class="sc-pv-side"${a&&n?` data-href="${n}" style="cursor:pointer"`:""}>
        <div class="sc-pv-label">Best Found</div>
        <div class="sc-pv-val best">${u}</div>
        <div class="sc-pv-plat">${g}</div>
      </div>
    </div>
    ${a?`<div class="sc-savings-banner">Save <strong>Rs. ${d.toLocaleString("en-IN")}</strong> on ${r}</div>`:""}
    ${k(l)}
    ${m(a?`Better price on ${r} — save Rs. ${d.toLocaleString("en-IN")}`:"This is the best price available now",a?"yellow":"green")}
  `}function ee(t){const e=t.sellerRating||0,s=t.sellerVerified,r=t.counterfeitRisk||"medium",n=t.sellerType||"",a=e>=4?"#00FF88":e>=3?"#FFD600":"#FF4444",c=s&&e>=4&&r==="low",d={brand_official:"Brand's official store",authorized_reseller:"Authorized reseller",established_3p:"Established third-party seller",new_3p:"New or low-history seller",suspicious:"Suspicious seller pattern"};let l;c?l=`${d[n]||"Verified seller"} with a ${e}/5 rating — safe to purchase from this seller.`:!s&&(r==="high"||r==="critical")?l=`Seller "${t.sellerName||"Unknown"}" is unverified with ${r} counterfeit risk. ${e>0?`Seller rating: ${e}/5.`:""} Verify independently before buying.`:s?l=`${d[n]||"Verified seller"} — confirmed but rating (${e}/5) is below ideal. Check recent buyer reviews before purchasing.`:l=`Seller "${t.sellerName||"Unknown"}" could not be confirmed as an authorized retailer. Exercise caution and check seller reviews.`;const u=c?"TRUSTED":s?"CAUTION":"UNVERIFIED",g=c?"#00FF88":s?"#FFD600":"#FF4444",i=c?"Trusted verified seller — safe to buy":s?"Verified but mixed — check reviews":"Unverified seller — exercise caution",f=c?"green":s?"yellow":"red";return`
    ${w(p.shield,"#00D4FF","rgba(0,212,255,0.1)","Seller Trust","History, verification & credibility",u,g)}
    ${P(t.trustScore)}
    ${B([`${e}/5`,"Rating",a],[s?"Yes":"No","Verified",s?"#00FF88":"#FF4444"],[r.toUpperCase(),"Risk",r==="low"?"#00FF88":r==="medium"?"#FFD600":"#FF4444"])}
    ${k(l)}
    ${m(i,f)}
  `}function te(t){const e=(h==null?void 0:h.price)||t.productPrice||0;let s=[];t.allAlternatives&&t.allAlternatives.length>0?s=t.allAlternatives.map(i=>{var f;return{name:i.name||"Unknown Product",brand:i.brand||"",price:i.price||0,platform:i.platform||"amazon",url:i.url||i.platformUrl||"",image:i.image||null,reason:i.reason||i.whyAlternative||"",type:i.type||i.alternativeType||"value",indianBrand:i.indianBrand||!1,savings:i.savings||((f=i.priceAnalysis)==null?void 0:f.savingsAmount)||0,rating:i.estimatedRating||0}}):t.alternatives&&t.alternatives.length>0&&(s=t.alternatives.map(i=>({name:i.name||"Unknown Product",brand:i.brand||"",price:i.price||0,platform:i.platform||"amazon",url:i.url||"",image:i.image||null,reason:i.reason||"",type:i.type||"value",indianBrand:i.indianBrand||!1,savings:i.savings||0,rating:0})));const r=s.filter(i=>i.price>0),n=r.length>0,a=e>0?Math.max(0,...s.map(i=>i.price>0&&i.price<e?e-i.price:0)):0,c=n?`Found ${r.length} alternative${r.length>1?"s":""} on Indian e-commerce${a>0?` — best saves Rs. ${a.toLocaleString("en-IN")}`:""}. Click any card to view.`:s.length>0?"AI found search links to help explore alternatives on Amazon and Flipkart.":"No alternatives found for this product. Try searching manually on Amazon or Flipkart.",d={amazon:"#FF9900",flipkart:"#2874F0",myntra:"#FF3F6C",nykaa:"#FC2779",meesho:"#B000D8"},l={budget:"#00FF88",value:"#00D4FF",premium:"#B47FFF"},u={budget:"Budget",value:"Value",premium:"Premium"},g=s.length>0?s.map(i=>{const f=d[i.platform]||"#00D4FF",x=(i.platform||"store").charAt(0).toUpperCase()+(i.platform||"store").slice(1),v=l[i.type]||"#00D4FF",H=u[i.type]||"Value",F=i.url&&i.url!=="#"?i.url:"",T=i.savings>0?i.savings:e>0&&i.price>0&&i.price<e?e-i.price:0;return`
          <div class="sc-alt-item"${F?` data-href="${F}"`:""}>
            <div class="sc-alt-thumb">
              ${i.image?`<img src="${i.image}" alt="" loading="lazy" onerror="this.style.display='none'">`:b(p.bulb,26,f)}
            </div>
            <div class="sc-alt-info">
              <div class="sc-alt-name">${i.name}</div>
              <div class="sc-alt-price-row">
                ${i.price>0?`<span class="sc-alt-price-val">Rs. ${i.price.toLocaleString("en-IN")}</span>
                     ${T>0?`<span class="sc-alt-save">Save Rs.${T.toLocaleString("en-IN")}</span>`:""}`:'<span style="font-size:11px;color:#94A3B8">Tap to check price</span>'}
              </div>
              <div class="sc-alt-badges">
                <span class="sc-alt-plat-tag" style="background:${f}22;color:${f}">${x}</span>
                <span class="sc-alt-type-tag" style="background:${v}18;color:${v}">${H}</span>
                ${i.indianBrand?'<span class="sc-alt-india-tag">&#127470;&#127475; Indian Brand</span>':""}
                ${i.rating>0?`<span style="font-size:9px;color:#FFD600;font-weight:700">&#9733; ${i.rating.toFixed(1)}</span>`:""}
              </div>
              ${i.reason?`<div class="sc-alt-reason">${i.reason}</div>`:""}
            </div>
            ${F?`<div class="sc-alt-arrow">${b(p.extlink,14,f)}</div>`:""}
          </div>`}).join(""):`<div style="padding:28px 16px;text-align:center;color:#94A3B8;font-size:12px;line-height:1.6">
         ${b(p.bulb,36,"#4B5563")}
         <p style="margin-top:12px;font-weight:600;color:#fff">No alternatives found</p>
         <p style="margin-top:4px;font-size:11px">Try searching on Amazon.in or Flipkart manually.</p>
       </div>`;return`
    ${w(p.bulb,"#FFD600","rgba(255,214,0,0.1)","Smart Alternatives","AI-curated Indian e-commerce picks",n?a>0?`SAVE Rs.${a.toLocaleString("en-IN")}`:`${r.length} FOUND`:s.length>0?"EXPLORE":"NONE FOUND","#FFD600")}
    <div class="sc-alt-grid" id="sc-alt-grid">${g}</div>
    ${k(c)}
    ${n?m(a>0?`Save up to Rs. ${a.toLocaleString("en-IN")} with these alternatives`:`${r.length} alternative${r.length>1?"s":""} found — compare and choose`,"green"):s.length>0?m("Click any card to explore alternatives on Amazon or Flipkart","yellow"):m("No alternatives found — this may be a unique or niche product","yellow")}
  `}function se(){const t=o.getElementById("sc-alt-grid");t&&t.addEventListener("click",e=>{const s=e.target.closest("[data-href]");s&&s.dataset.href&&window.open(s.dataset.href,"_blank","noopener")})}function re(t){var v;const e=t.trustScore||0,s=e>=70?"#00FF88":e>=40?"#FFD600":"#FF4444",r=t.fakeReviewPercent||0,n=t.sellerVerified,a=t.counterfeitRisk||"medium",c=n&&(a==="low"||a==="medium"),d=c?"Seller Verified":n?"Seller Caution":"Seller Unverified",l=c?"#00D4FF":n?"#FFD600":"#FF4444",u=c?"rgba(0,212,255,0.1)":n?"rgba(255,214,0,0.1)":"rgba(255,68,68,0.1)",g=r<30,i=(t.savings||0)>0,f=!n&&e>=70?" Note: seller is unverified — verify independently before purchasing.":"",x=(v=t.analysis)!=null&&v.authenticity?`${t.analysis.authenticity}${f}`:`Trust Score: ${e}/100. ${e>=70?"Product appears genuine.":e>=40?"Proceed with caution.":"High risk — avoid."} ${f}`;return`
    ${w(p.robot,"#FF8C00","rgba(255,140,0,0.1)","AI Summary","5-agent comprehensive analysis",`${e}/100`,s)}
    ${P(e)}
    ${B([`${r}%`,"Fake Reviews",g?"#00FF88":"#FF4444"],[`${t.sellerRating||0}/5`,"Seller",null],[i?`Rs.${(t.savings||0).toLocaleString("en-IN")}`:"Fair","Price","#00FF88"])}
    ${k(x)}
    <div class="sc-sum-badges">
      <span class="sc-sum-badge" style="color:${g?"#00FF88":"#FF4444"};background:${g?"rgba(0,255,136,0.1)":"rgba(255,68,68,0.1)"}">Reviews ${g?"OK":"Suspicious"}</span>
      <span class="sc-sum-badge" style="color:${l};background:${u}">${d}</span>
      <span class="sc-sum-badge" style="color:${i?"#00FF88":"#FFD600"};background:${i?"rgba(0,255,136,0.1)":"rgba(255,214,0,0.1)"}">${i?"Save Money":"Fair Price"}</span>
    </div>
    ${m(e>=70?"Safe to buy — green light from our AI":e>=40?"Proceed with caution — verify key details":"Avoid this product — multiple risk signals",e>=70?"green":e>=40?"yellow":"red")}
  `}function U(){var t,e;(t=o==null?void 0:o.getElementById("sc-panel"))==null||t.classList.add("open"),(e=o==null?void 0:o.getElementById("sc-backdrop"))==null||e.classList.add("on")}function z(){var t,e;(t=o==null?void 0:o.getElementById("sc-panel"))==null||t.classList.remove("open"),(e=o==null?void 0:o.getElementById("sc-backdrop"))==null||e.classList.remove("on")}function ie(){var t;(t=o==null?void 0:o.getElementById("sc-panel"))!=null&&t.classList.contains("open")?z():U()}window.addEventListener("message",t=>{var s,r;["http://localhost:5173","https://scancart.ai"].includes(t.origin)&&(((s=t.data)==null?void 0:s.type)===y.AUTH_SYNC&&chrome.storage.local.set({scancart_user:t.data.user}),((r=t.data)==null?void 0:r.type)===y.PING&&window.postMessage({type:y.PONG},t.origin))});chrome.runtime.onMessage.addListener((t,e,s)=>{switch(t.type){case y.SCAN_COMPLETE:t.trustScore!==void 0&&M(t.trustScore),s({success:!0});break;case y.GET_PRODUCT_DATA:{const r=D();s(r.getData());break}default:s({success:!0});break}return!0});function I(){if(!R()){N();return}const t=D();if(!t){console.warn("No scanner available."),C(null);return}typeof t.init=="function"&&t.init(),C(t.getData())}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",I):I();let E=location.href;const ne=new MutationObserver(()=>{location.href!==E&&(E=location.href,N(),setTimeout(()=>{I()},800))});ne.observe(document.body,{childList:!0,subtree:!0});
