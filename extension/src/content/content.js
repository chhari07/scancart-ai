// src/content/content.js

import { MESSAGE_TYPES } from "../utils/constants";
import { getScanner, isProductPage } from "./scanner";
import {
  injectScanButton,
  removeScanButton,
  setFabResult,
} from "./injectButton";

/* ---------------- AUTH BRIDGE ---------------- */

window.addEventListener("message", (event) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://scancart.ai",
  ];

  if (!allowedOrigins.includes(event.origin)) return;

  if (event.data?.type === MESSAGE_TYPES.AUTH_SYNC) {
    chrome.storage.local.set({
      scancart_user: event.data.user,
    });
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