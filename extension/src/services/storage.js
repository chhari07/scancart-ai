import { STORAGE_KEYS } from '../utils/constants'

export const storage = {
  async setUser(user) {
    return new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.USER]: user }, r))
  },
  async getUser() {
    return new Promise(r =>
      chrome.storage.local.get([STORAGE_KEYS.USER], res => r(res[STORAGE_KEYS.USER] || null))
    )
  },
  async clearUser() {
    return new Promise(r => chrome.storage.local.remove([STORAGE_KEYS.USER], r))
  },
  async saveScan(scan) {
    return new Promise(r =>
      chrome.storage.local.get([STORAGE_KEYS.SCANS], res => {
        const scans = res[STORAGE_KEYS.SCANS] || []
        scans.unshift({ ...scan, scannedAt: new Date().toISOString() })
        chrome.storage.local.set({ [STORAGE_KEYS.SCANS]: scans.slice(0, 50) }, r)
      })
    )
  },
  async getScans() {
    return new Promise(r =>
      chrome.storage.local.get([STORAGE_KEYS.SCANS], res => r(res[STORAGE_KEYS.SCANS] || []))
    )
  },
}
