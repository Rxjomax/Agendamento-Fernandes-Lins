import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';

export interface EmailConfigStatus {
  provider: 'resend';
  configured: boolean;
  targetEmail: string;
  fromEmail: string;
}

export interface AppointmentEmailPayload {
  code?: string;
  entryType?: 'client' | 'commitment';
  commitmentCategory?: string;
  location?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  clientName?: string;
  clientCpf?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientEmail?: string;
  descriptionMode?: 'complete' | 'brief';
  caseDescription?: string;
  briefSubject?: string;
  notes?: string;
  documents?: Array<{ name?: string; url?: string }>;
}

export interface SendAppointmentEmailResult {
  statusCode: number;
  body: Record<string, unknown>;
}

const MAX_SINGLE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getEmailConfigStatus(): EmailConfigStatus {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const targetEmail = (
    process.env.NOTIFICATION_EMAIL || 'marciel.fernandes@hotmail.com'
  ).trim();
  const rawFrom = (
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    'Fernandes & Lins Assessoria Jurídica <onboarding@resend.dev>'
  ).trim();
  const fromEmail = rawFrom.replace(
    /Fernandes\s*&\s*Lins\s+Advocacia/gi,
    'Fernandes & Lins Assessoria Jurídica'
  );

  return {
    provider: 'resend',
    configured: Boolean(resendApiKey),
    targetEmail,
    fromEmail,
  };
}

export async function sendAppointmentEmail(
  appointment: AppointmentEmailPayload | undefined,
  uploadsDir?: string
): Promise<SendAppointmentEmailResult> {
  if (!appointment || !appointment.clientName || !appointment.date) {
    return {
      statusCode: 400,
      body: { error: 'Dados do agendamento inválidos.' },
    };
  }

  const { targetEmail, fromEmail } = getEmailConfigStatus();
  const isCommitment = appointment.entryType === 'commitment';

  const docsArray = Array.isArray(appointment.documents)
    ? appointment.documents.slice(0, 10)
    : [];

  const subject = isCommitment
    ? `Compromisso na Agenda [${appointment.code || 'FL'}] — ${appointment.clientName} | Fernandes & Lins Assessoria Jurídica`
    : `Novo Agendamento [${appointment.code || 'FL'}] — ${appointment.clientName} | Fernandes & Lins Assessoria Jurídica`;

  let textBody = '';
  let htmlBody = '';

  if (isCommitment) {
    const commitmentObs =
      appointment.briefSubject ||
      appointment.caseDescription ||
      appointment.notes ||
      'Sem observações adicionais.';
    const commitmentCat = appointment.commitmentCategory || 'Compromisso';
    const commitmentLoc =
      appointment.location ||
      'R. Boanerges Pereira, 08 - Sl 06 - Jordão, Recife - PE, 51260-000';

    textBody = [
      'FERNANDES & LINS ASSESSORIA JURÍDICA — COMPROMISSO REGISTRADO NA AGENDA',
      '',
      `Código: ${appointment.code || '-'}`,
      `Compromisso: ${appointment.clientName}`,
      `Categoria: ${commitmentCat}`,
      `Data: ${appointment.date}`,
      `Horário: ${appointment.startTime || '-'} às ${appointment.endTime || '-'} (${appointment.durationMinutes || 45} min)`,
      `Local: ${commitmentLoc}`,
      '',
      'OBSERVAÇÕES:',
      commitmentObs,
    ].join('\n');

    htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #0F172A; max-width: 640px; margin: 0 auto; border: 1px solid #CBD5E1; border-radius: 12px; overflow: hidden;">
        <div style="background: #0B2545; color: #FFFFFF; padding: 20px 24px;">
          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #FACC15; font-weight: bold;">Fernandes &amp; Lins Assessoria Jurídica · Compromisso</p>
          <h2 style="margin: 6px 0 0; font-size: 20px;">${escapeHtml(appointment.clientName)}</h2>
        </div>
        <div style="padding: 20px 24px; background: #FFFFFF; font-size: 14px; line-height: 1.55;">
          <p style="margin: 0 0 8px;"><strong>Código:</strong> ${escapeHtml(appointment.code)}</p>
          <p style="margin: 0 0 8px;"><strong>Categoria:</strong> ${escapeHtml(commitmentCat)}</p>
          <p style="margin: 0 0 8px;"><strong>Data e Horário:</strong> ${escapeHtml(appointment.date)} · ${escapeHtml(appointment.startTime)} às ${escapeHtml(appointment.endTime)} (${escapeHtml(appointment.durationMinutes || 45)} min)</p>
          <p style="margin: 0 0 12px;"><strong>Local:</strong> ${escapeHtml(commitmentLoc)}</p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
          <p style="margin: 0 0 6px;"><strong>Observações:</strong></p>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; white-space: pre-line;">${escapeHtml(commitmentObs)}</div>
        </div>
      </div>
    `;
  } else {
    const caseModeLabel =
      appointment.descriptionMode === 'complete'
        ? 'Descrição Completa + PDFs'
        : 'Descrição Breve / Assunto';
    const caseContent =
      appointment.descriptionMode === 'complete'
        ? appointment.caseDescription || 'Não informado'
        : appointment.briefSubject || 'Não informado';
    const docsText =
      docsArray.length > 0
        ? docsArray
            .map((d) => `- ${d?.name || 'documento.pdf'}`)
            .join('\n')
        : 'Nenhum documento PDF anexado';

    textBody = [
      'FERNANDES & LINS ASSESSORIA JURÍDICA — NOVO ATENDIMENTO REGISTRADO',
      '',
      `Protocolo: ${appointment.code || '-'}`,
      `Data: ${appointment.date}`,
      `Horário: ${appointment.startTime || '-'} às ${appointment.endTime || '-'} (${appointment.durationMinutes || 45} min)`,
      '',
      'DADOS DO CLIENTE:',
      `Nome: ${appointment.clientName}`,
      `CPF: ${appointment.clientCpf || 'Não informado'}`,
      `Telefone/WhatsApp: ${appointment.clientPhone || 'Não informado'}`,
      `Endereço: ${appointment.clientAddress || 'Não informado'}`,
      ...(appointment.clientEmail
        ? [`E-mail do Cliente: ${appointment.clientEmail}`]
        : []),
      '',
      `REGISTRO (${caseModeLabel}):`,
      caseContent,
      '',
      'DOCUMENTAÇÃO EM PDF:',
      docsText,
    ].join('\n');

    htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #0F172A; max-width: 640px; margin: 0 auto; border: 1px solid #CBD5E1; border-radius: 12px; overflow: hidden;">
        <div style="background: #0B2545; color: #FFFFFF; padding: 20px 24px;">
          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #FACC15; font-weight: bold;">Fernandes &amp; Lins Assessoria Jurídica</p>
          <h2 style="margin: 6px 0 0; font-size: 20px;">Novo Agendamento: ${escapeHtml(appointment.clientName)}</h2>
        </div>
        <div style="padding: 20px 24px; background: #FFFFFF; font-size: 14px; line-height: 1.55;">
          <p style="margin: 0 0 12px;"><strong>Protocolo:</strong> ${escapeHtml(appointment.code)}</p>
          <p style="margin: 0 0 12px;"><strong>Data e Horário:</strong> ${escapeHtml(appointment.date)} · ${escapeHtml(appointment.startTime)} às ${escapeHtml(appointment.endTime)}</p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
          <p style="margin: 0 0 6px;"><strong>CPF:</strong> ${escapeHtml(appointment.clientCpf || 'Não informado')}</p>
          <p style="margin: 0 0 6px;"><strong>Telefone / WhatsApp:</strong> ${escapeHtml(appointment.clientPhone || 'Não informado')}</p>
          <p style="margin: 0 0 6px;"><strong>Endereço:</strong> ${escapeHtml(appointment.clientAddress || 'Não informado')}</p>
          ${appointment.clientEmail ? `<p style="margin: 0 0 6px;"><strong>E-mail do Cliente:</strong> ${escapeHtml(appointment.clientEmail)}</p>` : ''}
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
          <p style="margin: 0 0 6px;"><strong>${escapeHtml(caseModeLabel)}:</strong></p>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; white-space: pre-line;">${escapeHtml(caseContent)}</div>
          <p style="margin: 14px 0 4px;"><strong>Documentação em PDF (${docsArray.length}):</strong></p>
          <pre style="margin: 0; font-family: Arial, sans-serif; color: #334155;">${escapeHtml(docsText)}</pre>
        </div>
      </div>
    `;
  }

  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!resendApiKey) {
    return {
      statusCode: 200,
      body: {
        sent: false,
        needsConfiguration: true,
        provider: 'resend',
        to: targetEmail,
        subject,
        message: `Envio automático via Resend configurado para ${targetEmail}, mas falta definir a variável secreta RESEND_API_KEY nas Environment Variables do servidor (AI Studio ou Vercel).`,
      },
    };
  }

  const uploadsBaseDir = uploadsDir ? path.resolve(uploadsDir) : null;
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  let totalAttachmentBytes = 0;

  for (const doc of docsArray) {
    const docUrl = typeof doc?.url === 'string' ? doc.url : '';
    const rawName = String(doc?.name || 'documento.pdf')
      .replace(/[\r\n"/\\]/g, '_')
      .slice(0, 120);
    const filename = rawName.toLowerCase().endsWith('.pdf')
      ? rawName
      : `${rawName}.pdf`;

    if (docUrl.startsWith('data:application/pdf;base64,')) {
      const base64Data = docUrl.slice('data:application/pdf;base64,'.length);
      const buffer = Buffer.from(base64Data, 'base64');
      if (
        buffer.length > 0 &&
        buffer.length <= MAX_SINGLE_ATTACHMENT_BYTES &&
        totalAttachmentBytes + buffer.length <= MAX_TOTAL_ATTACHMENT_BYTES
      ) {
        totalAttachmentBytes += buffer.length;
        attachments.push({ filename, content: buffer });
      }
      continue;
    }

    if (uploadsBaseDir && docUrl.startsWith('/api/uploads/')) {
      const safeFileName = path.basename(docUrl);
      if (!safeFileName || safeFileName === '.' || safeFileName === '..') continue;
      const resolvedFile = path.resolve(uploadsBaseDir, safeFileName);
      if (!resolvedFile.startsWith(uploadsBaseDir + path.sep)) continue;

      if (fs.existsSync(resolvedFile)) {
        const stat = fs.statSync(resolvedFile);
        if (
          stat.isFile() &&
          stat.size <= MAX_SINGLE_ATTACHMENT_BYTES &&
          totalAttachmentBytes + stat.size <= MAX_TOTAL_ATTACHMENT_BYTES
        ) {
          totalAttachmentBytes += stat.size;
          attachments.push({
            filename,
            content: fs.readFileSync(resolvedFile),
          });
        }
      }
    }
  }

  const clientReplyTo =
    typeof appointment.clientEmail === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointment.clientEmail.trim())
      ? appointment.clientEmail.trim()
      : undefined;

  try {
    const resend = new Resend(resendApiKey);
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: fromEmail,
      to: [targetEmail],
      ...(clientReplyTo ? { replyTo: clientReplyTo } : {}),
      subject,
      text: textBody,
      html: htmlBody,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (resendError) {
      return {
        statusCode: 502,
        body: {
          sent: false,
          provider: 'resend',
          to: targetEmail,
          error: `Resend recusou o envio: ${resendError.message}`,
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        sent: true,
        provider: 'resend',
        to: targetEmail,
        messageId: resendData?.id,
        attachmentsCount: attachments.length,
      },
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: {
        sent: false,
        provider: 'resend',
        to: targetEmail,
        error:
          err instanceof Error
            ? `Erro ao enviar via Resend: ${err.message}`
            : 'Erro inesperado ao enviar via Resend.',
      },
    };
  }
}
