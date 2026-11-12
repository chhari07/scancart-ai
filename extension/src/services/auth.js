import { storage } from './storage'
import { WEBSITE_URL } from '../utils/constants'

export const authService = {
  async getCurrentUser() { return storage.getUser() },
  async isLoggedIn() { return !!(await storage.getUser()) },
  async logout() { await storage.clearUser() },
  redirectToLogin() {
    const url = WEBSITE_URL
    chrome.tabs.create({ url: `${url}/sign-in` })
  },
  redirectToSignUp() {
    const url = WEBSITE_URL
    chrome.tabs.create({ url: `${url}/sign-up` })
  },
  redirectToPricing() {
    const url = WEBSITE_URL
    chrome.tabs.create({ url: `${url}/pricing` })
  },
}
