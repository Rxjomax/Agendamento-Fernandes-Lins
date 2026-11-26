import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getEmailConfigStatus,
  sendAppointmentEmail,
} from './server/resendEmail';
import {
  runAiBookingChat,
  type AvailabilityInput,
} from './server/aiBookingChat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'database.json');

interface PersistedDatabaseState {
  services: unknown[];
  availability: AvailabilityInput & { googleReviewUrl?: string };
  appointments: unknown[];
  registeredUsers: unknown[];
  hasUserMutations?: boolean;
  clearedAt?: string;
  updatedAt: string;
}

const DEFAULT_LEGAL_SERVICES = [
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

function getCleanInitialDbState(): PersistedDatabaseState {
  return {
    services: DEFAULT_LEGAL_SERVICES,
    availability: {
      workDays: [1, 2, 3, 4, 5],
      startTime: '08:00',
      endTime: '18:00',
      lunchEnabled: true,
      lunchStart: '12:00',
      lunchEnd: '14:00',
      slotIntervalMinutes: 45,
      googleReviewUrl:
        'https://www.google.com/maps/search/?api=1&query=Fernandes+Lins+Advocacia+Recife',
      blockedDates: [],
    },
    appointments: [],
    registeredUsers: [
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
    ],
    updatedAt: new Date().toISOString(),
  };
}

function loadDbState(): PersistedDatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE_PATH)) {
      const initial = getCleanInitialDbState();
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed.registeredUsers) ? parsed.registeredUsers : [];
    const isLegacyBarbershop =
      users.some(
        (u: { email?: string }) =>
          String(u?.email || '').toLowerCase() === 'admin@ateliervertice.com.br'
      ) &&
      !users.some(
        (u: { email?: string }) =>
          String(u?.email || '').toLowerCase() === 'master@fernandeslins.adv.br'
      );

    if (isLegacyBarbershop) {
      const migrated = getCleanInitialDbState();
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(migrated, null, 2), 'utf-8');
      return migrated;
    }

    const rawServices = Array.isArray(parsed.services) ? parsed.services : [];
    const hasLegacyThreeLawyers = rawServices.some(
      (s: { specialist?: string }) =>
        String(s?.specialist || '').includes('Eduardo Vasconcelos')
    );

    const normalizedServices =
      rawServices.length > 0 && !hasLegacyThreeLawyers
        ? rawServices
        : DEFAULT_LEGAL_SERVICES;

    const parsedAvail = parsed.availability;
    const isVeryOldDefault =
      parsedAvail &&
      parsedAvail.startTime === '08:30' &&
      parsedAvail.endTime === '18:30' &&
      parsedAvail.lunchStart === '12:00' &&
      parsedAvail.lunchEnd === '13:30' &&
      !parsedAvail.dayOverrides;

    const isPreviousSaturdayDefault =
      parsedAvail &&
      parsedAvail.startTime === '08:00' &&
      parsedAvail.endTime === '18:00' &&
      Array.isArray(parsedAvail.workDays) &&
      parsedAvail.workDays.includes(6) &&
      parsedAvail.dayOverrides?.[6]?.startTime === '05:00' &&
      parsedAvail.dayOverrides?.[6]?.endTime === '20:00';

    const isOldDefaultSchedule = Boolean(isVeryOldDefault || isPreviousSaturdayDefault);

    const normalizedAvailability =
      parsedAvail && !isOldDefaultSchedule
        ? parsedAvail
        : getCleanInitialDbState().availability;

    if (hasLegacyThreeLawyers || isOldDefaultSchedule) {
      const migratedState: PersistedDatabaseState = {
        services: normalizedServices,
        availability: normalizedAvailability,
        appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
        registeredUsers:
          users.length > 0 ? users : getCleanInitialDbState().registeredUsers,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(migratedState, null, 2), 'utf-8');
      return migratedState;
    }

    return {
      services: normalizedServices,
      availability: normalizedAvailability,
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      registeredUsers:
        users.length > 0 ? users : getCleanInitialDbState().registeredUsers,
      hasUserMutations: Boolean(parsed.hasUserMutations),
      ...(parsed.clearedAt ? { clearedAt: String(parsed.clearedAt) } : {}),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return getCleanInitialDbState();
  }
}

function writeDbFileAtomic(state: PersistedDatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_FILE_PATH);
}

function saveDbState(nextState: Partial<PersistedDatabaseState>): PersistedDatabaseState {
  const current = loadDbState();
  const merged: PersistedDatabaseState = {
    services: Array.isArray(nextState.services) ? nextState.services : current.services,
    availability: nextState.availability || current.availability,
    appointments: Array.isArray(nextState.appointments)
      ? nextState.appointments
      : current.appointments,
    registeredUsers: Array.isArray(nextState.registeredUsers)
      ? nextState.registeredUsers
      : current.registeredUsers,
    hasUserMutations:
      typeof nextState.hasUserMutations === 'boolean'
        ? nextState.hasUserMutations
        : current.hasUserMutations || true,
    ...(nextState.clearedAt || current.clearedAt
      ? { clearedAt: nextState.clearedAt || current.clearedAt }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  try {
    writeDbFileAtomic(merged);
  } catch (err) {
    console.error('Erro ao salvar database.json:', err);
  }
  return merged;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  app.use('/api/uploads', express.static(UPLOADS_DIR));

  app.post('/api/upload-image', (req, res) => {
    try {
      const { dataUrl, prefix = 'photo' } = req.body || {};
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        res.status(400).json({ error: 'Formato de imagem inválido.' });
        return;
      }
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: 'Dados base64 inválidos.' });
        return;
      }
      const extRaw = matches[1].toLowerCase();
      const ext = extRaw === 'png' ? 'png' : extRaw === 'webp' ? 'webp' : 'jpg';
      const base64Data = matches[2];
      const safePrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'photo';
      const filename = `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      res.json({ url: `/api/uploads/${filename}` });
    } catch (err) {
      console.error('Erro em /api/upload-image:', err);
      res.status(500).json({ error: 'Falha ao salvar imagem no servidor.' });
    }
  });

  app.post('/api/upload-pdf', (req, res) => {
    try {
      const { dataUrl, fileName = 'documento.pdf', size = 0 } = req.body || {};
      if (
        typeof dataUrl !== 'string' ||
        !dataUrl.startsWith('data:application/pdf;base64,')
      ) {
        res.status(400).json({ error: 'Envie apenas arquivos em formato PDF.' });
        return;
      }
      const base64Data = dataUrl.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ error: 'O arquivo PDF excede 10 MB.' });
        return;
      }
      const cleanName =
        String(fileName)
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 80) || 'documento.pdf';
      const uniqueName = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.pdf`}`;
      const filePath = path.join(UPLOADS_DIR, uniqueName);
      fs.writeFileSync(filePath, buffer);
      res.json({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: String(fileName).slice(0, 120),
        size: Number(size) || buffer.length,
        url: `/api/uploads/${uniqueName}`,
        uploadedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro em /api/upload-pdf:', err);
      res.status(500).json({ error: 'Falha ao salvar PDF no servidor.' });
    }
  });

  app.get('/api/db/state', (_req, res) => {
    const state = loadDbState();
    res.json(state);
  });

  app.put('/api/db/state', (req, res) => {
    const { services, availability, appointments, registeredUsers } = req.body || {};
    const updated = saveDbState({
      services,
      availability,
      appointments,
      registeredUsers,
      hasUserMutations: true,
    });
    res.json(updated);
  });

  app.post('/api/db/appointments', (req, res) => {
    const { appointment } = req.body || {};
    if (!appointment || typeof appointment.id !== 'string') {
      res.status(400).json({ error: 'Agendamento inválido.' });
      return;
    }
    const current = loadDbState();
    const list = Array.isArray(current.appointments)
      ? (current.appointments as Array<{ id?: string }>)
      : [];
    const idx = list.findIndex((a) => a?.id === appointment.id);
    const nextList =
      idx >= 0
        ? list.map((a) => (a?.id === appointment.id ? appointment : a))
        : [appointment, ...list];
    const updated = saveDbState({
      appointments: nextList,
      hasUserMutations: true,
    });
    res.json({ ok: true, appointmentsCount: updated.appointments.length });
  });

  app.delete('/api/db/appointments/:id', (req, res) => {
    const targetId = String(req.params.id || '');
    const current = loadDbState();
    const list = Array.isArray(current.appointments)
      ? (current.appointments as Array<{ id?: string }>)
      : [];
    const nextList = list.filter((a) => a?.id !== targetId);
    const updated = saveDbState({
      appointments: nextList,
      hasUserMutations: true,
    });
    res.json({ ok: true, appointmentsCount: updated.appointments.length });
  });

  app.post('/api/db/clear', (_req, res) => {
    const clean: PersistedDatabaseState = {
      ...getCleanInitialDbState(),
      hasUserMutations: true,
      clearedAt: new Date().toISOString(),
    };
    try {
      writeDbFileAtomic(clean);
    } catch (err) {
      console.error('Erro ao zerar database.json:', err);
    }
    res.json(clean);
  });

  app.get('/api/email-config/status', (_req, res) => {
    res.json(getEmailConfigStatus());
  });

  app.post('/api/send-appointment-email', async (req, res) => {
    try {
      const { appointment } = req.body || {};
      const result = await sendAppointmentEmail(appointment, UPLOADS_DIR);
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      console.error('Erro em /api/send-appointment-email (Resend):', err);
      res.status(500).json({
        sent: false,
        provider: 'resend',
        error: 'Falha ao enviar e-mail automático via Resend.',
      });
    }
  });

  app.post('/api/ai-booking-chat', async (req, res) => {
    const result = await runAiBookingChat(req.body || {});
    res.status(result.statusCode).json(result.body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fernandes & Lins Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
