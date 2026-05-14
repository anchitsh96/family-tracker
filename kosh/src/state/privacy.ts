import { create } from 'zustand';
import { getPrivacyMode, setPrivacyMode } from '@/crypto/keystore';

// Global privacy mode. When `hidden` is true, every monetary figure in
// the app renders as an unreadable Braille-cell pattern (see maskDigits
// in components/Money). Toggled from the top-bar control.
//
// `hidden` starts true so that — in the brief window before hydrate()
// resolves the persisted value — the app errs on the side of NOT showing
// real numbers. hydrate() runs at app boot, well before the dashboard.
interface PrivacyState {
  hidden: boolean;
  hydrated: boolean;
  toggle: () => void;
  setHidden: (hidden: boolean) => void;
  hydrate: () => Promise<void>;
}

export const usePrivacy = create<PrivacyState>((set, get) => ({
  hidden: true,
  hydrated: false,
  toggle: () => {
    const next = !get().hidden;
    set({ hidden: next });
    // Fire-and-forget persist — a UI pref write should never block the tap.
    setPrivacyMode(next).catch(() => undefined);
  },
  setHidden: (hidden) => {
    set({ hidden });
    setPrivacyMode(hidden).catch(() => undefined);
  },
  hydrate: async () => {
    try {
      const persisted = await getPrivacyMode();
      set({ hidden: persisted, hydrated: true });
    } catch {
      // Keep the safe default (hidden) if the read fails.
      set({ hydrated: true });
    }
  },
}));
