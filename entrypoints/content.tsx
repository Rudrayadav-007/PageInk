import ReactDOM from 'react-dom/client';
import { ContentScriptContext } from 'wxt/client';
import { BRAND_CONFIG } from '../src/config/brand';
import { OverlayApp } from '../src/components/OverlayApp';
import overlayStyles from '../src/styles/overlay.css?inline';

declare global {
  interface Window {
    __PAGEINK_CONTROLLER__?: {
      toggle: () => Promise<void>;
      close: () => void;
    };
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: [],
  cssInjectionMode: 'manual',
  async main(ctx: ContentScriptContext) {
    // Guard against duplicate script injection in the same tab lifecycle
    if (window.__PAGEINK_CONTROLLER__) {
      await window.__PAGEINK_CONTROLLER__.toggle();
      return;
    }

    // Remove any stale <pageink-overlay> elements left over from an extension reload
    document.querySelectorAll(BRAND_CONFIG.mountTagName).forEach((el) => el.remove());

    let ui: Awaited<ReturnType<typeof createShadowRootUi<ReactDOM.Root>>> | null = null;
    let isMounted = false;

    const closeOverlay = () => {
      if (ui && isMounted) {
        ui.remove();
        isMounted = false;
      }
    };

    const openOverlay = async () => {
      if (!ui) {
        ui = await createShadowRootUi(ctx, {
          name: BRAND_CONFIG.mountTagName,
          position: 'overlay',
          zIndex: 2147483647,
          css: overlayStyles,
          onMount: (container) => {
            const mountEl = document.createElement('div');
            container.append(mountEl);
            const root = ReactDOM.createRoot(mountEl);
            root.render(<OverlayApp onClose={closeOverlay} />);
            return root;
          },
          onRemove: (root) => {
            root?.unmount();
          },
        });
      }

      if (!isMounted) {
        ui.mount();
        isMounted = true;
      }
    };

    const toggleOverlay = async () => {
      if (isMounted) {
        closeOverlay();
      } else {
        await openOverlay();
      }
    };

    window.__PAGEINK_CONTROLLER__ = {
      toggle: toggleOverlay,
      close: closeOverlay,
    };

    const handleRuntimeMessage = (
      message: { type?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message?.type === BRAND_CONFIG.toggleMessageType) {
        void toggleOverlay();
        sendResponse({ ok: true });
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    ctx.onInvalidated(() => {
      closeOverlay();
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      delete window.__PAGEINK_CONTROLLER__;
    });

    // Open immediately on first injection triggered by clicking the extension icon
    await openOverlay();
  },
});
