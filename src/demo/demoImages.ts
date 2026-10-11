// The bundled placeholder images the sample data points at (no real people).
import { Image } from 'react-native';
import type { DemoImages } from './generate';

const uri = (mod: number) => {
  try {
    return Image.resolveAssetSource(mod)?.uri ?? '';
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
