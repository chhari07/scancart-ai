import { initializeApp } from 'firebase/app'
import {
  getFirestore, doc, setDoc, getDoc, collection,
  addDoc, query, where, getDocs, orderBy, limit,
  Timestamp, updateDoc, increment
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// ─────────────────────────────────────────────
//  USER
// ─────────────────────────────────────────────
export async function getUserFromFirestore(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId))
    return snap.exists() ? snap.data() : null
  } catch { return null }
}

export async function canUserScan(userId) {
  try {
    const user = await getUserFromFirestore(userId)
    if (!user) return { canScan: true, remaining: 10 }
    if (user.plan === 'pro') return { canScan: true, remaining: Infinity }
    const today = user.scansToday || 0
    return { canScan: today < 10, remaining: Math.max(0, 10 - today) }
  } catch { return { canScan: true, remaining: 10 } }
}

// ─────────────────────────────────────────────
//  SCANS
// ─────────────────────────────────────────────
export async function saveScanToFirestore(userId, scanData) {
  try {
    const ref = await addDoc(collection(db, 'scans'), {
      userId,
      ...scanData,
      scannedAt: Timestamp.now(),
    })
    const isFake = scanData.trustScore < 50
    await updateDoc(doc(db, 'users', userId), {
      scansToday: increment(1),
      totalScans: increment(1),
      totalSaved: increment(scanData.savings || 0),
      fakesAvoided: increment(isFake ? 1 : 0),
      lastScanDate: Timestamp.now(),
    })
    return ref.id
  } catch (e) { console.error('saveScan error', e); return null }
}

export async function getRecentScans(userId, n = 10) {
  try {
    const q = query(
      collection(db, 'scans'),
      where('userId', '==', userId),
      orderBy('scannedAt', 'desc'),
      limit(n)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}
