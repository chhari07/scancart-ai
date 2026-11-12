// src/content/content.js

import { MESSAGE_TYPES, STORAGE_KEYS, WEBSITE_ORIGINS } from "../utils/constants";
import { getScanner, isProductPage } from "./scanner";
import {
  injectScanButton,
  removeScanButton,
  setFabResult,
} from "./injectButton";

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

    setTimeout(() => {
      initScanner();
    }, 800);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});