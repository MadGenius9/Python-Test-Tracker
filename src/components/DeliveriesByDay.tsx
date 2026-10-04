import { Calendar, Truck, Layers, ChevronDown, ChevronUp, FileText, CheckCircle2 } from 'lucide-react';
import React, { useState } from 'react';
import { formatLbs, formatTons } from '../lib/sandRules';
import { getOperationalDate, formatOperationalDateDisplay, parseDateParts } from '../lib/dateUtils';
import { AppState, DeliveryTicket } from '../types';

interface DeliveriesByDayProps {
  state: AppState;
}

export default function DeliveriesByDay({ state }: DeliveriesByDayProps) {
  const { config, deliveries } = state;
  const lbsPerTon = config.lbsPerTon || 2000;
  const lbsPerTruckload = config.lbsPerTruckload || 57000;

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [dayRangeFilter, setDayRangeFilter] = useState<number>(14); // default 14 days

  const todayStr = getOperationalDate();

  // Determine date bounds
  const deliveryDates = deliveries.map((d) => d.date).filter(Boolean);
  let maxDateStr = todayStr;
  let minDateStr = todayStr;

  if (deliveryDates.length > 0) {
    const sortedDates = [...deliveryDates].sort();
    if (sortedDates[sortedDates.length - 1] > maxDateStr) {
      maxDateStr = sortedDates[sortedDates.length - 1];
    }
    minDateStr = sortedDates[0];
  }

  // Generate sequence of dates from maxDateStr down to minDateStr (or based on filter)
  const generateDates = (): string[] => {
    const dates: string[] = [];
    const maxParts = parseDateParts(maxDateStr);
    const minParts = parseDateParts(minDateStr);
    if (!maxParts || !minParts) return [todayStr];

    const current = new Date(Date.UTC(maxParts.year, maxParts.month - 1, maxParts.day, 12, 0, 0));
    const start = new Date(Date.UTC(minParts.year, minParts.month - 1, minParts.day, 12, 0, 0));

    // Also factor in dayRangeFilter limit
    const todayParts = parseDateParts(todayStr) || maxParts;
    const filterLimitDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 12, 0, 0));
    filterLimitDate.setUTCDate(filterLimitDate.getUTCDate() - (dayRangeFilter - 1));

    const effectiveStartDate = start < filterLimitDate ? filterLimitDate : start;

    while (current >= effectiveStartDate) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      current.setUTCDate(current.getUTCDate() - 1);
    }

    return dates;
  };

  const dateList = generateDates();

  // Helper to format date display (e.g., "Wednesday, Aug 12, 2026")
  const formatDateDisplay = (dateStr: string): { main: string; relative: string } => {
    const main = formatOperationalDateDisplay(dateStr, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (dateStr === todayStr) {
      return { main, relative: 'TODAY' };
    }

    const todayParts = parseDateParts(todayStr);
    if (todayParts) {
      const yesterday = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day - 1, 12, 0, 0));
      const yyyy = yesterday.getUTCFullYear();
      const mm = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(yesterday.getUTCDate()).padStart(2, '0');
      if (dateStr === `${yyyy}-${mm}-${dd}`) {
        return { main, relative: 'YESTERDAY' };
      }
    }

    return { main, relative: '' };
  };

  const toggleDayExpansion = (dateStr: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  // Group deliveries by day
  const deliveriesByDayMap: Record<string, DeliveryTicket[]> = {};
  deliveries.forEach((d) => {
    if (!deliveriesByDayMap[d.date]) {
      deliveriesByDayMap[d.date] = [];
    }
    deliveriesByDayMap[d.date].push(d);
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Range Controls */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="bg-amber-500 text-slate-950 p-3 rounded-2xl font-black shadow-lg">
            <Calendar className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-amber-400">
              SAND LOGISTICS SUMMARY
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">
              DELIVERIES BY DAY
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Daily delivery weights, load counts, and sand type breakdowns (newest first).
            </p>
          </div>
        </div>

        {/* Range Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto">
          {[7, 14, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setDayRangeFilter(days)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition ${
                dayRangeFilter === days
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Past {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Date Cards List (Newest First) */}
      <div className="space-y-4">
        {dateList.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="font-black text-sm text-slate-300 uppercase">No Deliveries Found</p>
            <p className="text-xs mt-1">Record ticket entries to view daily sand intake breakdowns.</p>
          </div>
        ) : (
          dateList.map((dateStr) => {
            const dayTickets = deliveriesByDayMap[dateStr] || [];
            const hasDeliveries = dayTickets.length > 0;
            const dayTotalLbs = dayTickets.reduce((sum, t) => sum + (t.lbs || 0), 0);
            const dayTotalTons = dayTotalLbs / lbsPerTon;
            const dayTotalLoads = dayTickets.length;
            const dateLabel = formatDateDisplay(dateStr);
            const isExpanded = !!expandedDays[dateStr];

            // Calculate per-sand-type totals for this day
            const sandTypeBreakdown = config.sandTypes.map((st) => {
              const typeTickets = dayTickets.filter((t) => t.sandType === st.name);
              const typeLbs = typeTickets.reduce((sum, t) => sum + (t.lbs || 0), 0);
              const typeTons = typeLbs / lbsPerTon;
              const typeLoads = typeTickets.length;
              return {
                sandType: st.name,
                lbs: typeLbs,
                tons: typeTons,
                loads: typeLoads,
              };
            });

            return (
              <div
                key={dateStr}
                className={`bg-slate-900 border-2 rounded-2xl shadow-xl transition-all overflow-hidden ${
                  hasDeliveries
                    ? 'border-slate-800'
                    : 'border-slate-800/60 opacity-80'
                }`}
              >
                {/* Day Header Row */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg font-mono shrink-0 shadow-inner ${
                        hasDeliveries
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {dateStr.split('-')[2]}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white uppercase tracking-tight">
                          {dateLabel.main}
                        </span>
                        {dateLabel.relative && (
                          <span className="text-[10px] font-black uppercase bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md">
                            {dateLabel.relative}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>Date Code: <strong className="font-mono text-slate-300">{dateStr}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right Header Metrics */}
                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 shrink-0">
                    {hasDeliveries ? (
                      <>
                        <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-right">
                          <div className="text-[10px] font-black uppercase text-slate-400">
                            DAILY TOTAL
                          </div>
                          <div className="text-base font-black font-mono text-amber-400">
                            {formatLbs(dayTotalLbs)}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {dayTotalTons.toFixed(1)} Tons
                          </div>
                        </div>

                        <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 text-right">
                          <div className="text-[10px] font-black uppercase text-slate-400">
                            LOAD COUNT
                          </div>
                          <div className="text-base font-black font-mono text-white">
                            {dayTotalLoads} {dayTotalLoads === 1 ? 'LOAD' : 'LOADS'}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {dayTickets.length} Tickets
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleDayExpansion(dateStr)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition flex items-center gap-1.5"
                        >
                          {isExpanded ? (
                            <>
                              <span>HIDE TICKETS</span>
                              <ChevronUp className="w-4 h-4 text-amber-400" />
                            </>
                          ) : (
                            <>
                              <span>VIEW TICKETS ({dayTickets.length})</span>
                              <ChevronDown className="w-4 h-4 text-amber-400" />
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800/80 text-slate-400 text-xs font-black uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                        NO DELIVERIES LOGGED FOR THIS DAY (0 LBS / 0 LOADS)
                      </div>
                    )}
                  </div>
                </div>

                {/* Per Sand Type Breakdown Cards */}
                <div className="p-4 sm:p-5 bg-slate-950/40">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5">
                    SAND TYPE INTAKE BREAKDOWN
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sandTypeBreakdown.map((st) => (
                      <div
                        key={st.sandType}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          st.loads > 0
                            ? 'bg-slate-950 border-amber-500/50'
                            : 'bg-slate-950/60 border-slate-800/80 opacity-60'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                st.sandType.includes('100')
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                              }`}
                            ></span>
                            {st.sandType}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {st.loads} {st.loads === 1 ? 'Truckload' : 'Truckloads'}
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <div
                            className={`text-sm font-black ${
                              st.loads > 0 ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          >
                            {st.lbs.toLocaleString()} LBS
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {st.tons.toFixed(1)} Tons
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expandable Individual Tickets Table for Day */}
                {hasDeliveries && isExpanded && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 space-y-2">
                    <div className="text-[10px] font-black uppercase text-amber-400 tracking-wider mb-2">
                      TICKETS LOGGED ON {dateStr}
                    </div>

                    <div className="space-y-2">
                      {dayTickets.map((t) => (
                        <div
                          key={t.id}
                          className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black text-amber-400">
                              #{t.ticketNumber}
                            </span>
                            <span className="font-bold text-slate-950 bg-amber-400 px-2 py-0.5 rounded text-[10px]">
                              SILO #{t.siloNumber}
                            </span>
                            <span className="font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                              {t.sandType}
                            </span>
                            <span className="text-slate-400">
                              Supplier: <strong className="text-white">{t.supplier}</strong>
                            </span>
                            {t.createdAt && (
                              <span className="text-amber-400 font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                Logged: {new Date(t.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </div>

                          <div className="font-mono font-black text-white text-sm">
                            {t.lbs.toLocaleString()} LBS ({(t.lbs / lbsPerTon).toFixed(2)} Tons)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
