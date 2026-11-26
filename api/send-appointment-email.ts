import type { IncomingMessage, ServerResponse } from 'http';
import {
  sendAppointmentEmail,
  type AppointmentEmailPayload,
} from '../server/resendEmail';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
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
    const parsedBody =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as { appointment?: AppointmentEmailPayload })
        : ((req.body || {}) as { appointment?: AppointmentEmailPayload });

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
