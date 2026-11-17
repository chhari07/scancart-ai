// src/content/reviewCollector.js
// Reads more reviews than the product page shows, on ANY online shop, from 3 places:
//   1. the product page itself (store-tuned selectors for the big stores, common review markup for
//      every other shop: schema.org reviews, Shopify / WooCommerce / Judge.me / Yotpo / Stamped …)
//   2. the shop's own "all reviews" pages, fetched in the background inside the user's own logged-in
//      browser (at most 5 pages, one at a time). Amazon / Flipkart addresses are known; on any other
//      shop the "See all reviews" link and the "Next" page link are found on the page.
//   3. Amazon's "Customers say" box (the store's own summary of every review)
// Never throws: on any failure it returns what it has, with a note saying why.

const MAX_PAGES   = 5
const MAX_REVIEWS = 60
const GAP_MS      = 450
const PREF_KEY    = 'scDeepReviews'    // chrome.storage.local: false = read the product page only

const clean = t => String(t || '').replace(/\s+/g, ' ').replace(/\b(Read more|READ MORE|Read less)\b/g, '').trim()
const short = t => t.length > 600 ? t.slice(0, 600) + '…' : t
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Per-store review markup. `box` = one review card; `body` / `date` / `verified` / `stars` inside it.
const SHAPES = {
  amazon: {
    box:      '[data-hook="review"], [id^="customer_review-"], li.review',
    body:     '[data-hook="review-body"], [data-hook="review-collapsed"], .review-text-content, .review-text',
    date:     '[data-hook="review-date"]',
    verified: '[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]',
    stars:    '[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"], .review-rating',
  },
  flipkart: {
    box:      '.col.EPCmJX, ._27M-vq, .RcXBOT, .cPHDOP .col',
    body:     '.ZmyHeo, .t-ZTKy, ._6K-7Co, ._2-N8zT, .qwjRop',
    date:     '._2sc7ZR, ._2NsDsF',
    verified: '._2mcZGG, .MztJPv',
    stars:    '.XQDdHH, ._3LWZlK',
  },
  myntra: {
    box:      '.user-review-userReviewWrapper, .detailed-reviews-userReviewsContainer > div',
    body:     '.user-review-reviewTextWrapper, .t1bM8P, .c1-w-QI',
    date:     '.user-review-left span:last-child',
  },
  nykaa: {
    box:      '[class*="review-card"], .review-wrap',
    body:     '.css-7ltm6i, .review-description, .css-1q6p7dz, section p',
  },
  meesho: {
    box:      '[class*="ReviewCard"], [class*="review-card"]',
    body:     '[data-testid="review-text"], .review-text, p',
  },
  // Any other shop: schema.org microdata + the review widgets most shops use
  any: {
    box:      '[itemprop="review"], [data-hook="review"], [data-review-id], .spr-review, .jdgm-rev, .yotpo-review, .stamped-review, .okeReviews-review-item, .loox-review, .commentlist > li.review, li.review, [class*="review-card" i], [class*="reviewcard" i], [class*="review-item" i], [class*="reviewitem" i], [class*="review_item" i], [class*="review-tile" i], [class*="ReviewListItem"], [class*="customer-review" i]',
    body:     '[itemprop="reviewBody"], .spr-review-content-body, .jdgm-rev__body, .yotpo-review-content, .content-review, .stamped-review-body, .description, [class*="review-text" i], [class*="review-body" i], [class*="review-content" i], [class*="reviewtext" i], [class*="reviewbody" i], [class*="review-description" i], [class*="comment-text" i]',
    date:     '[itemprop="datePublished"], time, [class*="review-date" i], [class*="date" i]',
    stars:    '[itemprop="ratingValue"]',
  },
}

/** Pull review cards out of any document (the live page or a fetched review page). */
export function readReviewCards(doc, platform, extraTextSelector = '') {
  const S = SHAPES[platform] || SHAPES.any
  const out = []
  const seen = new Set()
  const push = (text, card) => {
    const t = clean(text)
    if (t.length < 15 || seen.has(t)) return
    seen.add(t)
    const q = s => s && card ? card.querySelector(s) : null
    out.push({
      text: short(t),
      date: clean(q(S.date)?.textContent).slice(0, 120),
      verified: S.verified ? Boolean(q(S.verified)) : null,
      stars: parseFloat(clean(q(S.stars)?.textContent)) || null,
    })
  }
  try {
    const cards = S.box ? [...doc.querySelectorAll(S.box)] : []
    for (const card of cards) {
      // Amazon nests review-collapsed inside review-body: take the innermost useful block once
      const body = S.body ? card.querySelector(S.body) : null
      if (body) { push(body.textContent, card); continue }
      // Unknown layout: the longest text block in the card that isn't the title or a button
      const blocks = [...card.querySelectorAll('span, p, div')].filter(e => !e.children.length || e.children.length < 3)
      const best = blocks.map(e => clean(e.textContent)).filter(t => t.length >= 25 && t.length < 4000).sort((a, b) => b.length - a.length)[0]
      if (best) push(best, card)
    }
    // Last resorts: the extension's older selectors, the common review markup, the reviews in the page's product data
    if (!out.length && extraTextSelector) doc.querySelectorAll(extraTextSelector).forEach(n => push(n.textContent, null))
    if (!out.length && S !== SHAPES.any) return readReviewCards(doc, 'any')
    for (const r of ldReviews(doc)) push(r.text, null)
    if (!out.length) for (const t of reviewSectionTexts(doc)) push(t, null)
    if (out.length < 5) for (const r of embeddedReviews(doc)) push(r.text, null)
  } catch {}
  return out
}

// Any shop with its own review layout: find the "Reviews" / "Ratings & Reviews" heading, then read the
// paragraphs of buyer text in the block under it (not buttons, names, dates or "Was this helpful?").
const REVIEWS_HEAD = /^\s*(customer |product |user |buyer )?(ratings?\s*(&|and)\s*)?reviews?(\s*(&|and)\s*ratings?)?\s*(\(\s*[\d,.k]+\s*\))?\s*$/i
const NOT_REVIEW = /^(write a review|was this (review )?helpful|helpful|report|reply|read more|show more|load more|view all|see all|verified (buyer|purchase)|\d+ (people|users) found)/i
export function reviewSectionTexts(doc) {
  const heads = [...doc.querySelectorAll('h1, h2, h3, h4, h5, p, span, div, button, a')].filter(e => e.children.length <= 2 && REVIEWS_HEAD.test(e.textContent || ''))
  const out = []
  const seen = new Set()
  for (const h of heads.slice(0, 4)) {
    let box = h
    for (let i = 0; i < 5 && box.parentElement; i++) { box = box.parentElement; if ((box.textContent || '').length > 400) break }
    for (const el of box.querySelectorAll('p, span, div, q, blockquote')) {
      if ([...el.children].some(c => !/^(B|I|EM|STRONG|BR|SPAN)$/.test(c.tagName))) continue
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (t.length < 20 || t.length > 1200 || NOT_REVIEW.test(t) || REVIEWS_HEAD.test(t) || /^[\d.,\s★☆|%()-]+$/.test(t)) continue
      if (/(₹|rs\.?)\s?\d/i.test(t) && t.length < 60) continue                 // a price, not a review
      if ([...seen].some(x => x.includes(t) || t.includes(x))) continue          // same text inside a wrapper
      seen.add(t); out.push(t)
      if (out.length >= 60) return out
    }
  }
  return out
}

// Shops that build review pages with JavaScript (Myntra, Next.js / React shops …) carry the reviews as data
// inside the page: window.__xyz = {…}, __NEXT_DATA__, application/json. Find objects that look like a review.
const TEXT_KEYS = ['reviewText', 'review_text', 'reviewBody', 'review', 'comment', 'comments', 'body', 'content', 'text', 'description', 'message', 'feedback']
const REVIEW_HINT = ['rating', 'userRating', 'user_rating', 'stars', 'star', 'score', 'userName', 'user_name', 'author', 'reviewer', 'reviewerName', 'nickname', 'customerName', 'createdAt', 'created_at', 'date', 'timestamp', 'upvotes', 'helpful', 'verified', 'isVerified']
export function embeddedReviews(doc) {
  const blobs = []
  for (const sc of doc.querySelectorAll('script')) {
    if (sc.src) continue
    const t = sc.textContent || ''
    if (t.length < 50 || t.length > 3e6) continue
    if (/json/i.test(sc.type || '') || sc.id === '__NEXT_DATA__') { blobs.push(t); continue }
    const m = t.match(/(?:window\.)?__[A-Za-z0-9_]+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)
    if (m && /review|comment|rating/i.test(m[1].slice(0, 200000))) blobs.push(m[1])
  }
  const out = [], seen = new Set()
  let steps = 0
  const walk = (x, d) => {
    if (!x || typeof x !== 'object' || d > 16 || ++steps > 60000 || out.length >= MAX_REVIEWS) return
    if (Array.isArray(x)) { for (const y of x) walk(y, d + 1); return }
    const keys = Object.keys(x)
    const text = TEXT_KEYS.map(k => x[k]).find(v => typeof v === 'string' && v.trim().length >= 12 && v.length <= 3000)
    if (text && keys.some(k => REVIEW_HINT.includes(k))) {
      const t = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (!seen.has(t) && !/^https?:/.test(t)) { seen.add(t); out.push({ text: t }) }
    }
    for (const k of keys) walk(x[k], d + 1)
  }
  for (const b of blobs) { try { walk(JSON.parse(b), 0) } catch {} }
  return out
}

/** What the page's review area looks like (logged by the phone app when no review was found). */
export function reviewClues(doc = document) {
  const cls = new Map()
  for (const el of doc.querySelectorAll('[class*="eview" i], [class*="rating" i], [id*="eview" i]')) {
    const c = String(el.className || el.id || '').split(/\s+/).find(x => /review|rating/i.test(x))
    if (c) cls.set(c, (cls.get(c) || 0) + 1)
  }
  const head = [...doc.querySelectorAll('h1, h2, h3, h4, span, div, p, button')].find(e => e.children.length <= 2 && /review/i.test(e.textContent || '') && (e.textContent || '').length < 60)
  return { classes: [...cls].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`), heading: head ? head.textContent.replace(/\s+/g, ' ').trim() : '', height: doc.documentElement.scrollHeight }
}

/** Reviews a page publishes in its schema.org product data (most shops do, for Google). */
function ldReviews(doc) {
  const out = []
  for (const sc of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (x) => {
        if (!x || typeof x !== 'object') return
        if (Array.isArray(x)) return x.forEach(walk)
        const t = [].concat(x['@type'] || [])
        if (t.includes('Review') && (x.reviewBody || x.description)) out.push({ text: String(x.reviewBody || x.description) })
        for (const k of ['@graph', 'review', 'reviews', 'itemListElement']) if (x[k]) walk(x[k])
      }
      walk(JSON.parse(sc.textContent))
    } catch {}
  }
  return out
}

/** Amazon "Customers say": summary sentence + every topic chip with its good / bad count. */
export function readStoreInsights(doc = document) {
  try {
    const root = doc.querySelector('#cr-product-insights-cards, [data-hook="cr-insights-widget"], #product-insights-feature-div, [data-hook*="cr-insights"]')
      || doc.querySelector('#customerReviews, #reviewsMedley')
    if (!root) return null
    const summary = clean(root.querySelector('[data-hook="cr-insights-widget-summary"], #product-summary p, [data-hook*="summary"] p')?.textContent).slice(0, 600)
    const all = clean(root.textContent)
    const topics = []
    const seen = new Set()
    // "57 customers mention "fit", 40 positive, 17 negative"
    const re = /(\d[\d,]*)\s+customers?\s+mention\s+[“"']([^“"'”]{2,40})[”"'],?\s*(\d[\d,]*)\s+positive,?\s*(\d[\d,]*)\s+negative/gi
    let m
    while ((m = re.exec(all))) {
      const label = m[2].trim()
      if (seen.has(label.toLowerCase())) continue
      seen.add(label.toLowerCase())
      const n = s => parseInt(String(s).replace(/,/g, ''), 10) || 0
      topics.push({ label: label[0].toUpperCase() + label.slice(1), mentions: n(m[1]), pos: n(m[3]), neg: n(m[4]) })
    }
    // Chips without counts (counts sit in a pop-up that hasn't loaded): name + good/bad from the icon/label
    if (!topics.length) {
      root.querySelectorAll('[data-hook="cr-insights-aspect-link"], [aria-label*="mention"], button[id*="aspect"], a[id*="aspect"]').forEach(b => {
        const label = clean(b.textContent).slice(0, 40)
        if (!label || seen.has(label.toLowerCase())) return
        seen.add(label.toLowerCase())
        const html = (b.outerHTML || '').toLowerCase()
        const tone = /negative|cr-insights-icon-negative|red/.test(html) ? 'neg' : /mixed/.test(html) ? 'mixed' : /positive|check|green/.test(html) ? 'pos' : null
        topics.push({ label, mentions: null, pos: null, neg: null, tone })
      })
    }
    if (!summary && !topics.length) return null
    return { source: 'Amazon “Customers say”', summary, topics: topics.slice(0, 16) }
  } catch { return null }
}

// Shops that load reviews only when you scroll to them, or behind a "Reviews" tab / "Load more" button.
// Used in the phone apps' hidden store page (and the Expo browser); the page is put back where it was.
const REVIEW_TAB = /^\s*((customer |product )?reviews?|ratings?\s*(&|and)\s*reviews?|reviews?\s*(&|and)\s*ratings?|(view|see|read|show) all( \d[\d,]*)? reviews?|(show|load|view) more( reviews?)?)\s*(\(\s*\d[\d,.k]*\s*\))?\s*$/i
function clickReviewControls(max = 3) {
  let n = 0
  for (const el of document.querySelectorAll('button, [role="tab"], [role="button"], summary, a, div, span, li, h2, h3')) {
    if (n >= max) break
    if (el.children.length > 2) continue
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (t.length > 40 || !REVIEW_TAB.test(t)) continue
    if (el.tagName === 'A') { const h = el.getAttribute('href') || ''; if (h && !h.startsWith('#') && !h.startsWith('javascript')) continue }   // real links are followed as review pages instead
    try { el.click(); n++ } catch {}
  }
  return n
}
async function wakeLazyReviews(platform) {
  const y0 = scrollY
  const count = () => readReviewCards(document, platform).length
  try {
    if (clickReviewControls()) await sleep(900)
    const steps = 8
    for (let i = 1; i <= steps && count() < 10; i++) {
      scrollTo(0, document.documentElement.scrollHeight * i / steps)
      await sleep(450)
    }
    for (let i = 0; i < 3 && count() < MAX_REVIEWS; i++) {
      const before = count()
      if (!clickReviewControls(1)) break
      await sleep(1000)
      if (count() === before) break
    }
  } catch {}
  scrollTo(0, y0)
}

async function deepOn() {
  try { const v = await chrome.storage.local.get(PREF_KEY); return v[PREF_KEY] !== false } catch { return true }
}
export async function setDeepReviews(on) {
  try { await chrome.storage.local.set({ [PREF_KEY]: Boolean(on) }) } catch {}
}
export { deepOn as getDeepReviews }

const SIGN_IN = /\/(ap\/signin|signin|sign-in|login|log-in|account\/login|auth|users\/sign_in)\b/i

/** Any shop: the "See all reviews" link on the product page (same site only). */
export function findReviewsLink(doc, pageUrl) {
  let base; try { base = new URL(pageUrl) } catch { return null }
  const ok = (href) => { try { const u = new URL(href, base); return u.host === base.host && u.href.split('#')[0] !== base.href.split('#')[0] ? u.href : null } catch { return null } }
  const links = [...doc.querySelectorAll('a[href]')]
  const byText = links.find(a => /\b(all|more|see|view|read|show)\b[^\n]{0,30}\breviews?\b|\breviews?\b[^\n]{0,6}\(\d|\ball\s+\d[\d,]*\s+reviews?\b/i.test((a.textContent || '') + ' ' + (a.getAttribute('aria-label') || '')) && ok(a.getAttribute('href')))
  if (byText) return ok(byText.getAttribute('href'))
  const byHref = links.find(a => /\/(product-)?reviews?\b|[?&](tab|section)=reviews?\b|\/ratings?-reviews?/i.test(a.getAttribute('href') || '') && ok(a.getAttribute('href')))
  return byHref ? ok(byHref.getAttribute('href')) : null
}

/** Any shop: the next page of reviews (rel=next, a "Next" link, or page=N+1 in the address). */
function nextPageUrl(doc, url) {
  let base; try { base = new URL(url) } catch { return null }
  const abs = (h) => { try { const u = new URL(h, base); return u.host === base.host ? u.href : null } catch { return null } }
  const rel = doc.querySelector('a[rel~="next"][href], link[rel~="next"][href]')
  if (rel) return abs(rel.getAttribute('href'))
  const a = [...doc.querySelectorAll('a[href]')].find(x => /^\s*(next|next page|›|»|>)\s*$/i.test(x.textContent || '') || /next/i.test(x.getAttribute('aria-label') || ''))
  if (a) return abs(a.getAttribute('href'))
  const m = base.href.match(/([?&](?:page|pageNumber|p|pg)=)(\d+)/i)
  return m ? base.href.replace(m[0], m[1] + (+m[2] + 1)) : null
}

// The store's "all reviews" page for this product (null = not a known address; found on the page instead)
function reviewPageUrl(platform, pageUrl, n) {
  try {
    const u = new URL(pageUrl)
    if (platform === 'amazon') {
      const asin = (u.pathname.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i) || [])[1]
      if (!asin) return null
      return `${u.origin}/product-reviews/${asin}/?reviewerType=all_reviews&pageNumber=${n}`
    }
    if (platform === 'flipkart') {
      if (!/\/p\/itm/i.test(u.pathname)) return null
      const r = new URL(u.origin + u.pathname.replace('/p/', '/product-reviews/'))
      const pid = u.searchParams.get('pid'); if (pid) r.searchParams.set('pid', pid)
      const lid = u.searchParams.get('lid'); if (lid) r.searchParams.set('lid', lid)
      r.searchParams.set('page', String(n))
      return r.toString()
    }
  } catch {}
  return null
}

/**
 * @returns {Promise<{ reviews:{text,date,verified,stars}[], pagesRead:number, fromPage:number,
 *   source:string, note:string|null, deep:boolean, storeInsights:object|null }>}
 */
export async function collectReviews(platform, pageUrl, { onStep, extraTextSelector, wake = false } = {}) {
  let fromDom = readReviewCards(document, platform, extraTextSelector)
  if (wake && fromDom.length < 10) {
    onStep?.('Loading the reviews on this page…')
    await wakeLazyReviews(platform)
    const again = readReviewCards(document, platform, extraTextSelector)
    if (again.length > fromDom.length) fromDom = again
  }
  const out = { reviews: fromDom.slice(), pagesRead: 0, fromPage: fromDom.length, source: 'product page', note: null, deep: false, storeInsights: null }
  try { if (location.href === pageUrl || !pageUrl) out.storeInsights = readStoreInsights(document) } catch {}

  const deep = await deepOn()
  out.deep = deep
  if (!deep) { out.note = 'Reading extra review pages is off'; return out }

  // Page 1: a known address (Amazon, Flipkart) or the shop's own "See all reviews" link
  const known = Boolean(reviewPageUrl(platform, pageUrl, 1))
  let next = known ? reviewPageUrl(platform, pageUrl, 1) : findReviewsLink(document, location.href)   // runs inside the product page
  if (!next) {
    out.note = out.reviews.length ? 'This shop shows its reviews on the product page' : 'No reviews found on this shop\'s page'
    if (!out.reviews.length) try { out.clues = reviewClues(document) } catch {}
    return out
  }

  const seen = new Set(out.reviews.map(r => r.text))
  for (let n = 1; n <= MAX_PAGES && next && out.reviews.length < MAX_REVIEWS; n++) {
    onStep?.(`Reading review page ${n} of ${MAX_PAGES}…`)
    let res
    try {
      res = await fetch(next, { credentials: 'include', redirect: 'follow' })
    } catch { out.note = 'Review pages could not be opened'; break }
    if (!res.ok) { out.note = `Shop blocked the review pages (${res.status})`; break }
    if (SIGN_IN.test(new URL(res.url).pathname)) { out.note = 'Sign in to the store to read more review pages'; break }
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if (n === 1 && !out.storeInsights) out.storeInsights = readStoreInsights(doc)
    const got = readReviewCards(doc, platform)
    if (!got.length) {
      if (n === 1) out.note = /captcha|robot/i.test(html.slice(0, 20000)) ? 'Store asked for a captcha — product page only' : /sign ?in to|log ?in to/i.test(html.slice(0, 20000)) ? 'Sign in to the store to read more review pages' : 'Review pages had no readable reviews'
      break
    }
    let added = 0
    for (const r of got) if (!seen.has(r.text)) { seen.add(r.text); out.reviews.push(r); added++ }
    out.pagesRead = n
    if (!added) break                  // same page again = no more pages
    next = known ? reviewPageUrl(platform, pageUrl, n + 1) : nextPageUrl(doc, next)
    await sleep(GAP_MS)
  }
  out.reviews = out.reviews.slice(0, MAX_REVIEWS)
  if (out.pagesRead) out.source = out.fromPage ? 'product page + review pages' : 'review pages'
  return out
}
