import { BRAND_CONFIG } from '../src/config/brand';

const RESTRICTED_PREFIXES = [
  'chrome://',
  'edge://',
  'brave://',
  'vivaldi://',
  'opera://',
  'about:',
  'view-source:',
  'devtools://',
  'chrome-extension://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
  'https://microsoftedge.microsoft.com/addons',
];

function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id || isRestrictedUrl(tab.url)) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: BRAND_CONFIG.toggleMessageType,
      });
    } catch {
      // Content script is not injected yet in this tab; inject it on demand.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js'],
        });
      } catch (err) {
        console.warn(`[${BRAND_CONFIG.appName}] Cannot inject overlay on this page:`, err);
      }
    }
  });
});
