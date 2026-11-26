import type { IncomingMessage, ServerResponse } from 'http';
import {
  runAiBookingChat,
  type AiBookingChatRequestBody,
} from '../server/aiBookingChat';

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
        ? (JSON.parse(req.body) as AiBookingChatRequestBody)
        : ((req.body || {}) as AiBookingChatRequestBody);

    const result = await runAiBookingChat(parsedBody);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error('Erro em /api/ai-booking-chat (Vercel):', err);
    res.status(500).json({
      error: 'Não foi possível consultar o assistente de agenda no momento.',
    });
  }
}
