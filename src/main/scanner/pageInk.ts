import { nativeImage } from 'electron';

/** The fraction of a scanned page's pixels that are dark — ink, as opposed to paper. Sampled
 * rather than exhaustive: a 300 dpi page is millions of pixels and every sixteenth one answers
 * the only question asked here, "is anything printed on this side?". Decoding uses Electron's
 * own image support, so no image library ships with the app. */
export function inkFraction(filePath: string): number {
  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) return 0;
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap(); // BGRA, 4 bytes per pixel
  let dark = 0;
  let sampled = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * 4;
      const luminance = (bitmap[offset] * 114 + bitmap[offset + 1] * 587 + bitmap[offset + 2] * 299) / 1000;
      sampled += 1;
      if (luminance < 110) dark += 1;
    }
  }
  return sampled === 0 ? 0 : dark / sampled;
}
