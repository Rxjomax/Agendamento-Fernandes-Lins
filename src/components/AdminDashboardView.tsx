import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  BarChart3,
  Bookmark,
  Briefcase,
  Calendar,
  CalendarPlus,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Shield,
  Sliders,
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
  AvailabilityConfig,
  DescriptionMode,
  EntryType,
  RegisteredUser,
  ServiceItem,
  ServiceStatus,
  UserRole,
} from '../types/scheduling';
import {
  buildEmailVoucherContent,
  buildWhatsAppVoucherUrl,
} from '../utils/notificationLinks';
import { FIRM_INFO } from '../data/seedData';
import {
  calculateEndTime,
  formatCPF,
  formatDateShortBR,
  formatFileSize,
  formatPhoneBR,
  isValidCPF,
  toDateISO,
} from '../utils/timeSlots';
import { AdminReportsView } from './AdminReportsView';
import { AdminAvailabilityView } from './AdminAvailabilityView';
import { AdminMasterDossierView } from './AdminMasterDossierView';
import { BrandMark } from './BrandMark';
import { processAndUploadImageFile } from '../utils/imageUpload';
import { uploadPdfDocumentFile } from '../utils/pdfUpload';

export type AdminTabType =
  | 'appointments'
  | 'completed'
  | 'dossiers'
  | 'services'
  | 'availability'
  | 'users'
  | 'reports'
  | 'analytics';

interface AdminDashboardViewProps {
  currentUserRole: UserRole;
  activeSubTab: AdminTabType;
  onChangeSubTab: (tab: AdminTabType) => void;
  services: ServiceItem[];
  appointments: Appointment[];
  availability: AvailabilityConfig;
  registeredUsers: RegisteredUser[];
  analyticsEvents: Array<{
    id: string;
    event: string;
    page: string;
    detail: string;
    timestamp: string;
  }>;
  onSaveService: (service: Omit<ServiceItem, 'id'>, existingId?: string) => void;
  onDeleteService: (id: string) => void;
  onToggleServiceStatus: (id: string) => void;
  onUpdateAvailability: (
    config: AvailabilityConfig,
    toastTitle?: string,
    toastDesc?: string
  ) => void;
  onUpdateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  onUpdateAppointment: (updated: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
  onCreateAppointment: (
    appt: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'endTime'>
  ) => void;
  onCreateUserByAdmin: (newUser: Omit<RegisteredUser, 'id' | 'createdAt'>) => {
    success: boolean;
    error?: string;
  };
  onToggleUserRole: (id: string) => void;
  onDeleteUser: (id: string) => void;
  onResetDemoData: () => void;
  onImportTemplateServices?: () => void;
  onOpenClientView: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUserRole,
  activeSubTab,
  onChangeSubTab,
  services,
  appointments,
  availability,
  registeredUsers,
  analyticsEvents,
  onSaveService,
  onDeleteService,
  onToggleServiceStatus,
  onUpdateAvailability,
  onUpdateAppointmentStatus,
  onUpdateAppointment,
  onDeleteAppointment,
  onCreateAppointment,
  onCreateUserByAdmin,
  onToggleUserRole,
  onDeleteUser,
  onResetDemoData,
  onImportTemplateServices,
  onOpenClientView,
}) => {
  const isMaster = currentUserRole === 'master';

  // Garante que usuário Staff não acesse abas exclusivas do Master
  useEffect(() => {
    if (
      !isMaster &&
      activeSubTab !== 'appointments' &&
      activeSubTab !== 'completed'
    ) {
      onChangeSubTab('appointments');
    }
  }, [isMaster, activeSubTab, onChangeSubTab]);

  // --- Filtros de Atendimentos ---
  const [statusFilter, setStatusFilter] = useState<'upcoming' | 'all' | AppointmentStatus>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [inspectingAppointment, setInspectingAppointment] = useState<Appointment | null>(null);

  // Form Novo / Editar Agendamento Manual ou Compromisso
  const [manualEntryType, setManualEntryType] = useState<EntryType>('client');
  const [manualServiceId, setManualServiceId] = useState(services[0]?.id || '');
  const [manualDate, setManualDate] = useState(toDateISO(new Date()));
  const [manualTime, setManualTime] = useState('10:00');
  const [manualDurationMinutes, setManualDurationMinutes] = useState<number>(60);
  const [manualCommitmentCategory, setManualCommitmentCategory] =
    useState<string>('Compromisso');
  const [manualLocation, setManualLocation] = useState('');
  const [manualNotifyByEmail, setManualNotifyByEmail] = useState(false);
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientPhone, setManualClientPhone] = useState('');
  const [manualClientCpf, setManualClientCpf] = useState('');
  const [manualClientAddress, setManualClientAddress] = useState('');
  const [manualClientEmail, setManualClientEmail] = useState('');
  const [manualStatus, setManualStatus] = useState<AppointmentStatus>('confirmed');
  const [manualDescMode, setManualDescMode] = useState<DescriptionMode>('complete');
  const [manualCaseDescription, setManualCaseDescription] = useState('');
  const [manualBriefSubject, setManualBriefSubject] = useState('');
  const [manualDocuments, setManualDocuments] = useState<AppointmentDocument[]>([]);
  const [isUploadingManualPdf, setIsUploadingManualPdf] = useState(false);
  const [manualFormError, setManualFormError] = useState<string | null>(null);
  const manualPdfInputRef = useRef<HTMLInputElement | null>(null);

  // --- Modal e Estados de Conclusão de Atendimento ---
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completingAppointment, setCompletingAppointment] = useState<Appointment | null>(null);
  const [completeNotes, setCompleteNotes] = useState('');

  // --- Filtros Específicos da Aba "Realizados" ---
  const [completedSearchQuery, setCompletedSearchQuery] = useState('');
  const [completedPeriodFilter, setCompletedPeriodFilter] = useState<
    'all' | 'today' | 'week' | 'month'
  >('all');

  // --- Modal CRUD de Áreas & Advogados ---
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | undefined>(undefined);
  const [srvName, setSrvName] = useState('');
  const [srvDescription, setSrvDescription] = useState('');
  const [srvDuration, setSrvDuration] = useState<number>(45);
  const [srvStatus, setSrvStatus] = useState<ServiceStatus>('active');
  const [srvCategory, setSrvCategory] = useState('Fernandes & Lins');
  const [srvSpecialist, setSrvSpecialist] = useState('Fernandes & Lins');
  const [srvImageUrl, setSrvImageUrl] = useState('');
  const [isUploadingSrvPhoto, setIsUploadingSrvPhoto] = useState(false);

  // --- Aba de Contas (Master & Equipe) ---
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserOab, setNewUserOab] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('123456');
  const [newUserRole, setNewUserRole] = useState<UserRole>('staff');
  const [newUserAvatarUrl, setNewUserAvatarUrl] = useState('');
  const [isUploadingUserPhoto, setIsUploadingUserPhoto] = useState(false);
  const [newUserError, setNewUserError] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const confirmed = appointments.filter((a) => a.status === 'confirmed');
    const pending = appointments.filter((a) => a.status === 'pending');
    const completed = appointments.filter((a) => a.status === 'completed');
    const cancelled = appointments.filter((a) => a.status === 'cancelled');

    const totalDocs = appointments.reduce(
      (acc, a) => acc + (a.documents?.length || 0),
      0
    );
    const completedDocsCount = completed.filter(
      (a) => (a.documents?.length || 0) > 0
    ).length;
    const completedHours = Math.round(
      (completed.reduce((acc, a) => acc + a.durationMinutes, 0) / 60) * 10
    ) / 10;

    return {
      totalCount: appointments.length,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      totalDocs,
      completedDocsCount,
      completedHours,
    };
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((appt) => {
        if (statusFilter === 'upcoming') {
          if (appt.status === 'cancelled' || appt.status === 'completed') return false;
        } else if (statusFilter !== 'all' && appt.status !== statusFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const digits = q.replace(/\D/g, '');
          return (
            appt.clientName.toLowerCase().includes(q) ||
            appt.serviceName.toLowerCase().includes(q) ||
            (appt.commitmentCategory || '').toLowerCase().includes(q) ||
            (appt.location || '').toLowerCase().includes(q) ||
            (appt.lawyerName || '').toLowerCase().includes(q) ||
            appt.clientPhone.toLowerCase().includes(q) ||
            (appt.clientCpf || '').toLowerCase().includes(q) ||
            (digits.length >= 3 && (appt.clientCpf || '').replace(/\D/g, '').includes(digits)) ||
            appt.code.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const cmpDate = a.date.localeCompare(b.date);
        if (cmpDate !== 0) return cmpDate;
        return a.startTime.localeCompare(b.startTime);
      });
  }, [appointments, statusFilter, searchQuery]);

  const filteredCompletedAppointments = useMemo(() => {
    const todayISO = toDateISO(new Date());
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = toDateISO(sevenDaysAgo);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = toDateISO(thirtyDaysAgo);

    return appointments
      .filter((appt) => {
        if (appt.status !== 'completed') return false;
        if (completedPeriodFilter === 'today' && appt.date !== todayISO) return false;
        if (completedPeriodFilter === 'week' && appt.date < sevenDaysAgoISO) return false;
        if (completedPeriodFilter === 'month' && appt.date < thirtyDaysAgoISO) return false;

        if (completedSearchQuery.trim()) {
          const q = completedSearchQuery.toLowerCase();
          const matchNotes =
            appt.completedNotes?.toLowerCase().includes(q) ||
            appt.caseDescription?.toLowerCase().includes(q) ||
            appt.briefSubject?.toLowerCase().includes(q);
          return (
            appt.clientName.toLowerCase().includes(q) ||
            appt.serviceName.toLowerCase().includes(q) ||
            (appt.lawyerName || '').toLowerCase().includes(q) ||
            (appt.clientCpf || '').toLowerCase().includes(q) ||
            appt.clientPhone.toLowerCase().includes(q) ||
            appt.code.toLowerCase().includes(q) ||
            Boolean(matchNotes)
          );
        }

        return true;
      })
      .sort((a, b) => {
        const cmpDate = b.date.localeCompare(a.date);
        if (cmpDate !== 0) return cmpDate;
        return b.startTime.localeCompare(a.startTime);
      });
  }, [appointments, completedPeriodFilter, completedSearchQuery]);

  const openCompleteAppointmentModal = (appt: Appointment) => {
    setCompletingAppointment(appt);
    setCompleteNotes(appt.completedNotes || '');
    setIsCompleteModalOpen(true);
  };

  const handleConfirmCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingAppointment) return;

    onUpdateAppointment({
      ...completingAppointment,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedNotes: completeNotes.trim() || 'Atendimento jurídico concluído.',
    });

    setIsCompleteModalOpen(false);
    setCompletingAppointment(null);
    setCompleteNotes('');
  };

  const filteredUsers = useMemo(() => {
    return registeredUsers.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.toLowerCase().includes(q) ||
          (u.oab || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [registeredUsers, userRoleFilter, userSearchQuery]);

  const openNewAppointmentModal = () => {
    setEditingAppointment(null);
    setManualEntryType('client');
    setManualServiceId(services[0]?.id || '');
    setManualDate(toDateISO(new Date()));
    setManualTime('10:00');
    setManualDurationMinutes(services[0]?.durationMinutes || 45);
    setManualCommitmentCategory('Compromisso');
    setManualLocation('');
    setManualNotifyByEmail(false);
    setManualClientName('');
    setManualClientPhone('');
    setManualClientCpf('');
    setManualClientAddress('');
    setManualClientEmail('');
    setManualStatus('confirmed');
    setManualDescMode('complete');
    setManualCaseDescription('');
    setManualBriefSubject('');
    setManualDocuments([]);
    setManualFormError(null);
    setIsManualModalOpen(true);
  };

  const openNewCommitmentModal = () => {
    setEditingAppointment(null);
    setManualEntryType('commitment');
    setManualServiceId(services[0]?.id || '');
    setManualDate(toDateISO(new Date()));
    setManualTime('10:00');
    setManualDurationMinutes(60);
    setManualCommitmentCategory('Compromisso');
    setManualLocation('');
    setManualNotifyByEmail(false);
    setManualClientName('');
    setManualClientPhone('');
    setManualClientCpf('');
    setManualClientAddress('');
    setManualClientEmail('');
    setManualStatus('confirmed');
    setManualDescMode('brief');
    setManualCaseDescription('');
    setManualBriefSubject('');
    setManualDocuments([]);
    setManualFormError(null);
    setIsManualModalOpen(true);
  };

  const openEditAppointmentModal = (appt: Appointment) => {
    setEditingAppointment(appt);
    setManualEntryType(appt.entryType === 'commitment' ? 'commitment' : 'client');
    setManualServiceId(appt.serviceId);
    setManualDate(appt.date);
    setManualTime(appt.startTime);
    setManualDurationMinutes(appt.durationMinutes || 60);
    setManualCommitmentCategory(appt.commitmentCategory || appt.serviceName || 'Compromisso');
    setManualLocation(appt.location || '');
    setManualNotifyByEmail(Boolean(appt.notifyByEmail));
    setManualClientName(appt.clientName);
    setManualClientPhone(appt.clientPhone);
    setManualClientCpf(appt.clientCpf || '');
    setManualClientAddress(appt.clientAddress || '');
    setManualClientEmail(appt.clientEmail || '');
    setManualStatus(appt.status);
    setManualDescMode(appt.descriptionMode || 'complete');
    setManualCaseDescription(appt.caseDescription || '');
    setManualBriefSubject(appt.briefSubject || '');
    setManualDocuments(appt.documents || []);
    setManualFormError(null);
    setIsManualModalOpen(true);
  };

  const handleManualPdfUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setManualFormError(null);
    setIsUploadingManualPdf(true);
    try {
      const uploadedList: AppointmentDocument[] = [];
      for (const file of Array.from(files)) {
        const doc = await uploadPdfDocumentFile(file);
        uploadedList.push(doc);
      }
      setManualDocuments((prev) => [...prev, ...uploadedList]);
    } catch (err) {
      setManualFormError(
        err instanceof Error ? err.message : 'Erro ao anexar arquivo PDF.'
      );
    } finally {
      setIsUploadingManualPdf(false);
    }
  };

  const handleManualAppointmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualFormError(null);

    if (manualEntryType === 'commitment') {
      if (manualClientName.trim().length < 2) {
        setManualFormError('Informe o título do compromisso.');
        return;
      }
      if (!manualDate || !manualTime) {
        setManualFormError('Informe a data e o horário do compromisso.');
        return;
      }

      const srvId = services[0]?.id || 'srv-atendimento-juridico';
      const duration = Math.max(15, Number(manualDurationMinutes) || 60);

      if (editingAppointment) {
        onUpdateAppointment({
          ...editingAppointment,
          entryType: 'commitment',
          commitmentCategory: manualCommitmentCategory,
          location: manualLocation.trim() || undefined,
          notifyByEmail: manualNotifyByEmail,
          serviceId: srvId,
          serviceName: manualCommitmentCategory,
          lawyerName: 'Fernandes & Lins',
          durationMinutes: duration,
          price: 0,
          date: manualDate,
          startTime: manualTime,
          endTime: calculateEndTime(manualTime, duration),
          clientName: manualClientName.trim(),
          clientPhone: '',
          clientCpf: '',
          clientAddress: '',
          clientEmail: '',
          descriptionMode: 'brief',
          caseDescription: undefined,
          briefSubject: manualBriefSubject.trim() || manualCommitmentCategory,
          documents: [],
          status: manualStatus,
        });
      } else {
        onCreateAppointment({
          entryType: 'commitment',
          commitmentCategory: manualCommitmentCategory,
          location: manualLocation.trim() || undefined,
          notifyByEmail: manualNotifyByEmail,
          serviceId: srvId,
          serviceName: manualCommitmentCategory,
          lawyerName: 'Fernandes & Lins',
          durationMinutes: duration,
          price: 0,
          date: manualDate,
          startTime: manualTime,
          clientName: manualClientName.trim(),
          clientPhone: '',
          clientCpf: '',
          clientAddress: '',
          clientEmail: '',
          descriptionMode: 'brief',
          briefSubject: manualBriefSubject.trim() || manualCommitmentCategory,
          documents: [],
          status: manualStatus,
          createdByRole: currentUserRole,
        });
      }

      setIsManualModalOpen(false);
      return;
    }

    if (manualClientName.trim().length < 2) {
      setManualFormError('Informe o nome completo do cliente.');
      return;
    }
    if (manualClientPhone.replace(/\D/g, '').length < 10) {
      setManualFormError('Informe um telefone/WhatsApp válido com DDD.');
      return;
    }
    if (!isValidCPF(manualClientCpf)) {
      setManualFormError('Informe um CPF válido (11 dígitos).');
      return;
    }
    if (manualClientAddress.trim().length < 5) {
      setManualFormError('Informe o endereço completo do cliente.');
      return;
    }
    if (manualDescMode === 'complete' && manualCaseDescription.trim().length < 5) {
      setManualFormError('Preencha o relato completo do caso.');
      return;
    }
    if (manualDescMode === 'brief' && manualBriefSubject.trim().length < 3) {
      setManualFormError('Informe o assunto ou descrição breve.');
      return;
    }

    const srv = services.find((s) => s.id === manualServiceId) || services[0];
    if (!srv) return;

    const cleanEmail =
      manualClientEmail.trim() ||
      `${manualClientName.trim().toLowerCase().replace(/\s+/g, '.')}@cliente.fernandeslins.adv.br`;

    if (editingAppointment) {
      onUpdateAppointment({
        ...editingAppointment,
        entryType: 'client',
        commitmentCategory: undefined,
        location: undefined,
        serviceId: srv.id,
        serviceName: srv.name,
        lawyerName: srv.specialist,
        durationMinutes: srv.durationMinutes,
        price: srv.price,
        date: manualDate,
        startTime: manualTime,
        endTime: calculateEndTime(manualTime, srv.durationMinutes),
        clientName: manualClientName.trim(),
        clientPhone: formatPhoneBR(manualClientPhone.trim()),
        clientCpf: formatCPF(manualClientCpf),
        clientAddress: manualClientAddress.trim(),
        clientEmail: cleanEmail,
        descriptionMode: manualDescMode,
        caseDescription:
          manualDescMode === 'complete' ? manualCaseDescription.trim() : undefined,
        briefSubject:
          manualDescMode === 'brief' ? manualBriefSubject.trim() : undefined,
        documents: manualDescMode === 'complete' ? manualDocuments : [],
        status: manualStatus,
      });
    } else {
      onCreateAppointment({
        entryType: 'client',
        serviceId: srv.id,
        serviceName: srv.name,
        lawyerName: srv.specialist,
        durationMinutes: srv.durationMinutes,
        price: srv.price,
        date: manualDate,
        startTime: manualTime,
        clientName: manualClientName.trim(),
        clientPhone: formatPhoneBR(manualClientPhone.trim()),
        clientCpf: formatCPF(manualClientCpf),
        clientAddress: manualClientAddress.trim(),
        clientEmail: cleanEmail,
        descriptionMode: manualDescMode,
        caseDescription:
          manualDescMode === 'complete' ? manualCaseDescription.trim() : undefined,
        briefSubject:
          manualDescMode === 'brief' ? manualBriefSubject.trim() : undefined,
        documents: manualDescMode === 'complete' ? manualDocuments : [],
        status: manualStatus,
        createdByRole: currentUserRole,
      });
    }

    setIsManualModalOpen(false);
    setEditingAppointment(null);
  };

  // Handlers CRUD de Áreas & Advogados
  const openCreateServiceModal = () => {
    setEditingServiceId(undefined);
    setSrvName('');
    setSrvDescription('');
    setSrvDuration(45);
    setSrvStatus('active');
    setSrvCategory('Fernandes & Lins');
    setSrvSpecialist('Fernandes & Lins');
    setSrvImageUrl('');
    setIsServiceModalOpen(true);
  };

  const openEditServiceModal = (service: ServiceItem) => {
    setEditingServiceId(service.id);
    setSrvName(service.name);
    setSrvDescription(service.description);
    setSrvDuration(service.durationMinutes);
    setSrvStatus(service.status);
    setSrvCategory(service.category);
    setSrvSpecialist(service.specialist);
    setSrvImageUrl(service.imageUrl || '');
    setIsServiceModalOpen(true);
  };

  const handleSrvPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingSrvPhoto(true);
    try {
      const uploadedUrl = await processAndUploadImageFile(file, {
        maxWidth: 600,
        maxHeight: 400,
        prefix: 'srv',
      });
      setSrvImageUrl(uploadedUrl);
    } catch {
      // ignore
    } finally {
      setIsUploadingSrvPhoto(false);
      e.target.value = '';
    }
  };

  const handleNewUserPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewUserError(null);
    setIsUploadingUserPhoto(true);
    try {
      const uploadedUrl = await processAndUploadImageFile(file, {
        maxWidth: 320,
        maxHeight: 320,
        prefix: 'avatar',
      });
      setNewUserAvatarUrl(uploadedUrl);
    } catch (err) {
      setNewUserError(err instanceof Error ? err.message : 'Erro ao enviar foto.');
    } finally {
      setIsUploadingUserPhoto(false);
      e.target.value = '';
    }
  };

  const handleServiceFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveService(
      {
        name: srvName.trim(),
        description: srvDescription.trim(),
        durationMinutes: Number(srvDuration) || 45,
        price: 0,
        status: srvStatus,
        category: srvCategory.trim() || 'Geral',
        specialist: srvSpecialist.trim() || 'Fernandes & Lins',
        imageUrl: srvImageUrl.trim() || undefined,
      },
      editingServiceId
    );
    setIsServiceModalOpen(false);
  };

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError(null);
    const result = onCreateUserByAdmin({
      name: newUserName.trim(),
      email: newUserEmail.trim().toLowerCase(),
      phone: newUserPhone.trim() || '(81) 99810-4000',
      password: newUserPassword,
      role: newUserRole,
      oab: newUserOab.trim() || undefined,
      avatarUrl: newUserAvatarUrl.trim() || undefined,
    });

    if (!result.success) {
      setNewUserError(result.error || 'Erro ao cadastrar conta.');
      return;
    }

    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserOab('');
    setNewUserPassword('123456');
    setNewUserAvatarUrl('');
    setIsNewUserModalOpen(false);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* SIDEBAR FERNANDES & LINS */}
      <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 flex flex-col justify-between p-5">
        <div>
          <div className="flex items-center gap-3 px-2 py-2 mb-5 border-b border-slate-200 pb-4">
            <BrandMark size="md" variant="navy" />
            <div className="min-w-0">
              <p className="font-editorial text-base font-semibold text-[#0B2545] truncate leading-none">
                {FIRM_INFO.shortName}
              </p>
              <p className="text-[11px] text-[#1D4ED8] font-semibold truncate mt-1">
                {isMaster ? 'Conta Master · Sócio' : 'Funcionário · Secretaria'}
              </p>
            </div>
          </div>

          <div className="px-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {isMaster ? 'Diretoria & Operação' : 'Operação da Recepção'}
          </div>

          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => onChangeSubTab('appointments')}
              className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                activeSubTab === 'appointments'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4" />
                <span>Atendimentos</span>
              </span>
              <span
                className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                  activeSubTab === 'appointments'
                    ? 'bg-white/15 text-white'
                    : 'bg-blue-50 text-[#1D4ED8]'
                }`}
              >
                {metrics.confirmedCount + metrics.pendingCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeSubTab('completed')}
              className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                activeSubTab === 'completed'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Realizados</span>
              </span>
              <span
                className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                  activeSubTab === 'completed'
                    ? 'bg-white/15 text-white'
                    : 'bg-[#FEF9C3] text-[#0B2545]'
                }`}
              >
                {metrics.completedCount}
              </span>
            </button>

            {isMaster && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeSubTab('dossiers')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'dossiers'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <FolderOpen className="w-4 h-4" />
                    <span>Detalhes & PDFs</span>
                  </span>
                  <span
                    className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                      activeSubTab === 'dossiers'
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-[#1D4ED8]'
                    }`}
                  >
                    {metrics.totalDocs}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubTab('services')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'services'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Scale className="w-4 h-4" />
                    <span>Áreas & Advogados</span>
                  </span>
                  <span
                    className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                      activeSubTab === 'services'
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-[#1D4ED8]'
                    }`}
                  >
                    {services.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubTab('availability')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'availability'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4" />
                    <span>Horários & Recesso</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubTab('users')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'users'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Users className="w-4 h-4" />
                    <span>Contas Master & Equipe</span>
                  </span>
                  <span
                    className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                      activeSubTab === 'users'
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-[#1D4ED8]'
                    }`}
                  >
                    {registeredUsers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubTab('reports')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'reports'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <BarChart3 className="w-4 h-4" />
                    <span>Relatórios</span>
                  </span>
                  <span
                    className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                      activeSubTab === 'reports'
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-[#1D4ED8]'
                    }`}
                  >
                    {appointments.filter((a) => a.status !== 'cancelled').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubTab('analytics')}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    activeSubTab === 'analytics'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545] hover:bg-blue-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4" />
                    <span>Analytics</span>
                  </span>
                  <span
                    className={`text-xs font-mono-tabular px-2 py-0.5 rounded-md ${
                      activeSubTab === 'analytics'
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-50 text-[#1D4ED8]'
                    }`}
                  >
                    {analyticsEvents.length}
                  </span>
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="mt-8 pt-4 border-t border-slate-200 space-y-2">
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] block">
              Atendimentos Ativos
            </span>
            <span className="font-mono-tabular text-base font-bold text-[#0B2545] block mt-0.5">
              {metrics.confirmedCount + metrics.pendingCount} na pauta
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenClientView}
            className="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-[#FEF9C3] hover:bg-[#FACC15] border border-[#FACC15] rounded-xl transition-colors cursor-pointer"
          >
            <span>Abrir Agenda da Recepção</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#0B2545]" />
          </button>

          {isMaster && (
            <button
              type="button"
              onClick={onResetDemoData}
              className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Zerar Banco de Dados</span>
            </button>
          )}
        </div>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <div
        className={`flex-1 p-5 sm:p-8 min-w-0 ${
          activeSubTab === 'dossiers' ? 'max-w-7xl' : 'max-w-6xl'
        }`}
      >
        {/* ================================================================= */}
        {/* SEÇÃO 1: ATENDIMENTOS                                             */}
        {/* ================================================================= */}
        {activeSubTab === 'appointments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Controle da Secretaria & Advogados
                </span>
                <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-0.5">
                  Atendimentos & Triagem
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 max-w-[65ch]">
                  Consulte fichas completas com CPF, endereço, relato detalhado ou breve, baixe PDFs anexados e atualize o status das consultas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={openNewCommitmentModal}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 text-xs font-bold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <CalendarPlus className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Novo Compromisso</span>
                </button>
                <button
                  type="button"
                  onClick={openNewAppointmentModal}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Atendimento</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <span className="text-xs font-medium text-slate-500">
                  Confirmados
                </span>
                <p className="text-2xl font-bold text-[#1D4ED8] font-mono-tabular mt-1">
                  {metrics.confirmedCount}
                </p>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  agendados na pauta
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <span className="text-xs font-medium text-slate-500">
                  Pendentes
                </span>
                <p className="text-2xl font-bold text-[#B45309] font-mono-tabular mt-1">
                  {metrics.pendingCount}
                </p>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  aguardando validação
                </span>
              </div>

              <button
                type="button"
                onClick={() => onChangeSubTab('completed')}
                className="bg-blue-50/70 hover:bg-blue-50 rounded-2xl border border-blue-200 p-4 cursor-pointer transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#0B2545]">
                    Realizados →
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-[#1D4ED8]" />
                </div>
                <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
                  {metrics.completedCount}
                </p>
                <span className="text-[11px] text-[#1D4ED8] font-medium block mt-0.5">
                  consultas concluídas
                </span>
              </button>

              {isMaster ? (
                <button
                  type="button"
                  onClick={() => onChangeSubTab('dossiers')}
                  className="bg-white hover:bg-blue-50/60 rounded-2xl border border-slate-200 hover:border-blue-300 p-4 cursor-pointer transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0B2545]">
                      PDFs Anexados →
                    </span>
                    <FileText className="w-4 h-4 text-[#1D4ED8]" />
                  </div>
                  <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
                    {metrics.totalDocs}
                  </p>
                  <span className="text-[11px] text-[#1D4ED8] font-medium block mt-0.5">
                    ver dossiês e PDFs
                  </span>
                </button>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <span className="text-xs font-medium text-slate-500">
                    PDFs Anexados
                  </span>
                  <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-1">
                    {metrics.totalDocs}
                  </p>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    documentos no dossiê
                  </span>
                </div>
              )}

              <div className="rounded-2xl p-4 col-span-2 lg:col-span-1 fl-navy-banner text-white">
                <span className="text-xs font-medium text-[#FEF9C3]">
                  Cancelados
                </span>
                <p className="text-2xl font-bold text-white font-mono-tabular mt-1">
                  {metrics.cancelledCount}
                </p>
                <span className="text-[11px] text-slate-300 block mt-0.5">
                  horários liberados
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap p-1 bg-white border border-slate-200 rounded-xl self-start gap-1">
                {(
                  [
                    {
                      id: 'upcoming',
                      label: `Próximos (${metrics.confirmedCount + metrics.pendingCount})`,
                    },
                    { id: 'confirmed', label: `Confirmados (${metrics.confirmedCount})` },
                    { id: 'pending', label: `Pendentes (${metrics.pendingCount})` },
                    { id: 'completed', label: `Realizados (${metrics.completedCount})` },
                    { id: 'cancelled', label: `Cancelados (${metrics.cancelledCount})` },
                    { id: 'all', label: `Todos (${metrics.totalCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      statusFilter === tab.id
                        ? 'bg-[#0B2545] text-[#FACC15]'
                        : 'text-slate-600 hover:text-[#0B2545]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar nome, CPF, advogado, código..."
                  className="w-full min-h-[44px] pl-9 pr-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="fl-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3.5 px-5">Data & Protocolo</th>
                      <th className="py-3.5 px-5">Cliente / CPF / Endereço</th>
                      <th className="py-3.5 px-5">Área & Advogado</th>
                      <th className="py-3.5 px-5">Caso & PDFs</th>
                      <th className="py-3.5 px-5">Status</th>
                      <th className="py-3.5 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 px-5 text-center text-sm text-slate-500">
                          Nenhum atendimento encontrado para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredAppointments.map((appt) => {
                        const summaryText =
                          appt.descriptionMode === 'complete'
                            ? appt.caseDescription
                            : appt.briefSubject;
                        return (
                          <tr
                            key={appt.id}
                            className={`hover:bg-blue-50/40 transition-colors ${
                              appt.status === 'cancelled'
                                ? 'bg-slate-50/80 opacity-75'
                                : ''
                            }`}
                          >
                            <td className="py-4 px-5 whitespace-nowrap align-top">
                              <div className="font-semibold text-[#0B2545] capitalize">
                                {formatDateShortBR(appt.date)}
                              </div>
                              <div className="text-xs font-mono-tabular text-slate-600 mt-0.5">
                                {appt.startTime} às {appt.endTime}
                              </div>
                              <span className="inline-block mt-1 text-[11px] font-mono-tabular font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FACC15] px-1.5 py-0.5 rounded">
                                {appt.code}
                              </span>
                            </td>

                            <td className="py-4 px-5 align-top max-w-[230px]">
                              <div className="font-semibold text-[#0B2545]">
                                {appt.clientName}
                              </div>
                              {appt.entryType === 'commitment' ? (
                                <>
                                  <div className="text-xs font-semibold text-[#1D4ED8] mt-0.5 inline-flex items-center gap-1">
                                    <Bookmark className="w-3 h-3" />
                                    Compromisso (sem cliente)
                                  </div>
                                  {appt.location && (
                                    <div
                                      className="text-[11px] text-slate-600 mt-0.5 truncate"
                                      title={appt.location}
                                    >
                                      Local: {appt.location}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="text-xs text-slate-600 mt-0.5 font-mono-tabular">
                                    CPF: {appt.clientCpf}
                                  </div>
                                  <div className="text-xs text-slate-600 font-mono-tabular">
                                    {appt.clientPhone}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={appt.clientAddress}>
                                    {appt.clientAddress}
                                  </div>
                                </>
                              )}
                            </td>

                            <td className="py-4 px-5 align-top">
                              <div className="font-medium text-[#0B2545]">
                                {appt.entryType === 'commitment'
                                  ? appt.commitmentCategory || appt.serviceName
                                  : appt.serviceName}
                              </div>
                              {appt.lawyerName && (
                                <div className="text-xs font-medium text-[#1D4ED8] mt-0.5">
                                  {appt.lawyerName}
                                </div>
                              )}
                              <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                                {appt.durationMinutes} min
                              </div>
                            </td>

                            <td className="py-4 px-5 align-top max-w-[240px]">
                              <div className="text-[11px] font-semibold text-[#0B2545] mb-1">
                                {appt.entryType === 'commitment'
                                  ? 'Observações'
                                  : appt.descriptionMode === 'complete'
                                  ? 'Descrição Completa'
                                  : 'Descrição Breve'}
                              </div>
                              {summaryText && (
                                <p className="text-xs text-slate-600 line-clamp-2">
                                  {summaryText}
                                </p>
                              )}
                              {appt.documents && appt.documents.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {appt.documents.map((doc) => (
                                    <a
                                      key={doc.id}
                                      href={doc.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={doc.name}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[11px] font-medium text-[#0B2545] hover:bg-blue-100"
                                    >
                                      <FileText className="w-3 h-3 text-[#1D4ED8]" />
                                      <span className="truncate max-w-[110px]">
                                        {doc.name}
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="py-4 px-5 whitespace-nowrap text-xs font-medium align-top">
                              {appt.status === 'confirmed' && (
                                <span className="inline-flex items-center gap-1.5 text-[#0B2545] font-semibold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                                  <span>Confirmado</span>
                                </span>
                              )}
                              {appt.status === 'completed' && (
                                <span className="inline-flex items-center gap-1.5 text-[#0B2545] font-semibold bg-[#FEF9C3] px-2.5 py-1 rounded-md border border-[#FACC15]">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0B2545]" />
                                  <span>Realizado</span>
                                </span>
                              )}
                              {appt.status === 'pending' && (
                                <span className="inline-flex items-center gap-1.5 text-[#B45309] font-semibold">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Pendente</span>
                                </span>
                              )}
                              {appt.status === 'cancelled' && (
                                <span className="inline-flex items-center gap-1.5 text-red-600 line-through">
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Cancelado</span>
                                </span>
                              )}
                            </td>

                            <td className="py-4 px-5 text-right whitespace-nowrap align-top">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectingAppointment(appt)}
                                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-[#0B2545] bg-slate-100 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                                  title="Ver ficha completa e PDFs"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {appt.status === 'completed' ? (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateAppointmentStatus(appt.id, 'confirmed')}
                                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-[#0B2545] hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                                  >
                                    Reabrir
                                  </button>
                                ) : (
                                  <>
                                    {appt.status !== 'cancelled' && (
                                      <button
                                        type="button"
                                        onClick={() => openCompleteAppointmentModal(appt)}
                                        className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] transition-colors cursor-pointer"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Concluir</span>
                                      </button>
                                    )}

                                    {appt.status !== 'confirmed' && (
                                      <button
                                        type="button"
                                        onClick={() => onUpdateAppointmentStatus(appt.id, 'confirmed')}
                                        className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B2545] text-white hover:bg-[#134074] cursor-pointer"
                                      >
                                        Confirmar
                                      </button>
                                    )}

                                    {appt.status !== 'cancelled' && (
                                      <button
                                        type="button"
                                        onClick={() => onUpdateAppointmentStatus(appt.id, 'cancelled')}
                                        className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white text-red-600 hover:bg-red-50 border border-slate-200 cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    )}

                                    <a
                                      href={buildWhatsAppVoucherUrl(appt)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-[#1D4ED8] hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Enviar comprovante no WhatsApp"
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                    </a>
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openEditAppointmentModal(appt)}
                                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-600 hover:text-[#0B2545] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Editar ficha do atendimento"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                {isMaster && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteAppointment(appt.id)}
                                    className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                    title="Excluir atendimento"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 2: ATENDIMENTOS REALIZADOS                                  */}
        {/* ================================================================= */}
        {activeSubTab === 'completed' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Histórico de Consultas Concluídas
                </span>
                <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1">
                  Atendimentos Já Realizados
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 max-w-[65ch]">
                  Registro de consultas finalizadas, pareceres dos advogados e documentos anexados.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeSubTab('appointments')}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>Ver Pauta Ativa</span>
                </button>

                <button
                  type="button"
                  onClick={openNewCommitmentModal}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>Novo Compromisso</span>
                </button>

                <button
                  type="button"
                  onClick={openNewAppointmentModal}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Atendimento</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="fl-card rounded-2xl p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Realizados
                </span>
                <p className="text-3xl font-bold text-[#0B2545] font-mono-tabular mt-1.5">
                  {metrics.completedCount}
                </p>
              </div>

              <div className="rounded-2xl p-5 fl-navy-banner text-white">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FEF9C3]">
                  Com Documentação PDF
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-white font-mono-tabular mt-1.5">
                  {metrics.completedDocsCount}
                </p>
              </div>

              <div className="fl-card rounded-2xl p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Horas Concluídas
                </span>
                <p className="text-3xl font-bold text-[#1D4ED8] font-mono-tabular mt-1.5">
                  {metrics.completedHours}h
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap p-1 bg-white border border-slate-200 rounded-xl self-start gap-1">
                {(
                  [
                    { id: 'all', label: `Todos (${metrics.completedCount})` },
                    { id: 'today', label: 'Hoje' },
                    { id: 'week', label: 'Últimos 7 dias' },
                    { id: 'month', label: 'Últimos 30 dias' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCompletedPeriodFilter(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      completedPeriodFilter === tab.id
                        ? 'bg-[#0B2545] text-[#FACC15]'
                        : 'text-slate-600 hover:text-[#0B2545]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={completedSearchQuery}
                  onChange={(e) => setCompletedSearchQuery(e.target.value)}
                  placeholder="Buscar por cliente, CPF, advogado..."
                  className="w-full min-h-[44px] pl-9 pr-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="fl-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3.5 px-5">Data & Protocolo</th>
                      <th className="py-3.5 px-5">Cliente / CPF</th>
                      <th className="py-3.5 px-5">Área & Advogado</th>
                      <th className="py-3.5 px-5">Parecer & Caso</th>
                      <th className="py-3.5 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredCompletedAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 px-5 text-center">
                          <CheckCircle2 className="w-8 h-8 text-[#1D4ED8] mx-auto opacity-70 mb-2" />
                          <p className="text-sm font-semibold text-[#0B2545]">
                            Nenhum atendimento realizado encontrado
                          </p>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Finalize um atendimento na aba Atendimentos clicando em "Concluir".
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredCompletedAppointments.map((appt) => {
                        return (
                          <tr key={appt.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-4 px-5 whitespace-nowrap">
                              <div className="font-semibold text-[#0B2545] capitalize">
                                {formatDateShortBR(appt.date)}
                              </div>
                              <div className="text-xs font-mono-tabular text-slate-500 mt-0.5">
                                {appt.startTime} às {appt.endTime} ·{' '}
                                <strong className="text-[#1D4ED8]">{appt.code}</strong>
                              </div>
                            </td>

                            <td className="py-4 px-5">
                              <div className="font-medium text-[#0B2545]">
                                {appt.clientName}
                              </div>
                              {appt.entryType === 'commitment' ? (
                                <div className="text-xs text-[#1D4ED8] font-medium">
                                  Compromisso · {appt.commitmentCategory || appt.serviceName}
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs text-slate-600 font-mono-tabular">
                                    CPF: {appt.clientCpf}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono-tabular">
                                    {appt.clientPhone}
                                  </div>
                                </>
                              )}
                            </td>

                            <td className="py-4 px-5">
                              <div className="font-medium text-[#0B2545]">
                                {appt.serviceName}
                              </div>
                              {appt.lawyerName && (
                                <div className="text-xs text-[#1D4ED8] mt-0.5">
                                  {appt.lawyerName}
                                </div>
                              )}
                            </td>

                            <td className="py-4 px-5 max-w-xs">
                              <div className="text-xs text-slate-700 leading-relaxed line-clamp-2">
                                {appt.completedNotes ||
                                  appt.caseDescription ||
                                  appt.briefSubject ||
                                  'Atendimento finalizado.'}
                              </div>
                            </td>

                            <td className="py-4 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectingAppointment(appt)}
                                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-[#0B2545] bg-slate-100 hover:bg-blue-100 rounded-lg cursor-pointer"
                                  title="Ver ficha completa"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <a
                                  href={buildEmailVoucherContent(appt).mailtoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-600 hover:text-[#0B2545] hover:bg-blue-50 rounded-lg"
                                  title="Enviar comprovante por e-mail"
                                >
                                  <Mail className="w-4 h-4" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => onUpdateAppointmentStatus(appt.id, 'confirmed')}
                                  className="min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-[#0B2545] hover:bg-slate-200 cursor-pointer"
                                >
                                  Reabrir
                                </button>
                                {isMaster && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteAppointment(appt.id)}
                                    className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                    title="Excluir registro"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SEÇÃO MASTER: DETALHES DAS AGENDAS, CLIENTES & DOCUMENTAÇÃO PDF   */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'dossiers' && (
          <AdminMasterDossierView
            appointments={appointments}
            onUpdateAppointment={onUpdateAppointment}
            onUpdateAppointmentStatus={onUpdateAppointmentStatus}
            onEditAppointment={openEditAppointmentModal}
            onOpenNewAppointment={openNewAppointmentModal}
            onOpenNewCommitment={openNewCommitmentModal}
          />
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 3 (MASTER): ÁREAS DE ATUAÇÃO & ADVOGADOS                    */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'services' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Gestão Exclusiva Master
                </span>
                <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1">
                  Áreas Jurídicas & Advogados
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 max-w-[65ch]">
                  Configure os ramos de atuação, advogados responsáveis e duração das consultas disponíveis na recepção.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {services.length === 0 && onImportTemplateServices && (
                  <button
                    type="button"
                    onClick={onImportTemplateServices}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-[#0B2545] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Áreas Padrão</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={openCreateServiceModal}
                  className="inline-flex items-center gap-2 min-h-[46px] px-4 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Área / Advogado</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {services.map((service, idx) => (
                <div
                  key={service.id}
                  className={`fl-card rounded-2xl p-6 flex flex-col justify-between gap-4 transition-colors ${
                    service.status === 'inactive' ? 'opacity-65 bg-slate-50' : ''
                  }`}
                >
                  <div className="space-y-3">
                    {service.imageUrl && (
                      <div className="w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                        <img
                          src={service.imageUrl}
                          alt={service.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono-tabular font-semibold text-[#1D4ED8]">
                        0{idx + 1} · {service.category || 'Geral'}
                      </span>
                      <span
                        className={`font-semibold ${
                          service.status === 'active'
                            ? 'text-[#0B2545]'
                            : 'text-slate-500'
                        }`}
                      >
                        {service.status === 'active' ? 'Ativo na Recepção' : 'Inativo'}
                      </span>
                    </div>

                    <h2 className="font-editorial text-xl font-semibold text-[#0B2545]">
                      {service.name}
                    </h2>
                    <p className="text-xs font-semibold text-[#134074] flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-[#1D4ED8]" />
                      <span>{service.specialist}</span>
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {service.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-mono-tabular">
                      <span className="text-slate-600 font-semibold">Duração padrão: {service.durationMinutes} min</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleServiceStatus(service.id)}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#0B2545] bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                      >
                        {service.status === 'active' ? 'Ocultar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditServiceModal(service)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#0B2545] bg-blue-50 hover:bg-blue-100 rounded-xl cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteService(service.id)}
                        className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl cursor-pointer"
                        title="Excluir área"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 4 (MASTER): HORÁRIOS E RECESSO                              */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'availability' && (
          <AdminAvailabilityView
            availability={availability}
            onUpdateAvailability={onUpdateAvailability}
            onOpenClientView={onOpenClientView}
          />
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 5 (MASTER): CONTAS MASTER & FUNCIONÁRIOS                    */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Controle de Acesso
                </span>
                <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1">
                  Contas Master & Equipe (Secretaria)
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 max-w-[65ch]">
                  Gerencie as duas permissões do escritório: Contas Master (sócios/advogados administradores) e Contas Funcionário (secretária/recepção).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewUserError(null);
                  setIsNewUserModalOpen(true);
                }}
                className="inline-flex items-center gap-2 min-h-[46px] px-4 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl self-start sm:self-auto cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Conta</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="fl-card rounded-2xl p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total de Contas
                </span>
                <p className="text-3xl font-bold text-[#0B2545] font-mono-tabular mt-1.5">
                  {registeredUsers.length}
                </p>
              </div>

              <div className="fl-card rounded-2xl p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Contas Master
                </span>
                <p className="text-3xl font-bold text-[#1D4ED8] font-mono-tabular mt-1.5">
                  {registeredUsers.filter((u) => u.role === 'master').length}
                </p>
              </div>

              <div className="fl-card rounded-2xl p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Contas Funcionário
                </span>
                <p className="text-3xl font-bold text-[#0B2545] font-mono-tabular mt-1.5">
                  {registeredUsers.filter((u) => u.role === 'staff').length}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl self-start">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'master', label: 'Master' },
                    { id: 'staff', label: 'Funcionário' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setUserRoleFilter(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      userRoleFilter === tab.id
                        ? 'bg-[#0B2545] text-[#FACC15]'
                        : 'text-slate-600 hover:text-[#0B2545]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou OAB..."
                  className="w-full min-h-[44px] pl-9 pr-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="fl-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3.5 px-5">Usuário</th>
                      <th className="py-3.5 px-5">E-mail & Senha</th>
                      <th className="py-3.5 px-5">Telefone</th>
                      <th className="py-3.5 px-5">Perfil</th>
                      <th className="py-3.5 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 px-5 text-center text-sm text-slate-500">
                          Nenhuma conta encontrada.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              {user.avatarUrl ? (
                                <img
                                  src={user.avatarUrl}
                                  alt={user.name}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-[#0B2545] text-[#FACC15] font-bold text-xs flex items-center justify-center shrink-0">
                                  {user.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-[#0B2545]">
                                  {user.name}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {user.oab
                                    ? user.oab
                                    : user.isDefaultMaster
                                    ? 'Conta Master Principal'
                                    : `Criada em ${formatDateShortBR(
                                        user.createdAt.slice(0, 10)
                                      )}`}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-5">
                            <div className="font-medium text-[#0B2545]">
                              {user.email}
                            </div>
                            <div className="text-xs font-mono-tabular text-slate-500 mt-0.5">
                              Senha: {user.password}
                            </div>
                          </td>

                          <td className="py-4 px-5 whitespace-nowrap font-mono-tabular text-xs text-[#0B2545]">
                            {user.phone}
                          </td>

                          <td className="py-4 px-5 whitespace-nowrap text-xs font-medium">
                            {user.role === 'master' ? (
                              <span className="inline-flex items-center gap-1.5 text-[#0B2545] font-semibold bg-[#FEF9C3] border border-[#FACC15] px-2.5 py-1 rounded-md">
                                <Shield className="w-3.5 h-3.5" />
                                <span>Master</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[#1D4ED8] font-semibold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                                <User className="w-3.5 h-3.5" />
                                <span>Funcionário</span>
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            {user.isDefaultMaster ? (
                              <span className="text-xs text-slate-500">
                                Conta protegida
                              </span>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => onToggleUserRole(user.id)}
                                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#0B2545] bg-slate-100 hover:bg-blue-50 border border-slate-200 rounded-xl cursor-pointer"
                                >
                                  {user.role === 'master'
                                    ? 'Tornar Funcionário'
                                    : 'Promover a Master'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteUser(user.id)}
                                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl cursor-pointer"
                                  title="Excluir conta"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 6 (MASTER): RELATÓRIOS                                      */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'reports' && (
          <AdminReportsView appointments={appointments} />
        )}

        {/* ================================================================= */}
        {/* SEÇÃO 7 (MASTER): ANALYTICS                                       */}
        {/* ================================================================= */}
        {isMaster && activeSubTab === 'analytics' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                Auditoria Interna
              </span>
              <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1">
                Registro de Atividades
              </h1>
              <p className="text-sm text-slate-600 mt-0.5 max-w-[65ch]">
                Histórico de agendamentos registrados, acessos e atualizações efetuadas pela secretaria e sócios.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3.5 px-5">Evento</th>
                      <th className="py-3.5 px-5">Tela</th>
                      <th className="py-3.5 px-5">Detalhes</th>
                      <th className="py-3.5 px-5 text-right">Horário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {analyticsEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 px-5 text-center text-xs text-slate-500">
                          Nenhum evento registrado nesta sessão.
                        </td>
                      </tr>
                    ) : (
                      analyticsEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-blue-50/40">
                          <td className="py-3.5 px-5 font-mono-tabular text-xs font-semibold text-[#0B2545]">
                            {ev.event}
                          </td>
                          <td className="py-3.5 px-5 font-mono-tabular text-xs text-slate-500">
                            {ev.page}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-[#0B2545]">
                            {ev.detail}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                            {new Date(ev.timestamp).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: INSPECIONAR FICHA COMPLETA & PDFS */}
      {inspectingAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <span className="font-mono-tabular text-xs font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FACC15] px-2 py-0.5 rounded">
                  {inspectingAppointment.code}
                </span>
                <h2 className="font-editorial text-xl font-semibold text-[#0B2545] mt-1.5">
                  {inspectingAppointment.clientName}
                </h2>
                <p className="text-xs text-slate-600">
                  {inspectingAppointment.serviceName} ·{' '}
                  {inspectingAppointment.lawyerName || 'Advogado responsável'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAppointment(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-[#0B2545] cursor-pointer"
                aria-label="Fechar ficha"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <span className="text-slate-500 block">Data e Horário</span>
                <strong className="text-[#0B2545] font-mono-tabular">
                  {formatDateShortBR(inspectingAppointment.date)} ·{' '}
                  {inspectingAppointment.startTime}–{inspectingAppointment.endTime}
                </strong>
              </div>
              {inspectingAppointment.entryType === 'commitment' ? (
                <>
                  <div>
                    <span className="text-slate-500 block">Categoria</span>
                    <strong className="text-[#0B2545]">
                      {inspectingAppointment.commitmentCategory ||
                        inspectingAppointment.serviceName}
                    </strong>
                  </div>
                  {inspectingAppointment.location && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Local / Link</span>
                      <strong className="text-[#0B2545] inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        {inspectingAppointment.location}
                      </strong>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <span className="text-slate-500 block">CPF</span>
                    <strong className="text-[#0B2545] font-mono-tabular">
                      {inspectingAppointment.clientCpf}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Telefone / WhatsApp</span>
                    <strong className="text-[#0B2545] font-mono-tabular">
                      {inspectingAppointment.clientPhone}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">E-mail</span>
                    <strong className="text-[#0B2545] truncate block">
                      {inspectingAppointment.clientEmail}
                    </strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">Endereço</span>
                    <strong className="text-[#0B2545]">
                      {inspectingAppointment.clientAddress}
                    </strong>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-[#0B2545] block">
                {inspectingAppointment.entryType === 'commitment'
                  ? 'Observações do Compromisso'
                  : inspectingAppointment.descriptionMode === 'complete'
                  ? 'Descrição Completa do Caso'
                  : 'Assunto / Descrição Breve'}
              </span>
              <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3.5 leading-relaxed whitespace-pre-line">
                {inspectingAppointment.descriptionMode === 'complete'
                  ? inspectingAppointment.caseDescription || 'Sem relato detalhado.'
                  : inspectingAppointment.briefSubject || 'Sem observações informadas.'}
              </p>
            </div>

            {inspectingAppointment.documents &&
              inspectingAppointment.documents.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#0B2545] block">
                    Documentação em PDF ({inspectingAppointment.documents.length})
                  </span>
                  <div className="space-y-1.5">
                    {inspectingAppointment.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={doc.name}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-xs text-[#0B2545]"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                          <span className="font-medium truncate">{doc.name}</span>
                        </span>
                        <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                          {formatFileSize(doc.size)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = inspectingAppointment;
                  setInspectingAppointment(null);
                  openEditAppointmentModal(target);
                }}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-[#0B2545] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl cursor-pointer"
              >
                Editar Ficha
              </button>
              <button
                type="button"
                onClick={() => setInspectingAppointment(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-[#FACC15] bg-[#0B2545] hover:bg-[#134074] rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR ÁREA JURÍDICA */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-editorial text-xl font-semibold text-[#0B2545]">
                {editingServiceId ? 'Editar Área Jurídica' : 'Nova Área Jurídica'}
              </h2>
              <button
                type="button"
                onClick={() => setIsServiceModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-[#0B2545]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleServiceFormSubmit} className="mt-4 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {srvImageUrl ? (
                    <img
                      src={srvImageUrl}
                      alt="Foto da área"
                      className="w-12 h-12 rounded-xl object-cover border border-slate-300 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white border border-dashed border-slate-300 text-[#1D4ED8] flex flex-col items-center justify-center shrink-0">
                      <Camera className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-[#0B2545]">
                      Imagem da Área (Opcional)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isUploadingSrvPhoto ? 'Enviando...' : 'Foto ilustrativa'}
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0B2545] hover:bg-[#134074] text-[#FACC15] text-xs font-semibold cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{srvImageUrl ? 'Trocar' : 'Foto'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSrvPhotoFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Nome da Área / Consulta *
                </label>
                <input
                  type="text"
                  required
                  value={srvName}
                  onChange={(e) => setSrvName(e.target.value)}
                  placeholder="Ex: Direito Trabalhista"
                  className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Descrição curta *
                </label>
                <textarea
                  rows={2}
                  required
                  value={srvDescription}
                  onChange={(e) => setSrvDescription(e.target.value)}
                  className="w-full p-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Ramo
                  </label>
                  <input
                    type="text"
                    value={srvCategory}
                    onChange={(e) => setSrvCategory(e.target.value)}
                    placeholder="Ex: Trabalhista"
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Advogado Responsável
                  </label>
                  <input
                    type="text"
                    value={srvSpecialist}
                    onChange={(e) => setSrvSpecialist(e.target.value)}
                    placeholder="Dr(a). Nome"
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Duração padrão da consulta
                </label>
                <select
                  value={srvDuration}
                  onChange={(e) => setSrvDuration(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                >
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={90}>90 minutos</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Status
                </label>
                <select
                  value={srvStatus}
                  onChange={(e) => setSrvStatus(e.target.value as ServiceStatus)}
                  className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                >
                  <option value="active">Ativo (Visível na recepção)</option>
                  <option value="inactive">Inativo (Oculto)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl cursor-pointer"
                >
                  Salvar Área
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO / EDITAR ATENDIMENTO MANUAL OU COMPROMISSO SEM CLIENTE */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-editorial text-xl font-semibold text-[#0B2545]">
                {editingAppointment
                  ? manualEntryType === 'commitment'
                    ? 'Editar Compromisso'
                    : 'Editar Atendimento'
                  : manualEntryType === 'commitment'
                  ? 'Novo Compromisso na Agenda'
                  : 'Novo Atendimento'}
              </h2>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-[#0B2545]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualFormError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{manualFormError}</span>
              </div>
            )}

            <form onSubmit={handleManualAppointmentSubmit} className="mt-4 space-y-3.5">
              {/* Alternância de Tipo */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setManualEntryType('client');
                    setManualFormError(null);
                  }}
                  className={`min-h-[42px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    manualEntryType === 'client'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  Atendimento com Cliente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualEntryType('commitment');
                    setManualFormError(null);
                  }}
                  className={`min-h-[42px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    manualEntryType === 'commitment'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  Compromisso (Sem Cliente)
                </button>
              </div>

              {manualEntryType === 'client' && services.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Área Jurídica *
                  </label>
                  <select
                    value={manualServiceId}
                    onChange={(e) => setManualServiceId(e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.specialist} ({s.durationMinutes} min)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={`grid ${manualEntryType === 'commitment' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Horário *
                  </label>
                  <input
                    type="time"
                    required
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                {manualEntryType === 'commitment' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Duração
                    </label>
                    <select
                      value={manualDurationMinutes}
                      onChange={(e) => setManualDurationMinutes(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1h 30min</option>
                      <option value={120}>2 horas</option>
                      <option value={180}>3 horas</option>
                      <option value={240}>4 horas</option>
                    </select>
                  </div>
                )}
              </div>

              {manualEntryType === 'commitment' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Título do Compromisso *
                    </label>
                    <input
                      type="text"
                      required
                      value={manualClientName}
                      onChange={(e) => setManualClientName(e.target.value)}
                      placeholder="Ex: Audiência na 3ª Vara / Prazo Processual / Reunião Interna"
                      className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        Categoria
                      </label>
                      <select
                        value={manualCommitmentCategory}
                        onChange={(e) => setManualCommitmentCategory(e.target.value)}
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="Compromisso">Compromisso</option>
                        <option value="Audiência">Audiência</option>
                        <option value="Prazo Processual">Prazo Processual</option>
                        <option value="Reunião Interna">Reunião Interna</option>
                        <option value="Diligência">Diligência</option>
                        <option value="Pessoal">Pessoal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        Status
                      </label>
                      <select
                        value={manualStatus}
                        onChange={(e) => setManualStatus(e.target.value as AppointmentStatus)}
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="confirmed">Confirmado</option>
                        <option value="completed">Realizado / Concluído</option>
                        <option value="pending">Pendente</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Local ou Link (Opcional)
                    </label>
                    <input
                      type="text"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      placeholder="Ex: Fórum, Google Meet ou Escritório"
                      className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Observações (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={manualBriefSubject}
                      onChange={(e) => setManualBriefSubject(e.target.value)}
                      placeholder="Detalhes, pauta ou lembretes deste compromisso..."
                      className="w-full p-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  {!editingAppointment && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualNotifyByEmail}
                        onChange={(e) => setManualNotifyByEmail(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0B2545]"
                      />
                      <span className="text-xs text-slate-700">
                        <strong className="text-[#0B2545] block">
                          Enviar aviso por e-mail (Resend)
                        </strong>
                        Opcional — o horário já bloqueia conflitos na pauta.
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Nome Completo do Cliente *
                    </label>
                    <input
                      type="text"
                      required
                      value={manualClientName}
                      onChange={(e) => setManualClientName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        Número / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={manualClientPhone}
                        onChange={(e) => setManualClientPhone(formatPhoneBR(e.target.value))}
                        placeholder="(81) 99999-9999"
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        CPF *
                      </label>
                      <input
                        type="text"
                        required
                        value={manualClientCpf}
                        onChange={(e) => setManualClientCpf(formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                      Endereço Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={manualClientAddress}
                      onChange={(e) => setManualClientAddress(e.target.value)}
                      placeholder="Rua, número, bairro, cidade - UF"
                      className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        E-mail (Opcional)
                      </label>
                      <input
                        type="email"
                        value={manualClientEmail}
                        onChange={(e) => setManualClientEmail(e.target.value)}
                        placeholder="cliente@email.com"
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                        Status
                      </label>
                      <select
                        value={manualStatus}
                        onChange={(e) => setManualStatus(e.target.value as AppointmentStatus)}
                        className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="confirmed">Confirmado</option>
                        <option value="completed">Realizado / Concluído</option>
                        <option value="pending">Pendente</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  {/* 2 BOTÕES DINÂMICOS: DESCRIÇÃO COMPLETA vs DESCRIÇÃO BREVE */}
                  <div className="pt-2 border-t border-slate-200 space-y-3">
                    <span className="block text-xs font-bold text-[#0B2545]">
                      Tipo de Preenchimento do Caso
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setManualDescMode('complete')}
                        className={`min-h-[46px] p-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                          manualDescMode === 'complete'
                            ? 'bg-[#0B2545] text-[#FACC15] border-[#0B2545]'
                            : 'bg-white text-[#0B2545] border-slate-300 hover:border-[#1D4ED8]'
                        }`}
                      >
                        Descrição Completa
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualDescMode('brief')}
                        className={`min-h-[46px] p-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                          manualDescMode === 'brief'
                            ? 'bg-[#0B2545] text-[#FACC15] border-[#0B2545]'
                            : 'bg-white text-[#0B2545] border-slate-300 hover:border-[#1D4ED8]'
                        }`}
                      >
                        Descrição Breve
                      </button>
                    </div>

                    {manualDescMode === 'complete' ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                            Relato Completo do Caso *
                          </label>
                          <textarea
                            rows={3}
                            value={manualCaseDescription}
                            onChange={(e) => setManualCaseDescription(e.target.value)}
                            placeholder="Descreva os fatos do caso, datas relevantes, partes envolvidas..."
                            className="w-full p-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                          />
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#0B2545] flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5 text-[#1D4ED8]" />
                              Documentação em PDF
                            </span>
                            <button
                              type="button"
                              onClick={() => manualPdfInputRef.current?.click()}
                              disabled={isUploadingManualPdf}
                              className="min-h-[38px] px-3 py-1 rounded-lg bg-[#0B2545] text-[#FACC15] text-xs font-semibold hover:bg-[#134074] cursor-pointer"
                            >
                              {isUploadingManualPdf ? 'Enviando...' : '+ Anexar PDF'}
                            </button>
                            <input
                              ref={manualPdfInputRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                void handleManualPdfUpload(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </div>

                          {manualDocuments.length > 0 && (
                            <div className="space-y-1">
                              {manualDocuments.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs"
                                >
                                  <span className="truncate text-[#0B2545] font-medium flex items-center gap-1.5">
                                    <FolderOpen className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                                    <span className="truncate">{doc.name}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setManualDocuments((prev) =>
                                        prev.filter((d) => d.id !== doc.id)
                                      )
                                    }
                                    className="text-red-600 hover:underline text-[11px] shrink-0 cursor-pointer"
                                  >
                                    Remover
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                          Assunto / Descrição Breve *
                        </label>
                        <input
                          type="text"
                          value={manualBriefSubject}
                          onChange={(e) => setManualBriefSubject(e.target.value)}
                          placeholder="Ex: Consulta sobre rescisão trabalhista / Entrega de documentos"
                          className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl cursor-pointer whitespace-nowrap"
                >
                  {editingAppointment
                    ? 'Salvar Alterações'
                    : manualEntryType === 'commitment'
                    ? 'Salvar Compromisso'
                    : 'Confirmar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONCLUIR ATENDIMENTO */}
      {isCompleteModalOpen && completingAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FEF9C3] border border-[#FACC15] text-[#0B2545] flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-editorial text-lg font-semibold text-[#0B2545]">
                    Concluir Consulta
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-[#1D4ED8] font-medium">
                    Protocolo {completingAppointment.code}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCompleteModalOpen(false);
                  setCompletingAppointment(null);
                }}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-[#0B2545] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-semibold text-[#0B2545]">{completingAppointment.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Área / Advogado:</span>
                <span className="font-medium text-[#0B2545]">{completingAppointment.serviceName}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmCompleteSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Parecer / Encaminhamento (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="Ex: Procuração assinada, ajuizamento previsto para próxima semana..."
                  className="w-full p-2.5 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCompleteModalOpen(false);
                    setCompletingAppointment(null);
                  }}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar Conclusão</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA CONTA (MASTER OU FUNCIONÁRIO) */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="font-editorial text-xl font-semibold text-[#0B2545]">
                Nova Conta de Acesso
              </h2>
              <button
                type="button"
                onClick={() => setIsNewUserModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-[#0B2545]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newUserError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {newUserError}
              </div>
            )}

            <form onSubmit={handleCreateUserSubmit} className="mt-4 space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {newUserAvatarUrl ? (
                    <img
                      src={newUserAvatarUrl}
                      alt="Foto da conta"
                      className="w-12 h-12 rounded-xl object-cover border border-slate-300 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white border border-dashed border-slate-300 text-[#1D4ED8] flex flex-col items-center justify-center shrink-0">
                      <Camera className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-[#0B2545]">
                      Foto de Perfil
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isUploadingUserPhoto ? 'Enviando...' : 'Opcional'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0B2545] hover:bg-[#134074] text-[#FACC15] text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{newUserAvatarUrl ? 'Trocar' : 'Foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleNewUserPhotoFileChange}
                      className="hidden"
                    />
                  </label>
                  {newUserAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setNewUserAvatarUrl('')}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nome e sobrenome"
                  className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="nome@fernandeslins.adv.br"
                  className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Telefone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(formatPhoneBR(e.target.value))}
                    placeholder="(81) 99999-9999"
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Senha *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Perfil de Acesso
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="staff">Funcionário (Secretaria)</option>
                    <option value="master">Master (Sócio / Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                    Registro OAB (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newUserOab}
                    onChange={(e) => setNewUserOab(e.target.value)}
                    placeholder="Ex: OAB/PE 41.820"
                    className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl cursor-pointer"
                >
                  Criar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
