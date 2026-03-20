/**
 * downloadImage.ts
 *
 * Browser-native image download — triggers a file save dialog.
 * Replaces the dev-only /api/save-image Vite middleware for production use.
 *
 * @param dataUrl   The image as a data URL (data:image/png;base64,...)
 * @param filename  Suggested filename for the download (e.g. "generation-001.png")
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Download an image from a remote URL (e.g. Supabase Storage public URL).
 * Fetches the blob first to bypass cross-origin download attribute restrictions.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  downloadImage(objectUrl, filename);
  URL.revokeObjectURL(objectUrl);
}
