// backend/utils/reviewAspects.js — "What buyers say": review topics per product category.
// 1) detectCategory(name, breadcrumb)  2) tagAspects(reviews, category). Rules only, English + Hinglish.
// Every count comes from real review text; fake-looking reviews are left out.

const W = (...xs) => xs // readability helper

// ── Aspect lists per category. Each aspect: words that mean "this review talks about it" ──
export const CATEGORIES = {
  clothing: {
    label: 'Clothing',
    aspects: {
      material:  W('fabric', 'material', 'cloth', 'cotton', 'polyester', 'rayon', 'linen', 'silk', 'kapda', 'kapde', 'see through', 'transparent', 'thin', 'thick', 'soft', 'rough', 'itchy'),
      fit:       W('fit', 'fitting', 'size', 'sizing', 'small', 'large', 'loose', 'tight', 'length', 'xl', 'xxl', 'chest', 'waist', 'shoulder', 'size chart'),
      colour:    W('colour', 'color', 'shade', 'rang', 'faded', 'dull', 'bright', 'darker', 'lighter'),
      stitching: W('stitch', 'stitching', 'silai', 'thread', 'seam', 'button', 'zip', 'zipper', 'finishing'),
      wash:      W('wash', 'washed', 'washing', 'shrink', 'shrunk', 'fade', 'faded', 'colour bleed', 'dhone', 'dhulai'),
      comfort:   W('comfortable', 'comfort', 'breathable', 'hot', 'sweat', 'wear all day'),
    },
  },
  footwear: {
    label: 'Footwear',
    aspects: {
      fit:        W('size', 'fit', 'fitting', 'tight', 'loose', 'narrow', 'wide', 'half size', 'one size'),
      comfort:    W('comfortable', 'comfort', 'cushion', 'soft', 'pain', 'bite', 'blister', 'light weight', 'lightweight', 'heavy'),
      sole:       W('sole', 'grip', 'slippery', 'slip', 'tread', 'heel'),
      material:   W('material', 'leather', 'mesh', 'upper', 'rubber', 'synthetic', 'canvas'),
      durability: W('durable', 'durability', 'tore', 'torn', 'broke', 'broken', 'came off', 'peeled', 'lasted', 'month', 'months'),
    },
  },
  electronics: {
    label: 'Electronics',
    aspects: {
      battery:      W('battery', 'backup', 'mah', 'drain', 'lasts', 'charge lasts'),
      performance:  W('sound', 'bass', 'audio', 'mic', 'display', 'screen', 'camera', 'speed', 'lag', 'performance', 'noise cancel', 'anc', 'clarity', 'volume'),
      build:        W('build', 'quality', 'plastic', 'body', 'sturdy', 'flimsy', 'cheap feel', 'premium'),
      charging:     W('charging', 'charger', 'charge', 'fast charge', 'type c', 'cable', 'port'),
      heating:      W('heat', 'heating', 'hot', 'garam', 'warm'),
      connectivity: W('bluetooth', 'connect', 'connection', 'pairing', 'pair', 'disconnect', 'wifi', 'range', 'latency', 'delay'),
      warranty:     W('warranty', 'service center', 'service centre', 'replacement', 'customer care', 'support'),
    },
  },
  home: {
    label: 'Home & kitchen',
    aspects: {
      material:   W('material', 'steel', 'plastic', 'glass', 'wood', 'wooden', 'aluminium', 'coating', 'non stick', 'nonstick'),
      size:       W('size', 'small', 'big', 'capacity', 'litre', 'liter', 'dimension', 'compact'),
      ease:       W('easy to use', 'easy', 'difficult', 'handle', 'install', 'installation', 'assemble'),
      cleaning:   W('clean', 'cleaning', 'wash', 'stain', 'rust', 'dishwasher'),
      durability: W('durable', 'broke', 'broken', 'crack', 'cracked', 'leak', 'leaking', 'stopped working', 'lasted'),
    },
  },
  beauty: {
    label: 'Beauty & skincare',
    aspects: {
      skin:     W('skin', 'acne', 'pimple', 'breakout', 'rash', 'itch', 'irritation', 'allergy', 'allergic', 'sensitive', 'oily', 'dry'),
      results:  W('result', 'results', 'glow', 'glowing', 'brighter', 'dark spots', 'pigmentation', 'tan', 'difference', 'effective', 'works', 'worked', 'no effect'),
      smell:    W('smell', 'fragrance', 'scent', 'khushboo', 'odour', 'odor'),
      texture:  W('texture', 'sticky', 'greasy', 'lightweight', 'absorbs', 'consistency', 'watery', 'thick'),
      fresh:    W('expiry', 'expired', 'expire', 'mfg', 'manufacturing date', 'old stock', 'fresh'),
      genuine:  W('original', 'genuine', 'fake', 'duplicate', 'first copy', 'authentic', 'sealed', 'seal'),
    },
  },
  food: {
    label: 'Food & grocery',
    aspects: {
      taste:    W('taste', 'tasty', 'swad', 'flavour', 'flavor', 'bland', 'sweet', 'salty', 'bitter'),
      fresh:    W('fresh', 'stale', 'expiry', 'expired', 'best before', 'fungus', 'smell', 'insects', 'keede'),
      packing:  W('packing', 'packaging', 'pack', 'sealed', 'leak', 'damaged', 'torn'),
      quantity: W('quantity', 'weight', 'grams', 'gm', 'kg', 'less quantity', 'half empty'),
    },
  },
}

// Asked on every product, whatever the category
export const COMMON = {
  matches:  W('as shown', 'same as picture', 'same as image', 'as described', 'different from', 'not same', 'not as shown', 'photo', 'picture', 'image', 'expected'),
  genuine:  W('original', 'genuine', 'fake', 'duplicate', 'first copy', 'copy product', 'authentic'),
  delivery: W('delivery', 'delivered', 'courier', 'packaging', 'packing', 'box', 'damaged'),
  value:    W('value for money', 'worth', 'price', 'paisa vasool', 'overpriced', 'costly', 'cheap'),
}

export const ASPECT_LABELS = {
  material: 'Material', fit: 'Fit & size', colour: 'Colour', stitching: 'Stitching', wash: 'After wash',
  comfort: 'Comfort', sole: 'Sole & grip', durability: 'Durability', battery: 'Battery',
  performance: 'Sound / screen', build: 'Build quality', charging: 'Charging', heating: 'Heating',
  connectivity: 'Connection', warranty: 'Warranty & service', size: 'Size', ease: 'Ease of use',
  cleaning: 'Cleaning', skin: 'Skin reaction', results: 'Results', smell: 'Smell', texture: 'Texture',
  fresh: 'Freshness / expiry', taste: 'Taste', packing: 'Packing', quantity: 'Quantity',
  matches: 'Matches photo?', genuine: 'Genuine product?', delivery: 'Delivery & box', value: 'Value for money',
}

const CAT_HINTS = {
  footwear:    /\b(shoe|shoes|sneaker|sneakers|sandal|sandals|slipper|slippers|flip ?flops?|loafer|boots?|heels|footwear|chappal|juttis?|mojaris?)\b/i,
  beauty:      /\b(serum|face ?wash|cream|moisturi[sz]er|sunscreen|lipstick|kajal|shampoo|conditioner|hair oil|perfume|deodorant|lotion|toner|cleanser|foundation|makeup|skin ?care|beauty|nail polish)\b/i,
  electronics: /\b(earbuds|earphones?|headphones?|neckband|speaker|smart ?watch|power ?bank|charger|cable|mobile|smartphone|phone|laptop|tablet|tv|television|mouse|keyboard|camera|trimmer|bluetooth|electronics)\b/i,
  food:        /\b(rice|atta|flour|dal|oil|ghee|tea|coffee|chocolate|biscuits?|snacks?|namkeen|spices?|masala|honey|dry ?fruits?|almonds?|cashews?|grocery|gourmet|food)\b/i,
  home:        /\b(bottle|flask|cookware|kadai|pan|tawa|pressure cooker|mixer|grinder|kettle|bedsheet|pillow|curtain|towel|storage|container|lamp|organi[sz]er|kitchen|home|furniture|mop|bucket)\b/i,
  clothing:    /\b(kurta|kurti|saree|sari|shirt|t-?shirt|tee|jeans|trousers?|pants|dress|top|tops|lehenga|jacket|hoodie|sweatshirt|shorts|leggings|dupatta|clothing|apparel|ethnic wear)\b/i,
}

/** breadcrumb first (the store's own category trail), then the product name */
export function detectCategory(name = '', breadcrumb = '') {
  const order = ['footwear', 'beauty', 'electronics', 'food', 'home', 'clothing']
  for (const src of [breadcrumb, name]) {
    if (!src) continue
    for (const k of order) if (CAT_HINTS[k].test(src)) return k
  }
  return null
}

// ── Sentiment words (English + Hinglish) ──
const POS = /\b(good|great|nice|best|excellent|awesome|perfect|soft|comfortable|sturdy|premium|clear|loud|fast|worth|love|loved|happy|satisfied|fine|accha|achha|acha|badhiya|mast|bdiya|zabardast|same as|as shown|as described|original|genuine|fresh|tasty|works|worked|effective|recommended|true to size|value for money|paisa vasool|lasts|long lasting|no issues?)\b/i
const NEG = /\b(bad|worst|poor|cheap|thin|rough|itchy|tight|loose|small|faded|fade|fades|shrink|shrunk|shrinks|torn|tore|broke|broken|cracked|leak|leaking|stopped|defective|damaged|fake|duplicate|stale|expired|smell(s|y)?|disconnects?|lag|lags|heats?|heating|hot|drain|drains|weak|low|less|waste|useless|disappointed|disappointing|not worth|return(ed)?|refund|kharab|bekar|bakwas|ghatiya|different|darker|lighter|rash|irritation|breakout|allergy|sticky|greasy|pain|bite|slippery)\b/i
const NEGATE = /\b(not|no|never|nahi|nahin|na|didn'?t|doesn'?t|isn'?t|wasn'?t|don'?t)\s+(\w+\s+)?$/i

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termRe = terms => new RegExp(`\\b(${terms.map(esc).join('|')})\\b`, 'i')

// split a review into clauses so "fabric is soft but colour faded" gives two opinions
function clauses(text) {
  return String(text).split(/[.!?;\n]+|,\s*|\s+(?:but|however|though|lekin|par|magar)\s+/i).map(s => s.trim()).filter(s => s.length > 2)
}

function polarity(clause) {
  const p = clause.match(POS), n = clause.match(NEG)
  let pos = Boolean(p), neg = Boolean(n)
  // "not good" → negative, "no smell" / "not tight" → positive
  if (p && NEGATE.test(clause.slice(0, p.index))) { pos = false; neg = true }
  if (n && NEGATE.test(clause.slice(0, n.index))) { neg = false; pos = true }
  if (pos && neg) return 'mixed'
  return pos ? 'pos' : neg ? 'neg' : 'neutral'
}

/**
 * @param {{text:string, label?:'real'|'fake'|'unclear'}[]} reviews  already sorted by the fake check
 * @param {string|null} category
 * @returns {{category, counted:number, skippedFake:number, aspects: {key,label,common,mentions,pos,neg,mixed,quotes:{text,pol}[], strength}[]}}
 */
export function tagAspects(reviews, category) {
  const cat = CATEGORIES[category]
  const lists = [
    ...Object.entries(cat?.aspects || {}).map(([k, t]) => ({ key: k, common: false, re: termRe(t) })),
    ...Object.entries(COMMON).filter(([k]) => !(cat?.aspects || {})[k]).map(([k, t]) => ({ key: k, common: true, re: termRe(t) })),
  ]
  const counted = reviews.filter(r => r.label !== 'fake')
  const out = Object.fromEntries(lists.map(l => [l.key, { key: l.key, label: ASPECT_LABELS[l.key] || l.key, common: l.common, mentions: 0, pos: 0, neg: 0, mixed: 0, quotes: [] }]))

  for (const r of counted) {
    const seen = new Set()
    for (const c of clauses(r.text)) {
      for (const l of lists) {
        if (seen.has(l.key) || !l.re.test(c)) continue
        const pol = polarity(c)
        if (pol === 'neutral') continue           // a mention with no opinion says nothing
        seen.add(l.key)
        const a = out[l.key]
        a.mentions++; a[pol === 'pos' ? 'pos' : pol === 'neg' ? 'neg' : 'mixed']++
        if (a.quotes.length < 12) a.quotes.push({ text: c.length > 110 ? c.slice(0, 107) + '…' : c, pol })
      }
    }
  }
  const aspects = Object.values(out).map(a => ({ ...a, strength: a.mentions >= 10 ? 'strong' : a.mentions >= 3 ? 'few' : 'hidden' }))
  return { category, categoryLabel: cat?.label || 'Other', counted: counted.length, skippedFake: reviews.length - counted.length, aspects }
}
