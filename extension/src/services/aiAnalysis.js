import { getDemoResult } from '../utils/demoData'
import { STORAGE_KEYS } from '../utils/constants'
import { callBackend } from './backendClient'

// Demo data is shown ONLY when the build explicitly opts in (VITE_DEMO_MODE=true),
// and is always tagged isDemo so the UI can say so. A real scan that fails
// surfaces as an error — never as sample data dressed up as a verdict.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// ─────────────────────────────────────────────
//  Main entry — backend only (the Claude key lives on the server, never in the extension)
// ─────────────────────────────────────────────
export async function analyzeProduct(url, productData = null, userId = null) {
  await new Promise(r => setTimeout(r, 1500)) // stage animation warmup

  if (DEMO_MODE) return { ...getDemoResult(url), isDemo: true }

  // Attach the signed-in website user so the backend saves the scan to their dashboard
  if (!userId) userId = await getSignedInUserId()

  const result = await callBackendEngine(url, productData, userId)
  if (!result) throw new Error('The scan service returned no result. Please try again.')
  return result
}

// ─────────────────────────────────────────────
//  Cheaper options — loaded only when the user asks.
//  Separate call so its slow live look-ups can never fail the main scan.
// ─────────────────────────────────────────────
export async function fetchAlternatives(url, productData = null) {
  const data = await callBackend('/api/scan/alternatives', { url, productData }, 35000)
  return data?.result || null
}

// ─────────────────────────────────────────────
//  Backend agentic engine call
// ─────────────────────────────────────────────
async function getSignedInUserId() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEYS.USER)
    return res[STORAGE_KEYS.USER]?.id || null
  } catch {
    return null
  }
}

async function callBackendEngine(url, productData, userId) {
  const data = await callBackend('/api/scan', { url, productData, ...(userId ? { userId } : {}) }, 15000)
  return data?.result || null
}
