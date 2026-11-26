import { Appointment } from '../types/scheduling';
import { formatDateLongBR, formatDateShortBR } from './timeSlots';

export const FIRM_ADDRESS =
  'R. Boanerges Pereira, 08 - Sl 06 - Jordão, Recife - PE, 51260-000';

export const FIRM_WHATSAPP_NUMBER = '558186693251';
export const FIRM_WHATSAPP_DISPLAY = '+55 81 8669-3251';
export const DEFAULT_NOTIFICATION_EMAIL = 'marciel.fernandes@hotmail.com';

export function formatPhoneForWhatsApp(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

export function buildWhatsAppVoucherText(appointment: Appointment): string {
  const statusLabel =
    appointment.status === 'confirmed'
      ? 'Confirmado'
      : appointment.status === 'pending'
      ? 'Aguardando Confirmação'
      : appointment.status === 'completed'
      ? 'Realizado'
      : 'Cancelado';

  if (appointment.entryType === 'commitment') {
    const obs =
      appointment.briefSubject ||
      appointment.caseDescription ||
      appointment.notes ||
      '';
    return [
      `*COMPROMISSO NA AGENDA — FERNANDES & LINS ASSESSORIA JURÍDICA*`,
      ``,
      `• *Código:* ${appointment.code}`,
      `• *Compromisso:* ${appointment.clientName}`,
      ...(appointment.commitmentCategory
        ? [`• *Categoria:* ${appointment.commitmentCategory}`]
        : []),
      `• *Status:* ${statusLabel}`,
      `• *Data:* ${formatDateShortBR(appointment.date)} (${formatDateLongBR(appointment.date)})`,
      `• *Horário:* ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
      `• *Local:* ${appointment.location || FIRM_ADDRESS}`,
      ...(obs ? [`• *Observações:* ${obs}`] : []),
    ].join('\n');
  }

  const caseText =
    appointment.descriptionMode === 'complete'
      ? appointment.caseDescription || 'Relato completo registrado.'
      : appointment.briefSubject || 'Consulta jurídica';

  const docsInfo =
    appointment.documents && appointment.documents.length > 0
      ? `${appointment.documents.length} PDF(s) anexado(s)`
      : 'Sem PDFs anexados';

  return [
    `*NOVO ATENDIMENTO — FERNANDES & LINS ASSESSORIA JURÍDICA*`,
    ``,
    `• *Protocolo:* ${appointment.code}`,
    `• *Status:* ${statusLabel}`,
    `• *Data:* ${formatDateShortBR(appointment.date)} (${formatDateLongBR(appointment.date)})`,
    `• *Horário:* ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
    `• *Cliente:* ${appointment.clientName}`,
    `• *Telefone/WhatsApp do Cliente:* ${appointment.clientPhone}`,
    `• *CPF:* ${appointment.clientCpf}`,
    `• *Endereço:* ${appointment.clientAddress}`,
    ...(appointment.clientEmail ? [`• *E-mail do Cliente:* ${appointment.clientEmail}`] : []),
    `• *Modo de Registro:* ${
      appointment.descriptionMode === 'complete'
        ? 'Descrição Completa'
        : 'Descrição Breve'
    }`,
    `• *Descrição / Assunto:* ${caseText}`,
    `• *Documentação:* ${docsInfo}`,
    `• *Local:* ${FIRM_ADDRESS}`,
  ].join('\n');
}

export function buildWhatsAppVoucherUrl(appointment: Appointment): string {
  const encodedText = encodeURIComponent(buildWhatsAppVoucherText(appointment));
  return `https://wa.me/${FIRM_WHATSAPP_NUMBER}?text=${encodedText}`;
}

export function buildEmailVoucherContent(
  appointment: Appointment,
  overrideToEmail?: string
): {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
} {
  const to = (overrideToEmail || DEFAULT_NOTIFICATION_EMAIL).trim();

  if (appointment.entryType === 'commitment') {
    const subject = `Compromisso [${appointment.code}] — ${appointment.clientName} | Fernandes & Lins Assessoria Jurídica`;
    const obs =
      appointment.briefSubject ||
      appointment.caseDescription ||
      appointment.notes ||
      'Sem observações adicionais.';
    const body = [
      `Compromisso registrado na agenda da Fernandes & Lins Assessoria Jurídica.`,
      ``,
      `=========================================`,
      `COMPROMISSO NA AGENDA`,
      `=========================================`,
      `Código: ${appointment.code}`,
      `Título: ${appointment.clientName}`,
      `Categoria: ${appointment.commitmentCategory || 'Compromisso'}`,
      `Data: ${formatDateLongBR(appointment.date)}`,
      `Horário: ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
      `Local: ${appointment.location || FIRM_ADDRESS}`,
      ``,
      `OBSERVAÇÕES:`,
      `${obs}`,
      `=========================================`,
    ].join('\n');

    const mailtoUrl = `mailto:${encodeURIComponent(
      to
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return { to, subject, body, mailtoUrl };
  }

  const subject = `Novo Agendamento [${appointment.code}] — ${appointment.clientName} | Fernandes & Lins Assessoria Jurídica`;
  const caseText =
    appointment.descriptionMode === 'complete'
      ? appointment.caseDescription || 'Não informado'
      : appointment.briefSubject || 'Não informado';
  const docsList =
    appointment.documents && appointment.documents.length > 0
      ? appointment.documents.map((d) => `- ${d.name}`).join('\n')
      : 'Nenhum documento PDF anexado';

  const body = [
    `Novo atendimento registrado na recepção da Fernandes & Lins Assessoria Jurídica.`,
    ``,
    `=========================================`,
    `FICHA DO ATENDIMENTO`,
    `=========================================`,
    `Protocolo: ${appointment.code}`,
    `Atendimento: ${appointment.serviceName}`,
    `Advogados: ${appointment.lawyerName || 'Fernandes & Lins'}`,
    `Data: ${formatDateLongBR(appointment.date)}`,
    `Horário: ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
    ``,
    `DADOS DO CLIENTE:`,
    `Nome: ${appointment.clientName}`,
    `CPF: ${appointment.clientCpf}`,
    `Telefone/WhatsApp: ${appointment.clientPhone}`,
    `Endereço: ${appointment.clientAddress}`,
    ...(appointment.clientEmail ? [`E-mail do Cliente: ${appointment.clientEmail}`] : []),
    ``,
    `REGISTRO DO CASO (${
      appointment.descriptionMode === 'complete'
        ? 'Descrição Completa'
        : 'Descrição Breve'
    }):`,
    `${caseText}`,
    ``,
    `DOCUMENTAÇÃO ANEXADA:`,
    `${docsList}`,
    ``,
    `Endereço do Escritório: ${FIRM_ADDRESS}`,
    `WhatsApp Oficial: ${FIRM_WHATSAPP_DISPLAY}`,
    `=========================================`,
  ].join('\n');

  const mailtoUrl = `mailto:${encodeURIComponent(
    to
  )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { to, subject, body, mailtoUrl };
}

export function buildGoogleCalendarUrl(appointment: Appointment): string {
  const dateClean = appointment.date.replace(/-/g, '');
  const startClean = appointment.startTime.replace(':', '') + '00';
  const endClean = appointment.endTime.replace(':', '') + '00';
  const isCommitment = appointment.entryType === 'commitment';
  const title = isCommitment
    ? `${appointment.commitmentCategory ? `[${appointment.commitmentCategory}] ` : ''}${appointment.clientName}`
    : `${appointment.serviceName} — ${appointment.clientName} (${appointment.code})`;
  const location = (isCommitment && appointment.location) || FIRM_ADDRESS;
  const details = isCommitment
    ? [
        `Fernandes & Lins Assessoria Jurídica`,
        `Código: ${appointment.code}`,
        `Categoria: ${appointment.commitmentCategory || 'Compromisso'}`,
        appointment.briefSubject || appointment.caseDescription || '',
      ]
        .filter(Boolean)
        .join('\n')
    : [
        `Fernandes & Lins Assessoria Jurídica`,
        `Protocolo: ${appointment.code}`,
        `Cliente: ${appointment.clientName}`,
        `CPF: ${appointment.clientCpf}`,
        `Telefone: ${appointment.clientPhone}`,
        appointment.briefSubject || appointment.caseDescription || '',
      ]
        .filter(Boolean)
        .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${dateClean}T${startClean}/${dateClean}T${endClean}`,
    details,
    location,
    ctz: 'America/Recife',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadAppointmentICS(appointment: Appointment): void {
  const dateClean = appointment.date.replace(/-/g, '');
  const startClean = appointment.startTime.replace(':', '') + '00';
  const endClean = appointment.endTime.replace(':', '') + '00';
  const isCommitment = appointment.entryType === 'commitment';
  const summary = isCommitment
    ? `${appointment.commitmentCategory ? `[${appointment.commitmentCategory}] ` : ''}${appointment.clientName}`
    : `${appointment.serviceName} - ${appointment.clientName} (${appointment.lawyerName || 'Fernandes & Lins'})`;
  const location = (isCommitment && appointment.location) || FIRM_ADDRESS;
  const description = isCommitment
    ? `Código: ${appointment.code} | Categoria: ${appointment.commitmentCategory || 'Compromisso'} | ${appointment.briefSubject || appointment.caseDescription || ''}`
    : `Protocolo: ${appointment.code} | Cliente: ${appointment.clientName} | CPF: ${appointment.clientCpf} | Telefone: ${appointment.clientPhone}`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fernandes e Lins Assessoria Juridica//PT',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@fernandeslins.adv.br`,
    `DTSTART:${dateClean}T${startClean}`,
    `DTEND:${dateClean}T${endClean}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${isCommitment ? 'compromisso' : 'atendimento'}-${appointment.code}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildWhatsAppReviewRequestUrl(
  appointment: Appointment,
  googleReviewUrl: string
): string {
  const cleanUrl =
    googleReviewUrl.trim() ||
    'https://www.google.com/maps/search/?api=1&query=Fernandes+Lins+Assessoria+Juridica+Recife';

  const message = [
    `Olá, *${appointment.clientName}*! Tudo bem?`,
    ``,
    `Agradecemos por comparecer hoje à *Fernandes & Lins Assessoria Jurídica* para seu atendimento.`,
    ``,
    `Caso deseje avaliar nosso atendimento no Google, acesse o link abaixo:`,
    `${cleanUrl}`,
    ``,
    `Atenciosamente,`,
    `Secretaria · Fernandes & Lins Assessoria Jurídica`,
  ].join('\n');

  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${FIRM_WHATSAPP_NUMBER}?text=${encodedText}`;
}

export function buildClientWhatsAppReminderUrl(
  appointment: Appointment
): string | null {
  if (appointment.entryType === 'commitment') return null;
  const clientDigits = formatPhoneForWhatsApp(appointment.clientPhone || '');
  if (clientDigits.length < 12) return null;

  const message = [
    `Olá, *${appointment.clientName}*! Tudo bem?`,
    ``,
    `Passando para lembrar do seu atendimento na *Fernandes & Lins Assessoria Jurídica*:`,
    ``,
    `• *Protocolo:* ${appointment.code}`,
    `• *Atendimento:* ${appointment.serviceName}`,
    `• *Data:* ${formatDateShortBR(appointment.date)} (${formatDateLongBR(appointment.date)})`,
    `• *Horário:* ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
    `• *Endereço:* ${FIRM_ADDRESS}`,
    ``,
    `Caso precise reagendar ou tirar alguma dúvida, pode responder por aqui.`,
    ``,
    `Atenciosamente,`,
    `Secretaria · Fernandes & Lins Assessoria Jurídica`,
  ].join('\n');

  return `https://wa.me/${clientDigits}?text=${encodeURIComponent(message)}`;
}
