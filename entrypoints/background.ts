import { BRAND_CONFIG } from '../src/config/brand';

export default defineBackground(() => {
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    // Restricted URLs (chrome://, chrome-extension://, Chrome Web Store, etc.) cannot be scripted
    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('https://chrome.google.com/webstore') ||
      tab.url.startsWith('https://chromewebstore.google.com')
    ) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: BRAND_CONFIG.toggleMessageType,
      });
    } catch {
      // Content script is not injected yet in this tab; inject it now.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js'],
        });
      } catch (err) {
        console.error(`[${BRAND_CONFIG.appName}] Failed to inject content script:`, err);
      }
    }
  });
});

