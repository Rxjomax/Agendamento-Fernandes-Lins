import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Calendar as CalendarIcon,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  History,
  LayoutGrid,
  List,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  Appointment,
  AppointmentStatus,
  AvailabilityConfig,
  UserSession,
} from '../types/scheduling';
import {
  formatDateLongBR,
  formatDateShortBR,
  formatFileSize,
  getScheduleForDayOfWeek,
  isAppointmentCompletedOrPast,
  isAppointmentUpcoming,
  parseDateISO,
  toDateISO,
} from '../utils/timeSlots';
import {
  buildClientWhatsAppReminderUrl,
  buildEmailVoucherContent,
  buildGoogleCalendarUrl,
  buildWhatsAppVoucherUrl,
  downloadAppointmentICS,
} from '../utils/notificationLinks';
import { FIRM_INFO } from '../data/seedData';

const COMMITMENT_CATEGORIES = [
  'Compromisso',
  'Audiência',
  'Prazo Processual',
  'Reunião Interna',
  'Diligência',
  'Pessoal',
] as const;

const COMMITMENT_DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h 30min' },
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
  { value: 240, label: '4 horas' },
];

interface ClientAgendaViewProps {
  appointments: Appointment[];
  availability: AvailabilityConfig;
  currentUser: UserSession | null;
  myBookedIds?: string[];
  focusedAppointment?: Appointment | null;
  onCancelAppointment: (id: string) => void;
  onUpdateStatus?: (id: string, status: AppointmentStatus) => void;
  onCreateCommitment?: (
    appt: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'endTime'>
  ) => void;
  onNewBooking: () => void;
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
}

type CalendarDisplayMode = 'month' | 'week' | 'list';

interface EventColorScheme {
  id: string;
  label: string;
  chipClass: string;
  dotClass: string;
  headerBgClass: string;
}

const EVENT_COLOR_PALETTES: EventColorScheme[] = [
  {
    id: 'royal-blue',
    label: 'Azul Royal',
    chipClass:
      'bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD] hover:bg-[#BFDBFE]',
    dotClass: 'bg-[#1D4ED8]',
    headerBgClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A]',
  },
  {
    id: 'amber-gold',
    label: 'Dourado Jurídico',
    chipClass:
      'bg-[#FEF3C7] text-[#78350F] border-[#FCD34D] hover:bg-[#FDE68A]',
    dotClass: 'bg-[#D97706]',
    headerBgClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]',
  },
  {
    id: 'indigo-navy',
    label: 'Índigo Marinho',
    chipClass:
      'bg-[#E0E7FF] text-[#1E1B4B] border-[#A5B4FC] hover:bg-[#C7D2FE]',
    dotClass: 'bg-[#4338CA]',
    headerBgClass: 'bg-[#EEF2FF] border-[#C7D2FE] text-[#1E1B4B]',
  },
  {
    id: 'teal-slate',
    label: 'Turquesa',
    chipClass:
      'bg-[#CCFBF1] text-[#134E4A] border-[#5EEAD4] hover:bg-[#99F6E4]',
    dotClass: 'bg-[#0F766E]',
    headerBgClass: 'bg-[#F0FDFA] border-[#99F6E4] text-[#134E4A]',
  },
  {
    id: 'sky-blue',
    label: 'Celeste',
    chipClass:
      'bg-[#E0F2FE] text-[#0C4A6E] border-[#7DD3FC] hover:bg-[#BAE6FD]',
    dotClass: 'bg-[#0284C7]',
    headerBgClass: 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0C4A6E]',
  },
  {
    id: 'rose-crimson',
    label: 'Carmim Editorial',
    chipClass:
      'bg-[#FFE4E6] text-[#881337] border-[#FDA4AF] hover:bg-[#FECDD3]',
    dotClass: 'bg-[#BE123C]',
    headerBgClass: 'bg-[#FFF1F2] border-[#FECDD3] text-[#881337]',
  },
];

const COMPLETED_SCHEME: EventColorScheme = {
  id: 'completed',
  label: 'Realizado',
  chipClass:
    'bg-[#DCFCE7] text-[#14532D] border-[#86EFAC] hover:bg-[#BBF7D0]',
  dotClass: 'bg-[#16A34A]',
  headerBgClass: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#14532D]',
};

const CANCELLED_SCHEME: EventColorScheme = {
  id: 'cancelled',
  label: 'Cancelado',
  chipClass:
    'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200 line-through',
  dotClass: 'bg-slate-400',
  headerBgClass: 'bg-slate-100 border-slate-300 text-slate-600',
};

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_HEADERS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function hashStringToIndex(str: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

function getAppointmentColorScheme(
  appt: Appointment,
  now: Date
): EventColorScheme {
  if (appt.status === 'cancelled') {
    return CANCELLED_SCHEME;
  }
  if (isAppointmentCompletedOrPast(appt, now)) {
    return COMPLETED_SCHEME;
  }
  const seedKey = `${appt.code || appt.id}-${appt.clientName}-${appt.descriptionMode}`;
  const idx = hashStringToIndex(seedKey, EVENT_COLOR_PALETTES.length);
  return EVENT_COLOR_PALETTES[idx];
}

function getMonthGridDates(year: number, monthIndex: number): Date[] {
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = firstDay.getDay(); // 0 = Domingo
  const gridStart = new Date(year, monthIndex, 1 - startOffset);

  const lastDay = new Date(year, monthIndex + 1, 0);
  const totalDaysNeeded = startOffset + lastDay.getDate();
  const totalCells = totalDaysNeeded <= 35 ? 35 : 42;

  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    cells.push(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i
      )
    );
  }
  return cells;
}

function getWeekDates(anchorISO: string): Date[] {
  const anchor = parseDateISO(anchorISO);
  const day = anchor.getDay();
  const sunday = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() - day
  );
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(
      new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i)
    );
  }
  return dates;
}

export const ClientAgendaView: React.FC<ClientAgendaViewProps> = ({
  appointments,
  availability,
  currentUser,
  myBookedIds,
  focusedAppointment,
  onCancelAppointment,
  onUpdateStatus,
  onCreateCommitment,
  onNewBooking,
  onOpenAuth,
  onOpenAdmin,
}) => {
  const now = new Date();
  const todayISO = toDateISO(now);

  const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => {
    if (focusedAppointment?.date) {
      const target = parseDateISO(focusedAppointment.date);
      return new Date(target.getFullYear(), target.getMonth(), 1);
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayISO, setSelectedDayISO] = useState<string>(
    () => focusedAppointment?.date || todayISO
  );
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedAppointment?.date) return;
    const target = parseDateISO(focusedAppointment.date);
    setSelectedDayISO(focusedAppointment.date);
    setCursorDate(new Date(target.getFullYear(), target.getMonth(), 1));
  }, [focusedAppointment?.id, focusedAppointment?.date]);

  const myBookedIdsSet = useMemo(
    () => new Set(myBookedIds || []),
    [myBookedIds]
  );

  const [lookupInput, setLookupInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'upcoming' | 'completed' | 'cancelled'
  >('all');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Modal de Novo Compromisso (sem precisar de cliente)
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [commitmentTitle, setCommitmentTitle] = useState('');
  const [commitmentCategory, setCommitmentCategory] = useState<string>('Compromisso');
  const [commitmentDate, setCommitmentDate] = useState<string>(todayISO);
  const [commitmentTime, setCommitmentTime] = useState<string>('10:00');
  const [commitmentDuration, setCommitmentDuration] = useState<number>(60);
  const [commitmentLocation, setCommitmentLocation] = useState('');
  const [commitmentNotes, setCommitmentNotes] = useState('');
  const [commitmentNotifyEmail, setCommitmentNotifyEmail] = useState(false);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  const isStaffOrMaster =
    currentUser?.role === 'master' || currentUser?.role === 'staff';
  const isMaster = currentUser?.role === 'master';

  const openCommitmentModal = (prefillDate?: string) => {
    setCommitmentTitle('');
    setCommitmentCategory('Compromisso');
    setCommitmentDate(prefillDate || selectedDayISO || todayISO);
    setCommitmentTime('10:00');
    setCommitmentDuration(60);
    setCommitmentLocation('');
    setCommitmentNotes('');
    setCommitmentNotifyEmail(false);
    setCommitmentError(null);
    setIsCommitmentModalOpen(true);
  };

  const handleCommitmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateCommitment) return;
    setCommitmentError(null);

    if (commitmentTitle.trim().length < 2) {
      setCommitmentError('Informe o título ou descrição do compromisso.');
      return;
    }
    if (!commitmentDate) {
      setCommitmentError('Escolha a data do compromisso.');
      return;
    }
    if (!commitmentTime) {
      setCommitmentError('Informe o horário de início.');
      return;
    }

    onCreateCommitment({
      serviceId: 'srv-atendimento-juridico',
      serviceName: commitmentCategory,
      lawyerName: 'Fernandes & Lins',
      entryType: 'commitment',
      commitmentCategory,
      location: commitmentLocation.trim() || undefined,
      notifyByEmail: commitmentNotifyEmail,
      durationMinutes: commitmentDuration,
      price: 0,
      date: commitmentDate,
      startTime: commitmentTime,
      clientName: commitmentTitle.trim(),
      clientPhone: '',
      clientCpf: '',
      clientAddress: '',
      clientEmail: '',
      descriptionMode: 'brief',
      briefSubject: commitmentNotes.trim() || commitmentCategory,
      documents: [],
      status: 'confirmed',
      createdByUserId: currentUser?.id,
      createdByRole: currentUser?.role,
    });

    const targetDateObj = parseDateISO(commitmentDate);
    setSelectedDayISO(commitmentDate);
    setCursorDate(new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), 1));
    setIsCommitmentModalOpen(false);
  };

  // Atendimentos visíveis conforme perfil:
  // Master/Funcionário vê tudo; visitante vê compromissos avulsos (sem dados de clientes) e resultados de busca
  const scopedAppointments = useMemo(() => {
    const query = lookupInput.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');

    return appointments
      .filter((appt) => {
        const isCommitment = appt.entryType === 'commitment';
        const isMyBooked = myBookedIdsSet.has(appt.id);
        if (!isStaffOrMaster && !query && !isCommitment && !isMyBooked) {
          return false;
        }

        if (query) {
          const matchName = appt.clientName.toLowerCase().includes(query);
          const matchCode = appt.code.toLowerCase().includes(query);
          const matchEmail = appt.clientEmail.toLowerCase().includes(query);
          const matchService = appt.serviceName.toLowerCase().includes(query);
          const matchCategory = (appt.commitmentCategory || '').toLowerCase().includes(query);
          const matchLocation = (appt.location || '').toLowerCase().includes(query);
          const matchAddress = (appt.clientAddress || '').toLowerCase().includes(query);
          const matchCase =
            (appt.caseDescription || '').toLowerCase().includes(query) ||
            (appt.briefSubject || '').toLowerCase().includes(query);
          const matchCpf =
            queryDigits.length >= 3 &&
            (appt.clientCpf || '').replace(/\D/g, '').includes(queryDigits);
          const matchPhone =
            queryDigits.length >= 4 &&
            appt.clientPhone.replace(/\D/g, '').includes(queryDigits);

          const matched =
            matchName ||
            matchCode ||
            matchEmail ||
            matchService ||
            matchCategory ||
            matchLocation ||
            matchAddress ||
            matchCase ||
            matchCpf ||
            matchPhone;

          if (!matched) return false;
        }

        const nowRef = new Date();
        if (statusFilter === 'upcoming') {
          return isAppointmentUpcoming(appt, nowRef);
        }
        if (statusFilter === 'completed') {
          return isAppointmentCompletedOrPast(appt, nowRef);
        }
        if (statusFilter === 'cancelled') {
          return appt.status === 'cancelled';
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });
  }, [appointments, isStaffOrMaster, lookupInput, myBookedIdsSet, statusFilter]);

  const stats = useMemo(() => {
    const nowRef = new Date();
    const base =
      isStaffOrMaster || lookupInput.trim()
        ? appointments
        : appointments.filter(
            (a) => a.entryType === 'commitment' || myBookedIdsSet.has(a.id)
          );
    const active = base.filter((a) => isAppointmentUpcoming(a, nowRef));
    const completed = base.filter((a) => isAppointmentCompletedOrPast(a, nowRef));
    const cancelled = base.filter((a) => a.status === 'cancelled');
    const sortedActive = [...active].sort((a, b) =>
      a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.startTime.localeCompare(b.startTime)
    );
    return {
      totalCount: base.length,
      activeCount: active.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      nextAppointment: sortedActive[0] || null,
    };
  }, [appointments, isStaffOrMaster, lookupInput, myBookedIdsSet]);

  // Agrupa agendamentos por data YYYY-MM-DD para renderização ultrarrápida no calendário
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    scopedAppointments.forEach((appt) => {
      if (!map[appt.date]) {
        map[appt.date] = [];
      }
      map[appt.date].push(appt);
    });
    return map;
  }, [scopedAppointments]);

  const monthGridDates = useMemo(
    () => getMonthGridDates(cursorDate.getFullYear(), cursorDate.getMonth()),
    [cursorDate]
  );

  const weekDates = useMemo(() => getWeekDates(selectedDayISO), [selectedDayISO]);

  const selectedDayAppointments = useMemo(
    () => appointmentsByDate[selectedDayISO] || [],
    [appointmentsByDate, selectedDayISO]
  );

  const selectedAppointment = useMemo(
    () => appointments.find((a) => a.id === selectedAppointmentId) || null,
    [appointments, selectedAppointmentId]
  );

  // Fecha modais com Escape
  useEffect(() => {
    if (!selectedAppointmentId && !isCommitmentModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAppointmentId(null);
        setConfirmCancelId(null);
        setIsCommitmentModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedAppointmentId, isCommitmentModalOpen]);

  const handleGoToday = () => {
    const freshNow = new Date();
    const freshToday = toDateISO(freshNow);
    setCursorDate(new Date(freshNow.getFullYear(), freshNow.getMonth(), 1));
    setSelectedDayISO(freshToday);
  };

  const handlePrevPeriod = () => {
    if (displayMode === 'week') {
      const curr = parseDateISO(selectedDayISO);
      const prev = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - 7);
      setSelectedDayISO(toDateISO(prev));
      setCursorDate(new Date(prev.getFullYear(), prev.getMonth(), 1));
    } else {
      setCursorDate(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      );
    }
  };

  const handleNextPeriod = () => {
    if (displayMode === 'week') {
      const curr = parseDateISO(selectedDayISO);
      const next = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + 7);
      setSelectedDayISO(toDateISO(next));
      setCursorDate(new Date(next.getFullYear(), next.getMonth(), 1));
    } else {
      setCursorDate(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      );
    }
  };

  const periodTitle = useMemo(() => {
    if (displayMode === 'week') {
      const first = weekDates[0];
      const last = weekDates[6];
      const sameMonth = first.getMonth() === last.getMonth();
      if (sameMonth) {
        return `${String(first.getDate()).padStart(2, '0')} – ${String(
          last.getDate()
        ).padStart(2, '0')} de ${MONTH_NAMES_PT[first.getMonth()]} ${first.getFullYear()}`;
      }
      return `${String(first.getDate()).padStart(2, '0')} ${MONTH_NAMES_PT[
        first.getMonth()
      ].slice(0, 3)} – ${String(last.getDate()).padStart(2, '0')} ${MONTH_NAMES_PT[
        last.getMonth()
      ].slice(0, 3)} ${last.getFullYear()}`;
    }
    return `${MONTH_NAMES_PT[cursorDate.getMonth()]} de ${cursorDate.getFullYear()}`;
  }, [displayMode, cursorDate, weekDates]);

  const getStatusText = (appt: Appointment): string => {
    if (appt.status === 'cancelled') return 'Cancelado';
    if (isAppointmentCompletedOrPast(appt, now)) return 'Realizado';
    if (appt.status === 'pending') return 'Pendente';
    return appt.date === todayISO ? 'Confirmado · Hoje' : 'Confirmado';
  };

  const renderAgendaListCard = (appt: Appointment) => {
    const scheme = getAppointmentColorScheme(appt, now);
    const isCancelled = appt.status === 'cancelled';
    const isCommitment = appt.entryType === 'commitment';
    const caseSummaryText =
      appt.descriptionMode === 'complete'
        ? appt.caseDescription
        : appt.briefSubject;

    return (
      <article
        key={appt.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-[#1D4ED8]/60 transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-semibold ${scheme.chipClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${scheme.dotClass}`} />
                <span className="font-mono-tabular">
                  {appt.startTime} – {appt.endTime}
                </span>
              </span>
              <span className="font-mono-tabular font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FACC15] px-2 py-0.5 rounded-md">
                {appt.code}
              </span>
              {isCommitment && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B2545] bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md">
                  <Bookmark className="w-3 h-3 text-[#1D4ED8]" />
                  {appt.commitmentCategory || 'Compromisso'}
                </span>
              )}
              <span className="font-semibold text-[#134074]">
                {getStatusText(appt)}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600 capitalize">
                {formatDateShortBR(appt.date)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedAppointmentId(appt.id)}
              className="text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-lg"
            >
              <h3
                className={`text-base sm:text-lg font-bold group-hover:text-[#1D4ED8] group-hover:underline ${
                  isCancelled ? 'text-slate-500 line-through' : 'text-[#0B2545]'
                }`}
              >
                {appt.clientName}
              </h3>
            </button>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {isCommitment ? (
                <>
                  <span>Compromisso sem cliente vinculado</span>
                  {appt.location && (
                    <span className="inline-flex items-center gap-1 text-[#0B2545] font-medium">
                      <MapPin className="w-3.5 h-3.5 text-[#1D4ED8]" />
                      {appt.location}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-mono-tabular">
                    CPF: {appt.clientCpf || 'Não informado'}
                  </span>
                  <span className="font-mono-tabular">{appt.clientPhone}</span>
                  {appt.documents && appt.documents.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#1D4ED8] font-semibold">
                      <Paperclip className="w-3.5 h-3.5" />
                      {appt.documents.length} PDF(s)
                    </span>
                  )}
                </>
              )}
            </div>

            {caseSummaryText && (!isCommitment || caseSummaryText !== (appt.commitmentCategory || appt.serviceName)) && (
              <p className="text-xs text-slate-700 leading-relaxed line-clamp-2 max-w-[68ch]">
                <strong className="text-[#0B2545]">
                  {isCommitment
                    ? 'Observações: '
                    : appt.descriptionMode === 'complete'
                    ? 'Relato Completo: '
                    : 'Assunto Breve: '}
                </strong>
                {caseSummaryText}
              </p>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedAppointmentId(appt.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-[#FACC15] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              {isCommitment ? 'Ver Compromisso' : 'Abrir Ficha Completa'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7">
      {/* Cabeçalho Compacto & Objetivo */}
      <section className="fl-navy-banner rounded-2xl p-5 sm:p-7 text-white mb-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#FACC15]">
            {FIRM_INFO.name}
          </span>
          <h1 className="font-editorial text-2xl sm:text-4xl font-semibold tracking-tight mt-0.5">
            Pauta Geral &amp; Calendário
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-[64ch]">
            Agenda compartilhada para atendimentos com clientes e compromissos internos (audiências, prazos, reuniões ou tarefas pessoais). Clique sobre qualquer item para ver os detalhes completos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!currentUser && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 text-[#FACC15]" />
              <span>Entrar (Master / Secretaria)</span>
            </button>
          )}
          {onCreateCommitment && (
            <button
              type="button"
              onClick={() => openCommitmentModal(selectedDayISO)}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <CalendarPlus className="w-4 h-4 text-[#FACC15]" />
              <span>Novo Compromisso</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-xl bg-[#FACC15] text-[#0B2545] hover:bg-[#EAB308] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Agendar na Recepção</span>
          </button>
        </div>
      </section>

      {/* Barra de Controle Estilo Google Agenda */}
      <section
        aria-label="Controles do calendário"
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 mb-4 space-y-3"
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Navegação Temporal: Hoje + Setas + Mês/Ano */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleGoToday}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-blue-50 text-xs font-bold text-[#0B2545] transition-colors cursor-pointer"
            >
              Hoje
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevPeriod}
                aria-label="Período anterior"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-[#0B2545] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextPeriod}
                aria-label="Próximo período"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-[#0B2545] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#0B2545] capitalize ml-1">
              {periodTitle}
            </h2>
          </div>

          {/* Busca + Filtro de Status + Seletor Mês / Semana / Lista */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Buscar cliente, CPF ou FL-..."
                className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-xl border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | 'upcoming' | 'completed' | 'cancelled'
                )
              }
              aria-label="Filtrar por status"
              className="min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-base sm:text-xs font-semibold text-[#0B2545] focus:border-[#1D4ED8] focus:outline-none cursor-pointer"
            >
              <option value="all">Todos ({stats.totalCount})</option>
              <option value="upcoming">Ativos ({stats.activeCount})</option>
              <option value="completed">Realizados ({stats.completedCount})</option>
              <option value="cancelled">Cancelados ({stats.cancelledCount})</option>
            </select>

            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
              {[
                { id: 'month' as const, label: 'Mês', icon: CalendarIcon },
                { id: 'week' as const, label: 'Semana', icon: LayoutGrid },
                { id: 'list' as const, label: 'Lista', icon: List },
              ].map((modeOption) => {
                const Icon = modeOption.icon;
                const active = displayMode === modeOption.id;
                return (
                  <button
                    key={modeOption.id}
                    type="button"
                    onClick={() => setDisplayMode(modeOption.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#0B2545] text-[#FACC15]'
                        : 'text-slate-600 hover:text-[#0B2545]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{modeOption.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Barra de Legenda Discreta + Resumo Numérico */}
        <div className="pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#0B2545]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] -ml-1" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E] -ml-1" />
              Atendimentos coloridos por cliente
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
              Realizado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              Cancelado
            </span>
            <span className="inline-flex items-center gap-1 text-[#134074]">
              <Paperclip className="w-3.5 h-3.5" />
              Indica PDFs anexados
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono-tabular text-xs">
            <span>
              <strong className="text-[#0B2545]">{stats.activeCount}</strong> ativo(s)
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <strong className="text-[#0B2545]">{stats.completedCount}</strong> realizado(s)
            </span>
            {stats.nextAppointment && (
              <>
                <span className="text-slate-300 hidden sm:inline">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAppointmentId(stats.nextAppointment!.id)
                  }
                  className="text-[#1D4ED8] hover:underline font-sans font-semibold cursor-pointer"
                >
                  Próximo: {formatDateShortBR(stats.nextAppointment.date)} às{' '}
                  {stats.nextAppointment.startTime} (
                  {stats.nextAppointment.clientName.split(' ')[0]})
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Aviso de Acesso para Visitante sem Login e sem Busca */}
      {!isStaffOrMaster && !lookupInput.trim() && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 sm:p-5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B2545] text-[#FACC15] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B2545]">
                Entre como Master ou Funcionário para visualizar os clientes no calendário
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 max-w-[66ch]">
                Por sigilo profissional (LGPD), os nomes e fichas completas aparecem no calendário após entrar com uma conta da equipe — ou ao pesquisar pelo CPF ou código de protocolo acima.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-[#FACC15] text-xs font-bold transition-colors shrink-0 cursor-pointer"
          >
            Entrar Agora
          </button>
        </div>
      )}

      {/* VISÃO 1: CALENDÁRIO GIGANTE MENSAL (ESTILO GOOGLE AGENDA) */}
      {displayMode === 'month' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Cabeçalho dos 7 dias da semana */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAY_HEADERS_PT.map((dayLabel, idx) => (
                <div
                  key={dayLabel}
                  className={`py-2.5 sm:py-3 px-1 sm:px-3 text-center text-[11px] sm:text-xs font-bold uppercase tracking-wider border-r last:border-r-0 border-slate-200 ${
                    idx === 0 ? 'text-slate-400' : 'text-[#0B2545]'
                  }`}
                >
                  {dayLabel}
                </div>
              ))}
            </div>

            {/* Células do Mês */}
            <div className="grid grid-cols-7">
              {monthGridDates.map((dateObj, idx) => {
                const iso = toDateISO(dateObj);
                const isCurrentMonth =
                  dateObj.getMonth() === cursorDate.getMonth();
                const isToday = iso === todayISO;
                const isSelected = iso === selectedDayISO;
                const dayOfWeek = dateObj.getDay();
                const isWorkDay = availability.workDays.includes(dayOfWeek);
                const blockedEntry = availability.blockedDates.find(
                  (b) => b.date === iso
                );
                const dayAppts = appointmentsByDate[iso] || [];
                const visibleDesktopAppts = dayAppts.slice(0, 4);
                const extraCount = dayAppts.length - visibleDesktopAppts.length;

                return (
                  <div
                    key={iso}
                    onClick={() => setSelectedDayISO(iso)}
                    className={`min-h-[76px] sm:min-h-[148px] p-1.5 sm:p-2 border-b border-r border-slate-200 transition-colors cursor-pointer flex flex-col justify-between ${
                      (idx + 1) % 7 === 0 ? 'border-r-0' : ''
                    } ${
                      isSelected
                        ? 'bg-[#EFF6FF]/65 ring-2 ring-inset ring-[#1D4ED8]'
                        : !isCurrentMonth
                        ? 'bg-slate-50/75'
                        : !isWorkDay || blockedEntry
                        ? 'bg-slate-50/50'
                        : 'bg-white hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Topo da Célula: Número do Dia + Status de Expediente */}
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-mono-tabular font-bold ${
                            isToday
                              ? 'bg-[#0B2545] text-[#FACC15]'
                              : isCurrentMonth
                              ? 'text-[#0B2545]'
                              : 'text-slate-400'
                          }`}
                        >
                          {dateObj.getDate()}
                        </span>

                        {blockedEntry ? (
                          <span className="hidden md:inline text-[10px] font-semibold text-red-600 truncate max-w-[90px]">
                            {blockedEntry.reason || 'Recesso'}
                          </span>
                        ) : !isWorkDay ? (
                          <span className="hidden md:inline text-[10px] font-medium text-slate-400">
                            Fechada
                          </span>
                        ) : dayAppts.length > 0 ? (
                          <span className="hidden md:inline text-[10px] font-mono-tabular font-semibold text-slate-400">
                            {dayAppts.length}
                          </span>
                        ) : null}
                      </div>

                      {/* Desktop/Tablet: Eventos Coloridos Clicáveis */}
                      <div className="hidden sm:flex flex-col gap-1">
                        {visibleDesktopAppts.map((appt) => {
                          const scheme = getAppointmentColorScheme(appt, now);
                          const docsCount = appt.documents?.length || 0;
                          return (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDayISO(iso);
                                setSelectedAppointmentId(appt.id);
                              }}
                              title={`${appt.startTime}–${appt.endTime} · ${appt.clientName} (Clique para abrir ficha completa)`}
                              className={`w-full text-left px-2 py-1 rounded-md border text-[11px] leading-tight transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2545] ${scheme.chipClass}`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${scheme.dotClass}`}
                              />
                              <span className="font-mono-tabular font-bold shrink-0">
                                {appt.startTime}
                              </span>
                              <span className="font-semibold truncate flex-1">
                                {appt.clientName}
                              </span>
                              {docsCount > 0 && (
                                <Paperclip className="w-3 h-3 shrink-0 opacity-80" />
                              )}
                            </button>
                          );
                        })}

                        {extraCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDayISO(iso);
                            }}
                            className="w-full text-left px-2 py-0.5 rounded text-[11px] font-bold text-[#1D4ED8] hover:bg-blue-50 cursor-pointer"
                          >
                            +{extraCount} mais neste dia
                          </button>
                        )}
                      </div>

                      {/* Mobile: Bolinhas coloridas compactas + contagem legível */}
                      <div className="flex sm:hidden flex-wrap items-center gap-1 mt-1">
                        {dayAppts.slice(0, 4).map((appt) => {
                          const scheme = getAppointmentColorScheme(appt, now);
                          return (
                            <span
                              key={appt.id}
                              className={`w-2 h-2 rounded-full ${scheme.dotClass}`}
                            />
                          );
                        })}
                        {dayAppts.length > 4 && (
                          <span className="text-[10px] font-mono-tabular font-bold text-[#0B2545]">
                            +{dayAppts.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel de Detalhes do Dia Selecionado (essencial no Mobile e útil no Desktop para ver todos do dia) */}
          <section
            aria-label="Atendimentos do dia selecionado"
            className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                  Dia Selecionado na Pauta
                </p>
                <h3 className="font-editorial text-xl sm:text-2xl font-bold text-[#0B2545] capitalize mt-0.5">
                  {formatDateLongBR(selectedDayISO)}
                </h3>
                {(() => {
                  const selDateObj = parseDateISO(selectedDayISO);
                  const dow = selDateObj.getDay();
                  const open = availability.workDays.includes(dow);
                  const blocked = availability.blockedDates.find(
                    (b) => b.date === selectedDayISO
                  );
                  if (blocked) {
                    return (
                      <p className="text-xs text-red-600 font-medium mt-0.5">
                        Sem expediente · {blocked.reason}
                      </p>
                    );
                  }
                  if (!open) {
                    return (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Escritório fechado neste dia da semana
                      </p>
                    );
                  }
                  const sched = getScheduleForDayOfWeek(dow, availability);
                  return (
                    <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                      Expediente: {sched.startTime} às {sched.endTime}
                      {sched.lunchEnabled
                        ? ` (intervalo ${sched.lunchStart}–${sched.lunchEnd})`
                        : ' (horário contínuo)'}
                    </p>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {onCreateCommitment && (
                  <button
                    type="button"
                    onClick={() => openCommitmentModal(selectedDayISO)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-300 text-[#0B2545] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <CalendarPlus className="w-4 h-4 text-[#1D4ED8]" />
                    <span>+ Compromisso</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNewBooking}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Agendamento</span>
                </button>
              </div>
            </div>

            {selectedDayAppointments.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-[#0B2545]">
                  Nenhum registro em {formatDateShortBR(selectedDayISO)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isStaffOrMaster
                    ? 'Agendamentos com clientes e compromissos internos aparecerão aqui com suas fichas.'
                    : 'Você pode adicionar um compromisso diretamente neste dia ou entrar como equipe para ver atendimentos de clientes.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-4">
                {selectedDayAppointments.map((appt) => {
                  const scheme = getAppointmentColorScheme(appt, now);
                  const isCommitment = appt.entryType === 'commitment';
                  const docsCount = appt.documents?.length || 0;
                  const casePreview =
                    appt.descriptionMode === 'complete'
                      ? appt.caseDescription
                      : appt.briefSubject;

                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={() => setSelectedAppointmentId(appt.id)}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2545] ${scheme.chipClass}`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs font-bold">
                          <span className={`w-2.5 h-2.5 rounded-full ${scheme.dotClass}`} />
                          {appt.startTime} – {appt.endTime}
                        </span>
                        <span className="font-mono-tabular text-[11px] font-bold opacity-85">
                          {appt.code}
                        </span>
                      </div>

                      <div>
                        <p className="text-sm font-bold leading-snug">
                          {appt.clientName}
                        </p>
                        {isCommitment ? (
                          <p className="text-xs opacity-85 mt-0.5 truncate">
                            {appt.commitmentCategory || 'Compromisso'}
                            {appt.location ? ` · ${appt.location}` : ''}
                          </p>
                        ) : (
                          <p className="text-xs opacity-85 mt-0.5 font-mono-tabular">
                            CPF: {appt.clientCpf || '—'} · {appt.clientPhone}
                          </p>
                        )}
                        {casePreview && (!isCommitment || casePreview !== (appt.commitmentCategory || appt.serviceName)) && (
                          <p className="text-xs opacity-90 mt-1.5 line-clamp-2">
                            {casePreview}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-current/15 text-[11px] font-semibold w-full">
                        <span>{getStatusText(appt)}</span>
                        <span className="inline-flex items-center gap-1">
                          {docsCount > 0 && (
                            <>
                              <Paperclip className="w-3 h-3" />
                              {docsCount} PDF ·
                            </>
                          )}
                          {isCommitment ? 'Ver detalhes →' : 'Abrir ficha →'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* VISÃO 2: SEMANA (7 COLUNAS ESTILO GOOGLE AGENDA) */}
      {displayMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {weekDates.map((dateObj) => {
              const iso = toDateISO(dateObj);
              const isToday = iso === todayISO;
              const dow = dateObj.getDay();
              const isWorkDay = availability.workDays.includes(dow);
              const blocked = availability.blockedDates.find(
                (b) => b.date === iso
              );
              const dayAppts = appointmentsByDate[iso] || [];

              return (
                <div
                  key={iso}
                  className={`min-h-[160px] md:min-h-[480px] flex flex-col ${
                    !isWorkDay || blocked ? 'bg-slate-50/70' : 'bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDayISO(iso)}
                    className={`p-3 border-b border-slate-200 text-left flex md:flex-col items-center md:items-start justify-between gap-1 cursor-pointer ${
                      isToday ? 'bg-[#0B2545] text-white' : 'bg-slate-50 text-[#0B2545]'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isToday ? 'text-[#FACC15]' : 'text-slate-500'
                      }`}
                    >
                      {WEEKDAY_HEADERS_PT[dow]}
                    </span>
                    <span className="font-mono-tabular text-lg font-bold">
                      {String(dateObj.getDate()).padStart(2, '0')}/
                      {String(dateObj.getMonth() + 1).padStart(2, '0')}
                    </span>
                  </button>

                  <div className="p-2.5 space-y-2 flex-1">
                    {blocked ? (
                      <p className="text-[11px] text-red-600 font-medium p-2">
                        Recesso: {blocked.reason}
                      </p>
                    ) : !isWorkDay ? (
                      <p className="text-[11px] text-slate-400 p-2">
                        Sem expediente
                      </p>
                    ) : dayAppts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 p-2">
                        Sem registros
                      </p>
                    ) : (
                      dayAppts.map((appt) => {
                        const scheme = getAppointmentColorScheme(appt, now);
                        const docsCount = appt.documents?.length || 0;
                        return (
                          <button
                            key={appt.id}
                            type="button"
                            onClick={() => setSelectedAppointmentId(appt.id)}
                            className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors cursor-pointer space-y-1 ${scheme.chipClass}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono-tabular font-bold inline-flex items-center gap-1">
                                <span
                                  className={`w-2 h-2 rounded-full ${scheme.dotClass}`}
                                />
                                {appt.startTime}
                              </span>
                              {docsCount > 0 && (
                                <Paperclip className="w-3 h-3 shrink-0" />
                              )}
                            </div>
                            <p className="font-bold leading-snug">
                              {appt.clientName}
                            </p>
                            <p className="text-[11px] opacity-80 truncate">
                              {appt.descriptionMode === 'complete'
                                ? 'Relato Completo'
                                : appt.briefSubject || 'Assunto breve'}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VISÃO 3: LISTA CRONOLÓGICA */}
      {displayMode === 'list' && (
        <div className="space-y-4">
          {scopedAppointments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center mx-auto mb-3">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="font-editorial text-xl font-semibold text-[#0B2545]">
                Nenhum registro encontrado nesta visualização
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-5">
                Ajuste o filtro, adicione um compromisso avulso ou registre um novo atendimento pela Recepção.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {onCreateCommitment && (
                  <button
                    type="button"
                    onClick={() => openCommitmentModal(selectedDayISO)}
                    className="inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-blue-50 text-[#0B2545] text-xs font-bold transition-colors cursor-pointer"
                  >
                    <CalendarPlus className="w-4 h-4 text-[#1D4ED8]" />
                    Novo Compromisso
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNewBooking}
                  className="inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl bg-[#FACC15] text-[#0B2545] hover:bg-[#EAB308] text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Agendar na Recepção
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {scopedAppointments.map(renderAgendaListCard)}
            </div>
          )}
        </div>
      )}

      {/* MODAL: FICHA COMPLETA DO CLIENTE (AO CLICAR NO NOME NO CALENDÁRIO) */}
      {selectedAppointment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-dossier-title"
          className="fixed inset-0 z-50 bg-[#0B2545]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setSelectedAppointmentId(null);
            setConfirmCancelId(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-3xl max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Cabeçalho da Ficha */}
            <div className="fl-navy-banner text-white px-5 py-4 sm:px-6 sm:py-5 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs mb-1.5">
                  <span className="font-mono-tabular font-bold bg-[#FACC15] text-[#0B2545] px-2.5 py-0.5 rounded-md">
                    {selectedAppointment.code}
                  </span>
                  <span className="font-semibold text-slate-200">
                    {getStatusText(selectedAppointment)}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-200">
                    {selectedAppointment.serviceName}
                  </span>
                </div>
                <h2
                  id="client-dossier-title"
                  className="font-editorial text-2xl sm:text-3xl font-bold text-white leading-tight truncate"
                >
                  {selectedAppointment.clientName}
                </h2>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="capitalize">
                    {formatDateLongBR(selectedAppointment.date)}
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#FACC15]">
                    {selectedAppointment.startTime} às{' '}
                    {selectedAppointment.endTime} ({selectedAppointment.durationMinutes}{' '}
                    min)
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedAppointmentId(null);
                  setConfirmCancelId(null);
                }}
                aria-label="Fechar ficha do cliente"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo Rolável com Todas as Informações do Cliente */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Bloco 1: Dados Pessoais ou Detalhes do Compromisso */}
              {selectedAppointment.entryType === 'commitment' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545] mb-3 flex items-center gap-1.5">
                    <Bookmark className="w-4 h-4 text-[#1D4ED8]" />
                    Detalhes do Compromisso
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Categoria
                      </span>
                      <span className="font-bold text-[#0B2545]">
                        {selectedAppointment.commitmentCategory ||
                          selectedAppointment.serviceName}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Tipo de Registro
                      </span>
                      <span className="font-medium text-[#0B2545]">
                        Compromisso na agenda (sem cliente)
                      </span>
                    </div>

                    {selectedAppointment.location && (
                      <div className="sm:col-span-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                          Local / Link
                        </span>
                        <span className="font-medium text-[#0B2545] inline-flex items-start gap-1.5 mt-0.5">
                          <MapPin className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                          <span>{selectedAppointment.location}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545] mb-3 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#1D4ED8]" />
                    Dados Cadastrais do Cliente
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Nome Completo
                      </span>
                      <span className="font-bold text-[#0B2545]">
                        {selectedAppointment.clientName}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        CPF
                      </span>
                      <span className="font-mono-tabular font-semibold text-[#0B2545]">
                        {selectedAppointment.clientCpf || 'Não informado'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Telefone / WhatsApp
                      </span>
                      <span className="font-mono-tabular font-semibold text-[#0B2545] inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        {selectedAppointment.clientPhone}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        E-mail
                      </span>
                      <span className="font-medium text-[#0B2545] break-all">
                        {selectedAppointment.clientEmail || 'Não informado'}
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Endereço Residencial / Comercial
                      </span>
                      <span className="font-medium text-[#0B2545] inline-flex items-start gap-1.5 mt-0.5">
                        <MapPin className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                        <span>
                          {selectedAppointment.clientAddress || 'Não informado'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco 2: Descrição do Caso / Observações */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545] flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-[#1D4ED8]" />
                    {selectedAppointment.entryType === 'commitment'
                      ? 'Observações do Compromisso'
                      : selectedAppointment.descriptionMode === 'complete'
                      ? 'Descrição Completa do Caso'
                      : 'Descrição Breve / Assunto'}
                  </h3>
                  {selectedAppointment.entryType !== 'commitment' && (
                    <span className="text-xs font-semibold text-[#134074]">
                      Modalidade:{' '}
                      {selectedAppointment.descriptionMode === 'complete'
                        ? 'Completa + Documentação'
                        : 'Breve'}
                    </span>
                  )}
                </div>

                {selectedAppointment.caseDescription ||
                selectedAppointment.briefSubject ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-[#0F172A] leading-relaxed whitespace-pre-line">
                    {selectedAppointment.descriptionMode === 'complete'
                      ? selectedAppointment.caseDescription ||
                        selectedAppointment.briefSubject
                      : selectedAppointment.briefSubject ||
                        selectedAppointment.caseDescription}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nenhuma observação registrada.
                  </p>
                )}

                {selectedAppointment.notes && (
                  <div className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <strong className="text-[#0B2545]">Observações: </strong>
                    {selectedAppointment.notes}
                  </div>
                )}

                {selectedAppointment.completedNotes && (
                  <div className="text-xs text-slate-700 bg-green-50 border border-green-200 rounded-xl p-3">
                    <strong className="text-[#14532D]">
                      Parecer / Conclusão:{' '}
                    </strong>
                    {selectedAppointment.completedNotes}
                  </div>
                )}
              </div>

              {/* Bloco 3: Documentação Anexada (PDFs) */}
              {(selectedAppointment.entryType !== 'commitment' ||
                (selectedAppointment.documents &&
                  selectedAppointment.documents.length > 0)) && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545] mb-3 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#1D4ED8]" />
                    Documentação em PDF (
                    {selectedAppointment.documents?.length || 0})
                  </h3>

                  {selectedAppointment.documents &&
                  selectedAppointment.documents.length > 0 ? (
                    <div className="space-y-2">
                      {selectedAppointment.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-[#DBEAFE] text-[#1E3A8A] flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#0B2545] truncate">
                                {doc.name}
                              </p>
                              <p className="text-[11px] font-mono-tabular text-slate-500">
                                {formatFileSize(doc.size)}
                              </p>
                            </div>
                          </div>

                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={doc.name}
                            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-[#FACC15] text-xs font-bold transition-colors shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Abrir / Baixar PDF</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Nenhum arquivo PDF anexado neste atendimento.
                    </p>
                  )}
                </div>
              )}

              {/* Bloco 4: Metadados Internos & Registro */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Registrado por:{' '}
                  <strong className="text-[#0B2545]">
                    {selectedAppointment.createdByRole === 'master'
                      ? 'Master'
                      : selectedAppointment.createdByRole === 'staff'
                      ? 'Funcionário / Secretaria'
                      : 'Recepção'}
                  </strong>{' '}
                  em{' '}
                  {new Date(selectedAppointment.createdAt).toLocaleString(
                    'pt-BR',
                    {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )}
                </span>
              </div>
            </div>

            {/* Rodapé de Ações do Modal */}
            <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const clientReminderUrl =
                    buildClientWhatsAppReminderUrl(selectedAppointment);
                  if (!clientReminderUrl) return null;
                  return (
                    <a
                      href={clientReminderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#16A34A] hover:bg-[#15803D] text-white transition-colors"
                      title={`Abrir WhatsApp do cliente (${selectedAppointment.clientPhone}) com lembrete pronto`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Enviar Lembrete ao Cliente</span>
                    </a>
                  );
                })()}

                <a
                  href={buildWhatsAppVoucherUrl(selectedAppointment)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B2545] text-[#FACC15] hover:bg-[#134074] transition-colors"
                  title="Enviar comprovante no WhatsApp do escritório"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Escritório</span>
                </a>

                <a
                  href={buildEmailVoucherContent(selectedAppointment).mailtoUrl}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-[#0B2545] border border-slate-300 hover:bg-blue-50 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>E-mail</span>
                </a>

                <a
                  href={buildGoogleCalendarUrl(selectedAppointment)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-[#0B2545] border border-slate-300 hover:bg-blue-50 transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>Google Agenda</span>
                </a>

                <button
                  type="button"
                  onClick={() => downloadAppointmentICS(selectedAppointment)}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-[#0B2545] border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.ics</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isStaffOrMaster && onUpdateStatus && (
                  <>
                    {selectedAppointment.status !== 'completed' &&
                      selectedAppointment.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateStatus(selectedAppointment.id, 'completed')
                          }
                          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#16A34A] hover:bg-[#15803D] text-white transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Concluir</span>
                        </button>
                      )}

                    {selectedAppointment.status === 'cancelled' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStatus(selectedAppointment.id, 'confirmed')
                        }
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1D4ED8] hover:bg-[#1E40AF] text-white transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reativar</span>
                      </button>
                    )}
                  </>
                )}

                {selectedAppointment.status !== 'cancelled' &&
                  (confirmCancelId === selectedAppointment.id ? (
                    <div className="flex items-center gap-2 bg-red-50 px-3 min-h-[44px] rounded-xl border border-red-200">
                      <button
                        type="button"
                        onClick={() => {
                          onCancelAppointment(selectedAppointment.id);
                          setConfirmCancelId(null);
                        }}
                        className="text-xs font-bold text-red-700 hover:underline cursor-pointer"
                      >
                        Confirmar cancelamento
                      </button>
                      <span className="text-red-300">|</span>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="text-xs text-slate-600 hover:text-[#0B2545] cursor-pointer"
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmCancelId(selectedAppointment.id)
                      }
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </button>
                  ))}

                {isMaster && onOpenAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAppointmentId(null);
                      onOpenAdmin();
                    }}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Gerenciar no Master</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR COMPROMISSO NA AGENDA (SEM CLIENTE) */}
      {isCommitmentModalOpen && onCreateCommitment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-commitment-title"
          className="fixed inset-0 z-50 bg-[#0B2545]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsCommitmentModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="fl-navy-banner text-white px-5 py-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#FACC15]">
                  Agenda Livre · Sem Cliente
                </span>
                <h2
                  id="new-commitment-title"
                  className="font-editorial text-xl sm:text-2xl font-bold text-white leading-tight"
                >
                  Novo Compromisso na Agenda
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCommitmentModalOpen(false)}
                aria-label="Fechar modal de compromisso"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCommitmentSubmit}
              className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1"
            >
              {commitmentError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{commitmentError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="agenda-commitment-title"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Título do Compromisso *
                </label>
                <input
                  id="agenda-commitment-title"
                  type="text"
                  required
                  value={commitmentTitle}
                  onChange={(e) => setCommitmentTitle(e.target.value)}
                  placeholder="Ex: Audiência na 3ª Vara / Prazo de Contestação / Reunião Interna"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <span className="block text-xs font-bold text-[#0B2545] mb-1.5">
                  Categoria
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMITMENT_CATEGORIES.map((cat) => {
                    const active = commitmentCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCommitmentCategory(cat)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#0B2545] text-[#FACC15] border-[#0B2545]'
                            : 'bg-slate-50 text-[#0B2545] border-slate-300 hover:bg-blue-50'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="agenda-commitment-date"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Data *
                  </label>
                  <input
                    id="agenda-commitment-date"
                    type="date"
                    required
                    value={commitmentDate}
                    onChange={(e) => setCommitmentDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-base sm:text-xs font-mono-tabular text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="agenda-commitment-time"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Início *
                  </label>
                  <input
                    id="agenda-commitment-time"
                    type="time"
                    required
                    value={commitmentTime}
                    onChange={(e) => setCommitmentTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-base sm:text-xs font-mono-tabular text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="agenda-commitment-duration"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Duração
                  </label>
                  <select
                    id="agenda-commitment-duration"
                    value={commitmentDuration}
                    onChange={(e) => setCommitmentDuration(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-base sm:text-xs font-semibold text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
                  >
                    {COMMITMENT_DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="agenda-commitment-location"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Local ou Link (opcional)
                </label>
                <input
                  id="agenda-commitment-location"
                  type="text"
                  value={commitmentLocation}
                  onChange={(e) => setCommitmentLocation(e.target.value)}
                  placeholder="Ex: Fórum Rodolfo Aureliano, Google Meet ou Escritório"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-base sm:text-sm text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label
                  htmlFor="agenda-commitment-notes"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Observações (opcional)
                </label>
                <textarea
                  id="agenda-commitment-notes"
                  rows={3}
                  value={commitmentNotes}
                  onChange={(e) => setCommitmentNotes(e.target.value)}
                  placeholder="Detalhes, número de processo, pauta ou lembretes..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-[#0B2545] bg-white focus:outline-none focus:border-[#1D4ED8] leading-relaxed"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={commitmentNotifyEmail}
                  onChange={(e) => setCommitmentNotifyEmail(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0B2545] focus:ring-[#1D4ED8]"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong className="text-[#0B2545] block">
                    Enviar aviso deste compromisso por e-mail
                  </strong>
                  O horário já bloqueia automaticamente conflitos na recepção, mesmo sem enviar e-mail.
                </span>
              </label>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCommitmentModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Clock className="w-4 h-4" />
                  <span>Salvar Compromisso</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
