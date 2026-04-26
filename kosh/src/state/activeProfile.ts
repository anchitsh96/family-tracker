import { create } from 'zustand';
import { setLastActiveProfile } from '@/crypto/keystore';

interface ProfileState {
  activeProfileId: string | null;
  setActive: (id: string) => void;
  // bumps whenever the active profile's data changes; screens subscribe to refresh
  dataVersion: number;
  bump: () => void;
}

export const useActiveProfile = create<ProfileState>((set) => ({
  activeProfileId: null,
  setActive: (id) => {
    set({ activeProfileId: id, dataVersion: 0 });
    // Persist as the last-viewed profile so the next app launch lands here.
    // Fire-and-forget — keychain write is fast and we never block UI on it.
    setLastActiveProfile(id).catch(() => undefined);
  },
  dataVersion: 0,
  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));
