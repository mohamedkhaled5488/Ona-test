// Account-level actions from Settings. The decisions live here, with the side
// effects passed in, so the rules can be tested without a server:
// - Signing out never deletes anything on the device.
// - Deleting the account needs a connection; offline, nothing changes.
// - The user chooses whether this device keeps its copy.
// - Withdrawing the "store my data" consent stops sync at once, and only
//   deletes server copies if the user asks for that.

export type ActionResult = { ok: true } | { ok: false; message: string };

export const OFFLINE_MESSAGE = "You're offline, so nothing was deleted. Try again when you're connected.";

export interface DeleteAccountDeps {
  isOnline: () => Promise<boolean>;
  deleteOnServer: () => Promise<{ error: { message: string } | null }>;
  signOutLocally: () => Promise<void>;
  wipeLocalData: () => Promise<void>;
  forgetAccount: () => void; // trial/subscription/sync facts for this account
}

export async function deleteAccount(keepLocalCopy: boolean, deps: DeleteAccountDeps): Promise<ActionResult> {
  if (!(await deps.isOnline())) return { ok: false, message: OFFLINE_MESSAGE };
  let result: { error: { message: string } | null };
  try {
    result = await deps.deleteOnServer();
  } catch {
    return { ok: false, message: OFFLINE_MESSAGE };
  }
  if (result.error) return { ok: false, message: `Your account wasn't deleted: ${result.error.message}` };
  await deps.signOutLocally();
  deps.forgetAccount();
  if (!keepLocalCopy) await deps.wipeLocalData();
  return { ok: true };
}

export interface WithdrawConsentDeps {
  setConsent: (on: boolean) => void;
  isOnline: () => Promise<boolean>;
  deleteServerData: () => Promise<{ error: { message: string } | null }>;
}

// Consent is withdrawn first and unconditionally — the server copy is a
// separate, optional step that can fail without undoing the withdrawal.
export async function withdrawStoreDataConsent(deleteServerCopies: boolean, deps: WithdrawConsentDeps): Promise<ActionResult> {
  deps.setConsent(false);
  if (!deleteServerCopies) return { ok: true };
  if (!(await deps.isOnline())) return { ok: false, message: "Sync is off. You're offline, so the copy in your account wasn't deleted yet — try again when you're connected." };
  try {
    const { error } = await deps.deleteServerData();
    if (error) return { ok: false, message: `Sync is off, but the copy in your account wasn't deleted: ${error.message}` };
  } catch {
    return { ok: false, message: "Sync is off. You're offline, so the copy in your account wasn't deleted yet." };
  }
  return { ok: true };
}
