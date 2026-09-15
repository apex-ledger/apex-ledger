import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { imageToLogoDataUrl } from '../utils/logoImage';

/**
 * The company logo, set from the document it prints on.
 *
 * The logo lives on the company, not the invoice, so changing it here changes every invoice,
 * receipt and statement — the box says so. Paste only works while the box has focus: listening
 * for Ctrl+V across the whole invoice would swallow a customer name being pasted into a field.
 */
export function CompanyLogoBox() {
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.api.company.get().then((r) => r.ok && setLogo(r.data.logoDataUrl ?? null));
  }, []);

  async function save(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await imageToLogoDataUrl(blob);
      const saved = await window.api.company.update({ logoDataUrl: dataUrl });
      if (!saved.ok) throw new Error(saved.error);
      setLogo(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const saved = await window.api.company.update({ logoDataUrl: null });
    if (!saved.ok) return setError(saved.error);
    setLogo(null);
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) {
      setError('The clipboard has no image in it. Copy the logo itself (right-click → Copy image), then paste.');
      return;
    }
    event.preventDefault();
    void save(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) void save(file);
  }

  return (
    <div className="block text-sm" data-export-skip>
      <span className="text-gray-600">Company logo</span>
      <div
        role="button"
        tabIndex={0}
        aria-label="Company logo — click, then paste with Ctrl+V, or drop an image"
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onDoubleClick={() => fileInput.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter') fileInput.current?.click(); }}
        className={`mt-1 flex h-[38px] items-center justify-center gap-2 rounded border border-dashed px-2 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${logo ? 'border-gray-300 bg-white' : 'border-gray-400 bg-gray-50 text-gray-500'}`}
        title="Click here and press Ctrl+V to paste a logo, drop an image on it, or double-click to choose a file. It prints on every invoice, receipt and statement."
      >
        {busy ? 'Saving…' : logo ? <img src={logo} alt="Company logo" className="max-h-7 max-w-[8rem] object-contain" /> : 'Click, then Ctrl+V to paste'}
      </div>
      <div className="mt-0.5 flex gap-2 text-[11px]">
        <button type="button" onClick={() => fileInput.current?.click()} className="text-brand-700 hover:underline">Choose file…</button>
        {logo && <button type="button" onClick={() => void remove()} className="text-gray-500 hover:text-red-600 hover:underline">Remove</button>}
      </div>
      {error && <span className="mt-0.5 block text-[11px] text-red-700">{error}</span>}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) void save(file); e.target.value = ''; }}
      />
    </div>
  );
}
