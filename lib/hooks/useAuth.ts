/**
 * Authentication hook for Telofy
 * Handles sign in, sign up, sign out, and session management
 */

import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

// ============================================
// AUTH STORE
// ============================================

interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  timezone?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  signOut: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user) =>
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
        }),

      setToken: (token) =>
        set((state) => {
          state.token = token;
          if (token) {
            api.setToken(token);
          }
        }),

      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
        }),

      setError: (error) =>
        set((state) => {
          state.error = error;
        }),

      signOut: () =>
        set((state) => {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
          state.error = null;
          api.setToken(null);
        }),

      clearError: () =>
        set((state) => {
          state.error = null;
        }),
    })),
    {
      name: 'telofy-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ============================================
// AUTH HOOK
// ============================================

export function useAuth() {
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    setUser,
    setToken,
    setLoading,
    setError,
    signOut: storeSignOut,
    clearError,
  } = useAuthStore();

  // Restore token to API client on mount
  useEffect(() => {
    if (token) {
      api.setToken(token);
    }
  }, [token]);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.signUp(email, password, name);
        setUser(response.user);
        setToken(response.token);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign up failed';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [setUser, setToken, setLoading, setError]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.signIn(email, password);
        setUser(response.user);
        setToken(response.token);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign in failed';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [setUser, setToken, setLoading, setError]
  );

  const signOut = useCallback(async () => {
    setLoading(true);

    try {
      await api.signOut();
    } catch {
      // Ignore errors, sign out locally anyway
    } finally {
      storeSignOut();
      setLoading(false);
    }
  }, [storeSignOut, setLoading]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    signUp,
    signIn,
    signOut,
    clearError,
  };
}

export default useAuth;
