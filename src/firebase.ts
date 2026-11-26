import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Appointment, ServiceItem } from './types/scheduling';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export { onAuthStateChanged, firebaseSignOut };
export type { FirebaseUser };

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

function sanitizeId(rawId: string): string {
  return rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128) || 'id-1';
}

export async function syncServiceToFirestore(service: ServiceItem): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeId(service.id);
  const path = `services/${docId}`;
  const docRef = doc(db, 'services', docId);
  try {
    const safeImageUrl =
      service.imageUrl && service.imageUrl.length <= 500
        ? service.imageUrl
        : '';
    const baseFields = {
      name: service.name.slice(0, 120),
      description: (service.description || '').slice(0, 500),
      durationMinutes: Math.min(Math.max(Number(service.durationMinutes) || 30, 5), 480),
      price: Math.min(Math.max(Number(service.price) || 0, 0), 50000),
      status: service.status === 'inactive' ? 'inactive' : 'active',
      category: (service.category || 'Geral').slice(0, 80),
      specialist: (service.specialist || 'Advogado(a)').slice(0, 120),
      ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
    };
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        id: docId,
        ...baseFields,
        ownerId: sanitizeId(user.uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        ...baseFields,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteServiceFromFirestore(serviceId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeId(serviceId);
  const path = `services/${docId}`;
  try {
    await deleteDoc(doc(db, 'services', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncAppointmentToFirestore(
  appointment: Appointment
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeId(appointment.id);
  const path = `appointments/${docId}`;
  const docRef = doc(db, 'appointments', docId);
  try {
    const safeCpf =
      appointment.clientCpf && appointment.clientCpf.trim().length >= 11
        ? appointment.clientCpf.trim().slice(0, 20)
        : '000.000.000-00';
    const safeAddress =
      appointment.clientAddress && appointment.clientAddress.trim().length >= 3
        ? appointment.clientAddress.trim().slice(0, 240)
        : 'Endereço informado na recepção';
    const mode = appointment.descriptionMode === 'brief' ? 'brief' : 'complete';
    const docsCount = Math.min(
      Math.max(Number(appointment.documents?.length || 0), 0),
      20
    );
    const entryType =
      appointment.entryType === 'commitment' ? 'commitment' : 'client';
    const safeCategory = (appointment.commitmentCategory || '').trim().slice(0, 80);
    const safeLocation = (appointment.location || '').trim().slice(0, 240);

    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      // Garante que o documento de serviço referenciado pelas regras exista antes do create
      const srvId = sanitizeId(appointment.serviceId || 'srv-atendimento-juridico');
      const srvRef = doc(db, 'services', srvId);
      const srvSnap = await getDoc(srvRef);
      if (!srvSnap.exists()) {
        await setDoc(srvRef, {
          id: srvId,
          name: (appointment.serviceName || 'Atendimento Jurídico').slice(0, 120),
          description: 'Atendimento jurídico compartilhado Fernandes & Lins.',
          durationMinutes: Math.min(Math.max(Number(appointment.durationMinutes) || 45, 5), 480),
          price: 0,
          status: 'active',
          category: 'Fernandes & Lins',
          specialist: 'Fernandes & Lins',
          ownerId: sanitizeId(user.uid),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await setDoc(docRef, {
        id: docId,
        code: (appointment.code || 'FL-0000').slice(0, 32),
        serviceId: srvId,
        serviceName: (appointment.serviceName || 'Atendimento Jurídico').slice(0, 120),
        ...(appointment.lawyerName
          ? { lawyerName: appointment.lawyerName.slice(0, 120) }
          : {}),
        durationMinutes: Math.min(
          Math.max(Number(appointment.durationMinutes) || 45, 5),
          480
        ),
        price: 0,
        date: appointment.date.slice(0, 10),
        startTime: appointment.startTime.slice(0, 5),
        endTime: appointment.endTime.slice(0, 5),
        clientName: (appointment.clientName || 'Cliente').slice(0, 120),
        clientPhone: (appointment.clientPhone || '(81) 99999-9999').slice(0, 30),
        clientCpf: safeCpf,
        clientAddress: safeAddress,
        ...(appointment.clientEmail
          ? { clientEmail: appointment.clientEmail.slice(0, 150) }
          : {}),
        descriptionMode: mode,
        ...(appointment.caseDescription
          ? { caseDescription: appointment.caseDescription.slice(0, 4000) }
          : {}),
        ...(appointment.briefSubject
          ? { briefSubject: appointment.briefSubject.slice(0, 300) }
          : {}),
        documentsCount: docsCount,
        entryType,
        ...(safeCategory ? { commitmentCategory: safeCategory } : {}),
        ...(safeLocation ? { location: safeLocation } : {}),
        status: appointment.status,
        ownerId: sanitizeId(user.uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        date: appointment.date.slice(0, 10),
        startTime: appointment.startTime.slice(0, 5),
        endTime: appointment.endTime.slice(0, 5),
        status: appointment.status,
        ...(appointment.lawyerName
          ? { lawyerName: appointment.lawyerName.slice(0, 120) }
          : {}),
        clientName: (appointment.clientName || 'Cliente').slice(0, 120),
        clientPhone: (appointment.clientPhone || '(81) 99999-9999').slice(0, 30),
        clientCpf: safeCpf,
        clientAddress: safeAddress,
        ...(appointment.clientEmail
          ? { clientEmail: appointment.clientEmail.slice(0, 150) }
          : {}),
        descriptionMode: mode,
        ...(appointment.caseDescription !== undefined
          ? { caseDescription: (appointment.caseDescription || '').slice(0, 4000) }
          : {}),
        ...(appointment.briefSubject !== undefined
          ? { briefSubject: (appointment.briefSubject || '').slice(0, 300) }
          : {}),
        documentsCount: docsCount,
        entryType,
        ...(appointment.commitmentCategory !== undefined
          ? { commitmentCategory: safeCategory }
          : {}),
        ...(appointment.location !== undefined
          ? { location: safeLocation }
          : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAppointmentFromFirestore(
  appointmentId: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeId(appointmentId);
  const path = `appointments/${docId}`;
  try {
    await deleteDoc(doc(db, 'appointments', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncUserProfileToFirestore(profile: {
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const uid = sanitizeId(user.uid);
  const path = `users/${uid}/private/info`;
  try {
    const rawAvatar = profile.avatarUrl || user.photoURL || '';
    const safeAvatarUrl = rawAvatar.length <= 500 ? rawAvatar : '';
    await setDoc(doc(db, 'users', uid, 'private', 'info'), {
      uid,
      name: (profile.name || user.displayName || 'Usuário').slice(0, 120),
      email: (profile.email || user.email || '').slice(0, 150),
      phone: (profile.phone || '(81) 99999-9999').slice(0, 30),
      ...(safeAvatarUrl ? { avatarUrl: safeAvatarUrl } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToAuthenticatedServices(
  onData: (services: ServiceItem[]) => void
): () => void {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return () => {};

  const q = query(
    collection(db, 'services'),
    where('status', '==', 'active')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ServiceItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          durationMinutes: data.durationMinutes,
          price: data.price,
          status: data.status,
          category: data.category,
          specialist: data.specialist,
          imageUrl: data.imageUrl,
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'services');
    }
  );
}

export function subscribeToAuthenticatedAppointments(
  onData: (appointments: Appointment[]) => void
): () => void {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return () => {};

  const isOwnerEmail =
    (user.email || '').toLowerCase() === 'jm783311@gmail.com';
  const q = isOwnerEmail
    ? query(collection(db, 'appointments'))
    : query(
        collection(db, 'appointments'),
        where('ownerId', '==', sanitizeId(user.uid))
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Appointment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          code: data.code,
          entryType: data.entryType === 'commitment' ? 'commitment' : 'client',
          commitmentCategory: data.commitmentCategory || undefined,
          location: data.location || undefined,
          serviceId: data.serviceId,
          serviceName: data.serviceName,
          lawyerName: data.lawyerName,
          durationMinutes: Number(data.durationMinutes) || 45,
          price: Number(data.price) || 0,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          clientName: data.clientName,
          clientPhone: data.entryType === 'commitment' && data.clientPhone === '(81) 99999-9999' ? '' : data.clientPhone,
          clientCpf: data.entryType === 'commitment' && data.clientCpf === '000.000.000-00' ? '' : data.clientCpf,
          clientAddress: data.entryType === 'commitment' && data.clientAddress === 'Endereço informado na recepção' ? '' : data.clientAddress,
          clientEmail: data.clientEmail,
          descriptionMode: data.descriptionMode === 'brief' ? 'brief' : 'complete',
          caseDescription: data.caseDescription,
          briefSubject: data.briefSubject,
          documents: [],
          status: data.status || 'confirmed',
          createdAt:
            typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : new Date().toISOString(),
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    }
  );
}
