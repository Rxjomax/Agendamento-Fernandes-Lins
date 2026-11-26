import type { IncomingMessage, ServerResponse } from 'http';

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method === 'GET') {
    res.status(200).json({
      ephemeral: true,
      hasUserMutations: false,
      appointments: [],
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    res.status(200).json({
      ephemeral: true,
      ok: true,
    });
    return;
  }

  res.status(405).json({ error: 'Método não permitido.' });
}
