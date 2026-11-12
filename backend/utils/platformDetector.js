// backend/utils/platformDetector.js

const PLATFORM_PATTERNS = {
  amazon:   /amazon\.(in|com).*(\/dp\/|\/gp\/)/,
  flipkart: /flipkart\.com.*\/p\//,
  myntra:   /myntra\.com.*\/buy/,
  nykaa:    /nykaa\.com.*\/p\//,
  meesho:   /meesho\.com.*\/p\//,
}

export function detectPlatform(url = '') {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return platform
  }
  if (url.includes('amazon')) return 'amazon'
  if (url.includes('flipkart')) return 'flipkart'
  if (url.includes('myntra')) return 'myntra'
  if (url.includes('nykaa')) return 'nykaa'
  if (url.includes('meesho')) return 'meesho'
  return 'unknown'
}

export function isProductPage(url = '') {
  return Object.values(PLATFORM_PATTERNS).some(p => p.test(url))
}

export const PLATFORM_DISPLAY = {
  amazon:   'Amazon.in',
  flipkart: 'Flipkart',
  myntra:   'Myntra',
  nykaa:    'Nykaa',
  meesho:   'Meesho',
  unknown:  'Unknown',
}
