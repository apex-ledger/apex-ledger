import type { AppointmentUrgency } from '@shared/domain/types';

export const URGENCY_DOT: Record<AppointmentUrgency, string> = {
  urgent: 'bg-red-500',
  normal: 'bg-blue-500',
  mild: 'bg-green-500',
};

export const URGENCY_CHIP: Record<AppointmentUrgency, string> = {
  urgent: 'bg-red-100 text-red-800 border-red-300',
  normal: 'bg-blue-100 text-blue-800 border-blue-300',
  mild: 'bg-green-100 text-green-800 border-green-300',
};

export const URGENCY_LABEL: Record<AppointmentUrgency, string> = {
  urgent: 'Urgent',
  normal: 'Normal',
  mild: 'Mild',
};
