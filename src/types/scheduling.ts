export type UserRole = 'master' | 'staff';

export type ServiceStatus = 'active' | 'inactive';

export type DescriptionMode = 'complete' | 'brief';

export interface AppointmentDocument {
  id: string;
  name: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  status: ServiceStatus;
  category: string;
  specialist: string; // Advogado responsável
  imageUrl?: string;
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed';

export type EntryType = 'client' | 'commitment';

export interface AppointmentReview {
  rating: number;
  comment: string;
  createdAt: string;
  sharedOnGoogle?: boolean;
}

export interface Appointment {
  id: string;
  code: string;
  entryType?: EntryType;
  commitmentCategory?: string;
  location?: string;
  notifyByEmail?: boolean;
  serviceId: string;
  serviceName: string;
  lawyerName?: string;
  durationMinutes: number;
  price: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  clientName: string;
  clientPhone: string;
  clientCpf: string;
  clientAddress: string;
  clientEmail: string;
  descriptionMode: DescriptionMode;
  caseDescription?: string;
  briefSubject?: string;
  documents?: AppointmentDocument[];
  notes?: string;
  status: AppointmentStatus;
  completedAt?: string;
  completedNotes?: string;
  paymentMethod?: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro' | 'outro';
  review?: AppointmentReview;
  createdByUserId?: string;
  createdByRole?: UserRole;
  createdAt: string;
}

export interface BlockedDate {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface DayScheduleOverride {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lunchEnabled?: boolean;
  lunchStart?: string; // HH:mm
  lunchEnd?: string; // HH:mm
}

export interface AvailabilityConfig {
  workDays: number[]; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lunchEnabled: boolean;
  lunchStart: string; // HH:mm
  lunchEnd: string; // HH:mm
  slotIntervalMinutes: number;
  blockedDates: BlockedDate[];
  googleReviewUrl?: string;
  dayOverrides?: Record<number, DayScheduleOverride>;
}

export interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  oab?: string;
  avatarUrl?: string;
  createdAt: string;
  isDefaultMaster?: boolean;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  oab?: string;
  avatarUrl?: string;
  firmName: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: 'default' | 'success' | 'warning';
}
