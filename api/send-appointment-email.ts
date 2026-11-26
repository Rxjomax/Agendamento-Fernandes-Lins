import type { IncomingMessage, ServerResponse } from 'http';
import {
  sendAppointmentEmail,
  type AppointmentEmailPayload,
} from '../server/resendEmail.js';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    let parsedBody: { appointment?: AppointmentEmailPayload } = {};
    if (typeof req.body === 'string') {
      parsedBody = JSON.parse(req.body || '{}') as {
        appointment?: AppointmentEmailPayload;
      };
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body as { appointment?: AppointmentEmailPayload };
    } else {
      const raw = await readRawBody(req);
      parsedBody = raw
        ? (JSON.parse(raw) as { appointment?: AppointmentEmailPayload })
        : {};
    }

    const result = await sendAppointmentEmail(parsedBody?.appointment);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error('Erro em /api/send-appointment-email (Vercel):', err);
    res.status(500).json({
      sent: false,
      provider: 'resend',
      error: 'Falha ao enviar e-mail automático via Resend.',
    });
  }
}
