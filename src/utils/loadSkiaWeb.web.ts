// Web only (see loadSkiaWeb.ts for why this file exists as a pair).
// @shopify/react-native-skia's web backend needs its CanvasKit WASM runtime
// loaded before any Skia component renders — fetched from a CDN rather than
// through Metro's dev server, which doesn't serve raw wasm binaries out of
// node_modules correctly by default.
export async function loadSkiaWebIfNeeded(): Promise<void> {
  // @ts-ignore — no published subpath export/types; this is the real build output path
  const mod: { LoadSkiaWeb: (opts?: { locateFile: (file: string) => string }) => Promise<void> } = await import(
    '@shopify/react-native-skia/lib/module/web'
  );
  await mod.LoadSkiaWeb({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/${file}` });
}
