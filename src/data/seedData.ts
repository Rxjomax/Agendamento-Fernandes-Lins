import {
  Appointment,
  AvailabilityConfig,
  RegisteredUser,
  ServiceItem,
  UserSession,
} from '../types/scheduling';

export const FIRM_INFO = {
  name: 'Fernandes & Lins Assessoria Jurídica',
  shortName: 'Fernandes & Lins',
  tagline: 'Advocacia Cível, Trabalhista, Previdenciária e Criminal.',
  address: 'R. Boanerges Pereira, 08 - Sl 06 - Jordão, Recife - PE, 51260-000',
  phone: '(81) 8669-3251',
  email: 'marciel.fernandes@hotmail.com',
};

export const INITIAL_USERS: RegisteredUser[] = [
  {
    id: 'usr-master-1',
    name: 'Marciel Fernandes',
    email: 'master@fernandeslins.adv.br',
    phone: '(81) 99810-4001',
    password: 'master123',
    role: 'master',
    createdAt: new Date().toISOString(),
    isDefaultMaster: true,
  },
  {
    id: 'usr-staff-1',
    name: 'Mariana Costa',
    email: 'secretaria@fernandeslins.adv.br',
    phone: '(81) 99810-4002',
    password: 'func123',
    role: 'staff',
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_MASTER_USER: UserSession = {
  id: INITIAL_USERS[0].id,
  name: INITIAL_USERS[0].name,
  email: INITIAL_USERS[0].email,
  phone: INITIAL_USERS[0].phone,
  role: 'master',
  oab: INITIAL_USERS[0].oab,
  firmName: FIRM_INFO.name,
};

export const DEFAULT_STAFF_USER: UserSession = {
  id: INITIAL_USERS[1].id,
  name: INITIAL_USERS[1].name,
  email: INITIAL_USERS[1].email,
  phone: INITIAL_USERS[1].phone,
  role: 'staff',
  firmName: FIRM_INFO.name,
};

export const TEMPLATE_SERVICES: ServiceItem[] = [
  {
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
];

export const INITIAL_SERVICES: ServiceItem[] = TEMPLATE_SERVICES;

export const DEFAULT_GOOGLE_REVIEW_URL =
  'https://www.google.com/maps/search/?api=1&query=Fernandes+Lins+Assessoria+Juridica+Recife';

export function getInitialAvailability(): AvailabilityConfig {
  return {
    workDays: [1, 2, 3, 4, 5], // Segunda a Sexta (Sábado e Domingo fechados)
    startTime: '08:00',
    endTime: '18:00',
    lunchEnabled: true,
    lunchStart: '12:00',
    lunchEnd: '14:00',
    slotIntervalMinutes: 45,
    googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
    blockedDates: [],
  };
}

export function getInitialAppointments(): Appointment[] {
  return [];
}
