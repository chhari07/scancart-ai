// Regression: substring keywords made genuine products look "far too cheap" (12 Nov 2026).
// "Table Mount" matched "tab" (tablet), "Black" matched "ac", and accessories got device price floors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectCategory, validatePrice } from '../utils/priceValidator.js'

const ok = [
  ['Artikel Dual Monitor Desk Mount for Upto 32 Inch Screens | Adjustable Table Mount | Black', 2049],
  ['Apple 2026 MacBook Air 15 Laptop with M5 chip', 161900],
  ['Laptop Stand for MacBook, Aluminium', 1299],
  ['iPhone 16 case', 499],
  ['Daikin 1.5 Ton Split AC', 38990],
]
const flagged = [
  ['MacBook Air M5 15 inch', 24999],
  ['Apple iPhone 16 (128 GB) - Black', 8999],
  ['AirPods Pro', 1499],
]

test('genuine products and accessories are not flagged as too cheap', () => {
  for (const [n, p] of ok) assert.equal(validatePrice(p, n).risk, 'low', n)
})
test('premium devices far below their usual price are still flagged', () => {
  for (const [n, p] of flagged) assert.ok(['critical', 'high'].includes(validatePrice(p, n).risk), n)
})
test('keywords match whole words only', () => {
  assert.equal(detectCategory('Adjustable Table Mount'), 'accessory')
  assert.notEqual(detectCategory('Black cotton kurta'), 'appliances')
})
