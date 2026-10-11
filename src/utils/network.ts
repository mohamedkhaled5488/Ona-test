// A cheap "can we reach the account server?" check, used before actions that
// need a connection. Developer tools can force offline.
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../lib/supabase';
import { useSettingsStore } from '../store/useSettingsStore';

export async function isOnline(timeoutMs = 5000): Promise<boolean> {
  if (useSettingsStore.getState().devSimulateOffline) return false;
  if (!isSupabaseConfigured || !supabaseUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any HTTP answer (even 401/404) means the server is reachable.
    await fetch(`${supabaseUrl}/auth/v1/health`, { method: 'GET', headers: { apikey: supabaseAnonKey ?? '' }, signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
