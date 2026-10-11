// Native (iOS/Android): Skia links natively, no WASM runtime to load.
// The real implementation lives in loadSkiaWeb.web.ts — Metro picks that
// file instead of this one when bundling for web, based on the filename
// extension alone, which is what keeps canvaskit-wasm (and its Node-only
// `fs` dependency) out of the native bundle entirely.
export async function loadSkiaWebIfNeeded(): Promise<void> {}
