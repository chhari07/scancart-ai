// src/content/index.js
import { getScanner } from "./scanner";

const scanner = getScanner();
scanner.init();

// Listen for requests from the Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PRODUCT_DATA") {
    const data = scanner.getData();
    sendResponse(data);
  }
  return true; // Keep the message channel open for async responses
});