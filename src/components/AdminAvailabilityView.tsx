import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import { AvailabilityConfig } from '../types/scheduling';
import {
  WEEKDAYS_PT,
  formatDateShortBR,
  getScheduleForDayOfWeek,
  minutesToTime,
  timeToMinutes,
  toDateISO,
} from '../utils/timeSlots';

interface AdminAvailabilityViewProps {
  availability: AvailabilityConfig;
  onUpdateAvailability: (
    config: AvailabilityConfig,
    toastTitle?: string,
    toastDesc?: string
  ) => void;
  onOpenClientView: () => void;
}

const TIME_OPTIONS: string[] = [];
for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) {
  TIME_OPTIONS.push(minutesToTime(m));
}

export const AdminAvailabilityView: React.FC<AdminAvailabilityViewProps> = ({
  availability,
  onUpdateAvailability,
  onOpenClientView,
}) => {
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [savedSuccessBanner, setSavedSuccessBanner] = useState<string | null>(null);

  const [newBlockDate, setNewBlockDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDateISO(tomorrow);
  });
  const [newBlockReason, setNewBlockReason] = useState('');
  const [blockError, setBlockError] = useState<string | null>(null);

  const [pickerMonth, setPickerMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [previewDuration, setPreviewDuration] = useState<number>(45);
  const [previewDayType, setPreviewDayType] = useState<'weekday' | 'saturday'>('weekday');

  const showQuickBanner = (msg: string) => {
    setSavedSuccessBanner(msg);
    setTimeout(() => {
      setSavedSuccessBanner((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleToggleWorkDay = (dayIndex: number) => {
    setScheduleError(null);
    const dayObj = WEEKDAYS_PT.find((d) => d.dayIndex === dayIndex);
    const exists = availability.workDays.includes(dayIndex);

    const updatedWorkDays = exists
      ? availability.workDays.filter((d) => d !== dayIndex)
      : [...availability.workDays, dayIndex].sort((a, b) => a - b);

    let nextOverrides = availability.dayOverrides
      ? { ...availability.dayOverrides }
      : undefined;
    if (exists && nextOverrides && dayIndex in nextOverrides) {
      delete nextOverrides[dayIndex];
      if (Object.keys(nextOverrides).length === 0) {
        nextOverrides = undefined;
      }
    }

    if (exists && dayIndex === 6) {
      setPreviewDayType('weekday');
    }

    const nextConfig: AvailabilityConfig = {
      ...availability,
      workDays: updatedWorkDays,
      dayOverrides: nextOverrides,
    };

    onUpdateAvailability(
      nextConfig,
      exists
        ? `${dayObj?.full || 'Dia'} marcado como Recesso`
        : `${dayObj?.full || 'Dia'} ativado no expediente`,
      'A agenda da recepção já foi atualizada.'
    );
    showQuickBanner(
      exists
        ? `${dayObj?.full} removido dos dias de atendimento.`
        : `${dayObj?.full} adicionado aos dias de atendimento.`
    );
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    setScheduleError(null);
    const nextStart = field === 'startTime' ? value : availability.startTime;
    const nextEnd = field === 'endTime' ? value : availability.endTime;

    if (timeToMinutes(nextStart) >= timeToMinutes(nextEnd)) {
      setScheduleError(
        'O horário de início do expediente deve ser anterior ao horário de encerramento.'
      );
      return;
    }

    const nextConfig: AvailabilityConfig = {
      ...availability,
      [field]: value,
    };

    onUpdateAvailability(
      nextConfig,
      'Horário de expediente atualizado',
      `Expediente definido das ${nextStart} às ${nextEnd}.`
    );
    showQuickBanner(`Expediente atualizado: ${nextStart} às ${nextEnd}`);
  };

  const handleToggleLunch = () => {
    setScheduleError(null);
    const nextLunchEnabled = !availability.lunchEnabled;
    const nextConfig: AvailabilityConfig = {
      ...availability,
      lunchEnabled: nextLunchEnabled,
    };

    onUpdateAvailability(
      nextConfig,
      nextLunchEnabled ? 'Intervalo de almoço ativado' : 'Intervalo de almoço desativado',
      nextLunchEnabled
        ? `Pausa das ${availability.lunchStart} às ${availability.lunchEnd} bloqueada na agenda.`
        : 'Horários do meio-dia liberados para triagem.'
    );
    showQuickBanner(
      nextLunchEnabled
        ? `Intervalo de almoço ativado (${availability.lunchStart}–${availability.lunchEnd}).`
        : 'Intervalo de almoço desativado.'
    );
  };

  const handleLunchTimeChange = (field: 'lunchStart' | 'lunchEnd', value: string) => {
    setScheduleError(null);
    const nextLunchStart = field === 'lunchStart' ? value : availability.lunchStart;
    const nextLunchEnd = field === 'lunchEnd' ? value : availability.lunchEnd;

    if (timeToMinutes(nextLunchStart) >= timeToMinutes(nextLunchEnd)) {
      setScheduleError(
        'O início da pausa de almoço deve ser anterior ao fim da pausa.'
      );
      return;
    }

    const nextConfig: AvailabilityConfig = {
      ...availability,
      [field]: value,
    };

    onUpdateAvailability(
      nextConfig,
      'Horário de almoço atualizado',
      `Pausa configurada das ${nextLunchStart} às ${nextLunchEnd}.`
    );
    showQuickBanner(`Pausa de almoço ajustada: ${nextLunchStart} às ${nextLunchEnd}`);
  };

  const handleExplicitSave = (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError(null);
    if (timeToMinutes(availability.startTime) >= timeToMinutes(availability.endTime)) {
      setScheduleError(
        'O horário de início do expediente deve ser menor que o fim do expediente.'
      );
      return;
    }
    if (
      availability.lunchEnabled &&
      timeToMinutes(availability.lunchStart) >= timeToMinutes(availability.lunchEnd)
    ) {
      setScheduleError('O início do almoço deve ser menor que o fim do almoço.');
      return;
    }

    onUpdateAvailability(
      availability,
      'Configurações de horários salvas',
      `Expediente ${availability.startTime}–${availability.endTime} sincronizado com sucesso.`
    );
    showQuickBanner('Todas as configurações de horários foram salvas com sucesso.');
  };

  const handleAddBlockedDate = (e: React.FormEvent) => {
    e.preventDefault();
    setBlockError(null);

    if (!newBlockDate) {
      setBlockError('Selecione uma data no calendário ou no campo abaixo para bloquear.');
      return;
    }

    const alreadyBlocked = availability.blockedDates.some(
      (b) => b.date === newBlockDate
    );
    if (alreadyBlocked) {
      setBlockError('Esta data já está na lista de datas bloqueadas.');
      return;
    }

    const reasonText = newBlockReason.trim() || 'Feriado Forense / Recesso do Escritório';
    const nextConfig: AvailabilityConfig = {
      ...availability,
      blockedDates: [
        ...availability.blockedDates,
        {
          id: `blk-${Date.now()}`,
          date: newBlockDate,
          reason: reasonText,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    };

    onUpdateAvailability(
      nextConfig,
      'Data bloqueada na agenda',
      `${formatDateShortBR(newBlockDate)} (${reasonText})`
    );
    setNewBlockReason('');
  };

  const handleRemoveBlockedDate = (id: string) => {
    const target = availability.blockedDates.find((b) => b.id === id);
    const nextConfig: AvailabilityConfig = {
      ...availability,
      blockedDates: availability.blockedDates.filter((b) => b.id !== id),
    };

    onUpdateAvailability(
      nextConfig,
      'Data desbloqueada',
      target
        ? `${formatDateShortBR(target.date)} voltou a ficar disponível.`
        : undefined
    );
  };

  const pickerDays = useMemo(() => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstDayWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      iso: string | null;
      dayNumber: number | null;
      isBlocked: boolean;
      isWorkDay: boolean;
    }> = [];

    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push({ iso: null, dayNumber: null, isBlocked: false, isWorkDay: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      const iso = toDateISO(dateObj);
      const isBlocked = availability.blockedDates.some((b) => b.date === iso);
      const isWorkDay = availability.workDays.includes(dateObj.getDay());
      cells.push({
        iso,
        dayNumber: d,
        isBlocked,
        isWorkDay,
      });
    }

    return cells;
  }, [pickerMonth, availability]);

  const pickerMonthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(pickerMonth);
  }, [pickerMonth]);

  const saturdaySchedule = useMemo(
    () => getScheduleForDayOfWeek(6, availability),
    [availability]
  );

  const handleSaturdayTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    setScheduleError(null);
    const currentSat = availability.dayOverrides?.[6] || {
      startTime: '05:00',
      endTime: '20:00',
      lunchEnabled: false,
    };
    const nextStart = field === 'startTime' ? value : currentSat.startTime;
    const nextEnd = field === 'endTime' ? value : currentSat.endTime;

    if (timeToMinutes(nextStart) >= timeToMinutes(nextEnd)) {
      setScheduleError('O horário inicial do sábado deve ser anterior ao encerramento.');
      return;
    }

    const nextConfig: AvailabilityConfig = {
      ...availability,
      dayOverrides: {
        ...(availability.dayOverrides || {}),
        6: {
          ...currentSat,
          [field]: value,
          lunchEnabled: false,
        },
      },
    };
    onUpdateAvailability(
      nextConfig,
      'Horário de Sábado atualizado',
      `Sábado definido das ${nextStart} às ${nextEnd}.`
    );
    showQuickBanner(`Horário de Sábado ajustado: ${nextStart} às ${nextEnd}`);
  };

  const previewGeneratedSlots = useMemo(() => {
    if (previewDayType === 'saturday' && !availability.workDays.includes(6)) {
      return [];
    }
    const activeDaySchedule =
      previewDayType === 'saturday'
        ? getScheduleForDayOfWeek(6, availability)
        : getScheduleForDayOfWeek(1, availability);
    const workStart = timeToMinutes(activeDaySchedule.startTime);
    const workEnd = timeToMinutes(activeDaySchedule.endTime);
    const lunchStart = timeToMinutes(activeDaySchedule.lunchStart);
    const lunchEnd = timeToMinutes(activeDaySchedule.lunchEnd);
    const duration = Math.max(15, previewDuration || 45);
    const step = duration;

    const list: Array<{ time: string; endTime: string; isLunch: boolean }> = [];
    let cur = workStart;
    while (cur + duration <= workEnd) {
      const slotStart = cur;
      const slotEnd = cur + duration;
      const overlapsLunch =
        activeDaySchedule.lunchEnabled && slotStart < lunchEnd && slotEnd > lunchStart;

      if (overlapsLunch) {
        list.push({
          time: minutesToTime(lunchStart),
          endTime: minutesToTime(lunchEnd),
          isLunch: true,
        });
        cur = lunchEnd > cur ? lunchEnd : cur + step;
        continue;
      }

      list.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        isLunch: false,
      });
      cur += step;
    }
    return list;
  }, [availability, previewDuration, previewDayType]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
            Jornada do Escritório
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[#0B2545] mt-0.5">
            Horários, Expediente & Recesso
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-[65ch]">
            Configure os dias úteis de atendimento dos advogados, horários de expediente, pausa de almoço e feriados forenses.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenClientView}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-xs font-semibold text-[#0B2545] bg-white hover:bg-blue-50 border border-slate-300 rounded-xl transition-colors self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          <span>Abrir Agenda da Recepção</span>
          <ExternalLink className="w-3.5 h-3.5 text-[#134074]" />
        </button>
      </div>

      {savedSuccessBanner && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs text-[#0B2545] font-medium">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-[#1D4ED8]" />
            <span>{savedSuccessBanner}</span>
          </span>
          <span className="font-mono-tabular text-[11px] text-[#134074] font-semibold">
            Salvo automaticamente
          </span>
        </div>
      )}

      {scheduleError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{scheduleError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleExplicitSave}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-6"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#0B2545]">
                  Dias de expediente semanal
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Selecione os dias em que o escritório realiza atendimentos ({availability.workDays.length} dias ativos).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAvailability(
                      {
                        ...availability,
                        workDays: [1, 2, 3, 4, 5],
                        startTime: '08:00',
                        endTime: '18:00',
                        lunchEnabled: true,
                        lunchStart: '12:00',
                        lunchEnd: '14:00',
                        dayOverrides: undefined,
                      },
                      'Horário oficial aplicado',
                      'Seg–Sex 08:00–12:00 / 14:00–18:00 · Sábado e Domingo fechados.'
                    );
                    setPreviewDayType('weekday');
                    showQuickBanner('Expediente oficial Seg–Sex (Sáb e Dom fechados) aplicado.');
                  }}
                  className="min-h-[44px] px-3 text-xs font-semibold text-[#0B2545] bg-[#FEF9C3] hover:bg-[#FACC15] border border-[#FACC15] rounded-lg transition-colors cursor-pointer"
                >
                  Padrão Oficial (Seg–Sex)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
              {WEEKDAYS_PT.map((day) => {
                const isSelected = availability.workDays.includes(day.dayIndex);
                return (
                  <button
                    key={day.dayIndex}
                    type="button"
                    onClick={() => handleToggleWorkDay(day.dayIndex)}
                    className={`min-h-[44px] py-2.5 px-3 text-xs font-medium rounded-xl border transition-all cursor-pointer flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                      isSelected
                        ? 'bg-[#0B2545] text-white border-[#0B2545]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-[#0B2545] hover:border-blue-300'
                    }`}
                  >
                    <span>{day.full.split('-')[0]}</span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-[#FACC15]" />
                    ) : (
                      <span className="text-[11px] opacity-70">Fechado</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2545] mb-1.5">
                Início do expediente
              </label>
              <select
                value={availability.startTime}
                onChange={(e) => handleTimeChange('startTime', e.target.value)}
                className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={`start-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2545] mb-1.5">
                Fim do expediente
              </label>
              <select
                value={availability.endTime}
                onChange={(e) => handleTimeChange('endTime', e.target.value)}
                className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={`end-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#0B2545]">
                  Intervalo de Almoço
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {availability.lunchEnabled
                    ? `Pausa ativa das ${availability.lunchStart} às ${availability.lunchEnd} (bloqueado na agenda).`
                    : 'Pausa desativada — horários do meio-dia liberados.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleLunch}
                className={`min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0 ${
                  availability.lunchEnabled
                    ? 'bg-[#0B2545] text-[#FACC15] hover:bg-[#134074]'
                    : 'bg-slate-100 text-slate-700 hover:text-[#0B2545] border border-slate-300'
                }`}
              >
                {availability.lunchEnabled ? 'Ativado' : 'Desativado'}
              </button>
            </div>

            {availability.lunchEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Início da pausa
                  </label>
                  <select
                    value={availability.lunchStart}
                    onChange={(e) => handleLunchTimeChange('lunchStart', e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={`lstart-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Fim da pausa
                  </label>
                  <select
                    value={availability.lunchEnd}
                    onChange={(e) => handleLunchTimeChange('lunchEnd', e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={`lend-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {availability.workDays.includes(6) && (
            <div className="pt-5 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0B2545]">
                    Horário Especial · Sábado
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Expediente contínuo diferenciado aos sábados (sem pausa de almoço).
                  </p>
                </div>
                <span className="font-mono-tabular text-xs font-bold text-[#0B2545] bg-[#FEF9C3] border border-[#FACC15] px-2.5 py-1 rounded-md">
                  {saturdaySchedule.startTime}–{saturdaySchedule.endTime}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Abertura (Sábado)
                  </label>
                  <select
                    value={saturdaySchedule.startTime}
                    onChange={(e) => handleSaturdayTimeChange('startTime', e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={`sat-start-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Fechamento (Sábado)
                  </label>
                  <select
                    value={saturdaySchedule.endTime}
                    onChange={(e) => handleSaturdayTimeChange('endTime', e.target.value)}
                    className="w-full min-h-[44px] px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={`sat-end-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-600">
              As alterações também são sincronizadas automaticamente ao selecionar.
            </span>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-[#0B2545] bg-[#FACC15] hover:bg-[#EAB308] rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Salvar Horários
            </button>
          </div>
        </form>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[#0B2545]">
              Bloquear Datas & Feriados Forenses
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Clique em um dia no calendário abaixo para impedir marcações em feriados ou recesso.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#0B2545] capitalize">
                {pickerMonthLabel}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setPickerMonth(
                      new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1)
                    )
                  }
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-[#0B2545] rounded-lg cursor-pointer"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPickerMonth(
                      new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1)
                    )
                  }
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-[#0B2545] rounded-lg cursor-pointer"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500 mb-1">
              {WEEKDAYS_PT.map((d) => (
                <div key={d.dayIndex}>{d.short}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {pickerDays.map((cell, idx) => {
                if (!cell.iso || !cell.dayNumber) {
                  return <div key={`empty-${idx}`} className="h-9" />;
                }

                const isSelected = cell.iso === newBlockDate;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      if (cell.iso) {
                        setNewBlockDate(cell.iso);
                        setBlockError(null);
                      }
                    }}
                    title={
                      cell.isBlocked
                        ? 'Data já bloqueada'
                        : `Selecionar ${formatDateShortBR(cell.iso)}`
                    }
                    className={`h-9 rounded-lg text-xs font-mono-tabular flex items-center justify-center transition-colors cursor-pointer ${
                      cell.isBlocked
                        ? 'bg-red-100 text-red-700 font-semibold border border-red-300'
                        : isSelected
                        ? 'bg-[#0B2545] text-[#FACC15] font-bold'
                        : cell.isWorkDay
                        ? 'bg-white hover:bg-blue-50 text-[#0B2545] border border-slate-200'
                        : 'text-slate-400 bg-transparent'
                    }`}
                  >
                    {cell.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>

          {blockError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{blockError}</span>
            </div>
          )}

          <form onSubmit={handleAddBlockedDate} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                Data selecionada para bloqueio
              </label>
              <input
                type="date"
                value={newBlockDate}
                onChange={(e) => {
                  setNewBlockDate(e.target.value);
                  setBlockError(null);
                }}
                className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] font-mono-tabular focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2545] mb-1">
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={newBlockReason}
                onChange={(e) => setNewBlockReason(e.target.value)}
                placeholder="Ex: Feriado Forense / Recesso / Sustentação Oral"
                className="w-full min-h-[44px] px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-xl text-[#0B2545] focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] py-2.5 px-4 text-xs font-semibold text-white bg-[#0B2545] hover:bg-[#134074] rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-[#FACC15]" />
              <span>
                Bloquear Data{' '}
                {newBlockDate ? `(${formatDateShortBR(newBlockDate)})` : ''}
              </span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 space-y-2">
            <span className="text-xs font-medium text-slate-600 block">
              Datas bloqueadas ({availability.blockedDates.length})
            </span>

            {availability.blockedDates.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center bg-slate-50 border border-slate-200 rounded-xl">
                Nenhuma data bloqueada no momento.
              </p>
            ) : (
              availability.blockedDates.map((blk) => (
                <div
                  key={blk.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#0B2545] capitalize">
                      {formatDateShortBR(blk.date)}
                    </p>
                    <p className="text-xs text-slate-600">{blk.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveBlockedDate(blk.id)}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                    title="Desbloquear data"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-[#0B2545] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1D4ED8]" />
              <span>
                Prévia dos Horários Gerados (
                {previewDayType === 'saturday'
                  ? `Sábado: ${saturdaySchedule.startTime} às ${saturdaySchedule.endTime}`
                  : `Seg–Sex: ${availability.startTime} às ${availability.endTime}`}
                )
              </span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Simulação da grade que aparece para a secretaria ao agendar consultas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            {availability.workDays.includes(6) && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewDayType('weekday')}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    previewDayType === 'weekday'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  Seg–Sex
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDayType('saturday')}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    previewDayType === 'saturday'
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  Sábado
                </button>
              </div>
            )}

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
              {[30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setPreviewDuration(mins)}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-mono-tabular font-semibold rounded-lg transition-colors cursor-pointer ${
                    previewDuration === mins
                      ? 'bg-[#0B2545] text-[#FACC15]'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {previewGeneratedSlots.map((slot) => (
            <div
              key={slot.time}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono-tabular flex items-center gap-1.5 ${
                slot.isLunch
                  ? 'bg-[#FEF9C3] border-[#FACC15] text-[#0B2545] line-through'
                  : 'bg-slate-50 border-slate-200 text-[#0B2545]'
              }`}
            >
              <span>{slot.time}</span>
              <span className="text-[11px] font-sans text-slate-600">
                {slot.isLunch ? '(Almoço)' : 'Livre'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
