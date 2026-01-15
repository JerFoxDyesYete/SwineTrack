import { createClient } from "@supabase/supabase-js";
import AsyncStorage from '@react-native-async-storage/async-storage';

const webStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(key);
    }
    return null; 
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
};

const isWeb = typeof document !== 'undefined';
const storageMechanism = isWeb ? webStorageAdapter : AsyncStorage;


const supabaseUrl = "https://tqhbmujdtqxqivaesydq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxaGJtdWpkdHF4cWl2YWVzeWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMTE1NTAsImV4cCI6MjA2Nzg4NzU1MH0.aGKcDwbjmJU97w7pzgDteFhYxf7IcsPStBIqlBhRfvA"; 

if (
  !supabaseUrl || 
  !supabaseAnonKey ||
  supabaseUrl.includes("YOUR_SUPABASE") ||
  supabaseAnonKey.includes("YOUR_SUPABASE")
) {
  console.error("❌ Supabase credentials not configured!");
  console.error(
    "Please check your environment variables for Supabase URL and Anon Key."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageMechanism, 
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from("snapshots").select("count").limit(1);
    if (error) {
      console.error("Supabase connection test failed:", error);
      return false;
    }
    console.log("✅ Supabase connection test successful");
    return true;
  } catch (err) {
    console.error("Supabase connection test error:", err);
    return false;
  }
};