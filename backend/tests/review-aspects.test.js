import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectCategory, tagAspects } from '../utils/reviewAspects.js'
import { classifyReviews } from '../utils/reviewClassifier.js'

const label = texts => { const c = classifyReviews(texts); return [...c.real.map(r => ({ ...r, label: 'real' })), ...c.fake.map(r => ({ ...r, label: 'fake' })), ...c.unclear.map(r => ({ ...r, label: 'unclear' }))] }
const get = (out, key) => out.aspects.find(a => a.key === key)

test('category from breadcrumb first, then name', () => {
  assert.equal(detectCategory('Something', 'Electronics › Headphones › Earbuds'), 'electronics')
  assert.equal(detectCategory('Women Cotton Kurta Set', ''), 'clothing')
  assert.equal(detectCategory('Men Running Shoes', ''), 'footwear')
  assert.equal(detectCategory('Vitamin C Face Serum', ''), 'beauty')
  assert.equal(detectCategory('Random gadget thing', ''), null)
})

test('one review can give opinions on several topics', () => {
  const out = tagAspects(label(['Fabric is soft but colour faded after 2 washes, size is perfect']), 'clothing')
  assert.equal(get(out, 'material').pos, 1)
  assert.equal(get(out, 'colour').neg, 1)
  assert.equal(get(out, 'wash').neg, 1)
  assert.equal(get(out, 'fit').pos, 1)
})

test('Hinglish and negation', () => {
  const out = tagAspects(label(['kapda accha hai lekin fitting tight hai', 'not good fabric, very thin']), 'clothing')
  assert.equal(get(out, 'material').pos, 1)
  assert.equal(get(out, 'material').neg, 1)
  assert.equal(get(out, 'fit').neg, 1)
})

test('fake-looking reviews are left out, under 3 opinions is hidden', () => {
  const out = tagAspects(label(['BEST FABRIC EVER!!!!! MUST BUY!!!', 'Material is good, used for 2 months']), 'clothing')
  assert.equal(out.skippedFake, 1)
  assert.equal(get(out, 'material').mentions, 1)
  assert.equal(get(out, 'material').strength, 'hidden')
})

test('unknown category still gets the common topics', () => {
  const out = tagAspects(label(['Same as shown in picture, value for money']), null)
  assert.equal(out.categoryLabel, 'Other')
  assert.equal(get(out, 'matches').pos, 1)
})
