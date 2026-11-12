// src/utils/stores.js — "Where else to buy this" for the Alternatives section.
// Each store gets a ScanCart store rating (out of 5) from our own fixed checklist:
//   genuine-product guarantee · brand warranty honoured · easy returns · seller control.
// It rates the STORE, not today's price — the link opens a search for this product there.

const q = s => encodeURIComponent(s)

const STORES = {
  apple:    { name: 'Apple Store (official)',  url: n => `https://www.apple.com/in/search/${q(n)}`,                        rating: 4.9, points: ['Brand’s own store — always genuine', 'Full Apple warranty'] },
  samsung:  { name: 'Samsung Store (official)', url: n => `https://www.samsung.com/in/search/?searchvalue=${q(n)}`,          rating: 4.8, points: ['Brand’s own store — always genuine', 'Full brand warranty'] },
  croma:    { name: 'Croma',                    url: n => `https://www.croma.com/searchB?q=${q(n)}`,                          rating: 4.5, points: ['Tata-owned electronics chain, sells its own stock', 'Brand warranty, store pickup'] },
  reliance: { name: 'Reliance Digital',         url: n => `https://www.reliancedigital.in/search?q=${q(n)}`,                  rating: 4.4, points: ['Large electronics chain, sells its own stock', 'Brand warranty, store pickup'] },
  vijay:    { name: 'Vijay Sales',              url: n => `https://www.vijaysales.com/search/${q(n)}`,                        rating: 4.3, points: ['Electronics chain, sells its own stock', 'Brand warranty'] },
  amazon:   { name: 'Amazon',                   url: n => `https://www.amazon.in/s?k=${q(n)}`,                                rating: 4.3, points: ['Huge choice; pick “Fulfilled by Amazon” listings', 'A-to-z guarantee on returns'] },
  flipkart: { name: 'Flipkart',                 url: n => `https://www.flipkart.com/search?q=${q(n)}`,                        rating: 4.2, points: ['Huge choice; pick “Flipkart Assured” listings', 'Check the seller’s rating'] },
  tatacliq: { name: 'Tata CLiQ',                url: n => `https://www.tatacliq.com/search/?searchCategory=all&text=${q(n)}`, rating: 4.1, points: ['Tata group store, brand-authorised sellers', 'Fewer listings than big marketplaces'] },
  myntra:   { name: 'Myntra',                   url: n => `https://www.myntra.com/${q(n)}`,                                   rating: 4.4, points: ['Fashion store, mostly brand-direct sellers', 'Easy returns on most items'] },
  ajio:     { name: 'AJIO',                     url: n => `https://www.ajio.com/search/?text=${q(n)}`,                        rating: 4.2, points: ['Reliance fashion store', 'Easy returns on most items'] },
  nykaa:    { name: 'Nykaa',                    url: n => `https://www.nykaa.com/search/result/?q=${q(n)}`,                   rating: 4.5, points: ['Beauty store that sources from brands', 'Low risk of fake cosmetics'] },
  meesho:   { name: 'Meesho',                   url: n => `https://www.meesho.com/search?q=${q(n)}`,                          rating: 3.6, points: ['Very low prices, many small sellers', 'Quality varies — check reviews closely'] },
}

const BRAND_STORE = { apple: 'apple', iphone: 'apple', macbook: 'apple', ipad: 'apple', airpods: 'apple', samsung: 'samsung', galaxy: 'samsung' }

function kindOf(name) {
  const n = name.toLowerCase()
  // electronics first: "laptop" contains "top", "watch" etc.
  if (/\b(laptop|macbook|notebook|phone|iphone|smartphone|tablet|ipad|tv|television|camera|headphones?|earbuds|airpods|smart ?watch|speaker|monitor|printer|refrigerator|washing machine|ac|air conditioner|microwave|console|playstation)\b/.test(n)) return 'electronics'
  if (/lipstick|foundation|serum|cream|shampoo|perfume|mascara|sunscreen|moisturi[sz]er|face ?wash|kajal|makeup/.test(n)) return 'beauty'
  if (/\b(shirts?|t-shirts?|tshirts?|jeans|dress(es)?|kurtas?|sarees?|shoes?|sneakers?|jackets?|tops?|trousers?|sandals?|footwear)\b/.test(n)) return 'fashion'
  return 'general'
}

const BY_KIND = {
  electronics: ['croma', 'reliance', 'vijay', 'amazon', 'flipkart', 'tatacliq'],
  fashion:     ['myntra', 'ajio', 'tatacliq', 'amazon', 'flipkart'],
  beauty:      ['nykaa', 'tatacliq', 'amazon', 'flipkart'],
  general:     ['amazon', 'flipkart', 'tatacliq', 'meesho'],
}

/**
 * @returns {{ key, name, url, rating, points, official, here }[]} best-rated first, max 5
 */
export function whereToBuy(product = {}) {
  const full = String(product.productName || product.name || '').trim()
  if (!full) return []
  // Search with the first few meaningful words — whole Amazon titles find nothing elsewhere
  const name = full.split(/[|,(]/)[0].split(/\s+/).slice(0, 7).join(' ')
  const lower = full.toLowerCase()
  const here = (product.platform || '').toLowerCase()

  const keys = []
  const brandKey = Object.entries(BRAND_STORE).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower))?.[1]
  if (brandKey) keys.push(brandKey)
  for (const k of BY_KIND[kindOf(full)]) if (!keys.includes(k)) keys.push(k)

  return keys
    .map(key => ({ key, ...STORES[key], url: STORES[key].url(name), official: key === brandKey, here: key === here }))
    .sort((a, b) => (b.official - a.official) || (b.rating - a.rating))
    .slice(0, 5)
}
