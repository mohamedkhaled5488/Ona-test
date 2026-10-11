// Text extraction from a photographed book page.
//
// There's no OCR service wired in yet — that needs either a paid vision API
// key (the same "would need real credentials" situation as Supabase) or an
// on-device ML module that isn't available inside Expo Go. Rather than block
// the photo-quote flow on that, this returns an empty result so the field is
// simply left blank and editable: the user types or pastes the text
// themselves, or leaves it as a plain image-only bookmark, exactly as the
// spec allows. Swapping in a real call (e.g. Google Cloud Vision, or
// react-native-mlkit-ocr in a dev build) is a one-function change here.
export interface OcrResult {
  text: string;
  confident: boolean;
}

export async function extractTextFromImage(_uri: string): Promise<OcrResult> {
  // Simulated latency so the UI's loading state is real and testable.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { text: '', confident: false };
}
