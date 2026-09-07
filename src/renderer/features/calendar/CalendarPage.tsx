import { useEffect, useMemo, useState } from 'react';
import type { AppointmentRecord, ClientRecord } from '@shared/domain/types';
import { buildMonthGrid } from '@shared/domain/calendar/buildMonthGrid';
import { colorForDueDate, computeAllDeadlines, type DeadlineColor } from '@shared/domain/reminders/computeDeadlines';
import { AppointmentFormModal } from './AppointmentFormModal';
import { DayDetailModal } from './DayDetailModal';
import { DueNowPanel } from './DueNowPanel';
import { URGENCY_DOT } from './urgencyColors';
import { localIsoDate } from '@shared/domain/dates/localDate';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayIso(): string {
  return localIsoDate();
}

export interface CalendarDeadline {
  clientName: string;
  label: string;
  color: DeadlineColor;
}

/* Light fills like every other coloured chip in the app. These sit inside dense calendar cells, so
 * a ring carries the urgency that the solid fill used to. */
const DEADLINE_BAR_CLASSES: Record<DeadlineColor, string> = {
  red: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  green: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
};

export function CalendarPage() {
  const today = todayIso();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRecord | null>(null);
  const [formDefaultDate, setFormDefaultDate] = useState(today);
  const [now, setNow] = useState(new Date());

  async function refresh() {
    const [apptResult, clientResult] = await Promise.all([window.api.appointments.list(), window.api.clients.list()]);
    if (apptResult.ok) setAppointments(apptResult.data);
    if (clientResult.ok) setClients(clientResult.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Keeps the "Due Now" panel current while the app is left open.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.clientName])), [clients]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentRecord[]>();
    for (const a of appointments) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  }, [appointments]);

  // Filing deadlines (T2, HST, fiscal year-end) placed on the calendar day they fall on — computed
  // relative to the currently viewed month so navigating months surfaces that month's occurrence of
  // each recurring deadline, while the red/amber/green urgency is always relative to the real
  // today, not the viewed month, so it stays accurate no matter which month is on screen.
  const deadlinesByDate = useMemo(() => {
    const map = new Map<string, CalendarDeadline[]>();
    const monthPrefix = `${year}-${pad2(month)}`;
    const viewReference = `${year}-${pad2(month)}-01`;
    for (const client of clients) {
      const deadlines = computeAllDeadlines(
        { fiscalYearEndMonth: client.fiscalYearEndMonth, fiscalYearEndDay: client.fiscalYearEndDay, hstFilingFrequency: client.hstFilingFrequency },
        viewReference,
      );
      for (const d of deadlines) {
        if (!d.dueDate.startsWith(monthPrefix)) continue;
        const list = map.get(d.dueDate) ?? [];
        list.push({ clientName: client.clientName, label: d.label, color: colorForDueDate(d.dueDate, today) });
        map.set(d.dueDate, list);
      }
    }
    return map;
  }, [clients, year, month, today]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  function goToMonth(deltaMonths: number) {
    let newMonth = month + deltaMonths;
    let newYear = year;
    while (newMonth > 12) {
      newMonth -= 12;
      newYear += 1;
    }
    while (newMonth < 1) {
      newMonth += 12;
      newYear -= 1;
    }
    setYear(newYear);
    setMonth(newMonth);
  }

  function openAddForDate(date: string) {
    setEditingAppointment(null);
    setFormDefaultDate(date);
    setShowFormModal(true);
  }

  function openEdit(a: AppointmentRecord) {
    setEditingAppointment(a);
    setFormDefaultDate(a.date);
    setShowFormModal(true);
  }

  async function handleDelete(id: string) {
    const appointment = appointments.find((item) => item.id === id);
    if (!window.confirm(`Delete${appointment ? ` “${appointment.title}”` : ' this appointment'} from the calendar? This cannot be undone.`)) return;
    await window.api.appointments.delete(id);
    setSelectedDate(null);
    refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-brand-900">Calendar</h1>
          <p className="text-sm text-gray-500">Appointment booking with color-coded urgency, reminders, and snooze.</p>
        </div>
      </div>

      <DueNowPanel appointments={appointments} clientNameById={clientNameById} now={now} onRefresh={refresh} />

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goToMonth(-1)} className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50">
              ←
            </button>
            <h2 className="w-40 text-center text-sm font-semibold text-brand-900">
              {new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <button type="button" onClick={() => goToMonth(1)} className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50">
              →
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Urgent
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Mild
              </span>
              <span className="ml-2 flex items-center gap-1 border-l border-gray-200 pl-2">
                <span className="h-2.5 w-4 rounded-sm bg-red-600" /> Filing Deadline
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setYear(Number(today.slice(0, 4)));
                setMonth(Number(today.slice(5, 7)));
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            >
              Today
            </button>
            <button type="button" onClick={() => openAddForDate(today)} className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-200">
              + New Appointment
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
              {d}
            </div>
          ))}
          {grid.map((date, i) => {
            const dayAppointments = date ? appointmentsByDate.get(date) ?? [] : [];
            const dayDeadlines = date ? deadlinesByDate.get(date) ?? [] : [];
            const isToday = date === today;
            return (
              <button
                key={i}
                type="button"
                disabled={!date}
                onClick={() => date && setSelectedDate(date)}
                className={`flex h-24 flex-col items-stretch rounded border p-1 text-left transition-colors ${
                  !date ? 'border-transparent' : isToday ? 'border-brand-400 bg-brand-50 hover:bg-brand-100' : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                {date && (
                  <>
                    <span className={`text-xs ${isToday ? 'font-bold text-brand-700' : 'text-gray-500'}`}>{Number(date.slice(-2))}</span>
                    {dayDeadlines.length > 0 && (
                      <span
                        title={dayDeadlines.map((d) => `${d.clientName} — ${d.label}`).join('\n')}
                        className={`mt-0.5 block truncate rounded px-1 py-0.5 text-[10px] font-bold leading-tight ${DEADLINE_BAR_CLASSES[dayDeadlines[0].color]}`}
                      >
                        {dayDeadlines.length === 1 ? dayDeadlines[0].clientName : `${dayDeadlines.length} Filings Due`}
                      </span>
                    )}
                    <div className="mt-1 flex flex-1 flex-col gap-1 overflow-hidden">
                      {dayAppointments.slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          title={a.title}
                          className={`block h-2.5 w-full rounded-sm ${URGENCY_DOT[a.urgency]} ${a.completed ? 'opacity-30' : ''}`}
                        />
                      ))}
                      {dayAppointments.length > 3 && <span className="text-[9px] font-medium text-gray-400">+{dayAppointments.length - 3} more</span>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <DayDetailModal
          open
          onClose={() => setSelectedDate(null)}
          date={selectedDate}
          appointments={appointmentsByDate.get(selectedDate) ?? []}
          clientNameById={clientNameById}
          onAdd={() => {
            setSelectedDate(null);
            openAddForDate(selectedDate);
          }}
          onEdit={(a) => {
            setSelectedDate(null);
            openEdit(a);
          }}
          onDelete={handleDelete}
        />
      )}

      <AppointmentFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSaved={refresh}
        editing={editingAppointment}
        defaultDate={formDefaultDate}
        clients={clients}
      />
    </div>
  );
}
