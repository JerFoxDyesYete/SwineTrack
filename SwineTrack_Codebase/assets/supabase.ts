import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const createStorage = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return {
        getItem: async (key: string) => window.localStorage.getItem(key),
        setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
        removeItem: async (key: string) => window.localStorage.removeItem(key),
      };
    } else {
      // Fallback (prevent web crash)
      return {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };
    }
  } else {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    };
  }
};

const supabaseUrl = 'https://tqhbmujdtqxqivaesydq.supabase.co';
// ⚠️ Use environment variables in production
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxaGJtdWpkdHF4cWl2YWVzeWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMTE1NTAsImV4cCI6MjA2Nzg4NzU1MH0.aGKcDwbjmJU97w7pzgDteFhYxf7IcsPStBIqlBhRfvA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
