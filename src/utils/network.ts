// A cheap "can we reach the account server?" check, used before actions that
// need a connection. Developer tools can force offline.
//
// Patient on purpose: on the free plan the server's sign-in service idles
// when nobody has used it for a while, and its first answer can take several
// seconds. A slow answer is still an answer, so the check waits up to
// `timeoutMs`, and tries once more if the first attempt fails outright (a
// dropped connection while the phone switches networks).
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../lib/supabase';
import { useSettingsStore } from '../store/useSettingsStore';

export const ONLINE_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 800;

async function reach(timeoutMs: number): Promise<'ok' | 'timeout' | 'failed'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any HTTP answer (even 401/404) means the server is reachable.
    await fetch(`${supabaseUrl}/auth/v1/health`, { method: 'GET', headers: { apikey: supabaseAnonKey ?? '' }, signal: controller.signal });
    return 'ok';
  } catch {
    return controller.signal.aborted ? 'timeout' : 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export async function isOnline(timeoutMs = ONLINE_TIMEOUT_MS): Promise<boolean> {
  if (useSettingsStore.getState().devSimulateOffline) return false;
  if (!isSupabaseConfigured || !supabaseUrl) return false;
  const first = await reach(timeoutMs);
  if (first === 'ok') return true;
  // Waited the whole time with no answer: really unreachable, don't wait twice.
  if (first === 'timeout') return false;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  return (await reach(timeoutMs)) === 'ok';
}
