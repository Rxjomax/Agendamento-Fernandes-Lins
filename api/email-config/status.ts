import type { IncomingMessage, ServerResponse } from 'http';
import { getEmailConfigStatus } from '../../server/resendEmail';

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }
  res.status(200).json(getEmailConfigStatus());
}
