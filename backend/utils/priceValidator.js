// backend/utils/priceValidator.js
// Price range heuristics for Indian e-commerce categories

const CATEGORY_MRP = {
  smartphone:    { min: 5000,  max: 200000 },
  smartwatch:    { min: 800,   max: 80000 },
  laptop:        { min: 20000, max: 300000 },
  earbuds:       { min: 300,   max: 40000 },
  headphones:    { min: 500,   max: 60000 },
  tablet:        { min: 8000,  max: 120000 },
  television:    { min: 8000,  max: 300000 },
  shoes:         { min: 300,   max: 30000 },
  cosmetics:     { min: 100,   max: 5000 },
  clothing:      { min: 150,   max: 20000 },
  appliances:    { min: 3000,  max: 200000 },
  accessory:     { min: 50,    max: 60000 },
  generic:       { min: 50,    max: 500000 },
}

const CATEGORY_KEYWORDS = {
  smartphone: ['iphone', 'phone', 'mobile', 'galaxy', 'pixel', 'oneplus', 'redmi', 'realme'],
  smartwatch: ['watch', 'smartwatch', 'fitness band', 'band', 'tracker'],
  laptop:     ['laptop', 'notebook', 'macbook', 'chromebook'],
  earbuds:    ['earbuds', 'airpods', 'tws', 'truly wireless'],
  headphones: ['headphones', 'headset'],
  tablet:     ['tablet', 'ipad', 'tab'],
  television: ['tv', 'television', 'oled', 'qled', 'smart tv'],
  shoes:      ['shoes', 'sneakers', 'running', 'footwear', 'boots'],
  cosmetics:  ['foundation', 'lipstick', 'mascara', 'serum', 'moisturizer', 'sunscreen'],
  clothing:   ['shirt', 'tshirt', 't-shirt', 'jeans', 'dress', 'kurta', 'saree'],
  appliances: ['refrigerator', 'washing machine', 'microwave', 'air conditioner', 'ac'],
}

// Accessories FOR a device ("Laptop Stand", "Phone Case", "Monitor Mount") are priced like accessories,
// not like the device — checked before the device keywords.
const ACCESSORY = /\b(mounts?|stands?|holders?|cases?|covers?|cables?|chargers?|adapters?|protectors?|screen guards?|skins?|sleeves?|straps?|bags?|tripods?|docks?|hubs?|keyboards?|mouse|mice|arms?|brackets?|cleaning kit|stickers?)\b/

export function detectCategory(productName = '') {
  const lower = productName.toLowerCase()
  if (ACCESSORY.test(lower)) return 'accessory'
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    // whole words only: "Table" is not "tab", "Black" is not "ac"
    if (keywords.some(kw => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))) return cat
  }
  return 'generic'
}

// Premium models with a well-known price floor in India — far below it usually means fake or a scam
const PREMIUM_FLOOR = [
  [/macbook\s*pro/i, 120000], [/macbook/i, 65000], [/iphone/i, 35000], [/ipad\s*pro/i, 60000], [/ipad/i, 25000],
  [/apple\s*watch/i, 20000], [/airpods\s*pro/i, 15000], [/airpods/i, 8000],
  [/galaxy\s*(s|z)\s?\d/i, 30000], [/playstation\s*5|\bps5\b/i, 30000], [/dyson/i, 15000],
]

export function validatePrice(price, productName = '', mrp = 0) {
  const category = detectCategory(productName)
  const range = CATEGORY_MRP[category] || CATEGORY_MRP.generic

  // Premium floors apply to the device itself, never to accessories for it ("MacBook stand", "iPhone case")
  const floor = category === 'accessory' ? null : PREMIUM_FLOOR.find(([re]) => re.test(productName))?.[1]
  if (floor) {
    if (price < floor * 0.45) return { risk: 'critical', deviation: (price - floor) / floor, reason: 'far below the usual price of this model' }
    if (price < floor * 0.65) return { risk: 'high',     deviation: (price - floor) / floor, reason: 'well below the usual price of this model' }
  }
  // Selling price a tiny fraction of the printed MRP is a classic fake-listing sign
  if (mrp > 0 && price > 0 && price < mrp * 0.25 && mrp >= 2000) return { risk: 'high', deviation: (price - mrp) / mrp, reason: 'less than a quarter of the MRP' }

  if (price < range.min * 0.40) return { risk: 'critical', deviation: -1 }
  if (price < range.min * 0.60) return { risk: 'high',     deviation: (price - range.min) / range.min }
  if (price < range.min * 0.80) return { risk: 'medium',   deviation: (price - range.min) / range.min }
  if (price > range.max * 1.20) return { risk: 'high',     deviation: (price - range.max) / range.max }
  return { risk: 'low', deviation: 0 }
}

export function isSuspiciousPrice(price, productName = '') {
  const { risk } = validatePrice(price, productName)
  return risk === 'critical' || risk === 'high'
}
