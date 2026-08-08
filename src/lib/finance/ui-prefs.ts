'use client';

import type { UiPrefs } from './types';

/**
 * The only thing still kept in localStorage.
 *
 * These are per-device view preferences, not financial data — losing them is
 * harmless, and round-tripping them through the database would add a network
 * write every time a balance is hidden or a tab is switched.
 *
 * `theme` is mirrored here purely as a pre-paint cache: the real value lives in
 * the `settings` table, but it is not available until after login, and reading
 * it from localStorage lets the bootstrap script in layout.tsx pick the right
 * background colour before React mounts.
 */
export const UI_KEY = 'cream-money.ui';

export interface StoredUi extends UiPrefs {
    theme: 'dark' | 'light';
}

export const DEFAULT_UI_PREFS: StoredUi = {
    lastView: 'overview',
    hideBalances: false,
    theme: 'dark'
};

export function loadUiPrefs(): StoredUi {
    if (typeof window === 'undefined') return { ...DEFAULT_UI_PREFS };
    try {
        const raw = window.localStorage.getItem(UI_KEY);
        if (!raw) return { ...DEFAULT_UI_PREFS };
        const parsed = JSON.parse(raw) as Partial<StoredUi>;

        return {
            lastView: typeof parsed.lastView === 'string' ? parsed.lastView : DEFAULT_UI_PREFS.lastView,
            hideBalances: parsed.hideBalances === true,
            theme: parsed.theme === 'light' ? 'light' : 'dark'
        };
    } catch {
        return { ...DEFAULT_UI_PREFS };
    }
}

export function saveUiPrefs(prefs: StoredUi): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(UI_KEY, JSON.stringify(prefs));
    } catch {
        /* Preferences are disposable; a quota failure must not break the app. */
    }
}
