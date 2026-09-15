/** The company file keeps the logo as a PNG or JPEG data URL, capped by companyUpdateSchema. */
const MAX_DATA_URL_CHARS = 600_000;
const MAX_EDGE_PX = 600;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That does not look like an image the browser can open.'));
    image.src = src;
  });
}

/**
 * Turns whatever was pasted, dropped or picked into a logo the company file will accept.
 *
 * A small PNG or JPEG goes in untouched. Anything else — a screenshot pasted from the clipboard
 * (often several megabytes), a WebP or GIF copied off a website — is redrawn onto a canvas no
 * larger than 600px on its longest side, as PNG, or as JPEG if the PNG is still over the cap.
 * A logo printed a couple of inches wide gains nothing from more pixels than that.
 */
export async function imageToLogoDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('Paste or choose an image — PNG or JPEG works best.');
  const original = await readAsDataUrl(blob);
  if (/^data:image\/(png|jpeg);base64,/.test(original) && original.length <= MAX_DATA_URL_CHARS) return original;

  const image = await loadImage(original);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize images.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const png = canvas.toDataURL('image/png');
  if (png.length <= MAX_DATA_URL_CHARS) return png;
  // JPEG has no transparency, so paint white first or a transparent logo comes out on black.
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.85);
  if (jpeg.length <= MAX_DATA_URL_CHARS) return jpeg;
  throw new Error('That image is too detailed to store as a logo. Try a simpler or smaller version.');
}
