import { create } from 'zustand';
import { getUsdInrCache, setUsdInrCache } from '@/crypto/keystore';

// Live USD→INR exchange rate.
//
// Spec §10 says "no external service" — but the user explicitly amended
// that for FX, because every US-stock value in the portfolio is dollar-
// denominated and needs to display in rupees at the current rate. This is
// the ONLY external call in the app. Anything else (analytics, crash
// reporting, sync, AI) remains prohibited.
//
// Source: api.frankfurter.app — free, no API key, ECB official rates.
// Refreshes hourly. If the network is unreachable we keep using the last
// cached value (a slightly stale ₹83 is better than a missing dashboard).
//
// The store hydrates from SecureStore on boot so the first paint after
// unlock shows real numbers, not the ₹80 fallback.

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=INR';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Fallback if both network AND cache are unavailable on first run. Picked
// to be in the right ballpark for 2026 so a brand-new install before its
// first fetch doesn't display a wildly wrong INR total.
const FALLBACK_RATE = 83.0;

export type FxStatus = 'idle' | 'loading' | 'error';

interface FxState {
  // Latest known USD→INR rate. Always populated (falls back to the cached
  // value or FALLBACK_RATE), so callers never have to deal with null.
  usdInr: number;
  fetchedAtMs: number | null;
  status: FxStatus;
  hydrated: boolean;
  // Pull from SecureStore — runs once at app boot.
  hydrate: () => Promise<void>;
  // Force a network refresh regardless of cache age.
  refresh: () => Promise<void>;
  // Refresh only if the cache is stale (>1h old) or empty. Cheap to call
  // on every screen mount; bails fast when fresh.
  refreshIfStale: () => Promise<void>;
}

export const useFx = create<FxState>((set, get) => ({
  usdInr: FALLBACK_RATE,
  fetchedAtMs: null,
  status: 'idle',
  hydrated: false,

  hydrate: async () => {
    try {
      const cached = await getUsdInrCache();
      if (cached) {
        set({ usdInr: cached.rate, fetchedAtMs: cached.fetchedAtMs, hydrated: true });
        return;
      }
    } catch {
      // Fall through to the default rate.
    }
    set({ hydrated: true });
  },

  refresh: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const res = await fetch(FRANKFURTER_URL);
      if (!res.ok) throw new Error(`fx http ${res.status}`);
      const json = (await res.json()) as { rates?: { INR?: number } };
      const rate = json?.rates?.INR;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error('fx malformed response');
      }
      const now = Date.now();
      set({ usdInr: rate, fetchedAtMs: now, status: 'idle' });
      setUsdInrCache(rate, now).catch(() => undefined);
    } catch {
      // Keep last-known value. Surface the error state so UI can show a
      // "rate may be stale" hint, but don't blow up the dashboard.
      set({ status: 'error' });
    }
  },

  refreshIfStale: async () => {
    const { fetchedAtMs, status } = get();
    if (status === 'loading') return;
    const fresh = fetchedAtMs !== null && Date.now() - fetchedAtMs < CACHE_TTL_MS;
    if (fresh) return;
    await get().refresh();
  },
}));
