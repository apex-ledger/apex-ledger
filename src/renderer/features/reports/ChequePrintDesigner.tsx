import { useEffect, useRef, useState } from 'react';
import type { ChequeRow } from '@shared/domain/ledger/chequeRegister';
import { chequeAmountWords } from './chequeAmountWords';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

type FieldKey = 'date' | 'payee' | 'amountWords' | 'amountNumbers' | 'memo';
interface FieldPlacement { x: number; y: number; width: number; fontSize: number }
interface ChequeLayout {
  widthMm: number;
  heightMm: number;
  backgroundDataUrl: string | null;
  printBackground: boolean;
  fields: Record<FieldKey, FieldPlacement>;
}
interface ChequePrintData {
  chequeNumber: string;
  date: string;
  payee: string;
  amount: string;
  memo: string;
}
interface SavedChequeTemplate {
  id: string;
  name: string;
  layout: ChequeLayout;
  savedAt: string;
}

const STORAGE_KEY = 'north-ledger-cheque-print-layout-v1';
const TEMPLATES_STORAGE_KEY = 'north-ledger-cheque-print-templates-v1';
const DEFAULT_LAYOUT: ChequeLayout = {
  widthMm: 158.75,
  heightMm: 69.85,
  backgroundDataUrl: null,
  printBackground: false,
  fields: {
    date: { x: 72, y: 12, width: 23, fontSize: 10 },
    payee: { x: 9, y: 32, width: 60, fontSize: 11 },
    amountWords: { x: 9, y: 52, width: 69, fontSize: 9 },
    amountNumbers: { x: 77, y: 32, width: 19, fontSize: 11 },
    memo: { x: 9, y: 76, width: 45, fontSize: 8 },
  },
};

const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'Date', payee: 'Payee', amountWords: 'Amount in words', amountNumbers: 'Numeric amount', memo: 'Memo',
};

function loadLayout(): ChequeLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<ChequeLayout>;
    return { ...DEFAULT_LAYOUT, ...parsed, fields: { ...DEFAULT_LAYOUT.fields, ...(parsed.fields ?? {}) } };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function loadTemplates(): SavedChequeTemplate[] {
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedChequeTemplate[]) : [];
  } catch {
    return [];
  }
}

function templateNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Imported Cheque';
}

function initialPrintData(cheque?: ChequeRow | null): ChequePrintData {
  return {
    chequeNumber: cheque ? String(cheque.chequeNumber) : '',
    date: cheque?.entryDate ?? localIsoDate(),
    payee: cheque?.payee ?? '',
    amount: cheque ? (cheque.amountCents / 100).toFixed(2) : '',
    memo: cheque ? `Cheque #${cheque.chequeNumber}` : '',
  };
}

function amountCents(data: ChequePrintData): number {
  const dollars = Number(data.amount.replace(/[$,\s]/g, ''));
  return Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0;
}

function fieldText(field: FieldKey, data: ChequePrintData): string {
  if (field === 'date') return data.date;
  if (field === 'payee') return data.payee || 'Payee';
  if (field === 'amountWords') return chequeAmountWords(amountCents(data));
  if (field === 'amountNumbers') return `$${(amountCents(data) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return data.memo || (data.chequeNumber ? `Cheque #${data.chequeNumber}` : 'Memo');
}

function ChequeFields({ data, layout }: { data: ChequePrintData; layout: ChequeLayout }) {
  return Object.entries(layout.fields).map(([rawKey, placement]) => {
    const key = rawKey as FieldKey;
    return (
      <div
        key={key}
        style={{
          position: 'absolute', left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`,
          fontSize: `${placement.fontSize}pt`, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', color: '#111827',
        }}
      >
        {fieldText(key, data)}
      </div>
    );
  });
}

export function ChequePrintDesigner({ cheque, onClose }: { cheque?: ChequeRow | null; onClose: () => void }) {
  const [layout, setLayout] = useState<ChequeLayout>(loadLayout);
  const [printData, setPrintData] = useState<ChequePrintData>(() => initialPrintData(cheque));
  const [templates, setTemplates] = useState<SavedChequeTemplate[]>(loadTemplates);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [selectedField, setSelectedField] = useState<FieldKey>('payee');
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      setMessage('The scan is too large to save. Import a smaller JPG/PNG image.');
    }
  }, [layout]);

  // The active template learns every later adjustment automatically—dragged positions, type size,
  // cheque dimensions, and background choice—so calibration is not lost after closing the page.
  useEffect(() => {
    if (!activeTemplateId) return;
    setTemplates((current) => {
      const next = current.map((template) =>
        template.id === activeTemplateId ? { ...template, layout, savedAt: new Date().toISOString() } : template,
      );
      try {
        window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        setMessage('The learned template could not be saved. Try a smaller scan or remove an older browser-stored template.');
      }
      return next;
    });
  }, [activeTemplateId, layout]);

  function saveTemplate(name: string, learnedLayout: ChequeLayout = layout) {
    const cleanName = name.trim() || 'Cheque Template';
    const template: SavedChequeTemplate = {
      id: window.crypto.randomUUID(),
      name: cleanName,
      layout: learnedLayout,
      savedAt: new Date().toISOString(),
    };
    setTemplates((current) => {
      const next = [...current, template];
      try {
        window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        setMessage('The scan is too large to save as a template. Import a smaller scan.');
        return current;
      }
      return next;
    });
    setActiveTemplateId(template.id);
    setTemplateName(cleanName);
    setMessage(`Saved “${cleanName}” as a learning cheque template. Future layout adjustments save automatically.`);
  }

  function removeActiveTemplate() {
    if (!activeTemplateId) return;
    const active = templates.find((template) => template.id === activeTemplateId);
    if (!active || !window.confirm(`Remove the saved cheque template “${active.name}”?`)) return;
    const next = templates.filter((template) => template.id !== activeTemplateId);
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    setTemplates(next);
    setActiveTemplateId(null);
    setTemplateName('');
    setMessage(`Removed the saved template “${active.name}”.`);
  }

  function useImageAsScan(dataUrl: string, importedName: string) {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1800 / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', 0.84);
      const ratio = image.naturalWidth / image.naturalHeight;
      const current = layoutRef.current;
      const next = { ...current, heightMm: Number((current.widthMm / ratio).toFixed(2)), backgroundDataUrl: compressed };
      setLayout(next);
      saveTemplate(importedName, next);
    };
    image.src = dataUrl;
  }

  async function importScan(file: File | undefined) {
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        setMessage('Rendering the first PDF page…');
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const document = await loadingTask.promise;
        const page = await document.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create the PDF preview canvas.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        useImageAsScan(canvas.toDataURL('image/jpeg', 0.9), templateNameFromFile(file.name));
        await loadingTask.destroy();
        setMessage('Using the first PDF page as the layout background.');
      } catch (error) {
        setMessage(`Could not read this PDF: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setMessage('Import a PDF, JPG, or PNG scan.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => useImageAsScan(String(reader.result), templateNameFromFile(file.name));
    reader.readAsDataURL(file);
  }

  function startDrag(event: React.PointerEvent, field: FieldKey) {
    event.preventDefault();
    setSelectedField(field);
    const preview = previewRef.current;
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const x = Math.max(0, Math.min(98, ((pointer.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(95, ((pointer.clientY - rect.top) / rect.height) * 100));
      setLayout((current) => ({
        ...current,
        fields: { ...current.fields, [field]: { ...current.fields[field], x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) } },
      }));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function updateField(patch: Partial<FieldPlacement>) {
    setLayout((current) => ({
      ...current,
      fields: { ...current.fields, [selectedField]: { ...current.fields[selectedField], ...patch } },
    }));
  }

  function printCheque() {
    const cleanup = () => document.body.classList.remove('cheque-printing');
    document.body.classList.add('cheque-printing');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 5000);
  }

  const selected = layout.fields[selectedField];
  return (
    <div className="rounded-lg border border-brand-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-brand-900">Fill and Print Cheque{printData.chequeNumber ? ` #${printData.chequeNumber}` : ''}</h2>
          <p className="text-xs text-gray-500">Fill the cheque, import a scan, then drag each blue field into position. The layout is saved on this computer.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Close</button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div
            ref={previewRef}
            className="relative w-full overflow-hidden border border-gray-300 bg-white shadow-inner"
            style={{ aspectRatio: `${layout.widthMm} / ${layout.heightMm}`, backgroundImage: layout.backgroundDataUrl ? `url(${layout.backgroundDataUrl})` : undefined, backgroundSize: '100% 100%' }}
          >
            {(Object.keys(layout.fields) as FieldKey[]).map((key) => {
              const placement = layout.fields[key];
              return (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(event) => startDrag(event, key)}
                  title={`Drag ${FIELD_LABELS[key]}`}
                  className={`absolute cursor-move overflow-hidden whitespace-nowrap border px-1 text-left ${selectedField === key ? 'border-blue-600 bg-blue-100/70' : 'border-blue-300 bg-blue-50/50'}`}
                  style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, fontSize: `${Math.max(8, placement.fontSize)}px`, lineHeight: 1.2 }}
                >
                  {fieldText(key, printData)}
                </button>
              );
            })}
            {!layout.backgroundDataUrl && <div className="absolute inset-0 -z-10 flex items-center justify-center text-sm text-gray-300">Import a scanned cheque image</div>}
          </div>
          <p className="mt-1 text-xs text-amber-700">Security: crop or cover the MICR/account numbers before importing if they are not needed for alignment.</p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-2">
            <label className="text-sm"><span className="text-gray-600">Cheque #</span><input value={printData.chequeNumber} onChange={(e) => setPrintData((current) => ({ ...current, chequeNumber: e.target.value }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" /></label>
            <label className="text-sm"><span className="text-gray-600">Date</span><input type="date" min={DATE_MIN} max={DATE_MAX} value={printData.date} onChange={(e) => setPrintData((current) => ({ ...current, date: clampIsoDate(e.target.value) }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" /></label>
            <label className="col-span-2 text-sm"><span className="text-gray-600">Pay to the order of</span><input value={printData.payee} onChange={(e) => setPrintData((current) => ({ ...current, payee: e.target.value }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" placeholder="Payee name" /></label>
            <label className="text-sm"><span className="text-gray-600">Amount ($)</span><input inputMode="decimal" value={printData.amount} onChange={(e) => setPrintData((current) => ({ ...current, amount: e.target.value }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" placeholder="0.00" /></label>
            <label className="text-sm"><span className="text-gray-600">Memo</span><input value={printData.memo} onChange={(e) => setPrintData((current) => ({ ...current, memo: e.target.value }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" /></label>
            <p className="col-span-2 text-xs text-gray-500">Written amount: {chequeAmountWords(amountCents(printData))}</p>
            <p className="col-span-2 text-xs font-medium text-amber-700">Printing a blank/custom cheque does not post an accounting transaction. Record the payment in NL Ledger as well.</p>
          </div>
          <div className="rounded border border-brand-200 bg-brand-50 p-2">
            <label className="block text-sm">
              <span className="font-medium text-brand-900">Saved cheque template</span>
              <select
                value={activeTemplateId ?? ''}
                onChange={(event) => {
                  const id = event.target.value || null;
                  setActiveTemplateId(id);
                  const chosen = templates.find((template) => template.id === id);
                  if (chosen) {
                    setLayout(chosen.layout);
                    setTemplateName(chosen.name);
                    setMessage(`Loaded “${chosen.name}”. Changes to this layout will save automatically.`);
                  }
                }}
                className="mt-1 w-full rounded border border-brand-200 bg-white px-2 py-1.5"
              >
                <option value="">Current unsaved layout</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <div className="mt-2 flex gap-2">
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name, e.g. RBC Operating" className="min-w-0 flex-1 rounded border border-brand-200 bg-white px-2 py-1 text-sm" />
              <button type="button" onClick={() => saveTemplate(templateName)} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">Save as Template</button>
            </div>
            {activeTemplateId && <button type="button" onClick={removeActiveTemplate} className="mt-1 text-xs text-rose-700 hover:underline">Remove selected template</button>}
            <p className="mt-1 text-xs text-brand-700">Importing a scan saves it automatically. Position and sizing changes are learned by the selected template.</p>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Scanned cheque layout</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf" onChange={(event) => void importScan(event.target.files?.[0])} className="mt-1 block w-full text-xs" />
          </label>
          {layout.backgroundDataUrl && (
            <button type="button" onClick={() => setLayout((current) => ({ ...current, backgroundDataUrl: null }))} className="text-xs text-rose-700 hover:underline">Remove scanned image</button>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Field to adjust</span>
            <select value={selectedField} onChange={(event) => setSelectedField(event.target.value as FieldKey)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5">
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => <option key={key} value={key}>{FIELD_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-gray-600">Horizontal position: {selected.x.toFixed(1)}%</span><input className="w-full" type="range" min={0} max={98} step={0.25} value={selected.x} onChange={(e) => updateField({ x: Number(e.target.value) })} /></label>
          <label className="block text-sm"><span className="text-gray-600">Vertical position: {selected.y.toFixed(1)}%</span><input className="w-full" type="range" min={0} max={95} step={0.25} value={selected.y} onChange={(e) => updateField({ y: Number(e.target.value) })} /></label>
          <label className="block text-sm"><span className="text-gray-600">Field width: {selected.width.toFixed(1)}%</span><input className="w-full" type="range" min={8} max={90} step={0.5} value={selected.width} onChange={(e) => updateField({ width: Number(e.target.value) })} /></label>
          <label className="block text-sm"><span className="text-gray-600">Font size: {selected.fontSize} pt</span><input className="w-full" type="range" min={6} max={18} step={1} value={selected.fontSize} onChange={(e) => updateField({ fontSize: Number(e.target.value) })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm"><span className="text-gray-600">Width (mm)</span><input type="number" value={layout.widthMm} onChange={(e) => setLayout((current) => ({ ...current, widthMm: Number(e.target.value) || DEFAULT_LAYOUT.widthMm }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
            <label className="text-sm"><span className="text-gray-600">Height (mm)</span><input type="number" value={layout.heightMm} onChange={(e) => setLayout((current) => ({ ...current, heightMm: Number(e.target.value) || DEFAULT_LAYOUT.heightMm }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={layout.printBackground} onChange={(e) => setLayout((current) => ({ ...current, printBackground: e.target.checked }))} /><span>Print the scanned background too. Leave off when printing onto pre-printed cheque stock.</span></label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)} className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Reset layout</button>
            <button type="button" onClick={printCheque} className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Print Cheque</button>
          </div>
          {message && <p className="text-xs text-rose-700">{message}</p>}
        </div>
      </div>

      <div
        className="cheque-print-sheet"
        style={{
          width: `${layout.widthMm}mm`, height: `${layout.heightMm}mm`,
          backgroundImage: layout.printBackground && layout.backgroundDataUrl ? `url(${layout.backgroundDataUrl})` : undefined,
          backgroundSize: '100% 100%',
        }}
      >
        <ChequeFields data={printData} layout={layout} />
      </div>
    </div>
  );
}
