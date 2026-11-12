// Single place that talks to the ScanCart backend.
// Popup + background call it directly; content scripts go through the background
// worker (see background/messageHandler.js), because a fetch made from a shopping
// page carries that page's origin and gets blocked.

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export async function postToBackend(path, body, timeoutMs = 15000) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Backend ${response.status}`)
  return response.json()
}

// True inside a content script (it has chrome.runtime but not chrome.tabs)
const IN_CONTENT_SCRIPT = typeof chrome !== 'undefined' && !chrome.tabs

export async function callBackend(path, body, timeoutMs) {
  if (!IN_CONTENT_SCRIPT) return postToBackend(path, body, timeoutMs)

  const res = await chrome.runtime.sendMessage({ type: 'SCANCART_API', path, body, timeoutMs })
  if (!res?.ok) throw new Error(res?.error || 'Scan service unavailable')
  return res.data
}
