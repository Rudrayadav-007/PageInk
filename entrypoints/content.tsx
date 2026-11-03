import ReactDOM from 'react-dom/client';
import { ContentScriptContext } from 'wxt/client';
import { BRAND_CONFIG } from '../src/config/brand';
import { OverlayApp } from '../src/components/OverlayApp';
import overlayStyles from '../src/styles/overlay.css?inline';

export default defineContentScript({
  registration: 'runtime',
  matches: [],
  cssInjectionMode: 'manual',
  async main(ctx: ContentScriptContext) {
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === BRAND_CONFIG.toggleMessageType) {
        void toggleOverlay();
        sendResponse({ ok: true });
      }
      return false;
    });

    // Open immediately on first injection triggered by clicking the extension icon
    await openOverlay();
  },
});

