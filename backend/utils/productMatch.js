// productMatch.js — is a search result the SAME product as the one on the page?
// Hard rules first (storage, RAM, size, volume, pack, colour, accessory), then word overlap.
// A cheaper 128 GB phone is never shown as a cheaper price for the 256 GB one.

const COLOURS = ['black', 'white', 'blue', 'red', 'green', 'grey', 'gray', 'silver', 'gold', 'pink', 'purple', 'violet', 'yellow',
  'orange', 'brown', 'beige', 'navy', 'maroon', 'cream', 'olive', 'teal', 'mint', 'lavender', 'graphite', 'titanium', 'midnight', 'starlight', 'onyx', 'cobalt', 'marble']
const ACCESSORY = /\b(case|cover|back cover|screen guard|screen protector|tempered glass|protector|skin|charger|cable|adapter|strap|band|pouch|stand|holder|refill|replacement)\b/
const BUNDLE = /(apple ?care|protect\+|combo|bundle|\bkit\b|with (charger|case|cover|earphones|headphones|warranty pack))/
const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'in', 'by', 'to', 'a', 'an', 'new', 'latest', 'india', 'men', 'women', 'mens', 'womens', 'unisex', 'buy', 'online', 'best', 'pack'])

const norm = (s) => String(s || '').toLowerCase().replace(/[(),|/+\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
const uniq = (a) => [...new Set(a)]

export function productAttrs(title) {
  const t = norm(title)
  const ram = (t.match(/(\d{1,2})\s*gb\s*ram/) || [])[1]
  const storage = uniq([...t.matchAll(/(\d{1,4})\s*(gb|tb)\b(?!\s*ram)/g)].map(m => m[2] === 'tb' ? +m[1] * 1024 : +m[1]).filter(v => v >= 16 && String(v) !== ram))
  const size = (t.match(/\b(?:uk|us|euro|size)\s*-?\s*(\d{1,2}(?:\.5)?)\b/) || t.match(/\b(\d{1,2}(?:\.5)?)\s*(?:uk|us)\b/) || [])[1] || null
  const inch = (t.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:inch|inches|in\b|")/) || [])[1] || null
  const vol = (() => {
    const m = t.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|g|gm|kg)\b/); if (!m) return null
    const v = +m[1], u = m[2]
    return u === 'l' || u === 'ltr' || u === 'litre' ? `${v * 1000}ml` : u === 'kg' ? `${v * 1000}g` : u === 'gm' ? `${v}g` : `${v}${u}`
  })()
  const pack = +((t.match(/pack of (\d+)|(\d+)\s*(?:pcs|pieces|pc)\b|set of (\d+)/) || []).slice(1).find(Boolean) || 1)
  const colours = COLOURS.filter(c => new RegExp(`\\b${c}\\b`).test(t)).map(c => c === 'gray' ? 'grey' : c)
  // Full colour name, e.g. "moonlight blue" vs "daybreak blue": the title part ( , | separated ) holding a colour word
  const colourName = (() => {
    const part = String(title || '').toLowerCase().split(/[(),|/]| - /).map(x => x.replace(/^[-\s]+|[-\s]+$/g, '')).find(x => x.split(/\s+/).length <= 3 && COLOURS.some(c => new RegExp(`\\b${c}\\b`).test(x)))
    return part ? part.replace(/\s+/g, ' ') : null
  })()
  const words = t.split(' ').filter(w => w.length > 1 && !STOP.has(w))
  const models = words.filter(w => /\d/.test(w) && /[a-z]/.test(w) && w.length >= 4 && !/^\d+(gb|tb|ml|g|kg|mah|w|hz|mp|inch)$/.test(w))
  return { storage, ram: ram ? +ram : null, size, inch, vol, pack, colours, colourName, models, words, accessory: ACCESSORY.test(t), bundle: BUNDLE.test(t.replace(/([a-z])with\b/g, '$1 with')) }
}

/**
 * @returns { same, score (0-1), how: 'exact' | 'NN% match', reason? }
 * `ids` lets a caller say two listings share an ID (ASIN, GTIN, model number) → exact.
 */
export function compareProducts(pageTitle, otherTitle, { pagePrice = 0, otherPrice = 0, sameId = false, ignoreColour = false } = {}) {
  const a = productAttrs(pageTitle), b = productAttrs(otherTitle)
  const differ = (x, y) => x != null && y != null && x !== y
  if (b.accessory && !a.accessory) return { same: false, score: 0, reason: 'An accessory, not the product' }
  if (b.bundle && !a.bundle) return { same: false, score: 0, reason: 'Sold with extras (bundle)' }
  if (a.words[0] && !b.words.includes(a.words[0])) return { same: false, score: 0, reason: 'Different brand' }
  if (a.storage.length && b.storage.length && Math.max(...a.storage) !== Math.max(...b.storage)) return { same: false, score: 0, reason: 'Storage is different' }
  if (differ(a.ram, b.ram)) return { same: false, score: 0, reason: 'RAM is different' }
  if (differ(a.size, b.size)) return { same: false, score: 0, reason: 'Size is different' }
  if (differ(a.inch, b.inch)) return { same: false, score: 0, reason: 'Screen size is different' }
  if (differ(a.vol, b.vol)) return { same: false, score: 0, reason: 'Quantity is different' }
  if (a.pack !== b.pack) return { same: false, score: 0, reason: 'Pack size is different' }
  if (!ignoreColour && a.colours.length && b.colours.length && !a.colours.some(c => b.colours.includes(c))) return { same: false, score: 0, reason: 'Colour is different' }
  if (!ignoreColour && a.colourName && b.colourName && a.colourName !== b.colourName) return { same: false, score: 0, reason: 'Colour is different' }
  if (sameId) return { same: true, score: 1, how: 'exact' }

  const sharedModel = a.models.some(m => b.models.includes(m))
  const lineNum = a.words.slice(1, 5).find(w => /^\d{2,5}$/.test(w))
  if (lineNum && !b.words.slice(0, 8).includes(lineNum)) return { same: false, score: 0, reason: 'Model number is different' }
  if (a.models.length && b.models.length && !sharedModel && a.models.some(m => m.length >= 6)) return { same: false, score: 0, reason: 'Model number is different' }
  // How many of the page title's first key words the other title also has (brand is the first word)
  const key = a.words.slice(0, 8), bw = new Set(b.words)
  const score = key.length ? key.filter(w => bw.has(w)).length / key.length : 0
  // Far cheaper than the page's own price is usually a different / fake / used item
  if (pagePrice > 0 && otherPrice > 0 && otherPrice < pagePrice * 0.4) return { same: false, score, reason: 'Too cheap to be the same item' }
  const final = sharedModel ? Math.max(score, 0.9) : score
  if (final < 0.6) return { same: false, score: final, reason: 'Looks like a different product' }
  return { same: true, score: final, how: sharedModel && final >= 0.9 ? 'exact' : `${Math.round(final * 100)}% match` }
}
