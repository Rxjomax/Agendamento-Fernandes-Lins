import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Bot,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  RotateCcw,
  Scale,
  Send,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  Appointment,
  AvailabilityConfig,
  EntryType,
  ServiceItem,
  UserSession,
} from '../types/scheduling';
import {
  calculateEndTime,
  doesAppointmentBelongToUser,
  formatCPF,
  formatDateLongBR,
  formatDateShortBR,
  formatPhoneBR,
  generateTimeSlotsForDate,
  isAppointmentUpcoming,
  isDateAvailable,
  isValidCPF,
  timeToMinutes,
  toDateISO,
} from '../utils/timeSlots';
import { buildWhatsAppVoucherUrl } from '../utils/notificationLinks';

const COMMITMENT_CATEGORIES = [
  'Compromisso',
  'Audiência',
  'Prazo Processual',
  'Reunião Interna',
  'Diligência',
  'Pessoal',
] as const;

const COMMITMENT_DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export interface AiBookingProposal {
  entryType?: EntryType;
  serviceId?: string;
  date: string;
  startTime: string;
  durationMinutes?: number;
  commitmentCategory?: string;
  location?: string;
  clientName?: string;
  clientPhone?: string;
  clientCpf?: string;
  clientAddress?: string;
  clientEmail?: string;
  notes?: string;
  notifyByEmail?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
  proposal?: AiBookingProposal;
  bookedAppointment?: Appointment;
  cancelledCode?: string;
}

interface AiBookingChatWidgetProps {
  services: ServiceItem[];
  availability: AvailabilityConfig;
  appointments: Appointment[];
  currentUser: UserSession | null;
  onBookFromChat: (
    bookingData: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'status'>
  ) => Appointment;
  onCancelFromChat: (appointmentId: string) => void;
  onOpenMyAgenda: () => void;
}

const getInitialSuggestions = (user: UserSession | null): string[] => {
  if (user) {
    return [
      'O que temos na agenda hoje?',
      'Adicionar compromisso sem cliente',
      'Quais horários livres amanhã?',
    ];
  }
  return [
    'Quais horários livres amanhã?',
    'Adicionar compromisso sem cliente',
    'Agendar atendimento com cliente',
  ];
};

export const AiBookingChatWidget: React.FC<AiBookingChatWidgetProps> = ({
  services,
  availability,
  appointments,
  currentUser,
  onBookFromChat,
  onCancelFromChat,
  onOpenMyAgenda,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>(() =>
    getInitialSuggestions(currentUser)
  );

  const activeServices = services.filter((s) => s.status === 'active');
  const primaryService = activeServices[0] || services[0];
  const isStaffOrMaster =
    currentUser?.role === 'master' || currentUser?.role === 'staff';

  const getWelcomeMessage = (user: UserSession | null): ChatMessage => ({
    id: 'welcome-msg',
    role: 'assistant',
    content: user
      ? `Olá, ${user.name.split(' ')[0]}! Sou o assistente da agenda única da Fernandes & Lins Assessoria Jurídica.\n\nPosso consultar horários livres, verificar a pauta do dia, agendar atendimento com cliente, registrar compromisso sem cliente (audiência, prazo, reunião ou pessoal) ou cancelar protocolos.`
      : `Olá! Sou o assistente de agenda da Fernandes & Lins Assessoria Jurídica.\n\nPosso consultar horários livres na pauta compartilhada, agendar um atendimento com cliente ou registrar um compromisso avulso sem cliente. Como posso ajudar?`,
    timestamp: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    getWelcomeMessage(currentUser),
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome-msg') {
        return [getWelcomeMessage(currentUser)];
      }
      return prev;
    });
    setQuickReplies(getInitialSuggestions(currentUser));
  }, [currentUser]);

  // Draft state for active proposal card (both Client and Commitment modes)
  const [draftEntryType, setDraftEntryType] = useState<EntryType>('client');
  const [draftServiceId, setDraftServiceId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftDuration, setDraftDuration] = useState<number>(60);
  const [draftCategory, setDraftCategory] = useState<string>('Compromisso');
  const [draftLocation, setDraftLocation] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftCpf, setDraftCpf] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftNotifyByEmail, setDraftNotifyByEmail] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [messages, isOpen, isLoading]);

  const handleResetChat = () => {
    setMessages([getWelcomeMessage(currentUser)]);
    setQuickReplies(getInitialSuggestions(currentUser));
    setCardError(null);
    setDraftName('');
    setDraftPhone('');
    setDraftCpf('');
    setDraftAddress('');
    setDraftEmail('');
    setDraftLocation('');
    setDraftNotes('');
    setDraftNotifyByEmail(false);
  };

  const matchActiveService = (queryOrId?: string): ServiceItem | undefined => {
    if (!activeServices.length) return primaryService;
    const clean = (queryOrId || '').trim().toLowerCase();
    if (!clean) return activeServices[0];
    return (
      activeServices.find(
        (s) => s.id.toLowerCase() === clean || s.name.toLowerCase() === clean
      ) || activeServices[0]
    );
  };

  const hasConflictAt = (
    dateISO: string,
    startTime: string,
    durationMinutes: number
  ): Appointment | undefined => {
    const startMins = timeToMinutes(startTime);
    const endMins = startMins + durationMinutes;
    return appointments.find((a) => {
      if (a.date !== dateISO || a.status === 'cancelled') return false;
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      return startMins < aEnd && endMins > aStart;
    });
  };

  const normalizeAndValidateProposal = (
    rawProposal?: AiBookingProposal
  ): AiBookingProposal | undefined => {
    if (!rawProposal || !rawProposal.date) {
      return undefined;
    }

    const entryType: EntryType =
      rawProposal.entryType === 'commitment' ? 'commitment' : 'client';
    const todayISO = toDateISO(new Date());

    if (entryType === 'commitment') {
      const targetDateISO =
        rawProposal.date >= todayISO ? rawProposal.date : todayISO;
      const validTime = /^\d{2}:\d{2}$/.test(rawProposal.startTime || '')
        ? rawProposal.startTime
        : '09:00';
      const validDuration =
        typeof rawProposal.durationMinutes === 'number' &&
        rawProposal.durationMinutes >= 15 &&
        rawProposal.durationMinutes <= 480
          ? rawProposal.durationMinutes
          : 60;
      const validCategory = COMMITMENT_CATEGORIES.includes(
        rawProposal.commitmentCategory as (typeof COMMITMENT_CATEGORIES)[number]
      )
        ? rawProposal.commitmentCategory!
        : 'Compromisso';

      return {
        entryType: 'commitment',
        serviceId: 'srv-compromisso',
        date: targetDateISO,
        startTime: validTime,
        durationMinutes: validDuration,
        commitmentCategory: validCategory,
        location: rawProposal.location || '',
        clientName: rawProposal.clientName || '',
        notes: rawProposal.notes || '',
        notifyByEmail: Boolean(rawProposal.notifyByEmail),
      };
    }

    const matchedService = matchActiveService(rawProposal.serviceId);
    if (!matchedService) return undefined;

    let targetDateISO = rawProposal.date >= todayISO ? rawProposal.date : todayISO;
    const [y, m, d] = targetDateISO.split('-').map(Number);
    const dtObj = new Date(y, (m || 1) - 1, d || 1);
    for (let i = 0; i < 14; i++) {
      const candidateISO = toDateISO(dtObj);
      if (isDateAvailable(candidateISO, availability).allowed) {
        targetDateISO = candidateISO;
        break;
      }
      dtObj.setDate(dtObj.getDate() + 1);
    }

    const slots = generateTimeSlotsForDate(
      targetDateISO,
      matchedService.durationMinutes,
      availability,
      appointments
    );
    const availableSlots = slots.filter((s) => s.available);

    let chosenTime = rawProposal.startTime || '09:00';
    const isExactAvailable = availableSlots.some(
      (s) => s.startTime === chosenTime
    );

    if (!isExactAvailable && availableSlots.length > 0) {
      chosenTime = availableSlots[0].startTime;
    }

    return {
      entryType: 'client',
      serviceId: matchedService.id,
      date: targetDateISO,
      startTime: chosenTime,
      durationMinutes: matchedService.durationMinutes,
      clientName: rawProposal.clientName || draftName || '',
      clientPhone: rawProposal.clientPhone || draftPhone || '',
      clientCpf: rawProposal.clientCpf || draftCpf || '',
      clientAddress: rawProposal.clientAddress || draftAddress || '',
      clientEmail: rawProposal.clientEmail || draftEmail || '',
      notes: rawProposal.notes || draftNotes || '',
    };
  };

  const applyProposalToDrafts = (p: AiBookingProposal) => {
    const mode: EntryType = p.entryType === 'commitment' ? 'commitment' : 'client';
    setDraftEntryType(mode);
    setDraftServiceId(p.serviceId || primaryService?.id || '');
    setDraftDate(p.date);
    setDraftStartTime(p.startTime);
    setDraftDuration(p.durationMinutes || (mode === 'commitment' ? 60 : primaryService?.durationMinutes || 45));
    setDraftCategory(p.commitmentCategory || 'Compromisso');
    setDraftLocation(p.location || '');
    setDraftName(p.clientName || '');
    setDraftPhone(p.clientPhone ? formatPhoneBR(p.clientPhone) : '');
    setDraftCpf(p.clientCpf ? formatCPF(p.clientCpf) : '');
    setDraftAddress(p.clientAddress || '');
    setDraftEmail(p.clientEmail || '');
    setDraftNotes(p.notes || '');
    setDraftNotifyByEmail(Boolean(p.notifyByEmail));
  };

  const executeBookingCreation = (
    proposal: AiBookingProposal
  ): Appointment | null => {
    const mode: EntryType =
      proposal.entryType === 'commitment' ? 'commitment' : 'client';

    if (mode === 'commitment') {
      const title = (proposal.clientName || '').trim();
      if (title.length < 2 || !proposal.date || !proposal.startTime) {
        return null;
      }
      const duration = proposal.durationMinutes || 60;
      const category = proposal.commitmentCategory || 'Compromisso';
      const endTime = calculateEndTime(proposal.startTime, duration);
      return onBookFromChat({
        entryType: 'commitment',
        commitmentCategory: category,
        location: (proposal.location || '').trim() || undefined,
        notifyByEmail: Boolean(proposal.notifyByEmail),
        serviceId: 'srv-compromisso',
        serviceName: category,
        lawyerName: primaryService?.specialist || 'Fernandes & Lins',
        durationMinutes: duration,
        price: 0,
        date: proposal.date,
        startTime: proposal.startTime,
        endTime,
        clientName: title,
        clientPhone: '',
        clientCpf: '',
        clientAddress: (proposal.location || '').trim(),
        clientEmail: '',
        descriptionMode: 'brief',
        briefSubject: (proposal.notes || '').trim() || category,
        documents: [],
        notes: (proposal.notes || '').trim() || undefined,
        createdByUserId: currentUser?.id,
        createdByRole: currentUser?.role,
      });
    }

    const service = matchActiveService(proposal.serviceId);
    if (!service) return null;

    const finalName = (proposal.clientName || '').trim();
    const finalPhone = (proposal.clientPhone || '').trim();
    const finalCpfRaw = (proposal.clientCpf || '').trim();
    const finalAddress = (proposal.clientAddress || '').trim();
    const finalEmail = (
      proposal.clientEmail || 'contato@fernandeslins.adv.br'
    ).trim();

    if (finalName.length < 2 || finalPhone.replace(/\D/g, '').length < 10) {
      return null;
    }

    const cpfDigits = finalCpfRaw.replace(/\D/g, '');
    if (cpfDigits.length > 0 && !isValidCPF(finalCpfRaw)) {
      return null;
    }

    const endTime = calculateEndTime(proposal.startTime, service.durationMinutes);
    return onBookFromChat({
      entryType: 'client',
      serviceId: service.id,
      serviceName: service.name,
      lawyerName: service.specialist,
      durationMinutes: service.durationMinutes,
      price: service.price,
      date: proposal.date,
      startTime: proposal.startTime,
      endTime,
      clientName: finalName,
      clientPhone: formatPhoneBR(finalPhone),
      clientCpf: cpfDigits.length === 11 ? formatCPF(finalCpfRaw) : 'Informar na recepção',
      clientAddress: finalAddress || 'Informar na recepção',
      clientEmail: finalEmail,
      descriptionMode: 'brief',
      briefSubject:
        (proposal.notes || '').trim() || `Atendimento agendado via assistente`,
      documents: [],
      notes: (proposal.notes || '').trim() || 'Agendado via Assistente de Agenda',
      createdByUserId: currentUser?.id,
      createdByRole: currentUser?.role,
    });
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const latestPendingMsg = [...messages]
      .reverse()
      .find((m) => m.proposal && !m.bookedAppointment);
    const activeProposal: AiBookingProposal | null = latestPendingMsg?.proposal
      ? {
          entryType: draftEntryType || latestPendingMsg.proposal.entryType || 'client',
          serviceId: draftServiceId || latestPendingMsg.proposal.serviceId,
          date: draftDate || latestPendingMsg.proposal.date,
          startTime: draftStartTime || latestPendingMsg.proposal.startTime,
          durationMinutes: draftDuration || latestPendingMsg.proposal.durationMinutes,
          commitmentCategory:
            draftCategory || latestPendingMsg.proposal.commitmentCategory,
          location: draftLocation || latestPendingMsg.proposal.location,
          clientName: draftName || latestPendingMsg.proposal.clientName,
          clientPhone: draftPhone || latestPendingMsg.proposal.clientPhone,
          clientCpf: draftCpf || latestPendingMsg.proposal.clientCpf,
          clientAddress: draftAddress || latestPendingMsg.proposal.clientAddress,
          clientEmail: draftEmail || latestPendingMsg.proposal.clientEmail,
          notes: draftNotes || latestPendingMsg.proposal.notes,
          notifyByEmail: draftNotifyByEmail,
        }
      : null;

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    if (!customText) setInput('');
    setIsLoading(true);
    setCardError(null);

    try {
      const todayISO = toDateISO(new Date());
      const upcomingAppointments = appointments.filter((a) =>
        isAppointmentUpcoming(a)
      );

      const bookedSlots = upcomingAppointments.map((a) => ({
        id: a.id,
        code: a.code,
        entryType: a.entryType || 'client',
        commitmentCategory: a.commitmentCategory,
        location: a.location,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        serviceName: a.serviceName,
        lawyerName: a.lawyerName,
        ...(isStaffOrMaster || a.entryType === 'commitment'
          ? { clientName: a.clientName, briefSubject: a.briefSubject }
          : {}),
      }));

      const visibleAppointments = upcomingAppointments
        .filter((a) => {
          if (isStaffOrMaster) return true;
          if (a.entryType === 'commitment') return true;
          return doesAppointmentBelongToUser(
            a,
            draftEmail || draftPhone
              ? { email: draftEmail, phone: draftPhone }
              : null
          );
        })
        .map((a) => ({
          id: a.id,
          code: a.code,
          entryType: a.entryType || 'client',
          commitmentCategory: a.commitmentCategory,
          location: a.location,
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          serviceName: a.serviceName,
          lawyerName: a.lawyerName,
          clientName: a.clientName,
          briefSubject: a.briefSubject,
        }));

      const response = await fetch('/api/ai-booking-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory
            .filter((m) => !m.isError)
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
          services,
          availability,
          bookedSlots,
          userAppointments: visibleAppointments,
          activeProposal,
          currentUser: currentUser
            ? {
                name: currentUser.name,
                email: currentUser.email,
                phone: currentUser.phone,
                role: currentUser.role,
              }
            : null,
          todayISO,
          currentTimeMinutes: new Date().getHours() * 60 + new Date().getMinutes(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível consultar o assistente de agenda no momento.'
        );
      }

      if (data.action === 'CANCEL_APPOINTMENT' && data.cancelAppointmentCode) {
        const codeClean = String(data.cancelAppointmentCode).trim().toUpperCase();
        const targetAppt = upcomingAppointments.find(
          (a) => a.code.toUpperCase() === codeClean
        );
        if (targetAppt) {
          onCancelFromChat(targetAppt.id);
          const isCommitment = targetAppt.entryType === 'commitment';
          const assistantMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content:
              data.reply ||
              `Pronto! O ${isCommitment ? 'compromisso' : 'protocolo'} ${targetAppt.code} (${targetAppt.clientName}) foi cancelado.`,
            timestamp: new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            cancelledCode: targetAppt.code,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setQuickReplies(['Ver horários livres amanhã', 'Adicionar compromisso sem cliente']);
          return;
        }
      }

      const validatedProposal =
        data.hasBookingProposal && data.bookingProposal
          ? normalizeAndValidateProposal(data.bookingProposal)
          : data.action === 'CONFIRM_BOOKING_NOW' && activeProposal
          ? normalizeAndValidateProposal(activeProposal)
          : undefined;

      if (validatedProposal) {
        applyProposalToDrafts(validatedProposal);
      }

      let autoBooked: Appointment | undefined;
      if (
        data.action === 'CONFIRM_BOOKING_NOW' &&
        (validatedProposal || activeProposal)
      ) {
        const targetProp = validatedProposal || activeProposal!;
        const created = executeBookingCreation(targetProp);
        if (created) {
          autoBooked = created;
          if (latestPendingMsg) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === latestPendingMsg.id ? { ...m, proposal: undefined } : m
              )
            );
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.reply ||
          'Conferi a agenda da Fernandes & Lins. Revise os dados abaixo para confirmar.',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        proposal: autoBooked ? undefined : validatedProposal,
        bookedAppointment: autoBooked,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (
        Array.isArray(data.suggestedQuickReplies) &&
        data.suggestedQuickReplies.length > 0
      ) {
        setQuickReplies(data.suggestedQuickReplies.slice(0, 3));
      }
    } catch (err) {
      const errorText =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao assistente de agenda no momento.';

      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        content: errorText,
        isError: true,
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setQuickReplies([
        'Tentar novamente',
        'Quais horários livres amanhã?',
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmProposalCard = (
    messageId: string,
    proposal: AiBookingProposal
  ) => {
    setCardError(null);
    const mode = draftEntryType;
    const chosenDate = draftDate || proposal.date;
    const chosenStartTime = draftStartTime || proposal.startTime;

    if (!chosenDate || !chosenStartTime) {
      setCardError('Selecione a data e o horário.');
      return;
    }

    if (mode === 'commitment') {
      const title = (draftName || proposal.clientName || '').trim();
      if (title.length < 2) {
        setCardError('Informe o título do compromisso (ex: Audiência, Prazo, Reunião).');
        return;
      }

      const created = executeBookingCreation({
        entryType: 'commitment',
        date: chosenDate,
        startTime: chosenStartTime,
        durationMinutes: draftDuration || 60,
        commitmentCategory: draftCategory || 'Compromisso',
        location: draftLocation.trim(),
        clientName: title,
        notes: draftNotes.trim(),
        notifyByEmail: draftNotifyByEmail,
      });

      if (!created) {
        setCardError('Não foi possível salvar o compromisso. Revise os campos.');
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, bookedAppointment: created }
            : m
        )
      );
      setQuickReplies(['Ver pauta de hoje', 'Adicionar outro compromisso']);
      return;
    }

    const finalName = (draftName || proposal.clientName || '').trim();
    const finalPhone = (draftPhone || proposal.clientPhone || '').trim();
    const finalCpf = (draftCpf || proposal.clientCpf || '').trim();

    if (finalName.length < 2) {
      setCardError('Informe o nome completo do cliente.');
      return;
    }

    if (finalPhone.replace(/\D/g, '').length < 10) {
      setCardError('Informe um telefone/WhatsApp válido com DDD.');
      return;
    }

    if (finalCpf.replace(/\D/g, '').length > 0 && !isValidCPF(finalCpf)) {
      setCardError('O CPF informado é inválido. Corrija ou deixe em branco.');
      return;
    }

    const created = executeBookingCreation({
      entryType: 'client',
      serviceId: draftServiceId || proposal.serviceId || primaryService?.id,
      date: chosenDate,
      startTime: chosenStartTime,
      clientName: finalName,
      clientPhone: finalPhone,
      clientCpf: finalCpf,
      clientAddress: (draftAddress || proposal.clientAddress || '').trim(),
      clientEmail: (draftEmail || proposal.clientEmail || '').trim(),
      notes: (draftNotes || proposal.notes || '').trim(),
    });

    if (!created) {
      setCardError('Não foi possível confirmar o atendimento. Revise os dados.');
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, bookedAppointment: created }
          : m
      )
    );
    setQuickReplies(['Ver pauta de hoje', 'Adicionar compromisso sem cliente']);
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex flex-col items-end">
      {isOpen && (
        <div
          role="dialog"
          aria-label="Assistente de Agenda Fernandes e Lins"
          className="mb-3 w-[calc(100vw-2rem)] sm:w-[430px] h-[600px] max-h-[84vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#0B2545] text-white px-4 py-3.5 flex items-center justify-between border-b border-[#1E3A8A]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#134074] border border-white/15 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4 text-[#FACC15]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold tracking-tight text-white truncate">
                  Assistente Fernandes & Lins
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  Agenda única · Clientes e Compromissos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleResetChat}
                title="Reiniciar conversa"
                aria-label="Reiniciar conversa"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Fechar assistente"
                aria-label="Fechar assistente"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const activeDateForCard = draftDate || msg.proposal?.date || '';
              const activeTimeForCard =
                draftStartTime || msg.proposal?.startTime || '';
              const isCommitmentCard = draftEntryType === 'commitment';

              const proposalService =
                activeServices.find(
                  (s) => s.id === (draftServiceId || msg.proposal?.serviceId)
                ) || primaryService;

              const effectiveDuration = isCommitmentCard
                ? draftDuration || 60
                : proposalService?.durationMinutes || 45;

              const availableDaySlots =
                msg.proposal && !msg.bookedAppointment && activeDateForCard
                  ? generateTimeSlotsForDate(
                      activeDateForCard,
                      effectiveDuration,
                      availability,
                      appointments
                    ).filter((s) => s.available)
                  : [];

              const commitmentConflict =
                msg.proposal &&
                !msg.bookedAppointment &&
                isCommitmentCard &&
                activeDateForCard &&
                activeTimeForCard
                  ? hasConflictAt(
                      activeDateForCard,
                      activeTimeForCard,
                      effectiveDuration
                    )
                  : undefined;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`flex items-end gap-2 max-w-[92%] ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mb-0.5 ${
                        isUser
                          ? 'bg-[#0B2545] text-[#FACC15]'
                          : msg.isError
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-blue-100 text-[#0B2545] border border-blue-200'
                      }`}
                    >
                      {isUser ? (
                        <User className="w-3.5 h-3.5" />
                      ) : msg.isError ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Bot className="w-3.5 h-3.5" />
                      )}
                    </div>

                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm sm:text-xs leading-relaxed ${
                        isUser
                          ? 'bg-[#0B2545] text-white rounded-br-xs'
                          : msg.isError
                          ? 'bg-red-50 text-red-900 border border-red-200 rounded-bl-xs'
                          : 'bg-white text-[#0F172A] border border-slate-200 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.content}</p>
                    </div>
                  </div>

                  {/* Interactive Proposal Card (Client OR Commitment) */}
                  {msg.proposal && !msg.bookedAppointment && (
                    <div className="mt-2.5 ml-8 w-[calc(100%-2rem)] bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
                      {/* Mode Switcher */}
                      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftEntryType('client');
                            setCardError(null);
                          }}
                          className={`min-h-[42px] px-2.5 py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            !isCommitmentCard
                              ? 'bg-[#0B2545] text-[#FACC15]'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Com Cliente</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftEntryType('commitment');
                            setCardError(null);
                          }}
                          className={`min-h-[42px] px-2.5 py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            isCommitmentCard
                              ? 'bg-[#0B2545] text-[#FACC15]'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>Compromisso</span>
                        </button>
                      </div>

                      <div className="p-3.5 space-y-3 text-xs">
                        {!isCommitmentCard && activeServices.length > 1 && proposalService && (
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Tipo de Atendimento
                            </label>
                            <select
                              value={proposalService.id}
                              onChange={(e) => setDraftServiceId(e.target.value)}
                              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-[#0B2545] text-base sm:text-xs focus:outline-none focus:border-[#1D4ED8]"
                            >
                              {activeServices.map((srv) => (
                                <option key={srv.id} value={srv.id}>
                                  {srv.name} — {srv.specialist}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Date & Time Block */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <div className="flex items-start gap-1.5 text-slate-700">
                            <Calendar className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0 mt-1" />
                            <div className="min-w-0 flex-1">
                              <label className="block text-[10px] text-slate-500 leading-none mb-1">
                                Data
                              </label>
                              <input
                                type="date"
                                value={activeDateForCard}
                                min={toDateISO(new Date())}
                                onChange={(e) => {
                                  if (e.target.value) setDraftDate(e.target.value);
                                }}
                                className="w-full bg-transparent font-semibold text-[#0B2545] text-sm sm:text-xs focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex items-start gap-1.5 text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0 mt-1" />
                            <div className="min-w-0 flex-1">
                              <label className="block text-[10px] text-slate-500 leading-none mb-1">
                                {isCommitmentCard ? 'Início' : 'Horário'}
                              </label>
                              {isCommitmentCard ? (
                                <input
                                  type="time"
                                  value={activeTimeForCard}
                                  onChange={(e) => setDraftStartTime(e.target.value)}
                                  className="w-full bg-transparent font-semibold text-[#0B2545] font-mono-tabular text-sm sm:text-xs focus:outline-none"
                                />
                              ) : (
                                <p className="font-semibold text-[#0B2545] font-mono-tabular text-xs">
                                  {activeTimeForCard} às{' '}
                                  {calculateEndTime(
                                    activeTimeForCard,
                                    effectiveDuration
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Available Slots Quick Picker */}
                        {availableDaySlots.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-semibold text-slate-500 mb-1.5">
                              {isCommitmentCard
                                ? `Sugestões livres em ${formatDateShortBR(activeDateForCard)} (ou digite qualquer hora acima):`
                                : `Horários livres em ${formatDateShortBR(activeDateForCard)}:`}
                            </p>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                              {availableDaySlots.map((slot) => {
                                const selected = activeTimeForCard === slot.startTime;
                                return (
                                  <button
                                    key={slot.startTime}
                                    type="button"
                                    onClick={() => setDraftStartTime(slot.startTime)}
                                    className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                                      selected
                                        ? 'bg-[#0B2545] text-[#FACC15]'
                                        : 'bg-slate-100 text-[#0B2545] hover:bg-blue-50'
                                    }`}
                                  >
                                    {slot.startTime}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : !isCommitmentCard ? (
                          <p className="text-[11px] text-amber-900 bg-[#FEF9C3] px-2.5 py-2 rounded-lg border border-[#FACC15]">
                            Sem horários livres nesta data para atendimento. Escolha outro dia útil acima.
                          </p>
                        ) : null}

                        {commitmentConflict && (
                          <p className="text-[11px] text-amber-900 bg-[#FEF9C3] px-2.5 py-2 rounded-lg border border-[#FACC15]">
                            Atenção: já existe "{commitmentConflict.clientName}" ({commitmentConflict.startTime}–{commitmentConflict.endTime}) neste horário.
                          </p>
                        )}

                        {/* COMMITMENT MODE FIELDS */}
                        {isCommitmentCard ? (
                          <div className="space-y-2.5 pt-2 border-t border-slate-200">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Título do Compromisso *
                              </label>
                              <input
                                type="text"
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                placeholder="Ex: Audiência TRT-6, Prazo Recurso..."
                                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Categoria
                                </label>
                                <select
                                  value={draftCategory}
                                  onChange={(e) => setDraftCategory(e.target.value)}
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                >
                                  {COMMITMENT_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Duração
                                </label>
                                <select
                                  value={draftDuration}
                                  onChange={(e) =>
                                    setDraftDuration(Number(e.target.value))
                                  }
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                >
                                  {COMMITMENT_DURATIONS.map((mins) => (
                                    <option key={mins} value={mins}>
                                      {mins >= 60
                                        ? `${mins / 60}h${mins % 60 ? ` ${mins % 60}min` : ''}`
                                        : `${mins} min`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Local ou Link (opcional)
                              </label>
                              <input
                                type="text"
                                value={draftLocation}
                                onChange={(e) => setDraftLocation(e.target.value)}
                                placeholder="Ex: Fórum Joana Bezerra ou sala virtual"
                                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Observações (opcional)
                              </label>
                              <input
                                type="text"
                                value={draftNotes}
                                onChange={(e) => setDraftNotes(e.target.value)}
                                placeholder="Detalhes ou número do processo..."
                                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                              />
                            </div>

                            <label className="flex items-center gap-2 py-1 text-[11px] text-slate-700 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={draftNotifyByEmail}
                                onChange={(e) =>
                                  setDraftNotifyByEmail(e.target.checked)
                                }
                                className="w-4 h-4 rounded border-slate-300 accent-[#0B2545]"
                              />
                              <span>Enviar lembrete por e-mail ao escritório</span>
                            </label>
                          </div>
                        ) : (
                          /* CLIENT BOOKING MODE FIELDS */
                          <div className="space-y-2.5 pt-2 border-t border-slate-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Nome do Cliente *
                                </label>
                                <input
                                  type="text"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  placeholder="Nome completo"
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  WhatsApp *
                                </label>
                                <input
                                  type="tel"
                                  value={draftPhone}
                                  onChange={(e) =>
                                    setDraftPhone(formatPhoneBR(e.target.value))
                                  }
                                  placeholder="(81) 99999-9999"
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  CPF (opcional)
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={draftCpf}
                                  onChange={(e) =>
                                    setDraftCpf(formatCPF(e.target.value))
                                  }
                                  placeholder="000.000.000-00"
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Endereço (opcional)
                                </label>
                                <input
                                  type="text"
                                  value={draftAddress}
                                  onChange={(e) => setDraftAddress(e.target.value)}
                                  placeholder="Rua, bairro, Recife"
                                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Assunto / Observações (opcional)
                              </label>
                              <input
                                type="text"
                                value={draftNotes}
                                onChange={(e) => setDraftNotes(e.target.value)}
                                placeholder="Ex: Triagem trabalhista, entrega de documentos..."
                                className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-base sm:text-xs text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                              />
                            </div>

                            <p className="text-[10px] text-slate-500">
                              Para anexar arquivos PDF ou relato jurídico completo, utilize a aba Recepção.
                            </p>
                          </div>
                        )}

                        {cardError && (
                          <p className="text-[11px] text-red-700 font-medium bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                            {cardError}
                          </p>
                        )}

                        <button
                          type="button"
                          disabled={!isCommitmentCard && availableDaySlots.length === 0}
                          onClick={() =>
                            handleConfirmProposalCard(msg.id, msg.proposal!)
                          }
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] disabled:opacity-40 text-[#0B2545] font-bold text-xs flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2545] transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {isCommitmentCard
                              ? 'Salvar Compromisso'
                              : 'Confirmar Atendimento'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmed Card */}
                  {msg.bookedAppointment && (
                    <div className="mt-2.5 ml-8 w-[calc(100%-2rem)] bg-[#0B2545] text-white rounded-xl p-3.5 shadow-md space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FACC15]">
                          {msg.bookedAppointment.entryType === 'commitment' ? (
                            <Bookmark className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {msg.bookedAppointment.entryType === 'commitment'
                            ? 'Compromisso Salvo!'
                            : 'Atendimento Confirmado!'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#134074] text-[#FACC15] font-mono-tabular text-[11px] font-bold">
                          {msg.bookedAppointment.code}
                        </span>
                      </div>

                      <div className="text-xs space-y-1 text-slate-100">
                        <p className="font-bold text-white">
                          {msg.bookedAppointment.entryType === 'commitment'
                            ? msg.bookedAppointment.clientName
                            : msg.bookedAppointment.serviceName}
                        </p>
                        {msg.bookedAppointment.entryType === 'commitment' &&
                          msg.bookedAppointment.commitmentCategory && (
                            <p className="text-[11px] text-[#FACC15]">
                              {msg.bookedAppointment.commitmentCategory}
                            </p>
                          )}
                        <p className="text-[11px] text-slate-300">
                          {formatDateLongBR(msg.bookedAppointment.date)} ·{' '}
                          {msg.bookedAppointment.startTime} às{' '}
                          {msg.bookedAppointment.endTime}
                        </p>
                        {msg.bookedAppointment.entryType === 'commitment' ? (
                          msg.bookedAppointment.location && (
                            <p className="text-[11px] text-slate-300 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#FACC15] shrink-0" />
                              <span>{msg.bookedAppointment.location}</span>
                            </p>
                          )
                        ) : (
                          <p className="text-[11px] text-slate-300">
                            Cliente: {msg.bookedAppointment.clientName}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={buildWhatsAppVoucherUrl(msg.bookedAppointment)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-h-[40px] py-2 px-2.5 rounded-lg bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenMyAgenda();
                          }}
                          className="min-h-[40px] py-2 px-3 rounded-lg bg-[#134074] hover:bg-[#1D4ED8] text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" />
                          <span>Pauta</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.cancelledCode && (
                    <div className="mt-2 ml-8 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Protocolo {msg.cancelledCode} cancelado</span>
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 mt-1 px-8">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pl-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#0B2545] flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2 flex items-center gap-1.5">
                  <span className="text-xs text-slate-600">
                    Consultando agenda da Fernandes & Lins...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies */}
          {quickReplies.length > 0 && !isLoading && (
            <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {quickReplies.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-[#0B2545] border border-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ex: "Horários amanhã" ou "Audiência sexta 10h"'
              disabled={isLoading}
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-base sm:text-xs text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#1D4ED8] transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0B2545] hover:bg-[#134074] disabled:opacity-40 text-[#FACC15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] transition-colors cursor-pointer shrink-0"
              title="Enviar mensagem"
              aria-label="Enviar mensagem"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={
          isOpen
            ? 'Fechar assistente de agenda'
            : 'Abrir assistente de agenda'
        }
        className="flex items-center gap-2.5 min-h-[48px] px-4 py-3 rounded-2xl bg-[#0B2545] hover:bg-[#134074] text-white shadow-xl border border-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] transition-colors cursor-pointer"
      >
        {isOpen ? (
          <X className="w-5 h-5 text-[#FACC15]" />
        ) : (
          <Scale className="w-5 h-5 text-[#FACC15]" />
        )}
        <span className="text-xs font-bold tracking-tight">
          {isOpen ? 'Fechar Assistente' : 'Assistente de Agenda'}
        </span>
      </button>
    </div>
  );
};
