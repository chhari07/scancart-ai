// src/content/content.js

import { MESSAGE_TYPES, STORAGE_KEYS, WEBSITE_ORIGINS } from "../utils/constants";
import { getScanner, isProductPage } from "./scanner";
import {
  injectScanButton,
  removeScanButton,
  setFabResult,
  setFabChecking,
  setFabQuick,
  setPriceInfo,
  getPageStatus,
  openPanel,
} from "./injectButton";
import { callBackend } from "../services/backendClient";

/* ---------------- AUTH BRIDGE ---------------- */

const isWebsite = WEBSITE_ORIGINS.includes(window.location.origin);

window.addEventListener("message", (event) => {
  // Only the ScanCart website itself (same window) may sign the extension in or out
  if (event.source !== window) return;
  if (!WEBSITE_ORIGINS.includes(event.origin)) return;

  if (event.data?.type === MESSAGE_TYPES.AUTH_SYNC && event.data.user?.id) {
    chrome.storage.local.set({
      [STORAGE_KEYS.USER]: event.data.user,
    });
  }

  if (event.data?.type === MESSAGE_TYPES.AUTH_LOGOUT) {
    chrome.storage.local.remove(STORAGE_KEYS.USER);
  }

  if (event.data?.type === MESSAGE_TYPES.PING) {
    window.postMessage(
      {
        type: MESSAGE_TYPES.PONG,
      },
      event.origin
    );
  }
});

// The site may have sent its user before this script loaded — ask it to send again.
if (isWebsite) {
  window.postMessage({ type: MESSAGE_TYPES.EXTENSION_READY }, window.location.origin);
}

/* ---------------- BACKGROUND MESSAGES ---------------- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case MESSAGE_TYPES.SCAN_COMPLETE:
      if (message.trustScore !== undefined) {
        setFabResult(message.trustScore);
      }
      sendResponse({ success: true });
      break;

    case MESSAGE_TYPES.GET_PRODUCT_DATA: {
      const scanner = getScanner();
      sendResponse(scanner.getData());
      break;
    }

    // Toolbar popup asks what the page already knows (quick / full score)
    case MESSAGE_TYPES.GET_STATUS:
      sendResponse(getPageStatus());
      break;

    // Toolbar popup hands over to the on-page panel (the main ScanCart view)
    case MESSAGE_TYPES.OPEN_PANEL:
      sendResponse({ opened: openPanel(message.option || null) });
      break;

    default:
      sendResponse({ success: true });
      break;
  }

  return true;
});

/* ---------------- INIT ---------------- */

function initScanner() {
  if (!isProductPage()) {
    removeScanButton();
    return;
  }

  const scanner = getScanner();

  if (!scanner) {
    console.warn("No scanner available.");
    injectScanButton(null);
    return;
  }

  if (typeof scanner.init === "function") {
    scanner.init();
  }

  // Pass extracted product data so the overlay can show it immediately
  injectScanButton(scanner.getData());
  pageLoadChecks(scanner);
}

/* ---------------- ON PAGE LOAD: save price + quick badge ---------------- */
// 1) Saves today's price to ScanCart's price history (that is how the graph and the
//    "is the discount real?" check learn over time).
// 2) Asks for a quick Trust Score from page data (rules only, no AI) for the button.
let checkedFor = null;
async function pageLoadChecks(scanner, attempt = 0) {
  let data = scanner.getData();
  // Some stores render the price late — read the page again a few times
  if (!data?.price && attempt < 3) {
    setTimeout(() => { scanner.scan(); pageLoadChecks(scanner, attempt + 1); }, 1500);
    return;
  }
  if (!data?.price) return;
  const url = location.href;
  if (checkedFor === url) return;
  checkedFor = url;
  const settings = (await chrome.storage.local.get("scancart_settings")).scancart_settings || {};
  const productData = { ...data };

  callBackend("/api/price/observe", {
    url,
    productData: { productName: data.productName, price: data.price, mrpPrice: data.mrpPrice || undefined, platform: data.platform },
  }, 8000).then((r) => setPriceInfo(r)).catch(() => {});

  if (settings.autoBadge === false) return;
  setFabChecking();
  try {
    const r = await callBackend("/api/scan/quick", { url, productData }, 8000);
    setFabQuick(r?.result);
    if (typeof r?.result?.trustScore === "number") chrome.runtime.sendMessage({ type: "SCANCART_QUICK_SCORE", score: r.result.trustScore });
  } catch {
    setFabQuick(null);   // backend not reachable / not enough data → plain "Scan with ScanCart"
  }
}

/* ---------------- PAGE LOAD ---------------- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScanner);
} else {
  initScanner();
}

/* ---------------- SPA ROUTE CHANGE ---------------- */

let previousUrl = location.href;

const observer = new MutationObserver(() => {
  if (location.href !== previousUrl) {
    previousUrl = location.href;

    removeScanButton();
    checkedFor = null;

    setTimeout(() => {
      initScanner();
    }, 800);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});