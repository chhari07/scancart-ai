// backend/services/firebase.js
import admin from 'firebase-admin'

let db = null

export async function initFirebase() {
  if (admin.apps.length) return Boolean(db)

  try {
    // Try service account file first
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    
    let credential
    try {
      const serviceAccount = require('./serviceAccountKey.json')
      credential = admin.credential.cert(serviceAccount)
      console.log('✅ Firebase: using serviceAccountKey.json')
    } catch {
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('no serviceAccountKey.json and FIREBASE_* env vars not set')
      }
      // Fallback to env vars
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
      console.log('✅ Firebase: using environment variables')
    }

    admin.initializeApp({ credential })
    db = admin.firestore()
    console.log('✅ Firebase Admin initialized')
    return true
  } catch (err) {
    console.warn('⚠️  Firebase init failed:', err.message)
    console.warn('    Scan results will not be persisted.')
    return false
  }
}

export function getDb() { return db }

export async function saveFirestoreScan(userId, scanData) {
  if (!db || !userId) return null
  try {
    const ref = await db.collection('scans').add({
      userId,
      // Core fields
      productName:   scanData.productName,
      productPrice:  scanData.productPrice,
      platform:      scanData.platform,
      url:           scanData.url,
      trustScore:    scanData.trustScore,
      trustLevel:    scanData.trustLevel,
      // Review engine fields
      fakeReviewPercent: scanData.fakeReviewPercent,
      botReviewPercent:  scanData.botReviewPercent,
      realReviewPercent: scanData.realReviewPercent,
      // Rating engine fields
      ratingDistribution:      scanData.ratingDistribution || [],
      ratingCredibilityScore:  scanData.ratingCredibilityScore,
      ratingHealthyRange:      scanData.ratingHealthyRange || null,
      ratingAboveHealthyRange: scanData.ratingAboveHealthyRange || false,
      ratingSuspicionLevel:    scanData.ratingSuspicionLevel || 'none',
      // Price + seller
      savings:        scanData.savings || 0,
      sellerVerified: scanData.sellerVerified,
      counterfeitRisk: scanData.counterfeitRisk,
      // Alternatives
      totalAlternativesFound: scanData.totalAlternativesFound || 0,
      allAlternatives: (scanData.allAlternatives || []).slice(0, 5),
      // Compliance engine
      complianceScore:     scanData.complianceScore ?? null,
      complianceBreaches: (scanData.complianceBreaches || []).slice(0, 5),
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const userIncrements = {
      scansToday: admin.firestore.FieldValue.increment(1),
      totalScans: admin.firestore.FieldValue.increment(1),
      totalSaved: admin.firestore.FieldValue.increment(scanData.savings || 0),
      fakesAvoided: admin.firestore.FieldValue.increment(scanData.trustScore < 50 ? 1 : 0),
    }
    if (scanData.ratingAboveHealthyRange) {
      userIncrements.suspiciousRatingsDetected = admin.firestore.FieldValue.increment(1)
    }
    if ((scanData.botReviewPercent || 0) > 30) {
      userIncrements.botReviewsDetected = admin.firestore.FieldValue.increment(1)
    }
    await db.collection('users').doc(userId).update(userIncrements)
    return ref.id
  } catch (e) {
    console.error('Firestore save error:', e.message)
    return null
  }
}

export async function getUserPlan(userId) {
  if (!db || !userId) return 'free'
  try {
    const snap = await db.collection('users').doc(userId).get()
    return snap.exists ? (snap.data().plan || 'free') : 'free'
  } catch { return 'free' }
}

// ── Price history — powers the "prior price / 30-day low" compliance check ──
// This is ScanCart's OWN tracked price data (real), not an external/government source.

export async function recordPriceObservation(productKey, { price, platform, productName, url }) {
  if (!db || !productKey || !price) return
  try {
    const docRef = db.collection('priceHistory').doc(productKey)
    await docRef.collection('observations').add({
      price,
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await docRef.set({
      productName: productName || null,
      url:         url || null,
      platform:    platform || null,
      lastSeenPrice: price,
      lastSeenAt:  admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  } catch (e) {
    console.warn('[Firebase] recordPriceObservation failed:', e.message)
  }
}

export async function getPriorPriceStats(productKey, { windowDays = 30 } = {}) {
  if (!db || !productKey) return null
  try {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    const snap = await db.collection('priceHistory').doc(productKey).collection('observations')
      .where('scannedAt', '>=', since)
      .orderBy('scannedAt', 'desc')
      .limit(60)
      .get()

    if (snap.empty) return null
    const prices = snap.docs.map(d => d.data().price).filter(p => typeof p === 'number' && p > 0)
    if (!prices.length) return null

    return {
      priorLow:    Math.min(...prices),
      priorHigh:   Math.max(...prices),
      priorAvg:    Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      sampleCount: prices.length,
      windowDays,
    }
  } catch (e) {
    console.warn('[Firebase] getPriorPriceStats failed:', e.message)
    return null
  }
}
