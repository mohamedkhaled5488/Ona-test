// Settings → Export my data: everything as one JSON file, shared through the
// system share sheet on a phone, downloaded in the web preview.
import { Platform } from 'react-native';
import { buildExport, collectPhotoUris } from './localData';
import { todayISO } from './date';

async function embedPhotos(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (Platform.OS === 'web') return out; // web photo URIs are already self-contained or blob: links
  const { File } = await import('expo-file-system');
  for (const uri of collectPhotoUris()) {
    if (out[uri] || uri.startsWith('data:')) continue;
    try {
      const type = /\.png$/i.test(uri) ? 'image/png' : 'image/jpeg';
      out[uri] = `data:${type};base64,${await new File(uri).base64()}`;
    } catch {
      // Missing or unreadable photo: the export keeps its original URI.
    }
  }
  return out;
}

export async function exportAllData(includePhotos: boolean): Promise<{ ok: boolean; message: string }> {
  try {
    const data = buildExport(includePhotos ? await embedPhotos() : undefined);
    const json = JSON.stringify(data, null, 2);
    const fileName = `ona-export-${todayISO()}.json`;

    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, message: 'Your export was downloaded.' };
    }

    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(json);
    if (!(await Sharing.isAvailableAsync())) return { ok: false, message: "Sharing isn't available on this device." };
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Ona data' });
    return { ok: true, message: 'Export ready.' };
  } catch {
    return { ok: false, message: "Couldn't create the export. Please try again." };
  }
}
