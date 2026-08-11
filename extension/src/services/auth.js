import { storage } from './storage'

export const authService = {
  async getCurrentUser() { return storage.getUser() },
  async isLoggedIn() { return !!(await storage.getUser()) },
  async logout() { await storage.clearUser() },
  redirectToLogin() {
    const url = import.meta.env.VITE_WEBSITE_URL || 'https://scancart.ai'
    chrome.tabs.create({ url: `${url}/sign-in` })
  },
  redirectToSignUp() {
    const url = import.meta.env.VITE_WEBSITE_URL || 'https://scancart.ai'
    chrome.tabs.create({ url: `${url}/sign-up` })
  },
  redirectToPricing() {
    const url = import.meta.env.VITE_WEBSITE_URL || 'https://scancart.ai'
    chrome.tabs.create({ url: `${url}/pricing` })
  },
}
