import { useEffect, useState } from 'react';
import type { Employee } from '@shared/domain/types';
import { PAY_PERIOD_TYPE_LABELS, ROE_REASON_CODES } from '@shared/domain/payroll/recordOfEmployment';
import type { RoePreview } from '../../../main/ipc/roe.handlers';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

type Recall = 'unknown' | 'notReturning' | 'date';

/** Record of Employment for one employee: the firm picks the reason and last day paid, reviews
 * block 15 as computed from posted runs, then saves the worksheet PDF and the ROE Web XML. */
export function RoeModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee | null }) {
  const [reasonCode, setReasonCode] = useState('A');
  const [lastDayPaid, setLastDayPaid] = useState(localIsoDate());
  const [recall, setRecall] = useState<Recall>('unknown');
  const [recallDate, setRecallDate] = useState(localIsoDate());
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [comments, setComments] = useState('');
  const [preview, setPreview] = useState<RoePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = employee && {
    employeeId: employee.id,
    reasonCode,
    lastDayPaid,
    expectedRecall: recall === 'date' ? { date: recallDate } : recall,
    comments: comments || null,
    contactName: contactName || null,
    contactPhone: contactPhone || null,
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPreview(null);
    setReasonCode('A');
    setLastDayPaid(localIsoDate());
    setRecall('unknown');
    setComments('');
  }, [open, employee?.id]);

  useEffect(() => {
    if (!open || !request) return;
    let cancelled = false;
    window.api.roe.preview(request).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setError(r.error);
      setError(null);
      setPreview(r.data);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id, reasonCode, lastDayPaid, recall, recallDate, contactName, contactPhone, comments]);

  async function save(kind: 'pdf' | 'xml') {
    if (!request) return;
    setBusy(true);
    setError(null);
    const r = kind === 'pdf' ? await window.api.roe.savePdf(request) : await window.api.roe.saveXml(request);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  const roe = preview?.roe ?? null;
  const field = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record of Employment — ${employee?.name ?? ''}`}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Close
          </button>
          <button type="button" disabled={busy || !roe} onClick={() => save('pdf')} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Save worksheet PDF
          </button>
          <button type="button" disabled={busy || !roe} onClick={() => save('xml')} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
            Save ROE Web XML
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3" data-testid="roe-modal">
        <div className="space-y-3 text-sm">
          {error && <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>}
          <label className="block">
            <span className="text-gray-600">Reason for issuing (block 16)</span>
            <select className={`${field} bg-white`} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {ROE_REASON_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-600">Last day for which paid (block 11)</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className={field} value={lastDayPaid} onChange={(e) => setLastDayPaid(clampIsoDate(e.target.value))} />
          </label>
          <div className="block">
            <span className="text-gray-600">Expected date of recall (block 14)</span>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-700">
              <label className="flex items-center gap-1"><input type="radio" checked={recall === 'unknown'} onChange={() => setRecall('unknown')} /> Unknown</label>
              <label className="flex items-center gap-1"><input type="radio" checked={recall === 'notReturning'} onChange={() => setRecall('notReturning')} /> Not returning</label>
              <label className="flex items-center gap-1"><input type="radio" checked={recall === 'date'} onChange={() => setRecall('date')} /> Date</label>
              {recall === 'date' && <input type="date" min={DATE_MIN} max={DATE_MAX} className="rounded border border-gray-300 px-2 py-1" value={recallDate} onChange={(e) => setRecallDate(clampIsoDate(e.target.value))} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-gray-600">Contact name (block 16)</span>
              <input className={field} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-gray-600">Contact phone</span>
              <input className={field} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-gray-600">Comments (block 18, optional — comments delay processing)</span>
            <input className={field} maxLength={160} value={comments} onChange={(e) => setComments(e.target.value)} />
          </label>
          <p className="text-xs text-gray-400">Block 15 is computed from posted pay runs. The XML is the ROE Web bulk-upload file; submit it under the firm's own ROE Web login.</p>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Block 15 preview</h3>
          {roe ? (
            <>
              <dl className="space-y-1">
                <Row label="Pay period type (6)" value={`${PAY_PERIOD_TYPE_LABELS[roe.payPeriodType]}`} />
                <Row label="First day worked (10)" value={roe.firstDayWorked} />
                <Row label="Final pay period end (12)" value={roe.finalPayPeriodEnd} />
                <Row label={`15A · insurable hours (${roe.periodsRequired15C} periods)`} value={roe.totalInsurableHours.toFixed(0)} />
                <Row label={`15B · insurable earnings (${roe.periodsRequired15B} periods)`} value={<Money cents={roe.totalInsurableEarningsCents} />} />
                {roe.vacationPayOnSeparationCents > 0 && <Row label="17A · vacation pay on separation" value={<Money cents={roe.vacationPayOnSeparationCents} />} />}
              </dl>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="py-1">P.P.</th>
                    <th className="py-1">Period</th>
                    <th className="py-1 text-right">Earnings</th>
                    <th className="py-1 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roe.periods.slice(0, 14).map((p) => (
                    <tr key={p.index}>
                      <td className="py-0.5">{p.index}</td>
                      <td className="py-0.5 text-gray-600">{p.payPeriodStart} – {p.payPeriodEnd}</td>
                      <td className="py-0.5 text-right"><Money cents={p.insurableEarningsCents} /></td>
                      <td className="py-0.5 text-right">{p.insurableHours.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {roe.periods.length > 14 && <p className="mt-1 text-xs text-gray-400">…and {roe.periods.length - 14} more on the worksheet.</p>}
              {roe.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {roe.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">Computing…</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span className="text-gray-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
