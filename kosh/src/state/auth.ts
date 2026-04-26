import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'first_run' | 'locked' | 'unlocked';

interface AuthState {
  status: AuthStatus;
  setStatus: (s: AuthStatus) => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  setStatus: (s) => set({ status: s }),
}));
