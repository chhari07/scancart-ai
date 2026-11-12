// Single place that talks to the ScanCart backend.
// Popup + background call it directly; content scripts go through the background
// worker (see background/messageHandler.js), because a fetch made from a shopping
// page carries that page's origin and gets blocked.

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

// Paths the in-page script may ask the worker to call
export const ALLOWED_PATHS = ['/api/scan', '/api/price', '/api/watch']

async function request(method, path, body, timeoutMs = 15000) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const err = new Error(`Backend ${response.status}`)
    err.status = response.status
    throw err
  }
  return response.json()
}

export const postToBackend = (path, body, timeoutMs) => request('POST', path, body, timeoutMs)
export const getFromBackend = (path, timeoutMs = 8000) => request('GET', path, null, timeoutMs)
export const deleteFromBackend = (path, timeoutMs = 8000) => request('DELETE', path, null, timeoutMs)

// True inside a content script (it has chrome.runtime but not chrome.tabs)
const IN_CONTENT_SCRIPT = typeof chrome !== 'undefined' && !chrome.tabs

export async function callBackend(path, body, timeoutMs) {
  if (!IN_CONTENT_SCRIPT) return postToBackend(path, body, timeoutMs)

  const res = await chrome.runtime.sendMessage({ type: 'SCANCART_API', path, body, timeoutMs })
  if (!res?.ok) { const e = new Error(res?.error || 'Scan service unavailable'); e.status = res?.status; throw e }
  return res.data
}
