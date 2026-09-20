'use client';

// ============================================================
// Auth Context & Hook
// Provides authenticated user, business, and agent state across client components.
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { authFetch } from '@/lib/api/auth-fetch';
import type { Business, Agent } from '@/types';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  business: Business | null;
  agent: Agent | null;
  loading: boolean;
  refreshBusiness: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  business: null,
  agent: null,
  loading: true,
  refreshBusiness: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusinessData = useCallback(async (userId: string) => {
    try {
      const resp = await authFetch('/api/business');
      if (resp.ok) {
        const data = await resp.json();
        if (data.business) {
          setBusiness(data.business);
          setAgent(data.agent || null);
          return;
        }
      }
      setBusiness(null);
      setAgent(null);
    } catch {
      setBusiness(null);
      setAgent(null);
    }
  }, []);

  const refreshBusiness = useCallback(async () => {
    if (user) {
      await fetchBusinessData(user.id);
    }
  }, [user, fetchBusinessData]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        fetchBusinessData(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        fetchBusinessData(currentUser.id);
      } else {
        setBusiness(null);
        setAgent(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchBusinessData]);

  const signOut = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setBusiness(null);
    setAgent(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        agent,
        loading,
        refreshBusiness,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
