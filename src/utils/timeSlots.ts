import { Appointment, AvailabilityConfig } from '../types/scheduling';

export interface GeneratedTimeSlot {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  available: boolean;
  reason?: 'booked' | 'past' | 'lunch' | 'outside';
  bookedBy?: string;
  appointment?: Appointment;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = (time || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function calculateEndTime(startTime: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(startTime) + durationMinutes);
}

export function toDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateLongBR(iso: string): string {
  const date = parseDateISO(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateShortBR(iso: string): string {
  const date = parseDateISO(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  if (rev !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  rev = (sum * 10) % 11;
  if (rev === 10) rev = 0;
  return rev === Number(digits[10]);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface EffectiveDaySchedule {
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
}

export function getScheduleForDayOfWeek(
  dayOfWeek: number,
  availability: AvailabilityConfig
): EffectiveDaySchedule {
  const override = availability.dayOverrides?.[dayOfWeek];
  if (!override) {
    return {
      startTime: availability.startTime,
      endTime: availability.endTime,
      lunchEnabled: availability.lunchEnabled,
      lunchStart: availability.lunchStart,
      lunchEnd: availability.lunchEnd,
    };
  }
  return {
    startTime: override.startTime || availability.startTime,
    endTime: override.endTime || availability.endTime,
    lunchEnabled:
      typeof override.lunchEnabled === 'boolean'
        ? override.lunchEnabled
        : availability.lunchEnabled,
    lunchStart: override.lunchStart || availability.lunchStart,
    lunchEnd: override.lunchEnd || availability.lunchEnd,
  };
}

export function isDateAvailable(
  isoDate: string,
  availability: AvailabilityConfig
): { allowed: boolean; reason?: string } {
  const blocked = availability.blockedDates.find((b) => b.date === isoDate);
  if (blocked) {
    return { allowed: false, reason: blocked.reason || 'Data sem atendimento (recesso/feriado)' };
  }

  const dateObj = parseDateISO(isoDate);
  const dayOfWeek = dateObj.getDay();
  if (!availability.workDays.includes(dayOfWeek)) {
    return { allowed: false, reason: 'Dia sem expediente configurado' };
  }

  return { allowed: true };
}

export function isUntouchedLegacyAvailability(
  av: AvailabilityConfig | null | undefined
): boolean {
  if (!av) return false;
  const isVeryOldDefault =
    av.startTime === '08:30' &&
    av.endTime === '18:30' &&
    av.lunchStart === '12:00' &&
    av.lunchEnd === '13:30' &&
    !av.dayOverrides;
  const isPreviousSaturdayOpenDefault =
    av.startTime === '08:00' &&
    av.endTime === '18:00' &&
    av.lunchStart === '12:00' &&
    av.lunchEnd === '14:00' &&
    Array.isArray(av.workDays) &&
    av.workDays.includes(6) &&
    av.dayOverrides?.[6]?.startTime === '05:00' &&
    av.dayOverrides?.[6]?.endTime === '20:00';
  return isVeryOldDefault || isPreviousSaturdayOpenDefault;
}

export function normalizeAvailabilityConfig(
  raw: AvailabilityConfig | null | undefined,
  fallback: AvailabilityConfig
): AvailabilityConfig {
  if (!raw || !Array.isArray(raw.workDays) || isUntouchedLegacyAvailability(raw)) {
    return fallback;
  }

  const cleanWorkDays = Array.from(
    new Set(
      raw.workDays
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
  ).sort((a, b) => a - b);

  let cleanOverrides: AvailabilityConfig['dayOverrides'] | undefined;
  if (raw.dayOverrides && typeof raw.dayOverrides === 'object') {
    const kept: Record<number, NonNullable<AvailabilityConfig['dayOverrides']>[number]> = {};
    for (const [k, v] of Object.entries(raw.dayOverrides)) {
      const dayIdx = Number(k);
      if (cleanWorkDays.includes(dayIdx) && v && v.startTime && v.endTime) {
        kept[dayIdx] = v;
      }
    }
    if (Object.keys(kept).length > 0) {
      cleanOverrides = kept;
    }
  }

  return {
    ...fallback,
    ...raw,
    workDays: cleanWorkDays,
    blockedDates: Array.isArray(raw.blockedDates) ? raw.blockedDates : [],
    slotIntervalMinutes:
      typeof raw.slotIntervalMinutes === 'number' && raw.slotIntervalMinutes >= 15
        ? raw.slotIntervalMinutes
        : fallback.slotIntervalMinutes,
    dayOverrides: cleanOverrides,
  };
}

export function getAppointmentEndMinutes(
  appt: Pick<Appointment, 'startTime' | 'endTime'> & { durationMinutes?: number }
): number {
  const startMins = timeToMinutes(appt.startTime);
  const rawEndMins = appt.endTime ? timeToMinutes(appt.endTime) : 0;
  if (rawEndMins > startMins) {
    return rawEndMins;
  }
  const fallbackDuration = Math.max(15, Number(appt.durationMinutes) || 45);
  return startMins + fallbackDuration;
}

/**
 * Gera os horários dinâmicos não sobrepostos para a data e duração informadas,
 * respeitando expediente por dia da semana, pausa de almoço e horário atual.
 */
export function generateTimeSlotsForDate(
  isoDate: string,
  serviceDurationMinutes: number,
  availability: AvailabilityConfig,
  appointments: Appointment[],
  lawyerNameFilter?: string,
  now: Date = new Date()
): GeneratedTimeSlot[] {
  const dateCheck = isDateAvailable(isoDate, availability);
  if (!dateCheck.allowed) {
    return [];
  }

  const dayOfWeek = parseDateISO(isoDate).getDay();
  const daySchedule = getScheduleForDayOfWeek(dayOfWeek, availability);

  const workStart = timeToMinutes(daySchedule.startTime);
  const workEnd = timeToMinutes(daySchedule.endTime);
  const lunchStart = timeToMinutes(daySchedule.lunchStart);
  const lunchEnd = timeToMinutes(daySchedule.lunchEnd);

  const duration = Math.max(15, serviceDurationMinutes || 45);
  const step = duration;

  const todayISO = toDateISO(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const dayAppointments = appointments.filter((appt) => {
    if (appt.date !== isoDate || appt.status === 'cancelled') return false;
    if (lawyerNameFilter && appt.lawyerName) {
      return appt.lawyerName.toLowerCase() === lawyerNameFilter.toLowerCase();
    }
    return true;
  });

  const slots: GeneratedTimeSlot[] = [];

  let current = workStart;
  while (current + duration <= workEnd) {
    const slotStart = current;
    const slotEnd = current + duration;

    if (daySchedule.lunchEnabled && slotStart < lunchEnd && slotEnd > lunchStart) {
      current = lunchEnd > current ? lunchEnd : current + step;
      continue;
    }

    const conflictingAppt = dayAppointments.find((appt) => {
      const apptStart = timeToMinutes(appt.startTime);
      const apptEnd = getAppointmentEndMinutes(appt);
      return slotStart < apptEnd && slotEnd > apptStart;
    });

    const isPastSlot =
      isoDate < todayISO || (isoDate === todayISO && slotStart <= currentMinutes);

    slots.push({
      startTime: minutesToTime(slotStart),
      endTime: minutesToTime(slotEnd),
      available: !conflictingAppt && !isPastSlot,
      reason: conflictingAppt ? 'booked' : isPastSlot ? 'past' : undefined,
      bookedBy: conflictingAppt?.clientName,
      appointment: conflictingAppt,
    });

    current += step;
  }

  return slots;
}

export const WEEKDAYS_PT = [
  { dayIndex: 0, short: 'Dom', full: 'Domingo' },
  { dayIndex: 1, short: 'Seg', full: 'Segunda-feira' },
  { dayIndex: 2, short: 'Ter', full: 'Terça-feira' },
  { dayIndex: 3, short: 'Qua', full: 'Quarta-feira' },
  { dayIndex: 4, short: 'Qui', full: 'Quinta-feira' },
  { dayIndex: 5, short: 'Sex', full: 'Sexta-feira' },
  { dayIndex: 6, short: 'Sáb', full: 'Sábado' },
];

export function hasAppointmentDateTimePassed(
  appt: Pick<Appointment, 'date' | 'startTime' | 'endTime'> & {
    durationMinutes?: number;
  },
  now: Date = new Date()
): boolean {
  if (!appt.date || !/^\d{4}-\d{2}-\d{2}$/.test(appt.date)) {
    return false;
  }
  const todayISO = toDateISO(now);
  if (appt.date < todayISO) return true;
  if (appt.date > todayISO) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = getAppointmentEndMinutes(appt);
  return endMinutes <= currentMinutes;
}

export function isAppointmentCompletedOrPast(
  appt: Appointment,
  now: Date = new Date()
): boolean {
  if (appt.status === 'cancelled') return false;
  if (appt.status === 'completed') return true;
  return hasAppointmentDateTimePassed(appt, now);
}

export function isAppointmentUpcoming(
  appt: Appointment,
  now: Date = new Date()
): boolean {
  if (appt.status === 'cancelled' || appt.status === 'completed') return false;
  return !hasAppointmentDateTimePassed(appt, now);
}

export function normalizePastAppointments(
  appointments: Appointment[],
  now: Date = new Date()
): Appointment[] {
  let changed = false;
  const next = appointments.map((appt) => {
    if (
      (appt.status === 'confirmed' || appt.status === 'pending') &&
      hasAppointmentDateTimePassed(appt, now)
    ) {
      changed = true;
      return {
        ...appt,
        status: 'completed' as const,
        completedAt:
          appt.completedAt ||
          `${appt.date}T${appt.endTime || appt.startTime}:00`,
        completedNotes:
          appt.completedNotes ||
          (appt.entryType === 'commitment'
            ? 'Compromisso concluído conforme agenda.'
            : 'Atendimento jurídico realizado conforme horário agendado.'),
      };
    }
    return appt;
  });
  return changed ? next : appointments;
}

export function doesAppointmentBelongToUser(
  appt: Appointment,
  user: { id?: string; email: string; phone?: string; role?: string } | null
): boolean {
  if (!user) return false;
  if (user.role === 'master' || user.role === 'staff') {
    return true;
  }
  if (user.id && appt.createdByUserId === user.id) {
    return true;
  }
  const userEmail = (user.email || '').trim().toLowerCase();
  const apptEmail = (appt.clientEmail || '').trim().toLowerCase();
  if (userEmail && apptEmail && apptEmail === userEmail) return true;

  const userPhoneDigits = (user.phone || '').replace(/\D/g, '');
  const apptPhoneDigits = (appt.clientPhone || '').replace(/\D/g, '');
  if (userPhoneDigits.length >= 8 && apptPhoneDigits === userPhoneDigits) {
    return true;
  }
  return false;
}
