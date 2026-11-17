import type { AuthUser } from '@school-erp/shared';
import { createStore } from 'zustand/vanilla';

interface UserState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
}

/** The signed-in user for client components. Seeded from the server session (T2). */
export const userStore = createStore<UserState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));
