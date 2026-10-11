import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './database.types';

// EXPO_PUBLIC_* vars are inlined into the bundle at build/start time by Expo
// itself (see .env.example) — no extra config needed. Both are undefined
// until you provide real values, and the app is built to run fine without
// them: every screen still works against local state, it just won't sync
// anywhere. The anon key is meant to be public; every table is still
// protected by row-level security (see supabase/migrations/0001_init.sql).
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// A harmless placeholder client when not configured, so importing this module
// never throws — call sites check `isSupabaseConfigured` before relying on it.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
