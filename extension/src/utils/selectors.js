// src/utils/selectors.js

export function detectPlatform(url = window.location.href) {
  if (/amazon\.(in|com).*(\/dp\/|\/gp\/)/.test(url))  return 'amazon'
  if (/flipkart\.com.*\/p\//.test(url))                return 'flipkart'
  if (/myntra\.com.*\/buy/.test(url))                  return 'myntra'
  if (/nykaa\.com.*\/p\//.test(url))                   return 'nykaa'
  if (/meesho\.com.*\/p\//.test(url))                  return 'meesho'
  return null
}

export function isProductPage(url = window.location.href) {
  return [
    /amazon\.(in|com).*(\/dp\/|\/gp\/)/,
    /flipkart\.com.*\/p\//,
    /myntra\.com.*\/.*\/buy/,
    /nykaa\.com.*\/p\//,
    /meesho\.com.*\/.*\/p\//,
  ].some(p => p.test(url))
}

// Each platform entry: { name, price, image, rating, numRatings, numReviews, seller, reviewTexts }
// NOTE: price for Amazon is an ordered ARRAY — parsePrice tries each in order, skipping MRP elements.
// Do NOT use a comma-joined string for Amazon price: querySelector with commas uses DOM order not
// selector order, so the MRP (.a-text-price .a-price-whole) — which appears first in the DOM on
// deal pages — would be returned instead of the actual selling price.
//
// IMPORTANT: Generic selectors like '.priceToPay .a-price-whole' are intentionally removed.
// They match EMI/installment and partner-offer price elements that appear earlier in DOM order
// than the actual selling price, causing the wrong (lower) price to be extracted.
// All selectors here are scoped to specific containers that only contain the selling price.
export const SELECTORS = {
  amazon: {
    name:            '#productTitle',
    price: [
      // Primary: new Amazon template — corePriceDisplay is the canonical selling price block
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-price-whole',
      '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-price-whole',
      // Deals / apex offer display (limited-time deal pages)
      '#apex_offerDisplay_desktop .priceToPay .a-price-whole',
      // Alternate core price block (some Amazon page variants)
      '#corePrice_desktop .priceToPay .a-price-whole',
      '#corePrice_feature_div .priceToPay .a-price-whole',
      // Buy-box price (used on some category pages and alternate templates)
      '#price_inside_buybox',
      '#price',
      // Legacy price blocks (older Amazon template — still used on some ASINs)
      '#priceblock_ourprice',
      '#priceblock_dealprice',
    ],
    image:           '#landingImage',
    rating:          '#acrPopover .a-icon-alt',
    numRatings:      '#acrCustomerReviewText',     // "12,847 ratings"
    numReviews:      '#acrCustomerReviewText',     // Amazon combines both; we parse same element
    seller:          '#sellerProfileTriggerId, #merchant-info a',
    sellerLink:      '#sellerProfileTriggerId, #merchant-info a',   // href → seller profile URL
    reviewTexts:     '[data-hook="review-body"] span.a-size-base, span.review-text-content span, [data-hook="review-body"] > span',
    // Best-effort strikethrough/MRP element — mirror of the price parser's exclusion list,
    // this time targeting those elements directly to capture the claimed "was" price.
    mrp:             '.a-price.a-text-price .a-offscreen, #corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
  },
  flipkart: {
    name:            '.B_NuCI, ._4rR01T, h1',
    price:           '._30jeq3, ._16Jk6d',
    image:           '._396cs4',
    rating:          '._3LWZlK',
    numRatings:      '._2_R_DZ span:first-child',
    numReviews:      '._2_R_DZ span:last-child',
    seller:          '#sellerName span span, .WS7GLi',
    sellerLink:      '#sellerName a, .WS7GLi a',
    reviewTexts:     '._6K-7Co, .t-ZTKy, ._2-N8zT',
    mrp:             '._3I9_wc, .yRaY8j',
  },
  myntra: {
    name:            '.pdp-name, .pdp-title',
    price:           '.pdp-price strong',
    image:           '.image-grid-image',
    rating:          '.index-overallRating div:first-child',
    numRatings:      '.index-ratingsCount',
    numReviews:      '.index-reviewsCount',
    seller:          '.pdp-sold-by-content a',
    sellerLink:      '.pdp-sold-by-content a',
    reviewTexts:     '.user-review-main .t1bM8P, .detailed-reviews .t1bM8P, .c1-w-QI',
    mrp:             '.pdp-mrp s, .pdp-price s',
  },
  nykaa: {
    name:            '.product-title, h1',
    price:           '.product-price, .css-1jczs19',
    image:           '.product-image img',
    rating:          '.css-m6n3ou, .rating-value',
    numRatings:      '.css-1r1e65v',
    numReviews:      '.css-1r1e65v',
    seller:          '.css-1bz84cs a',
    sellerLink:      '.css-1bz84cs a',
    reviewTexts:     '.css-7ltm6i, .review-description, .css-1q6p7dz',
    mrp:             '.css-17x46n5, .mrp-value s',
  },
  meesho: {
    name:            'h1, [data-testid="product-title"]',
    price:           'h4, [data-testid="product-price"]',
    image:           'img[alt]',
    rating:          '[data-testid="rating"]',
    numRatings:      '[data-testid="ratings-count"]',
    numReviews:      '[data-testid="reviews-count"]',
    seller:          '[data-testid="supplier-name"]',
    sellerLink:      '[data-testid="supplier-link"]',
    reviewTexts:     '[data-testid="review-text"], .review-text, [data-testid="user-review"]',
    mrp:             'p[style*="line-through"], .mrp del',
  },
}
