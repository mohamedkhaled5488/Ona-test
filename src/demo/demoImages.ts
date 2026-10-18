// The bundled placeholder images the sample data points at (no real people).
import { Image } from 'react-native';
import type { DemoImages } from './generate';

// On a phone `require` gives an asset number; on the web it gives the file's
// URL (or an object holding it), which resolveAssetSource doesn't handle.
const uri = (mod: unknown) => {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object') {
    const m = mod as { uri?: string; default?: unknown };
    if (typeof m.uri === 'string') return m.uri;
    if (m.default !== undefined) return uri(m.default);
  }
  try {
    return Image.resolveAssetSource(mod as number)?.uri ?? '';
  } catch {
    return '';
  }
};

export function demoImageUris(): DemoImages {
  return {
    sketchEarly: uri(require('../../assets/demo/sketch-early.png')),
    sketchLatest: uri(require('../../assets/demo/sketch-latest.png')),
    bookPage: uri(require('../../assets/demo/book-page.png')),
    practiceNotes: uri(require('../../assets/demo/practice-notes.png')),
  };
}
