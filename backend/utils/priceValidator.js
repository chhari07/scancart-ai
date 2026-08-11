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

export function detectCategory(productName = '') {
  const lower = productName.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'generic'
}

export function validatePrice(price, productName = '') {
  const category = detectCategory(productName)
  const range = CATEGORY_MRP[category] || CATEGORY_MRP.generic

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
