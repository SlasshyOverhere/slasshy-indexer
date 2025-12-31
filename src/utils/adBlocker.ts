/**
 * Simple Ad Blocker for Videasy Player
 * Uses CSS hiding rules and script injection to block common ad elements
 */

// Common ad-related CSS selectors to hide
const AD_SELECTORS = [
    // Generic ad containers
    '[class*="ad-"]',
    '[class*="-ad"]',
    '[class*="ads-"]',
    '[class*="-ads"]',
    '[id*="ad-"]',
    '[id*="-ad"]',
    '[id*="ads-"]',
    '[id*="-ads"]',
    '[class*="advertisement"]',
    '[id*="advertisement"]',
    '[class*="sponsor"]',
    '[id*="sponsor"]',

    // Popup overlays
    '[class*="popup"]',
    '[class*="modal"][class*="ad"]',
    '[class*="overlay"][class*="ad"]',

    // Common ad network containers
    '[class*="google-ad"]',
    '[class*="adsense"]',
    '[data-ad]',
    '[data-ads]',
    '[data-advertisement]',

    // Iframe ads (but not the main player)
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="adservice"]',
    'iframe[src*="ads."]',

    // Pop-under triggers
    '[onclick*="window.open"]',
    '[onclick*="popunder"]',

    // Floating/sticky ads
    '[class*="sticky-ad"]',
    '[class*="floating-ad"]',
    '[class*="fixed-ad"]',

    // Close button overlays (often trick users)
    '[class*="close-ad"]',
    '[class*="skip-ad"]',
];

// Known ad/tracking domains to block (exported for potential future use)
export const BLOCKED_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'ads.google.com',
    'adnxs.com',
    'adsrvr.org',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'criteo.com',
    'taboola.com',
    'outbrain.com',
    'popads.net',
    'popcash.net',
    'propellerads.com',
    'exoclick.com',
    'juicyads.com',
    'trafficjunky.com',
    'popunder.net',
    'clickadu.com',
    'adsterra.com',
    'mgid.com',
    'revcontent.com',
    'content.ad',
    'zergnet.com',
];

/**
 * Generate CSS rules to hide ad elements
 */
export function generateAdBlockCSS(): string {
    const rules = AD_SELECTORS.map(selector =>
        `${selector} { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; opacity: 0 !important; pointer-events: none !important; }`
    ).join('\n');

    return rules;
}

/**
 * Inject ad-blocking CSS into the document
 */
export function injectAdBlockCSS(): void {
    const styleId = 'slasshy-adblock-style';

    // Remove existing style if present
    const existing = document.getElementById(styleId);
    if (existing) {
        existing.remove();
    }

    // Create and inject new style
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = generateAdBlockCSS();
    document.head.appendChild(style);

    console.log('[AdBlocker] CSS rules injected');
}

/**
 * Override window.open to block ALL popup ads (aggressive mode)
 * Since we're in a desktop app, we never want popups from the embedded player
 */
export function blockPopups(): () => void {
    const originalOpen = window.open;

    // Block ALL window.open calls - no exceptions in this context
    window.open = function (url?: string | URL, _target?: string, _features?: string): Window | null {
        const urlStr = typeof url === 'string' ? url : url?.toString() || '';
        console.log('[AdBlocker] Blocked popup attempt:', urlStr);
        return null;
    };

    // Also intercept click events that might trigger popups
    const clickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // Check for suspicious onclick handlers
        const onclick = target.getAttribute('onclick') || '';
        if (onclick.includes('window.open') || onclick.includes('popunder') || onclick.includes('pop')) {
            console.log('[AdBlocker] Blocked click-popup:', onclick);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Check for _blank links
        if (target.tagName === 'A') {
            const href = (target as HTMLAnchorElement).href || '';
            const linkTarget = target.getAttribute('target');
            if (linkTarget === '_blank' && !href.includes('videasy.net')) {
                console.log('[AdBlocker] Blocked _blank link:', href);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
    };

    // Capture phase to intercept before handlers
    document.addEventListener('click', clickHandler, true);
    document.addEventListener('mousedown', clickHandler, true);

    console.log('[AdBlocker] Aggressive popup blocker active');

    // Return cleanup function
    return () => {
        window.open = originalOpen;
        document.removeEventListener('click', clickHandler, true);
        document.removeEventListener('mousedown', clickHandler, true);
    };
}

/**
 * Block common ad-related global functions
 */
export function blockAdFunctions(): void {
    // Block common ad function names
    const blockedFunctions = ['popunder', 'pop', 'clickunder', 'adpop', 'loadAd', 'showAd'];

    blockedFunctions.forEach(fn => {
        Object.defineProperty(window, fn, {
            value: () => null,
            writable: false,
            configurable: false
        });
    });

    console.log('[AdBlocker] Ad functions blocked');
}

/**
 * Remove ad elements from the DOM
 */
export function removeAdElements(): void {
    AD_SELECTORS.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                // Don't remove if it's part of the video player
                if (!el.closest('video') && !el.closest('[class*="player"]')) {
                    el.remove();
                }
            });
        } catch (e) {
            // Selector might be invalid, skip
        }
    });
}

/**
 * Set up MutationObserver to remove dynamically added ads
 */
export function observeAndRemoveAds(): () => void {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    // Check if the added element matches ad selectors
                    AD_SELECTORS.forEach(selector => {
                        try {
                            if (node.matches(selector) || node.querySelector(selector)) {
                                // Don't remove video player elements
                                if (!node.closest('video') && !node.closest('[class*="player"]')) {
                                    node.style.display = 'none';
                                }
                            }
                        } catch (e) {
                            // Selector might be invalid, skip
                        }
                    });
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('[AdBlocker] DOM observer active');

    return () => observer.disconnect();
}

/**
 * Initialize all ad blocking features
 */
export function initAdBlocker(): () => void {
    console.log('[AdBlocker] Initializing...');

    // Inject CSS rules
    injectAdBlockCSS();

    // Block popup windows
    const cleanupPopups = blockPopups();

    // Block ad functions
    blockAdFunctions();

    // Remove existing ad elements
    removeAdElements();

    // Observe for new ad elements
    const cleanupObserver = observeAndRemoveAds();

    console.log('[AdBlocker] Initialized successfully');

    // Return cleanup function
    return () => {
        cleanupPopups();
        cleanupObserver();
        const style = document.getElementById('slasshy-adblock-style');
        if (style) style.remove();
    };
}
