import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Copy,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { Appointment } from '../types/scheduling';
import {
  formatDateLongBR,
  formatFileSize,
} from '../utils/timeSlots';
import {
  DEFAULT_NOTIFICATION_EMAIL,
  FIRM_WHATSAPP_DISPLAY,
  buildEmailVoucherContent,
  buildWhatsAppVoucherUrl,
  downloadAppointmentICS,
} from '../utils/notificationLinks';
import { FIRM_INFO } from '../data/seedData';

export interface EmailDispatchState {
  status: 'idle' | 'sending' | 'sent' | 'needs_config' | 'error';
  to: string;
  message?: string;
}

interface ThankYouViewProps {
  appointment: Appointment | null;
  emailDispatchState?: EmailDispatchState;
  onRetryAutoEmail?: (appointment: Appointment) => void;
  onNewBooking: () => void;
  onGoToMyAgenda: () => void;
  onGoToAdmin?: () => void;
}

export const ThankYouView: React.FC<ThankYouViewProps> = ({
  appointment,
  emailDispatchState,
  onRetryAutoEmail,
  onNewBooking,
  onGoToMyAgenda,
  onGoToAdmin,
}) => {
  const [copied, setCopied] = useState(false);

  if (!appointment) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
          <h1 className="font-editorial text-2xl font-semibold text-[#0B2545]">
            Nenhum atendimento recente
          </h1>
          <p className="text-sm text-slate-600 mt-2 mb-6">
            Selecione uma área jurídica e um horário na recepção para gerar o protocolo do cliente.
          </p>
          <button
            type="button"
            onClick={onNewBooking}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B2545] text-[#FACC15] text-xs font-bold hover:bg-[#134074] transition-colors cursor-pointer"
          >
            Voltar à Recepção
          </button>
        </div>
      </div>
    );
  }

  const isCommitment = appointment.entryType === 'commitment';
  const targetNotificationEmail =
    emailDispatchState?.to || DEFAULT_NOTIFICATION_EMAIL;
  const whatsappUrl = buildWhatsAppVoucherUrl(appointment);
  const emailUrl = buildEmailVoucherContent(
    appointment,
    targetNotificationEmail
  ).mailtoUrl;
  const summaryDescription =
    appointment.descriptionMode === 'complete'
      ? appointment.caseDescription
      : appointment.briefSubject;
  const showEmailStatusBanner =
    !isCommitment ||
    appointment.notifyByEmail === true ||
    (emailDispatchState && emailDispatchState.status !== 'idle');

  const handleCopySummary = () => {
    const summaryText = isCommitment
      ? [
          `COMPROMISSO NA AGENDA — ${FIRM_INFO.name.toUpperCase()}`,
          `Código: ${appointment.code}`,
          `Título: ${appointment.clientName}`,
          `Categoria: ${appointment.commitmentCategory || appointment.serviceName}`,
          `Data: ${formatDateLongBR(appointment.date)}`,
          `Horário: ${appointment.startTime} às ${appointment.endTime} (${appointment.durationMinutes} min)`,
          appointment.location ? `Local: ${appointment.location}` : '',
          summaryDescription ? `Observações: ${summaryDescription}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `PROTOCOLO DE ATENDIMENTO — ${FIRM_INFO.name.toUpperCase()}`,
          `Protocolo: ${appointment.code}`,
          `Cliente: ${appointment.clientName}`,
          `CPF: ${appointment.clientCpf}`,
          `Endereço: ${appointment.clientAddress}`,
          `Área / Consulta: ${appointment.serviceName}`,
          appointment.lawyerName ? `Advogado: ${appointment.lawyerName}` : '',
          `Data: ${formatDateLongBR(appointment.date)}`,
          `Horário: ${appointment.startTime} às ${appointment.endTime}`,
          `Tipo de Registro: ${
            appointment.descriptionMode === 'complete'
              ? 'Descrição Completa do Caso'
              : 'Descrição Breve / Assunto'
          }`,
          summaryDescription ? `Resumo: ${summaryDescription}` : '',
          appointment.documents?.length
            ? `PDFs Anexados: ${appointment.documents.length}`
            : '',
          `Local: ${FIRM_INFO.address}`,
        ]
          .filter(Boolean)
          .join('\n');

    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
        <div className="w-12 h-12 rounded-2xl bg-[#FEF9C3] border border-[#FACC15] text-[#0B2545] flex items-center justify-center mb-5">
          <Check className="w-6 h-6" />
        </div>

        <span className="text-xs font-bold uppercase tracking-wider text-[#1D4ED8]">
          {isCommitment
            ? 'Compromisso Registrado na Agenda'
            : 'Atendimento Registrado na Pauta'}
        </span>
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mt-1">
          {isCommitment
            ? appointment.clientName
            : `Agendamento confirmado para ${appointment.clientName}`}
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-[60ch]">
          {isCommitment
            ? 'O compromisso já está salvo na agenda e o intervalo correspondente foi reservado automaticamente para evitar conflitos com novos agendamentos.'
            : 'O horário já está reservado na agenda do advogado responsável. Você pode encaminhar o comprovante ao cliente via WhatsApp, E-mail ou salvar no calendário.'}
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <span className="text-slate-500">
              {isCommitment ? 'Código' : 'Protocolo'}
            </span>
            <span className="font-mono-tabular font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FACC15] px-2.5 py-0.5 rounded-md">
              {appointment.code}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">
              {isCommitment ? 'Categoria' : 'Área / Consulta'}
            </span>
            <span className="font-semibold text-[#0B2545]">
              {isCommitment
                ? appointment.commitmentCategory || appointment.serviceName
                : appointment.serviceName}
            </span>
          </div>

          {!isCommitment && appointment.lawyerName && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500">Advogado responsável</span>
              <span className="font-medium text-[#134074]">
                {appointment.lawyerName}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">Data</span>
            <span className="font-medium text-[#0B2545] capitalize">
              {formatDateLongBR(appointment.date)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">Horário</span>
            <span className="font-mono-tabular font-semibold text-[#1D4ED8]">
              {appointment.startTime} às {appointment.endTime} (
              {appointment.durationMinutes} min)
            </span>
          </div>

          {isCommitment ? (
            <>
              {appointment.location && (
                <div className="flex flex-wrap items-start justify-between gap-2 pt-2 border-t border-slate-200">
                  <span className="text-slate-500">Local / Link</span>
                  <span className="font-medium text-[#0B2545] text-right max-w-xs">
                    {appointment.location}
                  </span>
                </div>
              )}

              {summaryDescription && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <span className="text-slate-500 block">Observações</span>
                  <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 leading-relaxed whitespace-pre-line">
                    {summaryDescription}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <span className="text-slate-500">CPF do Cliente</span>
                <span className="font-mono-tabular font-medium text-[#0B2545]">
                  {appointment.clientCpf}
                </span>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-slate-500">Endereço</span>
                <span className="font-medium text-[#0B2545] text-right max-w-xs">
                  {appointment.clientAddress}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Modo de Descrição</span>
                  <span className="text-xs font-semibold text-[#0B2545] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                    {appointment.descriptionMode === 'complete'
                      ? 'Descrição Completa + PDFs'
                      : 'Descrição Breve / Assunto'}
                  </span>
                </div>
                {summaryDescription && (
                  <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 leading-relaxed">
                    {summaryDescription}
                  </p>
                )}
                {appointment.documents && appointment.documents.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-xs font-semibold text-[#0B2545] block">
                      Documentação anexada ({appointment.documents.length} PDF):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {appointment.documents.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.name}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#1D4ED8] text-xs text-[#0B2545]"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#1D4ED8]" />
                          <span className="truncate max-w-[180px]">{doc.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono-tabular">
                            ({formatFileSize(doc.size)})
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Status do E-mail Automático */}
        {showEmailStatusBanner && (
          <div
            className={`mt-5 rounded-xl border p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              emailDispatchState?.status === 'sent'
                ? 'bg-green-50 border-green-200 text-[#14532D]'
                : emailDispatchState?.status === 'sending'
                ? 'bg-blue-50 border-blue-200 text-[#0B2545]'
                : 'bg-amber-50 border-amber-200 text-[#78350F]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {emailDispatchState?.status === 'sent' ? (
                  <>
                    <p className="font-bold">
                      E-mail automático enviado via Resend para{' '}
                      <span className="font-mono-tabular">
                        {emailDispatchState.to || DEFAULT_NOTIFICATION_EMAIL}
                      </span>
                    </p>
                    <p className="opacity-85 mt-0.5">
                      {isCommitment
                        ? 'Lembrete do compromisso entregue automaticamente.'
                        : `Cópia integral da ficha do atendimento${
                            appointment.documents &&
                            appointment.documents.length > 0
                              ? ` e ${appointment.documents.length} PDF(s) anexado(s)`
                              : ''
                          } entregue automaticamente.`}
                    </p>
                  </>
                ) : emailDispatchState?.status === 'sending' ? (
                  <p className="font-semibold">
                    Enviando comprovante via Resend para{' '}
                    <span className="font-mono-tabular">
                      {emailDispatchState.to || DEFAULT_NOTIFICATION_EMAIL}
                    </span>
                    ...
                  </p>
                ) : (
                  <>
                    <p className="font-bold">
                      Envio automático via Resend configurado para{' '}
                      <span className="font-mono-tabular">
                        {emailDispatchState?.to || DEFAULT_NOTIFICATION_EMAIL}
                      </span>
                    </p>
                    <p className="opacity-90 mt-0.5 leading-relaxed">
                      {emailDispatchState?.message ||
                        'Adicione a chave RESEND_API_KEY nas configurações de Secrets do projeto para ativar o envio automático em segundo plano via Resend.'}
                    </p>
                  </>
                )}
              </div>
            </div>

            {onRetryAutoEmail && emailDispatchState?.status !== 'sending' && (
              <button
                type="button"
                onClick={() => onRetryAutoEmail(appointment)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-current/25 font-bold text-xs shrink-0 hover:bg-white/80 cursor-pointer self-start sm:self-auto"
              >
                {emailDispatchState?.status === 'sent' ? 'Reenviar' : 'Tentar Novamente'}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#0B2545] text-[#FACC15] hover:bg-[#134074] transition-colors"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>WhatsApp ({FIRM_WHATSAPP_DISPLAY})</span>
          </a>

          <a
            href={emailUrl}
            className="min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-50 text-[#0B2545] border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <Mail className="w-4 h-4 text-[#1D4ED8] shrink-0" />
            <span>Enviar para {targetNotificationEmail}</span>
          </a>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => downloadAppointmentICS(appointment)}
            className="min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 text-[#0B2545] hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Agenda (.ics)</span>
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className="min-h-[46px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-[#0B2545] hover:border-[#1D4ED8] transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#1D4ED8]" />
                <span>{isCommitment ? 'Resumo copiado' : 'Protocolo copiado'}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>{isCommitment ? 'Copiar compromisso' : 'Copiar comprovante'}</span>
              </>
            )}
          </button>
        </div>

        <div
          className={`mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 ${
            onGoToAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          } gap-3`}
        >
          <button
            type="button"
            onClick={onNewBooking}
            className="min-h-[46px] py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-300 text-[#0B2545] hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {isCommitment ? 'Novo Registro' : 'Novo Atendimento'}
          </button>

          <button
            type="button"
            onClick={onGoToMyAgenda}
            className="min-h-[46px] py-2.5 px-4 rounded-xl text-xs font-bold bg-[#FACC15] text-[#0B2545] hover:bg-[#EAB308] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Ver Pauta Geral</span>
          </button>

          {onGoToAdmin && (
            <button
              type="button"
              onClick={onGoToAdmin}
              className="min-h-[46px] py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-50 text-[#0B2545] border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Painel do Escritório</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const PrivacyPolicyView: React.FC<{ onBack: () => void }> = ({
  onBack,
}) => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-[#1D4ED8] hover:text-[#0B2545] mb-4 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar à Recepção
      </button>
      <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mb-3">
        Sigilo Profissional & Privacidade (LGPD)
      </h1>
      <p className="text-sm text-slate-600 leading-relaxed mb-4 max-w-[65ch]">
        O escritório {FIRM_INFO.name} coleta os dados cadastrais dos clientes (nome completo, CPF, endereço, telefone e e-mail), relatos de casos e documentos em PDF estritamente para triagem jurídica, registro de atendimentos e organização da pauta dos advogados.
      </p>
      <p className="text-sm text-slate-600 leading-relaxed max-w-[65ch]">
        Todas as informações inseridas pela equipe da secretaria ou pelos sócios ficam protegidas sob dever de confidencialidade advocatícia e controle de acesso por perfil (Master e Funcionário).
      </p>
    </div>
  </div>
);

export const TermsOfUseView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-[#1D4ED8] hover:text-[#0B2545] mb-4 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar à Recepção
      </button>
      <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0B2545] mb-3">
        Normas de Atendimento & Recepção
      </h1>
      <p className="text-sm text-slate-600 leading-relaxed mb-4 max-w-[65ch]">
        Os atendimentos presenciais e remotos no escritório {FIRM_INFO.name} ocorrem mediante agendamento prévio na pauta da secretaria. Recomenda-se anexar os documentos essenciais em formato PDF no momento da triagem para agilizar a análise do advogado responsável.
      </p>
    </div>
  </div>
);

export const NotFoundView: React.FC<{ onBackHome: () => void }> = ({
  onBackHome,
}) => (
  <div className="max-w-md mx-auto px-4 py-16 text-center">
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
      <h1 className="font-editorial text-2xl font-semibold text-[#0B2545]">
        Página não encontrada
      </h1>
      <button
        type="button"
        onClick={onBackHome}
        className="mt-4 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B2545] text-[#FACC15] text-xs font-bold hover:bg-[#134074] cursor-pointer"
      >
        Voltar à Recepção
      </button>
    </div>
  </div>
);

export const LoadingViewSkeleton: React.FC = () => (
  <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
    <div className="h-32 bg-slate-200/70 rounded-2xl mb-6" />
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 h-96 bg-white rounded-2xl border border-slate-200" />
      <div className="lg:col-span-4 h-72 bg-white rounded-2xl border border-slate-200" />
    </div>
  </div>
);

export const CookieConsentBanner: React.FC<{ onOpenPrivacy: () => void }> = ({
  onOpenPrivacy,
}) => {
  const [accepted, setAccepted] = useState(() => {
    try {
      return localStorage.getItem('fl_adv_cookie_ok') === '1';
    } catch {
      return true;
    }
  });

  if (accepted) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-sm bg-white rounded-2xl border border-slate-200 p-4 shadow-lg flex items-start gap-3">
      <Shield className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-[#0B2545]">Armazenamento & Sessão</p>
        <p className="mt-0.5 leading-relaxed">
          Utilizamos armazenamento seguro para manter a pauta e sua sessão ativa.{' '}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-[#1D4ED8] font-semibold underline cursor-pointer"
          >
            Sigilo LGPD
          </button>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem('fl_adv_cookie_ok', '1');
            } catch {
              // ignore
            }
            setAccepted(true);
          }}
          className="mt-2.5 min-h-[40px] px-4 py-1.5 rounded-lg bg-[#0B2545] text-[#FACC15] font-bold text-xs hover:bg-[#134074] transition-colors cursor-pointer"
        >
          Entendi
        </button>
      </div>
    </div>
  );
};
