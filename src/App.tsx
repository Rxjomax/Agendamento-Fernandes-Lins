import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { ToastContainer } from './components/ToastContainer';
import {
  Appointment,
  AppointmentStatus,
  AvailabilityConfig,
  RegisteredUser,
  ServiceItem,
  ToastMessage,
  UserRole,
  UserSession,
} from './types/scheduling';
import {
  FIRM_INFO,
  INITIAL_SERVICES,
  INITIAL_USERS,
  TEMPLATE_SERVICES,
  getInitialAppointments,
  getInitialAvailability,
} from './data/seedData';
import {
  AnalyticsEvent,
  clearAnalyticsEvents,
  getAnalyticsEvents,
  trackAnalyticsEvent,
  updatePageSEO,
} from './utils/seoAndAnalytics';
import {
  deleteAppointmentFromFirestore,
  deleteServiceFromFirestore,
  firebaseSignOut,
  onAuthStateChanged,
  auth,
  subscribeToAuthenticatedAppointments,
  syncAppointmentToFirestore,
  syncServiceToFirestore,
  syncUserProfileToFirestore,
} from './firebase';
import {
  calculateEndTime,
  formatDateShortBR,
  formatPhoneBR,
  isAppointmentUpcoming,
  normalizeAvailabilityConfig,
  normalizePastAppointments,
} from './utils/timeSlots';
import { ClientBookingView } from './components/ClientBookingView';
import { ClientAgendaView } from './components/ClientAgendaView';
import {
  AdminDashboardView,
  AdminTabType,
} from './components/AdminDashboardView';
import { AuthView } from './components/AuthView';
import {
  CookieConsentBanner,
  EmailDispatchState,
  LoadingViewSkeleton,
  NotFoundView,
  PrivacyPolicyView,
  TermsOfUseView,
  ThankYouView,
} from './components/LegalAndSystemViews';
import { AiBookingChatWidget } from './components/AiBookingChatWidget';
import { DEFAULT_NOTIFICATION_EMAIL } from './utils/notificationLinks';
import { isEphemeralServer, markEphemeralServer } from './utils/serverMode';

export type AppView =
  | 'booking'
  | 'my-agenda'
  | 'auth'
  | 'admin'
  | 'thank-you'
  | 'privacy'
  | 'terms'
  | 'not-found';

const STORAGE_KEYS = {
  SERVICES: 'fl_adv_v1_services',
  AVAILABILITY: 'fl_adv_v1_availability',
  APPOINTMENTS: 'fl_adv_v1_appointments',
  USERS: 'fl_adv_v1_users',
  SESSION: 'fl_adv_v1_session',
  CLEARED_AT: 'fl_adv_v1_cleared_at',
  PURGED_LEGACY: 'fl_adv_v1_purged',
  SESSION_BOOKED_IDS: 'fl_adv_v1_session_booked_ids',
};

function saveAppointmentsToLocalStorage(list: Appointment[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function persistAppointmentToBackend(appointment: Appointment) {
  if (isEphemeralServer()) return;
  fetch('/api/db/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment }),
    keepalive: true,
  }).catch(() => {});
}

function deleteAppointmentFromBackend(id: string) {
  if (isEphemeralServer()) return;
  fetch(`/api/db/appointments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => {});
}

function purgeLegacyStorageOnce() {
  try {
    if (localStorage.getItem(STORAGE_KEYS.PURGED_LEGACY) === 'true') return;
    const legacyKeys = [
      'krono_clean_v5_services',
      'krono_clean_v5_availability',
      'krono_clean_v5_appointments',
      'krono_clean_v5_users',
      'krono_clean_v5_session',
      'krono_clean_v5_purged',
      'krono_clean_analytics_v5',
      'krono_cookie_ok',
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(STORAGE_KEYS.PURGED_LEGACY, 'true');
  } catch {
    // ignore
  }
}

function normalizeUserRole(rawRole: unknown): UserRole {
  if (rawRole === 'master' || rawRole === 'admin') return 'master';
  return 'staff';
}

function normalizeLegacyMasterFields<
  T extends { id?: string; email?: string; name?: string; oab?: string }
>(user: T): T {
  const isLegacyMaster =
    user.name === 'Dr. Henrique Fernandes' ||
    (user.id === 'usr-master-1' &&
      (!user.name || user.name === 'Dr. Henrique Fernandes'));
  const hasPlaceholderOab = user.oab === 'OAB/PE 41.820';
  if (!isLegacyMaster && !hasPlaceholderOab) return user;
  return {
    ...user,
    ...(isLegacyMaster ? { name: 'Marciel Fernandes' } : {}),
    ...(hasPlaceholderOab ? { oab: undefined } : {}),
  };
}

export function App() {
  purgeLegacyStorageOnce();

  const [currentView, setCurrentView] = useState<AppView>('booking');
  const [adminSubTab, setAdminSubTab] = useState<AdminTabType>('appointments');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dbHydrated, setDbHydrated] = useState(false);
  const skipNextPutRef = useRef(false);

  const [services, setServices] = useState<ServiceItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SERVICES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasLegacyThreeLawyers = parsed.some(
            (s: { specialist?: string }) =>
              String(s?.specialist || '').includes('Eduardo Vasconcelos')
          );
          if (!hasLegacyThreeLawyers) return parsed;
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_SERVICES;
  });

  const [availability, setAvailability] = useState<AvailabilityConfig>(() => {
    const fallback = getInitialAvailability();
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AVAILABILITY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return normalizeAvailabilityConfig(parsed, fallback);
      }
    } catch {
      // fallback
    }
    return fallback;
  });

  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.APPOINTMENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return normalizePastAppointments(parsed);
        }
      }
    } catch {
      // fallback
    }
    return normalizePastAppointments(getInitialAppointments());
  });

  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((u: RegisteredUser & { isDefaultAdmin?: boolean }) =>
            normalizeLegacyMasterFields({
              ...u,
              role: normalizeUserRole(u.role),
              isDefaultMaster: u.isDefaultMaster ?? u.isDefaultAdmin,
            })
          );
          const hasMaster = normalized.some(
            (u: RegisteredUser) =>
              u.email.toLowerCase() === 'master@fernandeslins.adv.br'
          );
          if (!hasMaster) return INITIAL_USERS;
          return normalized;
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email) {
          return normalizeLegacyMasterFields({
            ...parsed,
            role: normalizeUserRole(parsed.role),
            firmName: FIRM_INFO.name,
          });
        }
      }
    } catch {
      // fallback
    }
    return null;
  });

  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>(() =>
    getAnalyticsEvents()
  );

  const [lastBookedAppointment, setLastBookedAppointment] =
    useState<Appointment | null>(null);
  const [sessionBookedIds, setSessionBookedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSION_BOOKED_IDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string');
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [configuredNotificationEmail, setConfiguredNotificationEmail] = useState(
    DEFAULT_NOTIFICATION_EMAIL
  );
  const [emailDispatchState, setEmailDispatchState] = useState<EmailDispatchState>({
    status: 'idle',
    to: DEFAULT_NOTIFICATION_EMAIL,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/email-config/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.targetEmail) return;
        setConfiguredNotificationEmail(data.targetEmail);
        setEmailDispatchState((prev) =>
          prev.status === 'idle' ? { ...prev, to: data.targetEmail } : prev
        );
      })
      .catch(() => {});

    fetch('/api/db/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;

        if (data.ephemeral) {
          markEphemeralServer(true);
          skipNextPutRef.current = true;
          return;
        }

        const serverClearedAtMs = data.clearedAt ? Date.parse(data.clearedAt) : 0;
        let localClearedAtMs = 0;
        try {
          const rawCleared = localStorage.getItem(STORAGE_KEYS.CLEARED_AT);
          if (rawCleared) localClearedAtMs = Date.parse(rawCleared) || 0;
        } catch {
          // ignore
        }

        const wasClearedOnServer =
          serverClearedAtMs > 0 && serverClearedAtMs > localClearedAtMs;

        const serverAppointments: Appointment[] = Array.isArray(data.appointments)
          ? data.appointments
          : [];
        const hasServerMutated =
          Boolean(data.hasUserMutations) || serverAppointments.length > 0;

        if (wasClearedOnServer) {
          try {
            localStorage.setItem(STORAGE_KEYS.CLEARED_AT, data.clearedAt);
          } catch {
            // ignore
          }
          skipNextPutRef.current = true;
          if (Array.isArray(data.services) && data.services.length > 0) {
            setServices(data.services);
          }
          if (data.availability && Array.isArray(data.availability.workDays)) {
            setAvailability(
              normalizeAvailabilityConfig(data.availability, getInitialAvailability())
            );
          }
          setAppointments(normalizePastAppointments(serverAppointments));
          if (Array.isArray(data.registeredUsers) && data.registeredUsers.length > 0) {
            setRegisteredUsers(
              data.registeredUsers.map((u: RegisteredUser & { isDefaultAdmin?: boolean }) =>
                normalizeLegacyMasterFields({
                  ...u,
                  role: normalizeUserRole(u.role),
                  isDefaultMaster: u.isDefaultMaster ?? u.isDefaultAdmin,
                })
              )
            );
          }
          return;
        }

        // Se o servidor está zerado (ex.: reinício do container) e ainda não recebeu mutações,
        // preservamos os dados já salvos no navegador e deixamos o PUT reidratar o database.json.
        if (!hasServerMutated) {
          return;
        }

        if (Array.isArray(data.services) && data.services.length > 0) {
          setServices(data.services);
        }
        if (data.availability && Array.isArray(data.availability.workDays)) {
          setAvailability(
            normalizeAvailabilityConfig(data.availability, getInitialAvailability())
          );
        }

        const serverUpdatedMs = data.updatedAt ? Date.parse(data.updatedAt) : 0;
        setAppointments((prevLocal) => {
          const serverIds = new Set(serverAppointments.map((a) => a.id));
          const newerLocalOnly = prevLocal.filter((localAppt) => {
            if (serverIds.has(localAppt.id)) return false;
            const createdMs = localAppt.createdAt ? Date.parse(localAppt.createdAt) : 0;
            return !serverUpdatedMs || createdMs > serverUpdatedMs;
          });
          if (newerLocalOnly.length === 0) {
            skipNextPutRef.current = true;
          }
          return normalizePastAppointments([
            ...newerLocalOnly,
            ...serverAppointments,
          ]);
        });

        if (Array.isArray(data.registeredUsers) && data.registeredUsers.length > 0) {
          setRegisteredUsers(
            data.registeredUsers.map((u: RegisteredUser & { isDefaultAdmin?: boolean }) =>
              normalizeLegacyMasterFields({
                ...u,
                role: normalizeUserRole(u.role),
                isDefaultMaster: u.isDefaultMaster ?? u.isDefaultAdmin,
              })
            )
          );
        }
      })
      .catch(() => {
        // fallback silencioso
      })
      .finally(() => {
        if (active) setDbHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let unsubscribeAppointments: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeAppointments) {
        unsubscribeAppointments();
        unsubscribeAppointments = null;
      }
      if (!firebaseUser || !firebaseUser.emailVerified) return;

      unsubscribeAppointments = subscribeToAuthenticatedAppointments((cloudAppts) => {
        setAppointments((prev) => {
          const prevMap = new Map(prev.map((item) => [item.id, item]));
          const cloudIds = new Set(cloudAppts.map((item) => item.id));
          const mergedFromCloud = cloudAppts.map((cloudItem) => {
            const existing = prevMap.get(cloudItem.id);
            return existing?.documents?.length
              ? { ...cloudItem, documents: existing.documents }
              : cloudItem;
          });
          const localOnly = prev.filter((item) => !cloudIds.has(item.id));
          return normalizePastAppointments([...mergedFromCloud, ...localOnly]);
        });
      });
    });

    return () => {
      if (unsubscribeAppointments) unsubscribeAppointments();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!dbHydrated || isEphemeralServer()) return;
    if (skipNextPutRef.current) {
      skipNextPutRef.current = false;
      return;
    }
    fetch('/api/db/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        services,
        availability,
        appointments,
        registeredUsers,
      }),
    }).catch(() => {
      // ignore
    });
  }, [dbHydrated, services, availability, appointments, registeredUsers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    } catch {
      // ignore
    }
  }, [services]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AVAILABILITY, JSON.stringify(availability));
    } catch {
      // ignore
    }
  }, [availability]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));
    } catch {
      // ignore
    }
  }, [appointments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(registeredUsers));
    } catch {
      // ignore
    }
  }, [registeredUsers]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    if (
      currentView === 'admin' &&
      currentUser?.role !== 'master' &&
      currentUser?.role !== 'staff'
    ) {
      setCurrentView('booking');
    }
  }, [currentView, currentUser]);

  useEffect(() => {
    const normalizeNow = () => {
      setAppointments((prev) => normalizePastAppointments(prev));
    };
    normalizeNow();
    const timer = window.setInterval(normalizeNow, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const addToast = (title: string, description?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const logEvent = (event: string, page: string, detail: string) => {
    const updated = trackAnalyticsEvent(event, page, detail);
    setAnalyticsEvents(updated);
  };

  const navigateTo = (view: AppView) => {
    if (view === currentView) return;
    setIsTransitioning(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updatePageSEO(
      `Fernandes & Lins Assessoria Jurídica · ${
        view === 'admin'
          ? 'Painel do Escritório'
          : view === 'my-agenda'
          ? 'Pauta Geral'
          : 'Recepção & Agenda'
      }`,
      'Sistema de recepção, pauta dos advogados e gestão de atendimentos da Fernandes & Lins Assessoria Jurídica.'
    );
    setTimeout(() => {
      setCurrentView(view);
      setIsTransitioning(false);
    }, 150);
  };

  const handleLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);
    logEvent('user_login', '/auth', `Acesso: ${session.email} (${session.role})`);
    addToast(
      `Bem-vindo(a), ${session.name.split(' ')[0]}!`,
      session.role === 'master'
        ? 'Sessão Master iniciada com controle total.'
        : 'Sessão de Funcionário (Secretaria) iniciada.'
    );
    navigateTo(session.role === 'master' ? 'admin' : 'booking');
  };

  const handleRegisterUser = (
    newUser: Omit<RegisteredUser, 'id' | 'createdAt'>
  ): { success: boolean; error?: string } => {
    const normalizedEmail = newUser.email.trim().toLowerCase();
    const formattedPhone = formatPhoneBR(newUser.phone.trim());
    const phoneDigits = formattedPhone.replace(/\D/g, '');

    const emailExists = registeredUsers.some(
      (u) => u.email.trim().toLowerCase() === normalizedEmail
    );
    if (emailExists) {
      return {
        success: false,
        error: 'Este e-mail já está cadastrado.',
      };
    }

    const phoneExists =
      phoneDigits.length >= 10 &&
      registeredUsers.some(
        (u) => u.phone.replace(/\D/g, '') === phoneDigits
      );
    if (phoneExists) {
      return {
        success: false,
        error: 'Este telefone já está vinculado a outra conta.',
      };
    }

    const created: RegisteredUser = {
      ...newUser,
      name: newUser.name.trim(),
      email: normalizedEmail,
      phone: formattedPhone,
      id: `usr-${Date.now().toString().slice(-5)}`,
      createdAt: new Date().toISOString(),
    };

    setRegisteredUsers((prev) => [created, ...prev]);
    void syncUserProfileToFirestore({
      name: created.name,
      email: created.email,
      phone: created.phone,
      avatarUrl: created.avatarUrl,
    }).catch(() => {});

    const session: UserSession = {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      role: created.role,
      oab: created.oab,
      avatarUrl: created.avatarUrl,
      firmName: FIRM_INFO.name,
    };
    setCurrentUser(session);
    logEvent('user_register', '/auth', `Nova conta (${created.role}): ${created.email}`);

    addToast(
      'Conta criada com sucesso!',
      `Bem-vindo(a), ${created.name.split(' ')[0]}!`
    );
    navigateTo(created.role === 'master' ? 'admin' : 'booking');
    return { success: true };
  };

  const handleUpdateUserProfile = (
    userId: string,
    updates: {
      name: string;
      email: string;
      phone: string;
      oab?: string;
      avatarUrl?: string;
      newPassword?: string;
    }
  ): { success: boolean; error?: string } => {
    const targetUser = registeredUsers.find((u) => u.id === userId);
    if (!targetUser) {
      return { success: false, error: 'Conta não localizada.' };
    }

    const normalizedEmail = updates.email.trim().toLowerCase();
    const formattedPhone = formatPhoneBR(updates.phone.trim());
    const phoneDigits = formattedPhone.replace(/\D/g, '');

    const emailConflict = registeredUsers.some(
      (u) => u.id !== userId && u.email.trim().toLowerCase() === normalizedEmail
    );
    if (emailConflict) {
      return {
        success: false,
        error: 'Este e-mail já está em uso por outra conta.',
      };
    }

    const phoneConflict =
      phoneDigits.length >= 10 &&
      registeredUsers.some(
        (u) => u.id !== userId && u.phone.replace(/\D/g, '') === phoneDigits
      );
    if (phoneConflict) {
      return {
        success: false,
        error: 'Este telefone já está em uso por outra conta.',
      };
    }

    const updatedUser: RegisteredUser = {
      ...targetUser,
      name: updates.name.trim(),
      email: normalizedEmail,
      phone: formattedPhone,
      oab: updates.oab?.trim() || undefined,
      avatarUrl: updates.avatarUrl,
      password: updates.newPassword || targetUser.password,
    };

    setRegisteredUsers((prev) =>
      prev.map((u) => (u.id === userId ? updatedUser : u))
    );

    void syncUserProfileToFirestore({
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      avatarUrl: updatedUser.avatarUrl,
    }).catch(() => {});

    if (currentUser?.id === userId) {
      setCurrentUser({
        ...currentUser,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        oab: updatedUser.oab,
        avatarUrl: updatedUser.avatarUrl,
      });
    }

    logEvent('user_profile_updated', '/auth', `Perfil atualizado: ${updatedUser.email}`);
    addToast(
      'Perfil atualizado!',
      'Seus dados e foto foram salvos com sucesso.'
    );
    return { success: true };
  };

  const handleResetUserPassword = (
    identifier: string,
    phoneVerify: string,
    newPassword: string
  ): { success: boolean; error?: string; userEmail?: string } => {
    const cleanId = identifier.trim().toLowerCase();
    const idDigits = cleanId.replace(/\D/g, '');
    const verifyDigits = phoneVerify.replace(/\D/g, '');

    const target = registeredUsers.find((u) => {
      const emailMatch = u.email.trim().toLowerCase() === cleanId;
      const phoneMatch =
        idDigits.length >= 8 &&
        u.phone.replace(/\D/g, '').endsWith(idDigits.slice(-8));
      return emailMatch || phoneMatch;
    });

    if (!target) {
      return {
        success: false,
        error: 'Nenhuma conta encontrada com este e-mail ou telefone.',
      };
    }

    const targetPhoneDigits = target.phone.replace(/\D/g, '');
    if (!targetPhoneDigits.endsWith(verifyDigits.slice(-4))) {
      return {
        success: false,
        error: 'Os últimos 4 dígitos do telefone não conferem.',
      };
    }

    setRegisteredUsers((prev) =>
      prev.map((u) =>
        u.id === target.id ? { ...u, password: newPassword } : u
      )
    );

    logEvent('user_password_reset', '/auth', `Senha redefinida: ${target.email}`);
    addToast('Senha redefinida!', `A nova senha para ${target.name} já está ativa.`);
    return { success: true, userEmail: target.email };
  };

  const handleCreateUserByAdmin = (
    newUser: Omit<RegisteredUser, 'id' | 'createdAt'>
  ): { success: boolean; error?: string } => {
    const normalizedEmail = newUser.email.trim().toLowerCase();
    const exists = registeredUsers.some(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    if (exists) {
      return {
        success: false,
        error: 'Este e-mail já está cadastrado no sistema.',
      };
    }

    const created: RegisteredUser = {
      ...newUser,
      email: normalizedEmail,
      phone: formatPhoneBR(newUser.phone),
      id: `usr-${Date.now().toString().slice(-5)}`,
      createdAt: new Date().toISOString(),
    };
    setRegisteredUsers((prev) => [created, ...prev]);
    addToast('Conta criada', `${created.name} foi adicionado(a) à equipe.`);
    return { success: true };
  };

  const handleLogout = () => {
    const name = currentUser?.name.split(' ')[0] || 'Usuário';
    setCurrentUser(null);
    if (auth.currentUser) {
      void firebaseSignOut(auth);
    }
    addToast(`Até logo, ${name}!`, 'Sessão encerrada com segurança.');
    if (currentView === 'admin') {
      navigateTo('booking');
    }
  };

  const triggerAutomaticEmail = async (appointment: Appointment) => {
    setEmailDispatchState({
      status: 'sending',
      to: configuredNotificationEmail,
    });
    try {
      let resp = await fetch('/api/send-appointment-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment }),
      });

      // Em ambientes serverless (ex: Vercel, limite de 4.5 MB por requisição),
      // se anexos PDF em base64 excederem o limite, reenvia o aviso listando os nomes dos arquivos.
      if (resp.status === 413 && Array.isArray(appointment.documents) && appointment.documents.length > 0) {
        const lightweightAppointment: Appointment = {
          ...appointment,
          documents: appointment.documents.map((doc) => ({
            ...doc,
            url: doc.url.startsWith('data:') ? '' : doc.url,
          })),
        };
        resp = await fetch('/api/send-appointment-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment: lightweightAppointment }),
        });
      }

      const rawText = await resp.text().catch(() => '');
      let data: Record<string, any> = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (resp.ok && data.sent) {
        setEmailDispatchState({
          status: 'sent',
          to: data.to || configuredNotificationEmail,
        });
        addToast(
          'E-mail automático enviado!',
          `Comprovante enviado para ${data.to || configuredNotificationEmail}.`
        );
      } else if (data?.needsConfiguration) {
        setEmailDispatchState({
          status: 'needs_config',
          to: data.to || configuredNotificationEmail,
          message: data.message,
        });
      } else {
        const fallbackErr = !resp.ok
          ? `Falha no servidor ao enviar e-mail (HTTP ${resp.status}).`
          : 'Não foi possível concluir o envio automático.';
        setEmailDispatchState({
          status: 'error',
          to: data?.to || configuredNotificationEmail,
          message: data?.error || fallbackErr,
        });
      }
    } catch {
      setEmailDispatchState({
        status: 'error',
        to: configuredNotificationEmail,
        message: 'Falha de conexão ao tentar enviar o e-mail automático.',
      });
    }
  };

  const rememberSessionBookedId = (id: string) => {
    setSessionBookedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, 50);
      try {
        localStorage.setItem(STORAGE_KEYS.SESSION_BOOKED_IDS, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Handlers de Agendamento
  const handleCompleteBooking = (
    bookingData: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'status'>
  ) => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newAppointment: Appointment = {
      ...bookingData,
      id: `apt-${Date.now()}`,
      code: `FL-${randomNum}`,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    setAppointments((prev) => {
      const next = [newAppointment, ...prev];
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    rememberSessionBookedId(newAppointment.id);
    persistAppointmentToBackend(newAppointment);
    setLastBookedAppointment(newAppointment);
    void syncAppointmentToFirestore(newAppointment).catch(() => {});

    const isCommitment = newAppointment.entryType === 'commitment';
    if (!isCommitment || newAppointment.notifyByEmail === true) {
      void triggerAutomaticEmail(newAppointment);
    } else {
      setEmailDispatchState({
        status: 'idle',
        to: configuredNotificationEmail,
      });
    }

    logEvent(
      'booking_completed',
      '/recepcao',
      `${isCommitment ? 'Compromisso' : 'Protocolo'} ${newAppointment.code}: ${newAppointment.clientName} - ${newAppointment.serviceName}`
    );
    addToast(
      isCommitment ? 'Compromisso agendado!' : 'Atendimento agendado!',
      `${newAppointment.clientName} · ${formatDateShortBR(newAppointment.date)} às ${newAppointment.startTime} (${newAppointment.code}).`
    );
    navigateTo('thank-you');
  };

  const handleBookFromAiChat = (
    bookingData: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'status'>
  ): Appointment => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const isCommitment = bookingData.entryType === 'commitment';
    const newAppointment: Appointment = {
      ...bookingData,
      id: `apt-${Date.now()}`,
      code: `FL-${randomNum}`,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    setAppointments((prev) => {
      const next = [newAppointment, ...prev];
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    rememberSessionBookedId(newAppointment.id);
    persistAppointmentToBackend(newAppointment);
    setLastBookedAppointment(newAppointment);
    void syncAppointmentToFirestore(newAppointment).catch(() => {});

    if (!isCommitment || newAppointment.notifyByEmail === true) {
      void triggerAutomaticEmail(newAppointment);
    }

    logEvent(
      'ai_booking_completed',
      '/triagem',
      `${isCommitment ? 'Compromisso' : 'Protocolo'} ${newAppointment.code}: ${newAppointment.clientName} - ${newAppointment.serviceName}`
    );
    addToast(
      isCommitment ? 'Compromisso agendado!' : 'Atendimento confirmado!',
      `${newAppointment.clientName} · ${formatDateShortBR(newAppointment.date)} às ${newAppointment.startTime} (${newAppointment.code}).`
    );
    return newAppointment;
  };

  const handleCreateAppointmentByAdmin = (
    apptData: Omit<Appointment, 'id' | 'code' | 'createdAt' | 'endTime'>
  ) => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newAppointment: Appointment = {
      ...apptData,
      id: `apt-${Date.now()}`,
      code: `FL-${randomNum}`,
      endTime: calculateEndTime(apptData.startTime, apptData.durationMinutes),
      createdAt: new Date().toISOString(),
    };
    setAppointments((prev) => {
      const next = [newAppointment, ...prev];
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    persistAppointmentToBackend(newAppointment);
    void syncAppointmentToFirestore(newAppointment).catch(() => {});
    const isCommitment = newAppointment.entryType === 'commitment';
    if (!isCommitment || newAppointment.notifyByEmail === true) {
      void triggerAutomaticEmail(newAppointment);
    }
    addToast(
      isCommitment ? 'Compromisso registrado' : 'Atendimento registrado',
      `${newAppointment.clientName} em ${formatDateShortBR(newAppointment.date)} às ${newAppointment.startTime}.`
    );
  };

  const handleUpdateAppointment = (updated: Appointment) => {
    setAppointments((prev) => {
      const next = prev.map((a) => (a.id === updated.id ? updated : a));
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    persistAppointmentToBackend(updated);
    void syncAppointmentToFirestore(updated).catch(() => {});
    addToast(
      'Ficha atualizada',
      `Atendimento de ${updated.clientName} (${updated.code}) salvo.`
    );
  };

  const handleUpdateAppointmentStatus = (
    id: string,
    status: AppointmentStatus
  ) => {
    let updatedTarget: Appointment | undefined;
    setAppointments((prev) => {
      const next = prev.map((a) => {
        if (a.id !== id) return a;
        updatedTarget = {
          ...a,
          status,
          completedAt:
            status === 'completed'
              ? a.completedAt || new Date().toISOString()
              : a.completedAt,
        };
        return updatedTarget;
      });
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    const target = updatedTarget || appointments.find((a) => a.id === id);
    if (target) {
      const nextAppt: Appointment = {
        ...target,
        status,
        completedAt:
          status === 'completed'
            ? target.completedAt || new Date().toISOString()
            : target.completedAt,
      };
      persistAppointmentToBackend(nextAppt);
      void syncAppointmentToFirestore(nextAppt).catch(() => {});
      const label =
        status === 'confirmed'
          ? 'Confirmado'
          : status === 'completed'
          ? 'Realizado'
          : status === 'cancelled'
          ? 'Cancelado'
          : 'Pendente';
      addToast(
        `Status: ${label}`,
        `${target.entryType === 'commitment' ? 'Compromisso' : 'Cliente'} ${target.clientName} (${target.startTime}).`
      );
    }
  };

  const handleDeleteAppointment = (id: string) => {
    const target = appointments.find((a) => a.id === id);
    setAppointments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveAppointmentsToLocalStorage(next);
      return next;
    });
    deleteAppointmentFromBackend(id);
    void deleteAppointmentFromFirestore(id).catch(() => {});
    if (target) {
      addToast(
        'Registro excluído',
        `${target.entryType === 'commitment' ? 'Compromisso' : 'Atendimento de'} ${target.clientName} removido.`
      );
    }
  };

  const handleSaveService = (
    serviceData: Omit<ServiceItem, 'id'>,
    existingId?: string
  ) => {
    if (existingId) {
      const updatedItem: ServiceItem = { ...serviceData, id: existingId };
      setServices((prev) =>
        prev.map((s) => (s.id === existingId ? updatedItem : s))
      );
      void syncServiceToFirestore(updatedItem).catch(() => {});
      addToast('Área atualizada', `${serviceData.name} salva com sucesso.`);
    } else {
      const created: ServiceItem = {
        ...serviceData,
        id: `srv-${Date.now()}`,
      };
      setServices((prev) => [...prev, created]);
      void syncServiceToFirestore(created).catch(() => {});
      addToast('Nova área criada', `${created.name} adicionada à pauta.`);
    }
  };

  const handleDeleteService = (id: string) => {
    const target = services.find((s) => s.id === id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    void deleteServiceFromFirestore(id).catch(() => {});
    if (target) {
      addToast('Área removida', `${target.name} excluída.`);
    }
  };

  const handleToggleServiceStatus = (id: string) => {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: ServiceItem = {
          ...s,
          status: s.status === 'active' ? 'inactive' : 'active',
        };
        void syncServiceToFirestore(next).catch(() => {});
        return next;
      })
    );
  };

  const handleImportTemplateServices = () => {
    setServices(TEMPLATE_SERVICES);
    TEMPLATE_SERVICES.forEach((srv) => {
      void syncServiceToFirestore(srv).catch(() => {});
    });
    addToast(
      'Agenda padrão restaurada!',
      'O atendimento compartilhado da Fernandes & Lins foi carregado.'
    );
  };

  const handleUpdateAvailability = (
    config: AvailabilityConfig,
    toastTitle = 'Expediente atualizado',
    toastDesc = 'Os horários do escritório foram salvos.'
  ) => {
    setAvailability(normalizeAvailabilityConfig(config, getInitialAvailability()));
    addToast(toastTitle, toastDesc);
  };

  const handleToggleUserRole = (id: string) => {
    const target = registeredUsers.find((u) => u.id === id);
    if (!target || target.isDefaultMaster) {
      addToast('Ação bloqueada', 'A conta Master principal não pode ser alterada.');
      return;
    }
    const nextRole: UserRole = target.role === 'master' ? 'staff' : 'master';
    setRegisteredUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role: nextRole } : u))
    );
    addToast(
      'Perfil atualizado',
      `${target.name} agora é ${nextRole === 'master' ? 'Master' : 'Funcionário'}.`
    );
  };

  const handleDeleteUser = (id: string) => {
    const target = registeredUsers.find((u) => u.id === id);
    if (!target || target.isDefaultMaster) {
      addToast('Ação bloqueada', 'A conta Master principal é protegida.');
      return;
    }
    setRegisteredUsers((prev) => prev.filter((u) => u.id !== id));
    if (currentUser?.id === id) setCurrentUser(null);
    addToast('Conta removida', `${target.name} excluído(a).`);
  };

  const handleResetDemoData = () => {
    services.forEach((s) => {
      void deleteServiceFromFirestore(s.id).catch(() => {});
    });
    appointments.forEach((a) => {
      void deleteAppointmentFromFirestore(a.id).catch(() => {});
    });
    try {
      localStorage.setItem(STORAGE_KEYS.CLEARED_AT, new Date().toISOString());
    } catch {
      // ignore
    }
    const cleanAppts = getInitialAppointments();
    saveAppointmentsToLocalStorage(cleanAppts);
    setServices(INITIAL_SERVICES);
    setAvailability(getInitialAvailability());
    setAppointments(cleanAppts);
    setRegisteredUsers(INITIAL_USERS);
    setAnalyticsEvents(clearAnalyticsEvents());
    if (!isEphemeralServer()) {
      fetch('/api/db/clear', { method: 'POST', keepalive: true }).catch(() => {});
    }
    addToast(
      'Banco de dados reiniciado!',
      'Agendamentos limpos e configurações restauradas.'
    );
  };

  const activeAppointmentsCount = appointments.filter((a) =>
    isAppointmentUpcoming(a)
  ).length;

  const isStaffOrMaster =
    currentUser?.role === 'master' || currentUser?.role === 'staff';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] selection:bg-[#0B2545] selection:text-[#FACC15]">
      {/* TOP BAR: 3 ZONAS LIMPAS (Marca -> Navegação -> Conta) */}
      <header className="sticky top-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* ZONA 1: Marca (sem subtítulos nem badges) */}
          <button
            type="button"
            onClick={() => navigateTo('booking')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-xl cursor-pointer shrink-0"
          >
            <BrandMark size="md" variant="navy" />
            <span className="font-editorial font-semibold text-lg sm:text-xl tracking-tight text-[#0B2545] whitespace-nowrap">
              Fernandes & Lins
            </span>
          </button>

          {/* ZONA 2: Navegação Principal */}
          <nav
            aria-label="Navegação principal"
            className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              onClick={() => navigateTo('booking')}
              className={`flex items-center gap-1.5 min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                currentView === 'booking' || currentView === 'thank-you'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Recepção</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('my-agenda')}
              className={`flex items-center gap-1.5 min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                currentView === 'my-agenda'
                  ? 'bg-[#0B2545] text-[#FACC15]'
                  : 'text-slate-600 hover:text-[#0B2545]'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Pauta</span>
              {activeAppointmentsCount > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono-tabular ${
                    currentView === 'my-agenda'
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-100 text-[#0B2545]'
                  }`}
                >
                  {activeAppointmentsCount}
                </span>
              )}
            </button>

            {isStaffOrMaster && (
              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className={`flex items-center gap-1.5 min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  currentView === 'admin'
                    ? 'bg-[#0B2545] text-[#FACC15]'
                    : 'text-slate-600 hover:text-[#0B2545]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                <span>{currentUser?.role === 'master' ? 'Master' : 'Painel'}</span>
              </button>
            )}
          </nav>

          {/* ZONA 3: Ação de Conta */}
          <div className="flex items-center gap-1.5 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => navigateTo('auth')}
                  className={`flex items-center gap-2 min-h-[40px] px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                    currentView === 'auth'
                      ? 'bg-[#0B2545] text-white border-[#0B2545]'
                      : 'bg-white hover:bg-blue-50 border-slate-200'
                  }`}
                  title={`${currentUser.name} (${currentUser.role === 'master' ? 'Master' : 'Funcionário'})`}
                >
                  {currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.name}
                      className="w-6 h-6 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        currentView === 'auth'
                          ? 'bg-white/20 text-[#FACC15]'
                          : 'bg-[#0B2545] text-[#FACC15]'
                      }`}
                    >
                      {currentUser.role === 'master' ? (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      ) : (
                        currentUser.name.charAt(0).toUpperCase()
                      )}
                    </div>
                  )}
                  <span
                    className={`hidden md:inline text-xs font-semibold whitespace-nowrap ${
                      currentView === 'auth' ? 'text-white' : 'text-[#0B2545]'
                    }`}
                  >
                    {currentUser.name.split(' ')[0]}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigateTo('auth')}
                className={`flex items-center gap-1.5 min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  currentView === 'auth'
                    ? 'bg-[#0B2545] text-[#FACC15]'
                    : 'bg-[#FACC15] text-[#0B2545] hover:bg-[#EAB308]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {isTransitioning ? (
          <LoadingViewSkeleton />
        ) : (
          <>
            {currentView === 'booking' && (
              <ClientBookingView
                services={services}
                availability={availability}
                appointments={appointments}
                currentUser={currentUser}
                onOpenAuth={() => navigateTo('auth')}
                onOpenMyAgenda={() => navigateTo('my-agenda')}
                onCompleteBooking={handleCompleteBooking}
              />
            )}

            {currentView === 'my-agenda' && (
              <ClientAgendaView
                appointments={appointments}
                availability={availability}
                currentUser={currentUser}
                myBookedIds={sessionBookedIds}
                focusedAppointment={lastBookedAppointment}
                onCancelAppointment={(id) =>
                  handleUpdateAppointmentStatus(id, 'cancelled')
                }
                onUpdateStatus={handleUpdateAppointmentStatus}
                onCreateCommitment={handleCreateAppointmentByAdmin}
                onNewBooking={() => navigateTo('booking')}
                onOpenAuth={() => navigateTo('auth')}
                onOpenAdmin={
                  isStaffOrMaster ? () => navigateTo('admin') : undefined
                }
              />
            )}

            {currentView === 'auth' && (
              <AuthView
                registeredUsers={registeredUsers}
                currentUser={currentUser}
                appointments={appointments}
                onLoginSuccess={handleLoginSuccess}
                onRegisterUser={handleRegisterUser}
                onUpdateProfile={handleUpdateUserProfile}
                onResetPassword={handleResetUserPassword}
                onLogout={handleLogout}
                onBackToBooking={() => navigateTo('booking')}
                onOpenMyAgenda={() => navigateTo('my-agenda')}
                onOpenAdmin={
                  isStaffOrMaster ? () => navigateTo('admin') : undefined
                }
              />
            )}

            {currentView === 'admin' && isStaffOrMaster && currentUser && (
              <AdminDashboardView
                currentUserRole={currentUser.role}
                activeSubTab={adminSubTab}
                onChangeSubTab={setAdminSubTab}
                services={services}
                appointments={appointments}
                availability={availability}
                registeredUsers={registeredUsers}
                analyticsEvents={analyticsEvents}
                onSaveService={handleSaveService}
                onDeleteService={handleDeleteService}
                onToggleServiceStatus={handleToggleServiceStatus}
                onImportTemplateServices={handleImportTemplateServices}
                onUpdateAvailability={handleUpdateAvailability}
                onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
                onUpdateAppointment={handleUpdateAppointment}
                onDeleteAppointment={handleDeleteAppointment}
                onCreateAppointment={handleCreateAppointmentByAdmin}
                onCreateUserByAdmin={handleCreateUserByAdmin}
                onToggleUserRole={handleToggleUserRole}
                onDeleteUser={handleDeleteUser}
                onResetDemoData={handleResetDemoData}
                onOpenClientView={() => navigateTo('booking')}
              />
            )}

            {currentView === 'thank-you' && (
              <ThankYouView
                appointment={lastBookedAppointment}
                targetEmail={configuredNotificationEmail}
                emailDispatchState={emailDispatchState}
                onRetryAutoEmail={triggerAutomaticEmail}
                onNewBooking={() => navigateTo('booking')}
                onGoToMyAgenda={() => navigateTo('my-agenda')}
                onGoToAdmin={
                  isStaffOrMaster ? () => navigateTo('admin') : undefined
                }
              />
            )}

            {currentView === 'privacy' && (
              <PrivacyPolicyView onBack={() => navigateTo('booking')} />
            )}

            {currentView === 'terms' && (
              <TermsOfUseView onBack={() => navigateTo('booking')} />
            )}

            {currentView === 'not-found' && (
              <NotFoundView onBackHome={() => navigateTo('booking')} />
            )}
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <BrandMark size="xs" variant="navy" />
            <div>
              <span className="font-semibold text-[#0B2545]">
                {FIRM_INFO.name}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <span>{FIRM_INFO.address}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => navigateTo('booking')}
              className="hover:text-[#1D4ED8] transition-colors cursor-pointer font-medium"
            >
              Recepção
            </button>
            <button
              type="button"
              onClick={() => navigateTo('my-agenda')}
              className="hover:text-[#1D4ED8] transition-colors cursor-pointer font-medium"
            >
              Pauta Geral
            </button>
            <button
              type="button"
              onClick={() => navigateTo('auth')}
              className="hover:text-[#1D4ED8] transition-colors cursor-pointer font-medium"
            >
              Acessar Conta
            </button>
            {isStaffOrMaster && (
              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className="hover:text-[#1D4ED8] transition-colors cursor-pointer font-medium"
              >
                Painel
              </button>
            )}
            <button
              type="button"
              onClick={() => navigateTo('privacy')}
              className="hover:text-[#1D4ED8] transition-colors cursor-pointer"
            >
              Sigilo LGPD
            </button>
            <button
              type="button"
              onClick={() => navigateTo('terms')}
              className="hover:text-[#1D4ED8] transition-colors cursor-pointer"
            >
              Normas
            </button>
          </div>
        </div>
      </footer>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((item) => item.id !== id))
        }
      />

      <AiBookingChatWidget
        services={services}
        availability={availability}
        appointments={appointments}
        currentUser={currentUser}
        onBookFromChat={handleBookFromAiChat}
        onCancelFromChat={(id) => handleUpdateAppointmentStatus(id, 'cancelled')}
        onOpenMyAgenda={() => navigateTo('my-agenda')}
      />

      <CookieConsentBanner onOpenPrivacy={() => navigateTo('privacy')} />
    </div>
  );
}
export default App;
