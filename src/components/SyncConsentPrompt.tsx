// Right after signing in, if the account has never said whether Ona may keep
// a copy of the data (src/sync/accountConsent.ts). Asked once per account:
// the answer applies on every phone, and can be changed in Settings →
// Privacy, Security & Data.
import { useEffect } from 'react';
import { useUi } from './UiProvider';
import { answerConsentPrompt, useConsentPromptStore } from '../sync/accountConsent';

export const CONSENT_PROMPT = {
  title: 'Keep your data in your account?',
  message:
    'Ona can keep a copy of your plans, journal, feelings and habits in your account. Then they sync between your phones, and come back when you sign in again, for example after reinstalling. Nothing is shared with anyone. You can change this any time in Settings → Privacy, Security & Data.',
  yes: 'Yes, keep a copy',
  no: 'Not now',
};

export function SyncConsentPrompt() {
  const askFor = useConsentPromptStore((s) => s.askFor);
  const { showDialog } = useUi();
  useEffect(() => {
    if (!askFor) return;
    showDialog({
      title: CONSENT_PROMPT.title,
      message: CONSENT_PROMPT.message,
      actions: [
        { label: CONSENT_PROMPT.no, style: 'cancel', onPress: () => void answerConsentPrompt(false) },
        { label: CONSENT_PROMPT.yes, style: 'default', onPress: () => void answerConsentPrompt(true) },
      ],
    });
  }, [askFor, showDialog]);
  return null;
}
