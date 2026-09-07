import { useEffect, useState } from 'react';
import type { LetterFieldKey } from '@shared/domain/letters/letterTemplates';
import { LETTER_FIELDS } from '@shared/domain/letters/letterTemplates';
import type { LetterTemplateSummary } from '../../../preload';
import { Modal } from '../../components/Modal';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

/**
 * Pick a standard-form letter, fill its fields, generate a PDF. Equivalent to QBO's "Add a letter",
 * with one deliberate difference: there is no Notice to Reader, because CSRS 4200 replaced it with
 * the Compilation Engagement Report for periods ending on or after December 14, 2021 — offering the
 * old one would hand a practitioner a superseded communication.
 */
export function LetterPickerModal({
  open,
  onClose,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  /** Prefilled from the company file and the review period, so the common fields are already there. */
  defaults: Partial<Record<LetterFieldKey, string>>;
}) {
  const [templates, setTemplates] = useState<LetterTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Partial<Record<LetterFieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedPath(null);
    setSelectedId(null);
    setValues({ letterDate: todayIso(), ...defaults });
    window.api.letters.list().then((r) => {
      if (r.ok) setTemplates(r.data);
      else setError(r.error);
    });
    // defaults is a fresh object each render; keying off `open` is what makes this run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const blanks = selected ? selected.fields.filter((f) => !(values[f] ?? '').trim()) : [];

  async function handleGenerate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSavedPath(null);
    const result = await window.api.letters.generate({ templateId: selected.id, values });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.saved) setSavedPath(result.data.filePath);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Add a letter"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Close
          </button>
          <button
            type="button"
            disabled={busy || selected === null}
            onClick={handleGenerate}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Generate PDF
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-hidden rounded-xl2 border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`cursor-pointer border-t border-gray-100 ${selectedId === t.id ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-gray-800">{t.name}</div>
                    {t.standard && <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">{t.standard}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-500">{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="rounded-xl2 border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-xs font-medium text-gray-600">Fill in for {selected.name}</p>
              {blanks.length > 0 && <span className="text-xs text-amber-600">{blanks.length} still blank</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {selected.fields.map((key) => (
                <label key={key} className="block text-sm">
                  <span className="text-xs text-gray-500">{LETTER_FIELDS[key].label}</span>
                  <input
                    type={key === 'letterDate' || key === 'periodEnd' || key === 'periodStart' ? 'date' : 'text'}
                    placeholder={LETTER_FIELDS[key].placeholder}
                    className="mt-0.5 w-full rounded-lg border border-gray-300 px-2 py-1.5"
                    value={values[key] ?? ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            {selected.practitionerReviewRequired && (
              <p className="mt-2 text-xs text-amber-600">
                This letter carries professional responsibility. It generates as a draft with a review footer — read it through and take responsibility for
                the wording before issuing it.
              </p>
            )}
            {blanks.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">Anything left blank prints as an underscored blank to fill in by hand, never as template syntax.</p>
            )}
          </div>
        )}

        {savedPath && <p className="text-xs text-emerald-700">Saved to {savedPath}</p>}
      </div>
    </Modal>
  );
}
