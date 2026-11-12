// backend/services/scanContext.js
// Per-request scan options without threading them through every agent.
// quick = rules only: no Claude calls and no live web look-ups (used for the page-load badge).
import { AsyncLocalStorage } from 'node:async_hooks'

export const scanContext = new AsyncLocalStorage()
export const isQuickScan = () => scanContext.getStore()?.quick === true
