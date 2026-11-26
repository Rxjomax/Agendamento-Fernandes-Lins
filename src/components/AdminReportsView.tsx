import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CalendarCheck, Clock } from 'lucide-react';
import { Appointment } from '../types/scheduling';
import { WEEKDAYS_PT, parseDateISO } from '../utils/timeSlots';

interface AdminReportsViewProps {
  appointments: Appointment[];
}

interface DayChartRow {
  dayIndex: number;
  shortName: string;
  fullName: string;
  totalAtendimentos: number;
  realizados: number;
  confirmados: number;
  pendentes: number;
  cancelados: number;
}

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({ appointments }) => {
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const summary = useMemo(() => {
    const activeAppointments = appointments.filter((a) => a.status !== 'cancelled');
    const confirmedAppointments = appointments.filter((a) => a.status === 'confirmed');
    const completedAppointments = appointments.filter((a) => a.status === 'completed');
    const pendingAppointments = appointments.filter((a) => a.status === 'pending');
    const cancelledAppointments = appointments.filter((a) => a.status === 'cancelled');

    const totalVolume = includeCancelled
      ? appointments.length
      : activeAppointments.length;

    const totalMinutes = activeAppointments.reduce(
      (acc, a) => acc + a.durationMinutes,
      0
    );
    const avgDuration =
      activeAppointments.length > 0
        ? Math.round(totalMinutes / activeAppointments.length)
        : 45;

    return {
      totalVolume,
      allRecordsCount: appointments.length,
      activeCount: activeAppointments.length,
      completedCount: completedAppointments.length,
      confirmedCount: confirmedAppointments.length,
      pendingCount: pendingAppointments.length,
      cancelledCount: cancelledAppointments.length,
      totalHours: (totalMinutes / 60).toFixed(1),
      avgDuration,
    };
  }, [appointments, includeCancelled]);

  const chartData = useMemo<DayChartRow[]>(() => {
    const orderedWeekdays = [
      WEEKDAYS_PT[1],
      WEEKDAYS_PT[2],
      WEEKDAYS_PT[3],
      WEEKDAYS_PT[4],
      WEEKDAYS_PT[5],
      WEEKDAYS_PT[6],
      WEEKDAYS_PT[0],
    ];

    return orderedWeekdays.map((day) => {
      const dayAppts = appointments.filter((appt) => {
        const d = parseDateISO(appt.date);
        return d.getDay() === day.dayIndex;
      });

      const realizados = dayAppts.filter((a) => a.status === 'completed').length;
      const confirmados = dayAppts.filter((a) => a.status === 'confirmed').length;
      const pendentes = dayAppts.filter((a) => a.status === 'pending').length;
      const cancelados = dayAppts.filter((a) => a.status === 'cancelled').length;

      const validAppts = includeCancelled
        ? dayAppts
        : dayAppts.filter((a) => a.status !== 'cancelled');

      return {
        dayIndex: day.dayIndex,
        shortName: day.short,
        fullName: day.full,
        totalAtendimentos: validAppts.length,
        realizados,
        confirmados,
        pendentes,
        cancelados,
      };
    });
  }, [appointments, includeCancelled]);

  const busiestDay = useMemo(() => {
    return [...chartData].sort((a, b) => b.totalAtendimentos - a.totalAtendimentos)[0];
  }, [chartData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
            Indicadores do Escritório
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[#0B2545] mt-0.5">
            Relatórios & Volume de Atendimentos
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-[65ch]">
            Análise do volume total de atendimentos jurídicos, carga horária e demanda semanal por dia útil.
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIncludeCancelled(false)}
            className={`min-h-[44px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              !includeCancelled
                ? 'bg-[#0B2545] text-[#FACC15]'
                : 'text-slate-600 hover:text-[#0B2545]'
            }`}
          >
            Ativos
          </button>
          <button
            type="button"
            onClick={() => setIncludeCancelled(true)}
            className={`min-h-[44px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              includeCancelled
                ? 'bg-[#0B2545] text-[#FACC15]'
                : 'text-slate-600 hover:text-[#0B2545]'
            }`}
          >
            Incluir Cancelados
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        <div className="md:col-span-5 fl-navy-banner text-white rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#FEF9C3]">
                Volume Total de Atendimentos
              </span>
              <CalendarCheck className="w-4 h-4 text-[#FACC15]" />
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-bold font-mono-tabular tracking-tight text-white">
                {summary.totalVolume}
              </span>
              <span className="text-xs text-slate-200">
                {summary.totalVolume === 1 ? 'consulta registrada' : 'consultas registradas'}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/15 grid grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-slate-300 block">Realizados</span>
              <span className="font-mono-tabular font-semibold text-white text-sm">
                {summary.completedCount}
              </span>
            </div>
            <div>
              <span className="text-slate-300 block">Confirmados</span>
              <span className="font-mono-tabular font-semibold text-white text-sm">
                {summary.confirmedCount}
              </span>
            </div>
            <div>
              <span className="text-slate-300 block">Pendentes</span>
              <span className="font-mono-tabular font-semibold text-[#FACC15] text-sm">
                {summary.pendingCount}
              </span>
            </div>
            <div>
              <span className="text-slate-300 block">Horas</span>
              <span className="font-mono-tabular font-semibold text-white text-sm">
                {summary.totalHours}h
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>Carga Horária em Pauta</span>
                <Clock className="w-4 h-4 text-[#1D4ED8]" />
              </div>
              <p className="text-2xl font-bold text-[#0B2545] font-mono-tabular mt-2">
                {summary.totalHours}h agendadas
              </p>
            </div>
            <p className="text-xs text-slate-600 mt-4 pt-3 border-t border-slate-200">
              Duração média por atendimento:{' '}
              <strong className="font-mono-tabular text-[#1D4ED8]">
                {summary.avgDuration} min
              </strong>
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>Dia com Maior Demanda</span>
                <BarChart3 className="w-4 h-4 text-[#1D4ED8]" />
              </div>
              <p className="text-2xl font-bold text-[#0B2545] mt-2">
                {busiestDay && busiestDay.totalAtendimentos > 0
                  ? busiestDay.fullName.split('-')[0]
                  : 'Sem dados'}
              </p>
            </div>
            <p className="text-xs text-slate-600 mt-4 pt-3 border-t border-slate-200">
              Concentra{' '}
              <strong className="font-mono-tabular text-[#1D4ED8]">
                {busiestDay ? busiestDay.totalAtendimentos : 0}
              </strong>{' '}
              atendimento(s) registrado(s)
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-6 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-[#0B2545]">
              Atendimentos por Dia da Semana
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Distribuição de volume de atendimentos jurídicos de Segunda-feira a Domingo.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0B2545] inline-block" />
              <span>Maior movimento</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#93C5FD] inline-block" />
              <span>Dias regulares</span>
            </span>
          </div>
        </div>

        <div className="mt-6 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 16, left: -12, bottom: 8 }}
              barSize={42}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E2E8F0"
              />
              <XAxis
                dataKey="shortName"
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                tick={{ fill: '#0B2545', fontSize: 12, fontWeight: 500 }}
                dy={8}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#475569', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: '#EFF6FF' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0].payload as DayChartRow;
                  return (
                    <div className="bg-[#0B2545] text-white border border-[#1E3A8A] rounded-xl p-3 text-xs shadow-md">
                      <p className="font-semibold text-[#FACC15]">{data.fullName}</p>
                      <div className="mt-2 space-y-1 font-mono-tabular">
                        <p className="text-slate-200">
                          Total exibido: <strong className="text-white">{data.totalAtendimentos}</strong>
                        </p>
                        <p className="text-blue-200">
                          Realizados: {data.realizados} · Confirmados: {data.confirmados} · Pendentes: {data.pendentes}
                        </p>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="totalAtendimentos" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => {
                  const isMax =
                    busiestDay &&
                    entry.dayIndex === busiestDay.dayIndex &&
                    entry.totalAtendimentos > 0;
                  return (
                    <Cell
                      key={`cell-${entry.dayIndex}`}
                      fill={isMax ? '#0B2545' : '#93C5FD'}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0B2545]">
            Detalhamento por Dia da Semana
          </h3>
          <span className="text-xs text-slate-500">
            Atualizado automaticamente conforme a pauta
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-5">Dia da Semana</th>
                <th className="py-3 px-5 text-right">Realizados</th>
                <th className="py-3 px-5 text-right">Confirmados</th>
                <th className="py-3 px-5 text-right">Pendentes</th>
                <th className="py-3 px-5 text-right">Cancelados</th>
                <th className="py-3 px-5 text-right">Volume Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {chartData.map((row) => (
                <tr key={row.dayIndex} className="hover:bg-blue-50/40">
                  <td className="py-3.5 px-5 font-medium text-[#0B2545]">
                    {row.fullName}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono-tabular text-[#0B2545] font-semibold">
                    {row.realizados}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono-tabular text-[#1D4ED8] font-medium">
                    {row.confirmados}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono-tabular text-[#B45309] font-medium">
                    {row.pendentes}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono-tabular text-slate-500">
                    {row.cancelados}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono-tabular font-semibold text-[#0B2545]">
                    {row.realizados + row.confirmados + row.pendentes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
