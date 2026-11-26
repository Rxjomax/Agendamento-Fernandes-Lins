import { GoogleGenAI, Type } from '@google/genai';

export interface ServiceInput {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: string;
  specialist: string;
  status?: 'active' | 'inactive';
}

export interface DayOverrideInput {
  startTime: string;
  endTime: string;
  lunchEnabled?: boolean;
  lunchStart?: string;
  lunchEnd?: string;
}

export interface AvailabilityInput {
  workDays: number[];
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  slotIntervalMinutes: number;
  blockedDates: { date: string; reason: string }[];
  dayOverrides?: Record<number, DayOverrideInput>;
}

export interface BookedSlotInput {
  id?: string;
  code?: string;
  entryType?: 'client' | 'commitment';
  commitmentCategory?: string;
  location?: string;
  briefSubject?: string;
  date: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  lawyerName?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
}

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiBookingChatRequestBody {
  messages?: ChatMessageInput[];
  services?: ServiceInput[];
  availability?: AvailabilityInput;
  bookedSlots?: BookedSlotInput[];
  userAppointments?: BookedSlotInput[];
  currentUser?: { name: string; email: string; phone: string; role?: string } | null;
  activeProposal?: {
    entryType?: 'client' | 'commitment';
    serviceId?: string;
    date: string;
    startTime: string;
    durationMinutes?: number;
    commitmentCategory?: string;
    location?: string;
    clientName?: string;
    clientPhone?: string;
    clientCpf?: string;
    clientAddress?: string;
    clientEmail?: string;
    notes?: string;
    notifyByEmail?: boolean;
  } | null;
  todayISO?: string;
  currentTimeMinutes?: number;
}

export interface AiBookingChatResult {
  statusCode: number;
  body: Record<string, unknown>;
}

const WEEKDAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function timeToMins(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getServiceSynonymsHint(service: ServiceInput): string {
  const text = `${service.id} ${service.name} ${service.category} ${service.description}`.toLowerCase();
  if (text.includes('atendimento jurídico') || text.includes('geral')) {
    return 'Cobre triagem e atendimento em Direito Cível, Trabalhista, Previdenciário e Criminal na agenda única compartilhada.';
  }
  return `Área: ${service.category}`;
}

function computeFreeSlotsForDay(
  isoDate: string,
  durationMinutes: number,
  availability: AvailabilityInput,
  bookedSlots: BookedSlotInput[],
  todayISO?: string,
  currentTimeMinutes?: number
): string[] {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dayOfWeek = dt.getDay();

  if (!availability.workDays?.includes(dayOfWeek)) return [];
  if (availability.blockedDates?.some((b) => b.date === isoDate)) return [];

  const dayOverride = availability.dayOverrides?.[dayOfWeek];
  const workStart = timeToMins(dayOverride?.startTime || availability.startTime || '08:00');
  const workEnd = timeToMins(dayOverride?.endTime || availability.endTime || '18:00');
  const effectiveLunchEnabled =
    typeof dayOverride?.lunchEnabled === 'boolean'
      ? dayOverride.lunchEnabled
      : availability.lunchEnabled;
  const lunchStart = timeToMins(dayOverride?.lunchStart || availability.lunchStart || '12:00');
  const lunchEnd = timeToMins(dayOverride?.lunchEnd || availability.lunchEnd || '14:00');
  const duration = Math.max(15, durationMinutes || 45);
  const step = duration;

  const dayBookings = bookedSlots.filter((b) => b.date === isoDate);
  const free: string[] = [];

  let cur = workStart;
  while (cur + duration <= workEnd) {
    const end = cur + duration;
    if (effectiveLunchEnabled && cur < lunchEnd && end > lunchStart) {
      cur = lunchEnd > cur ? lunchEnd : cur + step;
      continue;
    }
    const isPastToday =
      todayISO &&
      isoDate === todayISO &&
      typeof currentTimeMinutes === 'number' &&
      cur <= currentTimeMinutes;

    const conflict = dayBookings.some((b) => {
      const bStart = timeToMins(b.startTime);
      const bEnd = timeToMins(b.endTime);
      return cur < bEnd && end > bStart;
    });
    if (!conflict && !isPastToday) {
      free.push(minsToTime(cur));
    }
    cur += step;
  }

  return free;
}

function formatOfficialScheduleSummary(availability?: AvailabilityInput): string {
  if (!availability) {
    return '- Segunda a Sexta: 08:00 às 12:00 e 14:00 às 18:00\n- Sábado e Domingo: Fechado';
  }
  const lines: string[] = [];
  for (let dayIdx = 1; dayIdx <= 7; dayIdx++) {
    const normalizedIdx = dayIdx % 7;
    const dayName = WEEKDAY_NAMES[normalizedIdx];
    const isOpen = availability.workDays?.includes(normalizedIdx);
    if (!isOpen) {
      lines.push(
        `- ${dayName}: Fechado para atendimento comum (compromissos avulsos continuam permitidos)`
      );
      continue;
    }
    const ov = availability.dayOverrides?.[normalizedIdx];
    const start = ov?.startTime || availability.startTime || '08:00';
    const end = ov?.endTime || availability.endTime || '18:00';
    const lunchOn =
      typeof ov?.lunchEnabled === 'boolean' ? ov.lunchEnabled : availability.lunchEnabled;
    const lunchStart = ov?.lunchStart || availability.lunchStart || '12:00';
    const lunchEnd = ov?.lunchEnd || availability.lunchEnd || '14:00';
    if (lunchOn) {
      lines.push(`- ${dayName}: ${start} às ${lunchStart} e ${lunchEnd} às ${end}`);
    } else {
      lines.push(`- ${dayName}: ${start} às ${end} (sem pausa de almoço)`);
    }
  }
  return lines.join('\n');
}

function buildScheduleWithFreeSlots(
  todayISO: string,
  availability: AvailabilityInput,
  bookedSlots: BookedSlotInput[],
  defaultDurationMinutes = 45,
  currentTimeMinutes?: number
): string {
  const [y, m, d] = todayISO.split('-').map(Number);
  const baseDate = new Date(y, (m || 1) - 1, d || 1);
  const lines: string[] = [];

  for (let i = 0; i < 14; i++) {
    const dt = new Date(baseDate);
    dt.setDate(baseDate.getDate() + i);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = dt.getDay();
    const dayName = WEEKDAY_NAMES[dayOfWeek];
    const blocked = availability.blockedDates?.find((b) => b.date === iso);
    const isWorkDay = availability.workDays?.includes(dayOfWeek);
    const dayCount = bookedSlots.filter((b) => b.date === iso).length;
    const countSuffix =
      dayCount > 0 ? ` (${dayCount} registro${dayCount > 1 ? 's' : ''} na pauta)` : '';

    const relativeTag =
      i === 0 ? ' [HOJE]' : i === 1 ? ' [AMANHÃ]' : i === 2 ? ' [DEPOIS DE AMANHÃ]' : '';

    if (blocked) {
      lines.push(
        `- ${iso} (${dayName})${relativeTag}: SEM EXPEDIENTE (${blocked.reason})${countSuffix}`
      );
    } else if (!isWorkDay) {
      lines.push(`- ${iso} (${dayName})${relativeTag}: SEM EXPEDIENTE${countSuffix}`);
    } else {
      const freeSlots = computeFreeSlotsForDay(
        iso,
        defaultDurationMinutes,
        availability,
        bookedSlots,
        todayISO,
        currentTimeMinutes
      );
      lines.push(
        `- ${iso} (${dayName})${relativeTag}: ABERTO${countSuffix} | Horários livres (${defaultDurationMinutes} min): ${
          freeSlots.length > 0 ? freeSlots.join(', ') : 'Sem vagas restantes'
        }`
      );
    }
  }

  return lines.join('\n');
}

export async function runAiBookingChat(
  body: AiBookingChatRequestBody
): Promise<AiBookingChatResult> {
  try {
    const {
      messages = [],
      services = [],
      availability,
      bookedSlots = [],
      userAppointments = [],
      currentUser = null,
      activeProposal = null,
      todayISO = new Date().toISOString().slice(0, 10),
      currentTimeMinutes,
    } = body || {};

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return {
        statusCode: 500,
        body: {
          error:
            'Chave GEMINI_API_KEY não configurada no servidor (defina nas Environment Variables).',
        },
      };
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const activeServices = services.filter((s) => s.status !== 'inactive');
    const primaryDuration = activeServices[0]?.durationMinutes || 45;

    const scheduleReference = availability
      ? buildScheduleWithFreeSlots(
          todayISO,
          availability,
          bookedSlots,
          primaryDuration,
          currentTimeMinutes
        )
      : `Hoje é ${todayISO}`;

    const officialScheduleSummary = formatOfficialScheduleSummary(availability);

    const servicesCatalogText =
      activeServices.length > 0
        ? activeServices
            .map(
              (s, idx) =>
                `${idx + 1}. [ID EXATO: "${s.id}"] — **${s.name}**\n` +
                `   • Categoria: ${s.category} | Duração padrão: ${s.durationMinutes} min | Banca: ${s.specialist}\n` +
                `   • Escopo: ${s.description}\n` +
                `   • ${getServiceSynonymsHint(s)}`
            )
            .join('\n\n')
        : 'Agenda única padrão: Atendimento Jurídico (Fernandes & Lins).';

    const specialistsList = Array.from(
      new Set(activeServices.map((s) => s.specialist).filter(Boolean))
    ).join(', ');

    const isAuthenticatedStaff =
      currentUser?.role === 'master' || currentUser?.role === 'staff';

    const userApptsText =
      userAppointments && userAppointments.length > 0
        ? userAppointments
            .map((a) => {
              if (a.entryType === 'commitment') {
                const cat = a.commitmentCategory || 'Compromisso';
                const loc = a.location ? ` | Local: ${a.location}` : '';
                const note = a.briefSubject ? ` | Obs: ${a.briefSubject}` : '';
                return `- [COMPROMISSO · ${cat}] Protocolo: ${a.code} | Título: ${a.clientName || a.serviceName} | Data: ${a.date} das ${a.startTime} às ${a.endTime}${loc}${note}`;
              }
              const clientLabel =
                isAuthenticatedStaff && a.clientName ? ` | Cliente: ${a.clientName}` : '';
              const subjectLabel =
                isAuthenticatedStaff && a.briefSubject ? ` | Assunto: ${a.briefSubject}` : '';
              return `- [ATENDIMENTO CLIENTE] Protocolo: ${a.code} | ${a.serviceName} (${a.lawyerName || 'Fernandes & Lins'})${clientLabel} | Data: ${a.date} das ${a.startTime} às ${a.endTime}${subjectLabel}`;
            })
            .join('\n')
        : 'Nenhum atendimento ou compromisso futuro visível neste modo.';

    const userContextText = currentUser
      ? `Operador conectado: ${currentUser.name} (${currentUser.role === 'master' ? 'Master' : 'Secretaria/Funcionário'}) — acesso completo à pauta do escritório.`
      : `Modo balcão / recepção sem login: respeite sigilo LGPD (não invente nomes de clientes; exiba apenas horários livres e compromissos sem dados pessoais de clientes).`;

    const activeProposalText = activeProposal
      ? `Proposta em andamento: tipo="${activeProposal.entryType || 'client'}", serviceId="${activeProposal.serviceId || activeServices[0]?.id || ''}", date="${activeProposal.date}", startTime="${activeProposal.startTime}"${
          activeProposal.entryType === 'commitment'
            ? `, título="${activeProposal.clientName || ''}", categoria="${activeProposal.commitmentCategory || 'Compromisso'}", duração=${activeProposal.durationMinutes || 60}min`
            : `, cliente="${activeProposal.clientName || ''}"`
        }.`
      : 'Nenhuma proposta pendente ainda.';

    const systemInstruction = `Você é o Assistente de Agenda da **Fernandes & Lins Assessoria Jurídica** — Assessoria Jurídica Cível, Trabalhista, Previdenciário e Criminal.
Endereço oficial do escritório: R. Boanerges Pereira, 08 - Sl 06 - Jordão, Recife - PE, 51260-000.
O escritório opera com **agenda única compartilhada** pelos sócios (${specialistsList || 'Fernandes & Lins'}).

HORÁRIO OFICIAL DE EXPEDIENTE ATUALMENTE CONFIGURADO:
${officialScheduleSummary}

TIPOS DE ATENDIMENTO CONFIGURADOS:
${servicesCatalogText}

MODOS DE REGISTRO DISPONÍVEIS NO SISTEMA ATUAL:
1. **Atendimento com Cliente (\`entryType: "client"\`)**:
   - Usa o serviço ativo da agenda compartilhada (ex: \`${activeServices[0]?.id || 'srv-atendimento-juridico'}\`).
   - Requer: data (\`YYYY-MM-DD\`) dentro do expediente, horário livre (\`HH:mm\`), Nome completo (\`clientName\`) e WhatsApp (\`clientPhone\`).
   - Campos opcionais no chat (mas aceitos): CPF (\`clientCpf\`), Endereço (\`clientAddress\`), E-mail (\`clientEmail\`) e Assunto/Observações (\`notes\`).
   - Envia confirmação automática por e-mail (Resend). Se precisar anexar documentos PDF ou preencher relato jurídico detalhado, oriente que pode usar o formulário principal de Recepção ou editar depois no Painel.

2. **Compromisso na Agenda sem cliente (\`entryType: "commitment"\`)**:
   - Serve para registrar compromissos sem vincular cliente (não pede CPF, telefone nem endereço).
   - Categorias válidas em \`commitmentCategory\`: "Compromisso", "Audiência", "Prazo Processual", "Reunião Interna", "Diligência", "Pessoal".
   - Campos: Título do compromisso em \`clientName\` (ex: "Audiência TRT-6", "Prazo Recurso", "Reunião interna dos sócios"), \`commitmentCategory\`, \`date\` (\`YYYY-MM-DD\`), \`startTime\` (\`HH:mm\`), \`durationMinutes\` (padrão 60; pode ser 15, 30, 45, 60, 90, 120, 180 ou 240), \`location\` (opcional: fórum, sala ou link), \`notes\` (opcional) e \`notifyByEmail\` (opcional, padrão false).
   - Compromissos bloqueiam conflitos automaticamente na agenda, mas **podem ser marcados em qualquer data ou horário**, inclusive fora do expediente ou no intervalo de almoço, caso o operador solicite.

AGENDA E HORÁRIOS LIVRES (Próximos 14 dias a partir de ${todayISO}):
${scheduleReference}

CONTEXTO DO OPERADOR:
${userContextText}

PAUTA FUTURA VISÍVEL (ATENDIMENTOS E COMPROMISSOS):
${userApptsText}

PROPOSTA ATIVA NO CHAT:
${activeProposalText}

REGRAS DE RESPOSTA:
- Responda sempre em português brasileiro claro, direto e profissional, sem jargões vazios.
- Nunca invente horários livres, advogados ou áreas fora dos dados acima.
- Se o usuário perguntar o que há na agenda hoje/amanhã/semana, liste objetivamente os itens da PAUTA FUTURA VISÍVEL (diferenciando atendimentos de compromissos).
- Se o usuário quiser **adicionar um compromisso sem cliente** (ex: audiência, prazo, reunião interna, diligência, compromisso pessoal, lembrete na agenda):
  - Preencha \`bookingProposal\` com \`entryType: "commitment"\`, \`clientName\` = título do compromisso, \`commitmentCategory\`, \`date\`, \`startTime\`, \`durationMinutes\` (padrão 60 se não informado), \`location\` e \`notes\` se mencionados.
  - Defina \`hasBookingProposal = true\` e \`action = "PROPOSE_BOOKING"\` (ou \`"CONFIRM_BOOKING_NOW"\` se o usuário já passou título + data + horário e pediu expressamente para salvar/confirmar direto).
- Se o usuário quiser **agendar atendimento com cliente**:
  - Preencha \`bookingProposal\` com \`entryType: "client"\`, \`serviceId\` (ID exato do catálogo), \`date\`, \`startTime\` livre, e quaisquer dados do cliente mencionados (\`clientName\`, \`clientPhone\`, \`clientCpf\`, \`clientAddress\`, \`clientEmail\`, \`notes\`).
  - Defina \`hasBookingProposal = true\` e \`action = "PROPOSE_BOOKING"\` (ou \`"CONFIRM_BOOKING_NOW"\` apenas se nome completo e WhatsApp válido já tiverem sido informados e o operador confirmar).
- Se o usuário pedir para cancelar um protocolo específico (ex: "cancelar FL-1234") presente na PAUTA FUTURA VISÍVEL, defina \`action = "CANCEL_APPOINTMENT"\` e \`cancelAppointmentCode = "FL-1234"\`.
- Sempre retorne 2 ou 3 \`suggestedQuickReplies\` curtas, úteis e coerentes com o estado atual da conversa.`;

    const recentMessages = Array.isArray(messages) ? messages.slice(-30) : [];
    const normalizedContents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
    for (const m of recentMessages) {
      const contentStr = String(m?.content ?? '').slice(0, 4000);
      if (!contentStr) continue;
      const mappedRole: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
      if (normalizedContents.length === 0 && mappedRole === 'model') continue;
      const last = normalizedContents[normalizedContents.length - 1];
      if (last && last.role === mappedRole) {
        last.parts[0].text += `\n${contentStr}`;
      } else {
        normalizedContents.push({
          role: mappedRole,
          parts: [{ text: contentStr }],
        });
      }
    }

    if (normalizedContents.length === 0) {
      normalizedContents.push({
        role: 'user',
        parts: [{ text: 'Quais horários livres temos hoje?' }],
      });
    }

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
        action: {
          type: Type.STRING,
          enum: ['NONE', 'PROPOSE_BOOKING', 'CONFIRM_BOOKING_NOW', 'CANCEL_APPOINTMENT'],
        },
        suggestedQuickReplies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        hasBookingProposal: { type: Type.BOOLEAN },
        bookingProposal: {
          type: Type.OBJECT,
          properties: {
            entryType: {
              type: Type.STRING,
              enum: ['client', 'commitment'],
            },
            serviceId: { type: Type.STRING },
            date: { type: Type.STRING },
            startTime: { type: Type.STRING },
            durationMinutes: { type: Type.INTEGER },
            commitmentCategory: {
              type: Type.STRING,
              enum: [
                'Compromisso',
                'Audiência',
                'Prazo Processual',
                'Reunião Interna',
                'Diligência',
                'Pessoal',
              ],
            },
            location: { type: Type.STRING },
            clientName: { type: Type.STRING },
            clientPhone: { type: Type.STRING },
            clientCpf: { type: Type.STRING },
            clientAddress: { type: Type.STRING },
            clientEmail: { type: Type.STRING },
            notes: { type: Type.STRING },
            notifyByEmail: { type: Type.BOOLEAN },
          },
          required: ['entryType', 'date', 'startTime'],
        },
        cancelAppointmentCode: { type: Type.STRING },
      },
      required: ['reply', 'action', 'suggestedQuickReplies', 'hasBookingProposal'],
    };

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    let rawText = '';
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: normalizedContents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema,
            },
          });
          if (response.text) {
            rawText = response.text;
            break;
          }
        } catch (err) {
          const status = (err as { status?: number })?.status;
          console.warn(
            `Modelo ${modelName} (tentativa ${attempt + 1}) falhou em /api/ai-booking-chat:`,
            status || err
          );
          lastError = err;
          if (status === 503 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 650));
            continue;
          }
          break;
        }
      }
      if (rawText) break;
    }

    if (!rawText) {
      throw lastError || new Error('Nenhum modelo Gemini respondeu a tempo.');
    }

    const cleanedJson = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');

    return {
      statusCode: 200,
      body: JSON.parse(cleanedJson),
    };
  } catch (error) {
    console.error('Erro em /api/ai-booking-chat:', error);
    const errStatus =
      typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : undefined;
    const errMsg = error instanceof Error ? error.message : String(error);
    const isQuota =
      errStatus === 429 ||
      errMsg.includes('429') ||
      errMsg.toLowerCase().includes('quota');
    const isOverloaded = errStatus === 503 || errMsg.includes('503');
    const isAuth =
      errStatus === 401 ||
      errStatus === 403 ||
      errMsg.includes('401') ||
      errMsg.includes('403') ||
      errMsg.toLowerCase().includes('api key') ||
      errMsg.toLowerCase().includes('permission_denied');

    return {
      statusCode: isQuota ? 429 : isOverloaded ? 503 : isAuth ? 403 : 500,
      body: {
        error: isQuota
          ? 'Limite temporário de consultas da IA atingido. Aguarde alguns instantes e tente novamente.'
          : isOverloaded
          ? 'O serviço da IA está temporariamente sobrecarregado. Aguarde alguns segundos e tente novamente.'
          : isAuth
          ? 'A chave GEMINI_API_KEY configurada no servidor não tem permissão ou é inválida.'
          : 'Não foi possível consultar o assistente de agenda no momento. Tente novamente.',
        ...(errStatus ? { statusCode: errStatus } : {}),
      },
    };
  }
}
