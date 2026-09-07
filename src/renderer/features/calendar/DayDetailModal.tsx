import type { AppointmentRecord, ClientRecord } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { URGENCY_CHIP } from './urgencyColors';

export function DayDetailModal({
  open,
  onClose,
  date,
  appointments,
  clientNameById,
  onAdd,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  appointments: AppointmentRecord[];
  clientNameById: Map<string, string>;
  onAdd: () => void;
  onEdit: (a: AppointmentRecord) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...appointments].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={date}
      footer={
        <button type="button" onClick={onAdd} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
          + Add Appointment
        </button>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No appointments this day.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => (
            <div key={a.id} className={`rounded border px-3 py-2 text-sm ${URGENCY_CHIP[a.urgency]} ${a.completed ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {a.time} — {a.title}
                </span>
                <span className="text-xs">{a.durationMinutes} min</span>
              </div>
              {a.clientId && clientNameById.get(a.clientId) && <div className="text-xs">Client: {clientNameById.get(a.clientId)}</div>}
              {a.notes && <div className="mt-1 text-xs">{a.notes}</div>}
              <div className="mt-1.5 flex gap-3">
                <button type="button" onClick={() => onEdit(a)} className="text-xs font-medium underline">
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(a.id)} className="text-xs font-medium underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
