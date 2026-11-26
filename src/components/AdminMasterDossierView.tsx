import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../types/scheduling';
import {
  formatDateLongBR,
  formatDateShortBR,
  formatFileSize,
  isAppointmentUpcoming,
} from '../utils/timeSlots';
import {
  buildClientWhatsAppReminderUrl,
  buildWhatsAppVoucherUrl,
} from '../utils/notificationLinks';
import { uploadPdfDocumentFile } from '../utils/pdfUpload';
import { PdfCanvasViewer } from './PdfCanvasViewer';

interface AdminMasterDossierViewProps {
  appointments: Appointment[];
  onUpdateAppointment: (updated: Appointment) => void;
  onUpdateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  onEditAppointment: (appt: Appointment) => void;
  onOpenNewAppointment: () => void;
  onOpenNewCommitment: () => void;
}

type ViewMode = 'agendas' | 'clients';
type QuickFilter =
  | 'all'
  | 'with-pdf'
  | 'clients'
  | 'commitments'
  | 'upcoming'
  | 'completed';

interface ClientDossierGroup {
  key: string;
  name: string;
  cpf: string;
  phone: string;
  email: string;
  address: string;
  appointments: Appointment[];
  documents: Array<{
    doc: AppointmentDocument;
    appointment: Appointment;
  }>;
  latestDate: string;
  latestTime: string;
  upcomingCount: number;
  completedCount: number;
}

const STATUS_META: Record<
  AppointmentStatus,
  { label: string; textClass: string; activeBg: string }
> = {
  confirmed: {
    label: 'Confirmado',
    textClass: 'text-[#1D4ED8]',
    activeBg: 'bg-[#0B2545] text-[#FACC15]',
  },
  pending: {
    label: 'Pendente',
    textClass: 'text-[#B45309]',
    activeBg: 'bg-[#B45309] text-white',
  },
  completed: {
    label: 'Realizado',
    textClass: 'text-[#15803D]',
    activeBg: 'bg-[#15803D] text-white',
  },
  cancelled: {
    label: 'Cancelado',
    textClass: 'text-[#B91C1C]',
    activeBg: 'bg-[#B91C1C] text-white',
  },
};

function normalizeClientKey(appt: Appointment): string {
  const cpfDigits = (appt.clientCpf || '').replace(/\D/g, '');
  if (cpfDigits.length === 11) return `cpf:${cpfDigits}`;
  const phoneDigits = (appt.clientPhone || '').replace(/\D/g, '');
  if (phoneDigits.length >= 10) return `tel:${phoneDigits}`;
  const email = (appt.clientEmail || '').trim().toLowerCase();
  if (email && !email.endsWith('@cliente.fernandeslins.adv.br')) {
    return `mail:${email}`;
  }
  return `name:${appt.clientName.trim().toLowerCase()}`;
}

function dataUrlToBlobUrl(url: string): { resolvedUrl: string; revoke: boolean } {
  if (!url.startsWith('data:')) {
    return { resolvedUrl: url, revoke: false };
  }
  try {
    const commaIdx = url.indexOf(',');
    if (commaIdx === -1) return { resolvedUrl: url, revoke: false };
    const header = url.slice(0, commaIdx);
    const data = url.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/i);
    const mimeType = mimeMatch?.[1] || 'application/pdf';
    const isBase64 = /;base64/i.test(header);
    const binary = isBase64 ? atob(data) : decodeURIComponent(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return { resolvedUrl: URL.createObjectURL(blob), revoke: true };
  } catch {
    return { resolvedUrl: url, revoke: false };
  }
}

export const AdminMasterDossierView: React.FC<AdminMasterDossierViewProps> = ({
  appointments,
  onUpdateAppointment,
  onUpdateAppointmentStatus,
  onEditAppointment,
  onOpenNewAppointment,
  onOpenNewCommitment,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('agendas');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(
    null
  );
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [expandedPdfDoc, setExpandedPdfDoc] = useState<{
    doc: AppointmentDocument;
    ownerLabel: string;
    appointmentCode: string;
  } | null>(null);

  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmRemoveDocId, setConfirmRemoveDocId] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  // Ordena agendas (mais recentes/próximas primeiro)
  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => {
      const cmpDate = b.date.localeCompare(a.date);
      if (cmpDate !== 0) return cmpDate;
      return b.startTime.localeCompare(a.startTime);
    });
  }, [appointments]);

  // Estatísticas reais consolidadas para o cabeçalho do Master
  const stats = useMemo(() => {
    const clientRecords = appointments.filter((a) => a.entryType !== 'commitment');
    const uniqueClients = new Set(clientRecords.map(normalizeClientKey)).size;
    const withPdfCount = appointments.filter(
      (a) => (a.documents?.length || 0) > 0
    ).length;
    const totalPdfCount = appointments.reduce(
      (acc, a) => acc + (a.documents?.length || 0),
      0
    );
    return {
      totalAgendas: appointments.length,
      uniqueClients,
      withPdfCount,
      totalPdfCount,
    };
  }, [appointments]);

  // Filtra agendamentos conforme filtros rápidos + busca (inclusive por nome de PDF)
  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return sortedAppointments.filter((appt) => {
      if (quickFilter === 'with-pdf' && (!appt.documents || appt.documents.length === 0)) {
        return false;
      }
      if (quickFilter === 'clients' && appt.entryType === 'commitment') {
        return false;
      }
      if (quickFilter === 'commitments' && appt.entryType !== 'commitment') {
        return false;
      }
      if (quickFilter === 'upcoming' && !isAppointmentUpcoming(appt)) {
        return false;
      }
      if (quickFilter === 'completed' && appt.status !== 'completed') {
        return false;
      }

      if (!q) return true;

      const docMatch = (appt.documents || []).some((d) =>
        d.name.toLowerCase().includes(q)
      );
      const cpfDigits = (appt.clientCpf || '').replace(/\D/g, '');
      const phoneDigits = (appt.clientPhone || '').replace(/\D/g, '');

      return (
        appt.clientName.toLowerCase().includes(q) ||
        appt.code.toLowerCase().includes(q) ||
        appt.serviceName.toLowerCase().includes(q) ||
        (appt.lawyerName || '').toLowerCase().includes(q) ||
        (appt.clientEmail || '').toLowerCase().includes(q) ||
        (appt.clientAddress || '').toLowerCase().includes(q) ||
        (appt.caseDescription || '').toLowerCase().includes(q) ||
        (appt.briefSubject || '').toLowerCase().includes(q) ||
        (appt.location || '').toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (cpfDigits.includes(qDigits) || phoneDigits.includes(qDigits))) ||
        docMatch
      );
    });
  }, [sortedAppointments, quickFilter, searchQuery]);

  // Agrupamento consolidado por cliente (somente atendimentos com clientes)
  const clientGroups = useMemo<ClientDossierGroup[]>(() => {
    const map = new Map<string, ClientDossierGroup>();
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    for (const appt of sortedAppointments) {
      if (appt.entryType === 'commitment') continue;
      const key = normalizeClientKey(appt);
      const existing = map.get(key);
      const apptDocs = (appt.documents || []).map((doc) => ({
        doc,
        appointment: appt,
      }));
      const upcoming = isAppointmentUpcoming(appt) ? 1 : 0;
      const completed = appt.status === 'completed' ? 1 : 0;

      if (!existing) {
        map.set(key, {
          key,
          name: appt.clientName,
          cpf: appt.clientCpf || '',
          phone: appt.clientPhone || '',
          email: appt.clientEmail || '',
          address: appt.clientAddress || '',
          appointments: [appt],
          documents: apptDocs,
          latestDate: appt.date,
          latestTime: appt.startTime,
          upcomingCount: upcoming,
          completedCount: completed,
        });
      } else {
        existing.appointments.push(appt);
        existing.documents.push(...apptDocs);
        existing.upcomingCount += upcoming;
        existing.completedCount += completed;
        if (!existing.cpf && appt.clientCpf) existing.cpf = appt.clientCpf;
        if (!existing.phone && appt.clientPhone) existing.phone = appt.clientPhone;
        if (!existing.email && appt.clientEmail) existing.email = appt.clientEmail;
        if (!existing.address && appt.clientAddress) {
          existing.address = appt.clientAddress;
        }
      }
    }

    return Array.from(map.values()).filter((group) => {
      if (quickFilter === 'with-pdf' && group.documents.length === 0) return false;
      if (quickFilter === 'upcoming' && group.upcomingCount === 0) return false;
      if (quickFilter === 'completed' && group.completedCount === 0) return false;
      if (!q) return true;

      const cpfDigits = group.cpf.replace(/\D/g, '');
      const phoneDigits = group.phone.replace(/\D/g, '');
      const docMatch = group.documents.some(({ doc }) =>
        doc.name.toLowerCase().includes(q)
      );
      const apptMatch = group.appointments.some(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          (a.caseDescription || '').toLowerCase().includes(q) ||
          (a.briefSubject || '').toLowerCase().includes(q) ||
          a.serviceName.toLowerCase().includes(q)
      );

      return (
        group.name.toLowerCase().includes(q) ||
        group.email.toLowerCase().includes(q) ||
        group.address.toLowerCase().includes(q) ||
        (qDigits.length >= 3 &&
          (cpfDigits.includes(qDigits) || phoneDigits.includes(qDigits))) ||
        docMatch ||
        apptMatch
      );
    });
  }, [sortedAppointments, quickFilter, searchQuery]);

  // Mantém seleção sincronizada com a lista filtrada
  useEffect(() => {
    if (viewMode === 'agendas') {
      if (filteredAppointments.length === 0) {
        setSelectedAppointmentId(null);
      } else if (
        !selectedAppointmentId ||
        !filteredAppointments.some((a) => a.id === selectedAppointmentId)
      ) {
        setSelectedAppointmentId(filteredAppointments[0].id);
      }
    } else {
      if (clientGroups.length === 0) {
        setSelectedClientKey(null);
      } else if (
        !selectedClientKey ||
        !clientGroups.some((g) => g.key === selectedClientKey)
      ) {
        setSelectedClientKey(clientGroups[0].key);
      }
    }
  }, [
    viewMode,
    filteredAppointments,
    clientGroups,
    selectedAppointmentId,
    selectedClientKey,
  ]);

  const activeClientGroup = useMemo(() => {
    if (viewMode !== 'clients' || !selectedClientKey) return null;
    return clientGroups.find((g) => g.key === selectedClientKey) || null;
  }, [viewMode, clientGroups, selectedClientKey]);

  const activeAppointment = useMemo(() => {
    if (viewMode === 'agendas') {
      return (
        filteredAppointments.find((a) => a.id === selectedAppointmentId) || null
      );
    }
    if (!activeClientGroup) return null;
    return (
      activeClientGroup.appointments.find((a) => a.id === selectedAppointmentId) ||
      activeClientGroup.appointments[0] ||
      null
    );
  }, [viewMode, filteredAppointments, selectedAppointmentId, activeClientGroup]);

  // Lista de PDFs visíveis no dossiê atual (no modo cliente mostra todos os PDFs do cliente)
  const visibleDocuments = useMemo(() => {
    if (viewMode === 'clients' && activeClientGroup) {
      return activeClientGroup.documents;
    }
    if (activeAppointment) {
      return (activeAppointment.documents || []).map((doc) => ({
        doc,
        appointment: activeAppointment,
      }));
    }
    return [];
  }, [viewMode, activeClientGroup, activeAppointment]);

  // Seleciona automaticamente o 1º PDF assim que o Master abre um registro/cliente com documentos
  useEffect(() => {
    setConfirmRemoveDocId(null);
    setUploadError(null);
    if (visibleDocuments.length === 0) {
      setSelectedDocId(null);
      return;
    }
    if (!selectedDocId || !visibleDocuments.some((item) => item.doc.id === selectedDocId)) {
      setSelectedDocId(visibleDocuments[0].doc.id);
    }
  }, [visibleDocuments, selectedDocId]);

  const activeDocEntry = useMemo(() => {
    if (!selectedDocId) return visibleDocuments[0] || null;
    return (
      visibleDocuments.find((item) => item.doc.id === selectedDocId) ||
      visibleDocuments[0] ||
      null
    );
  }, [visibleDocuments, selectedDocId]);

  // Converte data:application/pdf;base64 em Blob URL para visualização embutida confiável
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const rawUrl = activeDocEntry?.doc.url;
    if (!rawUrl) {
      setResolvedPreviewUrl(null);
      return;
    }
    const { resolvedUrl, revoke } = dataUrlToBlobUrl(rawUrl);
    setResolvedPreviewUrl(resolvedUrl);
    return () => {
      if (revoke) URL.revokeObjectURL(resolvedUrl);
    };
  }, [activeDocEntry?.doc.url]);

  const [resolvedExpandedUrl, setResolvedExpandedUrl] = useState<string | null>(
    null
  );
  useEffect(() => {
    const rawUrl = expandedPdfDoc?.doc.url;
    if (!rawUrl) {
      setResolvedExpandedUrl(null);
      return;
    }
    const { resolvedUrl, revoke } = dataUrlToBlobUrl(rawUrl);
    setResolvedExpandedUrl(resolvedUrl);
    return () => {
      if (revoke) URL.revokeObjectURL(resolvedUrl);
    };
  }, [expandedPdfDoc?.doc.url]);

  const scrollToDetailOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  };

  const handleAttachPdfToActive = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeAppointment) return;
    setUploadError(null);
    setIsUploadingPdf(true);
    try {
      const uploaded: AppointmentDocument[] = [];
      for (const file of Array.from(files)) {
        const doc = await uploadPdfDocumentFile(file);
        uploaded.push(doc);
      }
      const nextDocs = [...(activeAppointment.documents || []), ...uploaded];
      onUpdateAppointment({
        ...activeAppointment,
        descriptionMode:
          activeAppointment.entryType === 'commitment'
            ? activeAppointment.descriptionMode
            : 'complete',
        documents: nextDocs,
      });
      if (uploaded[0]) {
        setSelectedDocId(uploaded[0].id);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Erro ao anexar arquivo PDF.'
      );
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  };

  const handleRemoveDocument = (targetAppt: Appointment, docId: string) => {
    const remaining = (targetAppt.documents || []).filter((d) => d.id !== docId);
    onUpdateAppointment({
      ...targetAppt,
      documents: remaining,
    });
    setConfirmRemoveDocId(null);
    if (expandedPdfDoc?.doc.id === docId) {
      setExpandedPdfDoc(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO EDITORIAL DA ABA MASTER */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-semibold text-[#1D4ED8] tracking-wide">
            Exclusivo da Conta Master
          </p>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1 leading-tight">
            Detalhes das Agendas, Clientes & Documentação PDF
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-[68ch] leading-relaxed">
            Consulte cada atendimento ou histórico completo por cliente com visualização imediata dos arquivos PDF anexados ao dossiê.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenNewCommitment}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <CalendarPlus className="w-4 h-4 text-[#1D4ED8]" />
            <span>Novo Compromisso</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewAppointment}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2545]"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Atendimento</span>
          </button>
        </div>
      </header>

      {/* FAIXA DE INDICADORES EM GRADE LIMPA (DIVISÓRIAS 1PX, SEM CAIXAS ANINHADAS) */}
      <section
        aria-label="Resumo de agendas e documentações"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500">Total na Agenda</p>
          <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
            {stats.totalAgendas}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">registros cadastrados</p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500">Clientes Únicos</p>
          <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
            {stats.uniqueClients}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">fichas identificadas</p>
        </div>

        <button
          type="button"
          onClick={() =>
            setQuickFilter((prev) => (prev === 'with-pdf' ? 'all' : 'with-pdf'))
          }
          className={`p-4 sm:p-5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8] ${
            quickFilter === 'with-pdf' ? 'bg-blue-50/80' : 'hover:bg-slate-50'
          }`}
        >
          <p className="text-xs text-[#1D4ED8] font-medium">
            Agendas com PDF {quickFilter === 'with-pdf' ? '(filtrado)' : ''}
          </p>
          <p className="text-2xl font-bold text-[#1D4ED8] font-mono-tabular mt-1">
            {stats.withPdfCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">clique para filtrar</p>
        </button>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500">Documentos PDF</p>
          <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
            {stats.totalPdfCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">arquivos prontos para leitura</p>
        </div>
      </section>

      {/* BARRA DE CONTROLE: MODO DE VISUALIZAÇÃO + FILTROS + BUSCA */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Modo de organização: Por Agendamento vs Por Cliente */}
          <div
            role="tablist"
            aria-label="Modo de visualização dos dossiês"
            className="inline-flex p-1 bg-white border border-slate-200 rounded-xl self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'agendas'}
              onClick={() => setViewMode('agendas')}
              className={`min-h-[40px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-2 ${
                viewMode === 'agendas'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Por Agendamento ({filteredAppointments.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'clients'}
              onClick={() => {
                setViewMode('clients');
                if (quickFilter === 'commitments') setQuickFilter('all');
              }}
              className={`min-h-[40px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-2 ${
                viewMode === 'clients'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Por Cliente ({clientGroups.length})</span>
            </button>
          </div>

          {/* Busca abrangente (inclui nome do arquivo PDF) */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, CPF, protocolo ou PDF..."
              aria-label="Buscar cliente, CPF, protocolo ou nome de arquivo PDF"
              className="w-full min-h-[44px] pl-10 pr-9 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8] focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-[#0B2545] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros rápidos de corte */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'with-pdf', label: `Com PDFs (${stats.withPdfCount})` },
              ...(viewMode === 'agendas'
                ? [
                    { id: 'clients' as const, label: 'Clientes' },
                    { id: 'commitments' as const, label: 'Compromissos' },
                  ]
                : []),
              { id: 'upcoming', label: 'Próximos' },
              { id: 'completed', label: 'Realizados' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setQuickFilter(f.id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                quickFilter === f.id
                  ? 'bg-[#0B2545] text-[#FACC15] border-[#0B2545]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#134074] hover:text-[#0B2545]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* PAINEL ASSIMÉTRICO MASTER-DETAIL (5 COLS LISTA / 7 COLS DOSSIÊ + LEITOR PDF) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: LISTA SELECIONÁVEL */}
        <section
          aria-label={
            viewMode === 'agendas' ? 'Lista de agendas' : 'Lista de clientes'
          }
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-[#0B2545]">
              {viewMode === 'agendas'
                ? 'Agendas Registradas'
                : 'Carteira de Clientes'}
            </h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              {viewMode === 'agendas'
                ? `${filteredAppointments.length} itens`
                : `${clientGroups.length} clientes`}
            </span>
          </div>

          {viewMode === 'agendas' ? (
            filteredAppointments.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-[#0B2545]">
                  Nenhum agendamento encontrado
                </p>
                <p className="text-xs text-slate-500">
                  Ajuste o filtro ou a busca, ou cadastre um novo atendimento.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 max-h-[760px] overflow-y-auto">
                {filteredAppointments.map((appt) => {
                  const isSelected = activeAppointment?.id === appt.id;
                  const docsCount = appt.documents?.length || 0;
                  const isCommitment = appt.entryType === 'commitment';
                  const statusMeta = STATUS_META[appt.status];

                  return (
                    <li key={appt.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAppointmentId(appt.id);
                          scrollToDetailOnMobile();
                        }}
                        className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8] ${
                          isSelected
                            ? 'bg-[#0B2545] text-white'
                            : 'bg-white hover:bg-slate-50 text-[#0F172A]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-semibold truncate ${
                                isSelected ? 'text-white' : 'text-[#0B2545]'
                              }`}
                            >
                              {appt.clientName}
                            </p>
                            <div
                              className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs mt-1 ${
                                isSelected ? 'text-slate-200' : 'text-slate-600'
                              }`}
                            >
                              <span className="font-mono-tabular">
                                {formatDateShortBR(appt.date)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {appt.startTime}–{appt.endTime}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  isSelected
                                    ? 'text-[#FACC15] font-medium'
                                    : `${statusMeta.textClass} font-medium`
                                }
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                          </div>

                          {docsCount > 0 && (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold shrink-0 pt-0.5 ${
                                isSelected ? 'text-[#FACC15]' : 'text-[#1D4ED8]'
                              }`}
                              title={`${docsCount} PDF(s) anexado(s)`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                {docsCount} {docsCount === 1 ? 'PDF' : 'PDFs'}
                              </span>
                            </span>
                          )}
                        </div>

                        <div
                          className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-2 ${
                            isSelected ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          <span className="font-mono-tabular">{appt.code}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">
                            {isCommitment
                              ? `Compromisso · ${appt.commitmentCategory || appt.serviceName}`
                              : appt.clientCpf || appt.clientPhone || appt.serviceName}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : clientGroups.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-[#0B2545]">
                Nenhum cliente encontrado
              </p>
              <p className="text-xs text-slate-500">
                Quando houver atendimentos com clientes, o histórico consolidado aparecerá aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 max-h-[760px] overflow-y-auto">
              {clientGroups.map((group) => {
                const isSelected = activeClientGroup?.key === group.key;
                const docsCount = group.documents.length;

                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientKey(group.key);
                        setSelectedAppointmentId(group.appointments[0]?.id || null);
                        scrollToDetailOnMobile();
                      }}
                      className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8] ${
                        isSelected
                          ? 'bg-[#0B2545] text-white'
                          : 'bg-white hover:bg-slate-50 text-[#0F172A]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isSelected ? 'text-white' : 'text-[#0B2545]'
                            }`}
                          >
                            {group.name}
                          </p>
                          <div
                            className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs mt-1 ${
                              isSelected ? 'text-slate-200' : 'text-slate-600'
                            }`}
                          >
                            <span className="font-mono-tabular">
                              {group.appointments.length}{' '}
                              {group.appointments.length === 1
                                ? 'agenda'
                                : 'agendas'}
                            </span>
                            {group.cpf && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular">{group.cpf}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {docsCount > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold shrink-0 pt-0.5 ${
                              isSelected ? 'text-[#FACC15]' : 'text-[#1D4ED8]'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              {docsCount} {docsCount === 1 ? 'PDF' : 'PDFs'}
                            </span>
                          </span>
                        )}
                      </div>

                      <div
                        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-2 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span className="font-mono-tabular">
                          Último: {formatDateShortBR(group.latestDate)} às {group.latestTime}
                        </span>
                        {group.phone && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">{group.phone}</span>
                          </>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* COLUNA DIREITA: DOSSIÊ DETALHADO + LEITOR EMBUTIDO DE PDF */}
        <section
          ref={detailPanelRef}
          aria-label="Dossiê detalhado e visualização de PDFs"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          {!activeAppointment ? (
            <div className="p-10 text-center space-y-3">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <h2 className="font-editorial text-xl font-semibold text-[#0B2545]">
                Selecione uma agenda ou cliente
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Os dados completos do cliente, relato do caso e todos os documentos PDF anexados aparecerão aqui para leitura direta.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {/* 1. CABEÇALHO DO DOSSIÊ */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-[#0B2545]">
                        {activeAppointment.code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeAppointment.entryType === 'commitment'
                          ? 'Compromisso de Agenda'
                          : 'Atendimento com Cliente'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          STATUS_META[activeAppointment.status].textClass
                        }`}
                      >
                        {STATUS_META[activeAppointment.status].label}
                      </span>
                    </div>

                    <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1 leading-tight break-words">
                      {activeAppointment.clientName}
                    </h2>

                    <p className="text-sm text-slate-600 mt-1">
                      {formatDateLongBR(activeAppointment.date)} ·{' '}
                      <span className="font-mono-tabular font-semibold text-[#0B2545]">
                        {activeAppointment.startTime}–{activeAppointment.endTime}
                      </span>{' '}
                      <span className="font-mono-tabular text-slate-500">
                        ({activeAppointment.durationMinutes} min)
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(() => {
                      const clientReminderUrl =
                        buildClientWhatsAppReminderUrl(activeAppointment);
                      if (!clientReminderUrl) return null;
                      return (
                        <a
                          href={clientReminderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#15803D] bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>Enviar Lembrete ao Cliente</span>
                        </a>
                      );
                    })()}
                    {activeAppointment.entryType !== 'commitment' &&
                      activeAppointment.clientPhone && (
                        <a
                          href={buildWhatsAppVoucherUrl(activeAppointment)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap"
                          title="Enviar comprovante para o WhatsApp do escritório"
                        >
                          <MessageCircle className="w-4 h-4 text-[#1D4ED8]" />
                          <span>WhatsApp Escritório</span>
                        </a>
                      )}
                    <button
                      type="button"
                      onClick={() => onEditAppointment(activeAppointment)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Edit3 className="w-4 h-4 text-[#1D4ED8]" />
                      <span>Editar Ficha</span>
                    </button>
                  </div>
                </div>

                {/* Controle rápido de status pelo Master */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-slate-500 mr-1">Status:</span>
                  {(
                    ['confirmed', 'pending', 'completed', 'cancelled'] as AppointmentStatus[]
                  ).map((st) => {
                    const isActive = activeAppointment.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          onUpdateAppointmentStatus(activeAppointment.id, st)
                        }
                        className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? `${STATUS_META[st].activeBg} border-transparent`
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-[#0B2545]'
                        }`}
                      >
                        {STATUS_META[st].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SELETOR DE HISTÓRICO QUANDO O CLIENTE TEM MÚLTIPLOS AGENDAMENTOS (MODO POR CLIENTE) */}
              {viewMode === 'clients' &&
                activeClientGroup &&
                activeClientGroup.appointments.length > 1 && (
                  <div className="px-5 sm:px-6 py-4 bg-slate-50/70 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-[#0B2545]">
                        Histórico de Agendamentos deste Cliente (
                        {activeClientGroup.appointments.length})
                      </h3>
                      <span className="text-xs text-slate-500">
                        Clique para alternar a pauta exibida
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeClientGroup.appointments.map((item) => {
                        const selected = item.id === activeAppointment.id;
                        const itemDocs = item.documents?.length || 0;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedAppointmentId(item.id)}
                            className={`min-h-[40px] px-3 py-1.5 text-xs rounded-xl border transition-colors cursor-pointer text-left ${
                              selected
                                ? 'bg-[#0B2545] text-white border-[#0B2545]'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-[#134074]'
                            }`}
                          >
                            <span className="font-mono-tabular font-semibold">
                              {formatDateShortBR(item.date)} · {item.startTime}
                            </span>
                            <span className="mx-1.5 opacity-60">·</span>
                            <span
                              className={
                                selected
                                  ? 'text-[#FACC15]'
                                  : STATUS_META[item.status].textClass
                              }
                            >
                              {STATUS_META[item.status].label}
                            </span>
                            {itemDocs > 0 && (
                              <span
                                className={`ml-1.5 font-mono-tabular ${
                                  selected ? 'text-blue-200' : 'text-[#1D4ED8]'
                                }`}
                              >
                                ({itemDocs} PDF)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 2. DADOS CADASTRAIS DO CLIENTE OU DO COMPROMISSO */}
              <div className="p-5 sm:p-6">
                <h3 className="text-xs font-bold text-[#0B2545] mb-3">
                  {activeAppointment.entryType === 'commitment'
                    ? 'Detalhes do Compromisso'
                    : 'Dados Cadastrais do Cliente'}
                </h3>

                {activeAppointment.entryType === 'commitment' ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Categoria</dt>
                      <dd className="font-medium text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                        <span>
                          {activeAppointment.commitmentCategory ||
                            activeAppointment.serviceName}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Responsável</dt>
                      <dd className="font-medium text-[#0B2545] mt-0.5">
                        {activeAppointment.lawyerName || 'Fernandes & Lins'}
                      </dd>
                    </div>
                    {activeAppointment.location && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-slate-500">Local / Link</dt>
                        <dd className="font-medium text-[#0B2545] mt-0.5 flex items-start gap-1.5">
                          <MapPin className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                          <span className="break-words">
                            {activeAppointment.location}
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">CPF</dt>
                      <dd className="font-mono-tabular font-medium text-[#0B2545] mt-0.5">
                        {activeAppointment.clientCpf || 'Não informado'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Telefone / WhatsApp</dt>
                      <dd className="font-mono-tabular font-medium text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {activeAppointment.clientPhone || 'Não informado'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">E-mail</dt>
                      <dd className="font-medium text-[#0B2545] mt-0.5 flex items-center gap-1.5 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {activeAppointment.clientEmail || 'Não informado'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        Atendimento & Responsável
                      </dt>
                      <dd className="font-medium text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {activeAppointment.serviceName} ·{' '}
                          {activeAppointment.lawyerName || 'Fernandes & Lins'}
                        </span>
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Endereço</dt>
                      <dd className="font-medium text-[#0B2545] mt-0.5 flex items-start gap-1.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          {activeAppointment.clientAddress || 'Não informado'}
                        </span>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              {/* 3. RELATO DO CASO / OBSERVAÇÕES */}
              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-[#0B2545]">
                    {activeAppointment.entryType === 'commitment'
                      ? 'Observações do Compromisso'
                      : activeAppointment.descriptionMode === 'complete'
                      ? 'Descrição Completa do Caso'
                      : 'Assunto / Descrição Breve'}
                  </h3>
                  <span className="text-xs font-mono-tabular text-slate-400">
                    Registrado em {formatDateShortBR(activeAppointment.createdAt.slice(0, 10))}
                  </span>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line max-w-[68ch]">
                  {activeAppointment.descriptionMode === 'complete'
                    ? activeAppointment.caseDescription ||
                      activeAppointment.briefSubject ||
                      'Sem relato detalhado registrado.'
                    : activeAppointment.briefSubject ||
                      activeAppointment.caseDescription ||
                      'Sem observações informadas.'}
                </p>

                {activeAppointment.completedNotes && (
                  <div className="pt-3 mt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-[#15803D] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Registro de Conclusão</span>
                    </p>
                    <p className="text-sm text-slate-700 mt-1 leading-relaxed whitespace-pre-line max-w-[68ch]">
                      {activeAppointment.completedNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* 4. DOCUMENTAÇÕES EM PDF COM LEITOR INTEGRADO NA TELA */}
              <div className="p-5 sm:p-6 space-y-4 bg-slate-50/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#0B2545] flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-[#1D4ED8]" />
                      <span>
                        Documentação em PDF (
                        <span className="font-mono-tabular">
                          {visibleDocuments.length}
                        </span>
                        )
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {viewMode === 'clients' && activeClientGroup
                        ? `Todos os documentos anexados nas agendas de ${activeClientGroup.name}.`
                        : 'Os arquivos PDF anexados a este atendimento abrem diretamente abaixo.'}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      multiple
                      onChange={(e) => void handleAttachPdfToActive(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingPdf}
                      onClick={() => pdfInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#1D4ED8]" />
                      <span>
                        {isUploadingPdf ? 'Anexando PDF...' : 'Anexar PDF'}
                      </span>
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {visibleDocuments.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-[#0B2545]">
                      Nenhum PDF anexado a este dossiê
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Caso o cliente entregue documentos, procurações ou comprovantes em PDF, anexe aqui para visualizar a qualquer momento.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={isUploadingPdf}
                        onClick={() => pdfInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-xs font-bold text-[#FACC15] bg-[#0B2545] hover:bg-[#134074] rounded-xl transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Anexar Primeiro PDF</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* LISTA DE ARQUIVOS PDF DO DOSSIÊ */}
                    <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl overflow-hidden">
                      {visibleDocuments.map(({ doc, appointment }) => {
                        const isSelectedDoc = activeDocEntry?.doc.id === doc.id;
                        const isConfirmingRemove = confirmRemoveDocId === doc.id;

                        return (
                          <li
                            key={doc.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                              isSelectedDoc ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedDocId(doc.id)}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-lg"
                            >
                              <FileText
                                className={`w-5 h-5 shrink-0 ${
                                  isSelectedDoc
                                    ? 'text-[#1D4ED8]'
                                    : 'text-slate-400'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#0B2545] truncate">
                                  {doc.name}
                                </p>
                                <p className="text-xs text-slate-500 font-mono-tabular flex flex-wrap items-center gap-x-1.5">
                                  <span>{formatFileSize(doc.size)}</span>
                                  {viewMode === 'clients' && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        {appointment.code} (
                                        {formatDateShortBR(appointment.date)})
                                      </span>
                                    </>
                                  )}
                                  {isSelectedDoc && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-[#1D4ED8] font-sans font-semibold">
                                        Em exibição abaixo
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                              {isConfirmingRemove ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveDocument(appointment, doc.id)
                                    }
                                    className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Confirmar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveDocId(null)}
                                    className="min-h-[38px] px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-[#0B2545] rounded-lg cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDocId(doc.id);
                                      setExpandedPdfDoc({
                                        doc,
                                        ownerLabel: appointment.clientName,
                                        appointmentCode: appointment.code,
                                      });
                                    }}
                                    title="Expandir PDF em tela cheia"
                                    aria-label={`Expandir ${doc.name}`}
                                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 hover:text-[#1D4ED8] hover:bg-white rounded-lg border border-transparent hover:border-slate-200 cursor-pointer"
                                  >
                                    <Maximize2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveDocId(doc.id)}
                                    title="Remover PDF"
                                    aria-label={`Remover ${doc.name}`}
                                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-red-200 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* VISUALIZADOR EMBUTIDO DO PDF SELECIONADO (CANVAS PDF.JS — SEM BLOQUEIO NO BRAVE/CHROME) */}
                    {activeDocEntry && (
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#0B2545] truncate">
                              {activeDocEntry.doc.name}
                            </p>
                            <p className="text-xs text-slate-500 font-mono-tabular">
                              {formatFileSize(activeDocEntry.doc.size)} ·{' '}
                              {activeDocEntry.appointment.code}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPdfDoc({
                                  doc: activeDocEntry.doc,
                                  ownerLabel: activeDocEntry.appointment.clientName,
                                  appointmentCode: activeDocEntry.appointment.code,
                                })
                              }
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Maximize2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                              <span>Tela Cheia</span>
                            </button>
                            <a
                              href={resolvedPreviewUrl || activeDocEntry.doc.url}
                              download={activeDocEntry.doc.name}
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-bold text-[#FACC15] bg-[#0B2545] hover:bg-[#134074] rounded-lg transition-colors whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Baixar PDF</span>
                            </a>
                          </div>
                        </div>

                        <PdfCanvasViewer
                          url={activeDocEntry.doc.url}
                          fileName={activeDocEntry.doc.name}
                          downloadUrl={resolvedPreviewUrl || activeDocEntry.doc.url}
                          heightClass="h-[480px] sm:h-[560px]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* MODAL TELA CHEIA PARA LEITURA CONFORTÁVEL DE PDF */}
      {expandedPdfDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Leitura em tela cheia de ${expandedPdfDoc.doc.name}`}
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-3 sm:p-6"
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0B2545] truncate">
                  {expandedPdfDoc.doc.name}
                </p>
                <p className="text-xs text-slate-500">
                  {expandedPdfDoc.ownerLabel} ·{' '}
                  <span className="font-mono-tabular">
                    {expandedPdfDoc.appointmentCode}
                  </span>{' '}
                  ·{' '}
                  <span className="font-mono-tabular">
                    {formatFileSize(expandedPdfDoc.doc.size)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={resolvedExpandedUrl || expandedPdfDoc.doc.url}
                  download={expandedPdfDoc.doc.name}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-bold text-[#FACC15] bg-[#0B2545] hover:bg-[#134074] rounded-xl transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => setExpandedPdfDoc(null)}
                  aria-label="Fechar visualização em tela cheia"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-[#0B2545] bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <PdfCanvasViewer
                url={expandedPdfDoc.doc.url}
                fileName={expandedPdfDoc.doc.name}
                downloadUrl={resolvedExpandedUrl || expandedPdfDoc.doc.url}
                heightClass="flex-1 min-h-0 h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
