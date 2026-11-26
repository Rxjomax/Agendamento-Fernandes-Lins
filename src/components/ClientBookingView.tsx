import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Calendar as CalendarIcon,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  LogIn,
  MapPin,
  MessageCircle,
  Moon,
  Paperclip,
  ShieldCheck,
  Sun,
  Sunset,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { uploadPdfDocumentFile } from '../utils/pdfUpload';
import { buildClientWhatsAppReminderUrl } from '../utils/notificationLinks';
import {
  Appointment,
  AppointmentDocument,
  AvailabilityConfig,
  DescriptionMode,
  EntryType,
  ServiceItem,
  UserSession,
} from '../types/scheduling';
import {
  GeneratedTimeSlot,
  WEEKDAYS_PT,
  calculateEndTime,
  formatCPF,
  formatDateLongBR,
  formatDateShortBR,
  formatFileSize,
  formatPhoneBR,
  generateTimeSlotsForDate,
  isDateAvailable,
  isValidCPF,
  timeToMinutes,
  toDateISO,
} from '../utils/timeSlots';
import { FIRM_INFO } from '../data/seedData';
import { BrandMark } from './BrandMark';

const MONTHS_PT = [
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

const BRIEF_TOPIC_PRESETS = [
  'Consulta inicial de triagem',
  'Entrega de documentação / procuração',
  'Acompanhamento de processo',
  'Assinatura de contrato / acordo',
];

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

function getCalendarGridDays(year: number, month: number): (Date | null)[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = firstDayOfMonth.getDay();

  const days: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

interface ClientBookingViewProps {
  services: ServiceItem[];
  availability: AvailabilityConfig;
  appointments: Appointment[];
  currentUser: UserSession | null;
  onOpenAuth: () => void;
  onOpenMyAgenda: () => void;
  onCompleteBooking: (
    appointment: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'status'>
  ) => void;
}

export const ClientBookingView: React.FC<ClientBookingViewProps> = ({
  services,
  availability,
  appointments,
  currentUser,
  onOpenAuth,
  onOpenMyAgenda,
  onCompleteBooking,
}) => {
  const activeServices = useMemo(
    () => services.filter((s) => s.status === 'active'),
    [services]
  );

  // Agenda única compartilhada por Fernandes & Lins (sem divisão por advogado)
  const defaultService = useMemo<ServiceItem>(
    () =>
      activeServices[0] || {
        id: 'srv-atendimento-juridico',
        name: 'Atendimento Jurídico',
        description:
          'Consulta presencial e triagem documental com acesso compartilhado entre Fernandes & Lins.',
        durationMinutes: 45,
        price: 0,
        status: 'active',
        category: 'Fernandes & Lins',
        specialist: 'Fernandes & Lins',
      },
    [activeServices]
  );

  const initialAvailableDate = useMemo(() => {
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let firstAllowedISO: string | null = null;
    for (let i = 0; i < 45; i++) {
      const iso = toDateISO(cursor);
      if (isDateAvailable(iso, availability).allowed) {
        if (!firstAllowedISO) firstAllowedISO = iso;
        const hasOpenSlot = generateTimeSlotsForDate(
          iso,
          defaultService.durationMinutes,
          availability,
          appointments
        ).some((s) => s.available);
        if (hasOpenSlot) {
          return iso;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return firstAllowedISO || toDateISO(new Date());
  }, [availability, defaultService.durationMinutes, appointments]);

  const [selectedDateISO, setSelectedDateISO] =
    useState<string>(initialAvailableDate);
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const [y, m] = initialAvailableDate.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Modo de registro: Atendimento com Cliente ou Compromisso avulso na agenda
  const [entryType, setEntryType] = useState<EntryType>('client');
  const [commitmentTitle, setCommitmentTitle] = useState('');
  const [commitmentCategory, setCommitmentCategory] = useState<string>('Compromisso');
  const [commitmentDuration, setCommitmentDuration] = useState<number>(60);
  const [commitmentCustomTime, setCommitmentCustomTime] = useState<string>('');
  const [commitmentLocation, setCommitmentLocation] = useState('');
  const [commitmentNotes, setCommitmentNotes] = useState('');
  const [commitmentNotifyEmail, setCommitmentNotifyEmail] = useState(false);

  // Campos de triagem preenchidos pela secretaria na recepção
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCpf, setClientCpf] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  // Opções dinâmicas de preenchimento: Descrição Completa (+ PDFs) vs Descrição Breve
  const [descriptionMode, setDescriptionMode] =
    useState<DescriptionMode>('complete');
  const [caseDescription, setCaseDescription] = useState('');
  const [briefSubject, setBriefSubject] = useState('');
  const [documents, setDocuments] = useState<AppointmentDocument[]>([]);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inspectedAppointment, setInspectedAppointment] =
    useState<Appointment | null>(null);

  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(new Date());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const todayISO = useMemo(() => toDateISO(nowTick), [nowTick]);
  const isCommitmentMode = entryType === 'commitment';
  const effectiveSelectedTime = isCommitmentMode
    ? commitmentCustomTime || selectedTime
    : selectedTime;
  const effectiveDurationMinutes = isCommitmentMode
    ? commitmentDuration
    : defaultService.durationMinutes;

  useEffect(() => {
    if (isCommitmentMode) return;
    if (!selectedDateISO || selectedDateISO < todayISO || !isDateAvailable(selectedDateISO, availability).allowed) {
      setSelectedDateISO(initialAvailableDate);
      setSelectedTime('');
    }
  }, [availability, isCommitmentMode, selectedDateISO, todayISO, initialAvailableDate]);

  const timeSlots = useMemo<GeneratedTimeSlot[]>(() => {
    if (!selectedDateISO) return [];
    return generateTimeSlotsForDate(
      selectedDateISO,
      defaultService.durationMinutes,
      availability,
      appointments,
      undefined,
      nowTick
    );
  }, [selectedDateISO, defaultService.durationMinutes, availability, appointments, nowTick]);

  const availableSlotsCount = useMemo(
    () => timeSlots.filter((s) => s.available && s.startTime).length,
    [timeSlots]
  );

  const groupedSlots = useMemo(() => {
    const morning: GeneratedTimeSlot[] = [];
    const afternoon: GeneratedTimeSlot[] = [];
    const evening: GeneratedTimeSlot[] = [];
    timeSlots.forEach((slot) => {
      if (!slot.startTime) return;
      const mins = timeToMinutes(slot.startTime);
      if (mins < 12 * 60) morning.push(slot);
      else if (mins < 18 * 60) afternoon.push(slot);
      else evening.push(slot);
    });
    return { morning, afternoon, evening };
  }, [timeSlots]);

  const scheduleSummaryText = useMemo(() => {
    const weekdayHours = availability.lunchEnabled
      ? `Seg a Sex: ${availability.startTime}–${availability.lunchStart} e ${availability.lunchEnd}–${availability.endTime}`
      : `Seg a Sex: ${availability.startTime}–${availability.endTime}`;
    const hasSat = availability.workDays.includes(6);
    const satOverride = availability.dayOverrides?.[6];
    const satText = hasSat
      ? `Sáb: ${satOverride?.startTime || availability.startTime}–${
          satOverride?.endTime || availability.endTime
        }`
      : 'Sáb: Fechado';
    const domText = availability.workDays.includes(0) ? 'Dom: Aberto' : 'Dom: Fechado';
    return `${weekdayHours} · ${satText} · ${domText}`;
  }, [availability]);

  const dayBookings = useMemo(() => {
    return appointments
      .filter((a) => a.date === selectedDateISO && a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [appointments, selectedDateISO]);

  const calendarDays = useMemo(
    () =>
      getCalendarGridDays(
        currentMonthDate.getFullYear(),
        currentMonthDate.getMonth()
      ),
    [currentMonthDate]
  );

  const handleSelectDate = (dateObj: Date) => {
    const iso = toDateISO(dateObj);
    if (iso < todayISO) return;
    if (!isCommitmentMode && !isDateAvailable(iso, availability).allowed) return;
    setSelectedDateISO(iso);
    setSelectedTime('');
    setErrors((p) => ({ ...p, time: '' }));
  };

  const handlePdfFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setPdfUploadError(null);
    setIsUploadingPdf(true);
    const uploaded: AppointmentDocument[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const doc = await uploadPdfDocumentFile(file);
        uploaded.push(doc);
      }
      setDocuments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setPdfUploadError(
        err instanceof Error ? err.message : 'Erro ao anexar documento PDF.'
      );
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleSwitchDescriptionMode = (nextMode: DescriptionMode) => {
    setDescriptionMode(nextMode);
    setErrors((prev) => ({
      ...prev,
      caseDescription: '',
      briefSubject: '',
    }));
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (isCommitmentMode) {
      if (!effectiveSelectedTime) {
        newErrors.time =
          'Escolha um horário na agenda ao lado ou informe o horário de início.';
      }
      if (!commitmentTitle.trim() || commitmentTitle.trim().length < 2) {
        newErrors.commitmentTitle =
          'Informe o título ou assunto do compromisso.';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        const firstTargetId = newErrors.time
          ? 'rec-commitment-time'
          : 'rec-commitment-title';
        requestAnimationFrame(() => {
          const el = document.getElementById(firstTargetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              el.focus({ preventScroll: true });
            }
          }
        });
        return;
      }

      if (!selectedDateISO || !effectiveSelectedTime) return;

      const endTime = calculateEndTime(
        effectiveSelectedTime,
        commitmentDuration
      );

      onCompleteBooking({
        serviceId: defaultService.id,
        serviceName: commitmentCategory,
        lawyerName: 'Fernandes & Lins',
        entryType: 'commitment',
        commitmentCategory,
        location: commitmentLocation.trim() || undefined,
        notifyByEmail: commitmentNotifyEmail,
        price: 0,
        durationMinutes: commitmentDuration,
        date: selectedDateISO,
        startTime: effectiveSelectedTime,
        endTime,
        clientName: commitmentTitle.trim(),
        clientPhone: '',
        clientCpf: '',
        clientAddress: '',
        clientEmail: '',
        descriptionMode: 'brief',
        briefSubject: commitmentNotes.trim() || commitmentCategory,
        documents: [],
        createdByUserId: currentUser?.id,
        createdByRole: currentUser?.role,
      });

      setSelectedTime('');
      setCommitmentCustomTime('');
      setCommitmentTitle('');
      setCommitmentLocation('');
      setCommitmentNotes('');
      setCommitmentNotifyEmail(false);
      setErrors({});
      return;
    }

    if (!selectedTime) {
      newErrors.time = 'Selecione um horário livre na agenda ao lado.';
    }
    if (!clientName.trim() || clientName.trim().length < 3) {
      newErrors.name = 'Informe o nome completo do cliente.';
    }
    const phoneDigits = clientPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      newErrors.phone = 'Informe um número de telefone/WhatsApp válido com DDD.';
    }
    if (!isValidCPF(clientCpf)) {
      newErrors.cpf = 'Informe um CPF válido com 11 dígitos.';
    }
    if (!clientAddress.trim() || clientAddress.trim().length < 5) {
      newErrors.address = 'Informe o endereço completo do cliente.';
    }

    if (descriptionMode === 'complete') {
      if (!caseDescription.trim() || caseDescription.trim().length < 3) {
        newErrors.caseDescription =
          'Descreva os detalhes do caso antes de confirmar.';
      }
    } else {
      if (!briefSubject.trim() || briefSubject.trim().length < 2) {
        newErrors.briefSubject =
          'Informe o assunto ou descrição breve do atendimento.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstTargetId = newErrors.time
        ? 'rec-time-section'
        : newErrors.name
        ? 'rec-client-name'
        : newErrors.phone
        ? 'rec-client-phone'
        : newErrors.cpf
        ? 'rec-client-cpf'
        : newErrors.address
        ? 'rec-client-address'
        : newErrors.caseDescription
        ? 'rec-case-description'
        : 'rec-brief-subject';

      requestAnimationFrame(() => {
        const el = document.getElementById(firstTargetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.focus({ preventScroll: true });
          }
        }
      });
      return;
    }

    if (!selectedDateISO || !selectedTime) return;

    const endTime = calculateEndTime(
      selectedTime,
      defaultService.durationMinutes
    );

    onCompleteBooking({
      serviceId: defaultService.id,
      serviceName: defaultService.name,
      lawyerName: 'Fernandes & Lins',
      entryType: 'client',
      price: defaultService.price,
      durationMinutes: defaultService.durationMinutes,
      date: selectedDateISO,
      startTime: selectedTime,
      endTime,
      clientName: clientName.trim(),
      clientPhone: formatPhoneBR(clientPhone.trim()),
      clientCpf: formatCPF(clientCpf.trim()),
      clientAddress: clientAddress.trim(),
      clientEmail: clientEmail.trim().toLowerCase(),
      descriptionMode,
      caseDescription:
        descriptionMode === 'complete' ? caseDescription.trim() : undefined,
      briefSubject:
        descriptionMode === 'brief' ? briefSubject.trim() : undefined,
      documents: descriptionMode === 'complete' ? documents : [],
      createdByUserId: currentUser?.id,
      createdByRole: currentUser?.role,
    });

    // Limpa os campos para o próximo atendimento na recepção
    setSelectedTime('');
    setClientName('');
    setClientPhone('');
    setClientCpf('');
    setClientAddress('');
    setClientEmail('');
    setCaseDescription('');
    setBriefSubject('');
    setDocuments([]);
    setErrors({});
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Banner Institucional Azul Marinho + Destaque Amarelo Ouro */}
      <section className="fl-navy-banner rounded-2xl p-6 sm:p-8 text-white mb-6 border border-[#1E3A8A]">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5 max-w-[74ch]">
            <BrandMark size="xl" variant="gold" className="mt-0.5" />
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#FACC15] mb-1.5">
                <span className="uppercase">{FIRM_INFO.name}</span> · {FIRM_INFO.tagline}
              </p>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-white leading-[1.1] text-balance">
                Agenda Compartilhada &amp; Recepção
              </h1>
              <p className="text-sm sm:text-base text-slate-200 mt-2.5 leading-relaxed">
                Consulte as datas e horários disponíveis para Fernandes &amp; Lins, preencha os dados cadastrais do cliente e anexe os documentos do caso em PDF.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#FACC15]" />
                  {FIRM_INFO.address}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 font-mono-tabular">
                  <Clock className="w-3.5 h-3.5 text-[#FACC15]" />
                  {scheduleSummaryText}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenMyAgenda}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <CalendarCheck className="w-4 h-4 text-[#FACC15]" />
              <span>Ver Pauta Completa</span>
            </button>

            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              {currentUser ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {currentUser.role === 'master' ? 'Master' : 'Secretaria'}:{' '}
                    {currentUser.name.split(' ')[0]}
                  </span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Acessar Master / Funcionário</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Grid Principal: Esquerda (Datas Disponíveis & Horários) + Direita (Ficha de Cadastro do Cliente) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA (5 Colunas): Calendário, Horários e Pauta do Dia */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Datas e Horários Disponíveis */}
          <div id="rec-time-section" className="fl-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-[#0B2545]">
                  1. Datas e Horários Disponíveis
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 capitalize">
                  {formatDateLongBR(selectedDateISO)}
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FDE047] px-2.5 py-1 rounded-md">
                {availableSlotsCount === 0
                  ? 'Sem vagas'
                  : availableSlotsCount === 1
                  ? '1 livre'
                  : `${availableSlotsCount} livres`}
              </span>
            </div>

            {/* Calendário */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-[#0B2545]">
                  {MONTHS_PT[currentMonthDate.getMonth()]}{' '}
                  <span className="font-mono-tabular text-[#1D4ED8]">
                    {currentMonthDate.getFullYear()}
                  </span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Mês anterior"
                    onClick={() =>
                      setCurrentMonthDate(
                        new Date(
                          currentMonthDate.getFullYear(),
                          currentMonthDate.getMonth() - 1,
                          1
                        )
                      )
                    }
                    className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#134074] flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Próximo mês"
                    onClick={() =>
                      setCurrentMonthDate(
                        new Date(
                          currentMonthDate.getFullYear(),
                          currentMonthDate.getMonth() + 1,
                          1
                        )
                      )
                    }
                    className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#134074] flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                {WEEKDAYS_PT.map((w) => (
                  <div
                    key={w.dayIndex}
                    className="text-[11px] font-semibold text-slate-500 py-1"
                  >
                    {w.short}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((dayObj, idx) => {
                  if (!dayObj) return <div key={`empty-${idx}`} className="h-10" />;
                  const iso = toDateISO(dayObj);
                  const isSelected = iso === selectedDateISO;
                  const isPast = iso < todayISO;
                  const availCheck = isDateAvailable(iso, availability);
                  const canSelect = !isPast && (isCommitmentMode || availCheck.allowed);
                  const isToday = iso === todayISO;
                  const dayCount = appointments.filter(
                    (a) => a.date === iso && a.status !== 'cancelled'
                  ).length;

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!canSelect}
                      onClick={() => handleSelectDate(dayObj)}
                      title={
                        isCommitmentMode && !availCheck.allowed
                          ? `Selecionar ${formatDateShortBR(iso)} (compromisso fora do expediente)`
                          : availCheck.reason || `Selecionar ${formatDateShortBR(iso)}`
                      }
                      className={`h-10 rounded-lg font-mono-tabular text-xs font-semibold flex flex-col items-center justify-center relative transition-colors ${
                        isSelected
                          ? 'bg-[#0B2545] text-white cursor-pointer'
                          : canSelect
                          ? 'bg-white text-slate-800 border border-slate-200 hover:border-[#134074] hover:bg-blue-50 cursor-pointer'
                          : 'text-slate-300 bg-transparent cursor-not-allowed'
                      }`}
                    >
                      <span>{dayObj.getDate()}</span>
                      {dayCount > 0 && canSelect && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                            isSelected ? 'bg-[#FACC15]' : 'bg-[#1D4ED8]'
                          }`}
                        />
                      )}
                      {isToday && dayCount === 0 && !isSelected && (
                        <span className="w-1 h-1 rounded-full bg-[#F59E0B] absolute bottom-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grade de Horários */}
            {timeSlots.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 text-center">
                <CalendarIcon className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-700">
                  Sem expediente nesta data
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isCommitmentMode
                    ? 'Para compromissos fora do expediente, informe o horário de início diretamente no formulário ao lado.'
                    : 'Escolha um dia útil no calendário acima.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedSlots.morning.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                      <Sun className="w-3.5 h-3.5 text-[#D97706]" />
                      <span>Manhã</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {groupedSlots.morning.map((slot) => {
                        const isChosen = effectiveSelectedTime === slot.startTime;
                        const isPast = slot.reason === 'past';
                        return (
                          <button
                            key={slot.startTime}
                            type="button"
                            disabled={!slot.available && !slot.appointment}
                            onClick={() => {
                              if (slot.available) {
                                setSelectedTime(slot.startTime);
                                if (isCommitmentMode) {
                                  setCommitmentCustomTime(slot.startTime);
                                }
                                setErrors((p) => ({ ...p, time: '' }));
                              } else if (slot.appointment) {
                                setInspectedAppointment(slot.appointment);
                              }
                            }}
                            title={
                              slot.available
                                ? `Reservar ${slot.startTime} às ${slot.endTime}`
                                : slot.appointment
                                ? `Ocupado: ${slot.bookedBy} (clique para ver)`
                                : 'Horário já encerrado'
                            }
                            className={`min-h-[44px] py-2 px-2 rounded-lg font-mono-tabular text-xs font-semibold border transition-colors ${
                              isChosen
                                ? 'bg-[#FACC15] border-[#CA8A04] text-[#0B2545] font-bold cursor-pointer'
                                : slot.available
                                ? 'bg-white border-slate-200 text-[#0B2545] hover:border-[#134074] hover:bg-blue-50 cursor-pointer'
                                : isPast
                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-400 cursor-pointer'
                            }`}
                          >
                            {slot.startTime}
                            {!slot.available && (
                              <span className="block text-[9px] font-sans font-normal truncate">
                                {isPast ? 'Passou' : 'Ocupado'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {groupedSlots.afternoon.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                      <Sunset className="w-3.5 h-3.5 text-[#134074]" />
                      <span>Tarde</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {groupedSlots.afternoon.map((slot) => {
                        const isChosen = effectiveSelectedTime === slot.startTime;
                        const isPast = slot.reason === 'past';
                        return (
                          <button
                            key={slot.startTime}
                            type="button"
                            disabled={!slot.available && !slot.appointment}
                            onClick={() => {
                              if (slot.available) {
                                setSelectedTime(slot.startTime);
                                if (isCommitmentMode) {
                                  setCommitmentCustomTime(slot.startTime);
                                }
                                setErrors((p) => ({ ...p, time: '' }));
                              } else if (slot.appointment) {
                                setInspectedAppointment(slot.appointment);
                              }
                            }}
                            title={
                              slot.available
                                ? `Reservar ${slot.startTime} às ${slot.endTime}`
                                : slot.appointment
                                ? `Ocupado: ${slot.bookedBy} (clique para ver)`
                                : 'Horário já encerrado'
                            }
                            className={`min-h-[44px] py-2 px-2 rounded-lg font-mono-tabular text-xs font-semibold border transition-colors ${
                              isChosen
                                ? 'bg-[#FACC15] border-[#CA8A04] text-[#0B2545] font-bold cursor-pointer'
                                : slot.available
                                ? 'bg-white border-slate-200 text-[#0B2545] hover:border-[#134074] hover:bg-blue-50 cursor-pointer'
                                : isPast
                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-400 cursor-pointer'
                            }`}
                          >
                            {slot.startTime}
                            {!slot.available && (
                              <span className="block text-[9px] font-sans font-normal truncate">
                                {isPast ? 'Passou' : 'Ocupado'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {groupedSlots.evening.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                      <Moon className="w-3.5 h-3.5 text-[#0B2545]" />
                      <span>Noite</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {groupedSlots.evening.map((slot) => {
                        const isChosen = effectiveSelectedTime === slot.startTime;
                        const isPast = slot.reason === 'past';
                        return (
                          <button
                            key={slot.startTime}
                            type="button"
                            disabled={!slot.available && !slot.appointment}
                            onClick={() => {
                              if (slot.available) {
                                setSelectedTime(slot.startTime);
                                if (isCommitmentMode) {
                                  setCommitmentCustomTime(slot.startTime);
                                }
                                setErrors((p) => ({ ...p, time: '' }));
                              } else if (slot.appointment) {
                                setInspectedAppointment(slot.appointment);
                              }
                            }}
                            title={
                              slot.available
                                ? `Reservar ${slot.startTime} às ${slot.endTime}`
                                : slot.appointment
                                ? `Ocupado: ${slot.bookedBy} (clique para ver)`
                                : 'Horário já encerrado'
                            }
                            className={`min-h-[44px] py-2 px-2 rounded-lg font-mono-tabular text-xs font-semibold border transition-colors ${
                              isChosen
                                ? 'bg-[#FACC15] border-[#CA8A04] text-[#0B2545] font-bold cursor-pointer'
                                : slot.available
                                ? 'bg-white border-slate-200 text-[#0B2545] hover:border-[#134074] hover:bg-blue-50 cursor-pointer'
                                : isPast
                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-400 cursor-pointer'
                            }`}
                          >
                            {slot.startTime}
                            {!slot.available && (
                              <span className="block text-[9px] font-sans font-normal truncate">
                                {isPast ? 'Passou' : 'Ocupado'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {errors.time && (
              <p className="mt-3 text-xs text-red-700 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.time}
              </p>
            )}
          </div>

          {/* 3. Pauta do Dia Selecionado (Agendamentos já marcados) */}
          <div className="fl-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-[#0B2545]">
                Pauta de {formatDateShortBR(selectedDateISO)}
              </h2>
              <span className="font-mono-tabular text-xs text-slate-600">
                {dayBookings.length} atendimento(s)
              </span>
            </div>

            {dayBookings.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                Nenhum atendimento agendado para esta data até o momento.
              </p>
            ) : (
              <div className="space-y-2">
                {dayBookings.map((appt) => (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={() => setInspectedAppointment(appt)}
                    className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-[#134074] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0B2545] truncate">
                        <span className="font-mono-tabular text-[#1D4ED8] mr-2">
                          {appt.startTime}
                        </span>
                        {appt.clientName}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {appt.entryType === 'commitment'
                          ? `${appt.commitmentCategory || 'Compromisso'}${
                              appt.location ? ` · ${appt.location}` : ''
                            }`
                          : `${
                              appt.descriptionMode === 'complete'
                                ? 'Descrição completa'
                                : appt.briefSubject || 'Descrição breve'
                            }${
                              appt.documents && appt.documents.length > 0
                                ? ` · ${appt.documents.length} PDF(s)`
                                : ''
                            }`}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#134074] shrink-0">
                      Abrir →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (7 Colunas): Ficha de Atendimento na Recepção */}
        <div className="lg:col-span-7">
          <form
            onSubmit={validateAndSubmit}
            noValidate
            className="fl-card rounded-2xl p-5 sm:p-7 space-y-6"
          >
            {/* Seletor de Tipo: Atendimento com Cliente vs Compromisso na Agenda */}
            <div
              role="tablist"
              aria-label="Tipo de registro na agenda"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isCommitmentMode}
                onClick={() => {
                  setEntryType('client');
                  setErrors({});
                }}
                className={`min-h-[48px] px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                  !isCommitmentMode
                    ? 'bg-[#0B2545] text-[#FACC15]'
                    : 'text-slate-600 hover:text-[#0B2545] hover:bg-white/70'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Atendimento com Cliente</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={isCommitmentMode}
                onClick={() => {
                  setEntryType('commitment');
                  if (selectedTime && !commitmentCustomTime) {
                    setCommitmentCustomTime(selectedTime);
                  }
                  setErrors({});
                }}
                className={`min-h-[48px] px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                  isCommitmentMode
                    ? 'bg-[#0B2545] text-[#FACC15]'
                    : 'text-slate-600 hover:text-[#0B2545] hover:bg-white/70'
                }`}
              >
                <Bookmark className="w-4 h-4 shrink-0" />
                <span>Compromisso na Agenda</span>
              </button>
            </div>

            {/* Cabeçalho da Ficha + Resumo do Horário Escolhido */}
            <div className="pb-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-editorial text-2xl font-bold text-[#0B2545]">
                  {isCommitmentMode
                    ? '2. Novo Compromisso (Sem Cliente)'
                    : '2. Ficha do Cliente & Registro do Caso'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  {isCommitmentMode
                    ? 'Adicione audiências, prazos, reuniões internas ou tarefas pessoais diretamente na pauta.'
                    : 'Preencha os dados do cliente que compareceu ou solicitou agendamento.'}
                </p>
              </div>

              <div className="bg-[#0B2545] text-white rounded-xl px-4 py-2.5 text-xs shrink-0">
                <p className="text-[#FACC15] font-semibold">
                  {isCommitmentMode
                    ? `Compromisso · ${commitmentCategory}`
                    : 'Agenda · Fernandes & Lins'}
                </p>
                <p className="font-mono-tabular mt-0.5 text-slate-200">
                  {formatDateShortBR(selectedDateISO)} ·{' '}
                  {effectiveSelectedTime
                    ? `${effectiveSelectedTime} às ${calculateEndTime(
                        effectiveSelectedTime,
                        effectiveDurationMinutes
                      )}`
                    : 'Escolha ou informe o horário'}
                </p>
              </div>
            </div>

            {isCommitmentMode ? (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="rec-commitment-title"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Título do Compromisso *
                  </label>
                  <input
                    id="rec-commitment-title"
                    type="text"
                    value={commitmentTitle}
                    onChange={(e) => {
                      setCommitmentTitle(e.target.value);
                      if (errors.commitmentTitle) {
                        setErrors((p) => ({ ...p, commitmentTitle: '' }));
                      }
                    }}
                    placeholder="Ex: Audiência na 2ª Vara, Prazo de Recurso, Reunião de Sócios, Compromisso Pessoal"
                    className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                      errors.commitmentTitle ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {errors.commitmentTitle && (
                    <p className="mt-1 text-xs text-red-700">
                      {errors.commitmentTitle}
                    </p>
                  )}
                </div>

                <div>
                  <span className="block text-xs font-bold text-[#0B2545] mb-1.5">
                    Categoria do Compromisso
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="rec-commitment-time"
                      className="block text-xs font-bold text-[#0B2545] mb-1.5"
                    >
                      Horário de início *
                    </label>
                    <input
                      id="rec-commitment-time"
                      type="time"
                      value={commitmentCustomTime || selectedTime}
                      onChange={(e) => {
                        setCommitmentCustomTime(e.target.value);
                        if (errors.time) setErrors((p) => ({ ...p, time: '' }));
                      }}
                      className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm font-mono-tabular bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                        errors.time ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Clique em um horário à esquerda ou digite qualquer horário livremente.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="rec-commitment-duration"
                      className="block text-xs font-bold text-[#0B2545] mb-1.5"
                    >
                      Duração prevista
                    </label>
                    <select
                      id="rec-commitment-duration"
                      value={commitmentDuration}
                      onChange={(e) => setCommitmentDuration(Number(e.target.value))}
                      className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-semibold text-[#0B2545] bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] cursor-pointer"
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
                    htmlFor="rec-commitment-location"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Local ou Link (opcional)
                  </label>
                  <input
                    id="rec-commitment-location"
                    type="text"
                    value={commitmentLocation}
                    onChange={(e) => setCommitmentLocation(e.target.value)}
                    placeholder="Ex: Fórum, Escritório, Google Meet ou endereço externo"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rec-commitment-notes"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    Observações / Pauta (opcional)
                  </label>
                  <textarea
                    id="rec-commitment-notes"
                    rows={3}
                    value={commitmentNotes}
                    onChange={(e) => setCommitmentNotes(e.target.value)}
                    placeholder="Detalhes relevantes, número de processo ou lembretes deste compromisso..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] leading-relaxed"
                  />
                </div>

                <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commitmentNotifyEmail}
                    onChange={(e) => setCommitmentNotifyEmail(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0B2545] focus:ring-[#1D4ED8]"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <strong className="text-[#0B2545] block">
                      Enviar aviso deste compromisso por e-mail (Resend)
                    </strong>
                    Mesmo sem marcar esta opção, o horário será bloqueado automaticamente na agenda para evitar novos agendamentos no mesmo período.
                  </span>
                </label>
              </div>
            ) : (
              <>
            {/* Dados Pessoais: Nome, Número, CPF, Endereço, E-mail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="rec-client-name"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Nome completo do cliente *
                </label>
                <input
                  id="rec-client-name"
                  type="text"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                  }}
                  placeholder="Ex: João Carlos Albuquerque"
                  className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                    errors.name ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-700">{errors.name}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rec-client-phone"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Número / WhatsApp *
                </label>
                <input
                  id="rec-client-phone"
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => {
                    setClientPhone(formatPhoneBR(e.target.value));
                    if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
                  }}
                  placeholder="(81) 99999-0000"
                  className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm font-mono-tabular bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                    errors.phone ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-700">{errors.phone}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rec-client-cpf"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  CPF *
                </label>
                <input
                  id="rec-client-cpf"
                  type="text"
                  inputMode="numeric"
                  value={clientCpf}
                  onChange={(e) => {
                    setClientCpf(formatCPF(e.target.value));
                    if (errors.cpf) setErrors((p) => ({ ...p, cpf: '' }));
                  }}
                  placeholder="000.000.000-00"
                  className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm font-mono-tabular bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                    errors.cpf ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.cpf && (
                  <p className="mt-1 text-xs text-red-700">{errors.cpf}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="rec-client-address"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  Endereço completo *
                </label>
                <input
                  id="rec-client-address"
                  type="text"
                  value={clientAddress}
                  onChange={(e) => {
                    setClientAddress(e.target.value);
                    if (errors.address) setErrors((p) => ({ ...p, address: '' }));
                  }}
                  placeholder="Rua, número, complemento, bairro e cidade"
                  className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                    errors.address ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.address && (
                  <p className="mt-1 text-xs text-red-700">{errors.address}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="rec-client-email"
                  className="block text-xs font-bold text-[#0B2545] mb-1.5"
                >
                  E-mail para envio do comprovante (opcional)
                </label>
                <input
                  id="rec-client-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="cliente@email.com.br"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074]"
                />
              </div>
            </div>

            {/* SELETOR DINÂMICO: 2 BOTÕES QUE ADAPTAM O FORMULÁRIO NA HORA */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div>
                <p className="text-xs font-bold text-[#0B2545] mb-1">
                  Modo de preenchimento do atendimento *
                </p>
                <p className="text-xs text-slate-600 mb-3">
                  Escolha abaixo se deseja registrar o caso completo com anexos em PDF ou apenas o assunto breve.
                </p>

                <div
                  role="tablist"
                  aria-label="Tipo de descrição do caso"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={descriptionMode === 'complete'}
                    onClick={() => handleSwitchDescriptionMode('complete')}
                    className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                      descriptionMode === 'complete'
                        ? 'bg-[#0B2545] border-[#0B2545] text-white'
                        : 'bg-slate-50 border-slate-300 text-[#0B2545] hover:bg-blue-50/70'
                    }`}
                  >
                    <FolderOpen
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        descriptionMode === 'complete'
                          ? 'text-[#FACC15]'
                          : 'text-[#134074]'
                      }`}
                    />
                    <div>
                      <span className="text-sm font-bold block leading-tight">
                        Descrição Completa
                      </span>
                      <span
                        className={`text-xs block mt-0.5 ${
                          descriptionMode === 'complete'
                            ? 'text-slate-200'
                            : 'text-slate-600'
                        }`}
                      >
                        Relato detalhado do caso + envio de PDFs
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={descriptionMode === 'brief'}
                    onClick={() => handleSwitchDescriptionMode('brief')}
                    className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                      descriptionMode === 'brief'
                        ? 'bg-[#0B2545] border-[#0B2545] text-white'
                        : 'bg-slate-50 border-slate-300 text-[#0B2545] hover:bg-blue-50/70'
                    }`}
                  >
                    <FileText
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        descriptionMode === 'brief'
                          ? 'text-[#FACC15]'
                          : 'text-[#134074]'
                      }`}
                    />
                    <div>
                      <span className="text-sm font-bold block leading-tight">
                        Descrição Breve
                      </span>
                      <span
                        className={`text-xs block mt-0.5 ${
                          descriptionMode === 'brief'
                            ? 'text-slate-200'
                            : 'text-slate-600'
                        }`}
                      >
                        Somente o assunto / resumo rápido
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* OPÇÃO A: DESCRIÇÃO COMPLETA + DROPZONE DE PDF */}
              {descriptionMode === 'complete' && (
                <div className="space-y-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 sm:p-5">
                  <div>
                    <label
                      htmlFor="rec-case-description"
                      className="block text-xs font-bold text-[#0B2545] mb-1.5"
                    >
                      Descrição completa do caso *
                    </label>
                    <textarea
                      id="rec-case-description"
                      rows={5}
                      value={caseDescription}
                      onChange={(e) => {
                        setCaseDescription(e.target.value);
                        if (errors.caseDescription) {
                          setErrors((p) => ({ ...p, caseDescription: '' }));
                        }
                      }}
                      placeholder="Relate aqui os fatos principais narrados pelo cliente, partes contrárias, número de processo (se houver), datas importantes e urgências..."
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] leading-relaxed ${
                        errors.caseDescription
                          ? 'border-red-500'
                          : 'border-slate-300'
                      }`}
                    />
                    {errors.caseDescription && (
                      <p className="mt-1 text-xs text-red-700">
                        {errors.caseDescription}
                      </p>
                    )}
                  </div>

                  {/* Upload / Dropzone de PDFs */}
                  <div>
                    <label className="block text-xs font-bold text-[#0B2545] mb-1.5">
                      Documentação em PDF (RG/CPF, contratos, intimações, comprovantes)
                    </label>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingPdf(true);
                      }}
                      onDragLeave={() => setIsDraggingPdf(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingPdf(false);
                        void handlePdfFiles(e.dataTransfer.files);
                      }}
                      onClick={() => pdfInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          pdfInputRef.current?.click();
                        }
                      }}
                      className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
                        isDraggingPdf
                          ? 'border-[#0B2545] bg-[#FEF9C3]/40'
                          : 'border-slate-300 bg-white hover:border-[#134074] hover:bg-blue-50/40'
                      }`}
                    >
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        onChange={(e) => void handlePdfFiles(e.target.files)}
                        className="hidden"
                      />
                      <Upload className="w-6 h-6 text-[#134074] mx-auto mb-2" />
                      <p className="text-sm font-bold text-[#0B2545]">
                        {isUploadingPdf
                          ? 'Enviando PDF(s) para o prontuário...'
                          : 'Clique ou arraste os arquivos PDF aqui'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Apenas arquivos .pdf · até 10 MB por documento
                      </p>
                    </div>

                    {pdfUploadError && (
                      <p className="mt-2 text-xs text-red-700 font-medium flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {pdfUploadError}
                      </p>
                    )}

                    {documents.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Paperclip className="w-4 h-4 text-[#134074] shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#0B2545] truncate">
                                  {doc.name}
                                </p>
                                <p className="text-[11px] font-mono-tabular text-slate-500">
                                  PDF · {formatFileSize(doc.size)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-[#0B2545] text-xs font-semibold"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Abrir</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocument(doc.id)}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Remover PDF"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OPÇÃO B: DESCRIÇÃO BREVE (SOMENTE ASSUNTO) */}
              {descriptionMode === 'brief' && (
                <div className="space-y-3 bg-slate-50/80 border border-slate-200 rounded-xl p-4 sm:p-5">
                  <div>
                    <label
                      htmlFor="rec-brief-subject"
                      className="block text-xs font-bold text-[#0B2545] mb-1.5"
                    >
                      Assunto / Descrição breve *
                    </label>
                    <input
                      id="rec-brief-subject"
                      type="text"
                      value={briefSubject}
                      onChange={(e) => {
                        setBriefSubject(e.target.value);
                        if (errors.briefSubject) {
                          setErrors((p) => ({ ...p, briefSubject: '' }));
                        }
                      }}
                      placeholder="Ex: Dúvida sobre cálculo rescisório / Entrega de procuração"
                      className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-base sm:text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134074] ${
                        errors.briefSubject
                          ? 'border-red-500'
                          : 'border-slate-300'
                      }`}
                    />
                    {errors.briefSubject && (
                      <p className="mt-1 text-xs text-red-700">
                        {errors.briefSubject}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {BRIEF_TOPIC_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setBriefSubject(preset);
                          setErrors((p) => ({ ...p, briefSubject: '' }));
                        }}
                        className="min-h-[40px] px-3 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#134074] text-xs font-medium text-slate-700 hover:text-[#0B2545] cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
              </>
            )}

            {Object.values(errors).some(Boolean) && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1"
              >
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Complete os campos obrigatórios para confirmar:</span>
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {Object.values(errors)
                    .filter(Boolean)
                    .map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                </ul>
              </div>
            )}

            {/* Botão de Submissão Principal */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-600">
                {effectiveSelectedTime ? (
                  <>
                    {isCommitmentMode ? 'Compromisso' : 'Atendimento'}{' '}
                    <strong className="text-[#0B2545]">
                      {isCommitmentMode ? commitmentCategory : 'Fernandes & Lins'}
                    </strong>{' '}
                    em{' '}
                    <strong className="text-[#0B2545]">
                      {formatDateShortBR(selectedDateISO)} às {effectiveSelectedTime}
                    </strong>
                    .
                  </>
                ) : isCommitmentMode ? (
                  'Escolha ou informe o horário para salvar o compromisso na agenda.'
                ) : (
                  'Selecione uma data e horário disponível na agenda ao lado para concluir.'
                )}
              </p>

              <button
                type="submit"
                disabled={isUploadingPdf}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] font-bold text-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isCommitmentMode
                    ? 'Salvar Compromisso'
                    : 'Confirmar Agendamento'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de Inspeção de Horário Já Agendado na Pauta */}
      {inspectedAppointment && (
        <div className="fixed inset-0 z-50 bg-[#0B2545]/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <p className="text-xs font-mono-tabular font-bold text-[#1D4ED8]">
                  {inspectedAppointment.code} · {inspectedAppointment.startTime} às{' '}
                  {inspectedAppointment.endTime}
                </p>
                <h3 className="text-lg font-bold text-[#0B2545] mt-0.5">
                  {inspectedAppointment.clientName}
                </h3>
                <p className="text-xs text-slate-600">
                  {inspectedAppointment.serviceName} ·{' '}
                  {inspectedAppointment.lawyerName || 'Fernandes & Lins'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedAppointment(null)}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                aria-label="Fechar detalhes"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inspectedAppointment.entryType === 'commitment' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Tipo</span>
                  <span className="font-bold text-[#0B2545]">
                    Compromisso na agenda
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Categoria</span>
                  <span className="font-bold text-[#0B2545]">
                    {inspectedAppointment.commitmentCategory ||
                      inspectedAppointment.serviceName}
                  </span>
                </div>
                {inspectedAppointment.location && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">Local / Link</span>
                    <span className="font-semibold text-slate-800">
                      {inspectedAppointment.location}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">CPF</span>
                  <span className="font-mono-tabular font-bold text-[#0B2545]">
                    {inspectedAppointment.clientCpf}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Telefone / WhatsApp</span>
                  <span className="font-mono-tabular font-bold text-[#0B2545]">
                    {inspectedAppointment.clientPhone}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Endereço</span>
                  <span className="font-semibold text-slate-800">
                    {inspectedAppointment.clientAddress}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-[#0B2545] block">
                {inspectedAppointment.entryType === 'commitment'
                  ? 'Observações do Compromisso'
                  : inspectedAppointment.descriptionMode === 'complete'
                  ? 'Descrição Completa do Caso'
                  : 'Assunto / Descrição Breve'}
              </span>
              <p className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 whitespace-pre-line leading-relaxed">
                {inspectedAppointment.descriptionMode === 'complete'
                  ? inspectedAppointment.caseDescription || 'Sem relato informado.'
                  : inspectedAppointment.briefSubject || 'Sem observações informadas.'}
              </p>
            </div>

            {inspectedAppointment.documents &&
              inspectedAppointment.documents.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#0B2545] block">
                    Documentação Anexada ({inspectedAppointment.documents.length} PDF)
                  </span>
                  {inspectedAppointment.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-semibold text-[#0B2545] hover:bg-blue-100"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{doc.name}</span>
                      </span>
                      <span className="font-mono-tabular text-[11px] shrink-0">
                        {formatFileSize(doc.size)} · Abrir
                      </span>
                    </a>
                  ))}
                </div>
              )}

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
              {(() => {
                const clientReminderUrl =
                  buildClientWhatsAppReminderUrl(inspectedAppointment);
                if (!clientReminderUrl) return null;
                return (
                  <a
                    href={clientReminderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-[#15803D] text-xs font-semibold transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>Enviar Lembrete ao Cliente</span>
                  </a>
                );
              })()}
              <button
                type="button"
                onClick={() => setInspectedAppointment(null)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0B2545] text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
