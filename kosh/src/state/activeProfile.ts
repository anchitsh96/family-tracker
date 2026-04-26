import { create } from 'zustand';

interface ProfileState {
  activeProfileId: string | null;
  setActive: (id: string) => void;
  // bumps whenever the active profile's data changes; screens subscribe to refresh
  dataVersion: number;
  bump: () => void;
}

export const useActiveProfile = create<ProfileState>((set) => ({
  activeProfileId: null,
  setActive: (id) => set({ activeProfileId: id, dataVersion: 0 }),
  dataVersion: 0,
  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));
