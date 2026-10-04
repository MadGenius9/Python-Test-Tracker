import React from 'react';
import { SiloDerivedState } from '../types';
import { formatLbs, formatTons } from '../lib/sandRules';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#252b34] bg-[#0c0f14] p-4 sm:p-6 shadow-2xl">
      {/* Precision SCADA Engineering Floor Grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(215, 196, 163, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(215, 196, 163, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(215,196,163,0.06),transparent_70%)]" />

      <div className="relative space-y-8">
        {sides.map(({ sideName, silos }) => {
          const bankTitle = sideName.toUpperCase().startsWith('SIDE')
            ? sideName.toUpperCase()
            : `BANK ${sideName.toUpperCase()}`;

          return (
            <div key={sideName} className="space-y-3">
              {/* Bank Header Bar */}
              <div className="flex items-center justify-between border-b border-[#232933] pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-[#d7c4a3] shadow-[0_0_8px_rgba(215,196,163,0.6)]" />
                  <span className="text-xs font-mono font-bold tracking-[0.22em] text-[#e7e1d6]">
                    {bankTitle}
                  </span>
                  <span className="text-[11px] font-mono text-[#78828e]">
                    ({silos.length} HOPPERS)
                  </span>
                </div>
                <div className="text-[10px] font-mono tracking-widest text-[#78828e] uppercase">
                  MANIFOLD RUNNER {sideName.toUpperCase()}
                </div>
              </div>

              {/* Silo Units Row */}
              <div className="flex items-end gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1">
                {silos.map((silo) => {
                  const percent = Math.max(0, Math.min(100, silo.percentFull || 0));
                  const isSelected = selectedSilo === silo.siloNumber;
                  const isOffline = silo.isOutOfService;
                  const isLow = silo.onHandLbs < 30000 && !isOffline;

                  // Mesh color tagging
                  const sandLower = (silo.sandType || '').toLowerCase();
                  let sandTagStyle = 'border-[#3a4450] bg-[#161b22] text-[#c2cbd6]';
                  let sandFillStart = '#caa260';
                  let sandFillEnd = '#967438';

                  if (sandLower.includes('100')) {
                    sandTagStyle = 'border-[#d4a017]/40 bg-[#d4a017]/10 text-[#f0d48a]';
                    sandFillStart = '#d4a359';
                    sandFillEnd = '#9c7333';
                  } else if (sandLower.includes('40/70') || sandLower.includes('40')) {
                    sandTagStyle = 'border-[#5b7c99]/40 bg-[#5b7c99]/10 text-[#9bc0e2]';
                    sandFillStart = '#829bb0';
                    sandFillEnd = '#506678';
                  } else if (silo.sandType) {
                    sandTagStyle = 'border-[#8fa37a]/40 bg-[#8fa37a]/10 text-[#b8d49f]';
                    sandFillStart = '#9cb886';
                    sandFillEnd = '#657e51';
                  }

                  // Vertical sand mass height calculation inside vessel (cavity y=32 to y=156, height 124)
                  const fillHeight = (percent / 100) * 120;
                  const fillY = 154 - fillHeight;

                  return (
                    <button
                      key={silo.siloNumber}
                      type="button"
                      onClick={() => onSelect?.(silo.siloNumber)}
                      className={`group relative shrink-0 w-[142px] sm:w-[152px] rounded-xl border p-3 text-center transition-all duration-200 cursor-pointer select-none ${
                        isSelected
                          ? 'border-[#d7c4a3] bg-[#171c24] shadow-[0_0_24px_rgba(215,196,163,0.18)] ring-1 ring-[#d7c4a3]/60'
                          : 'border-[#222832] bg-[#11141a] hover:border-[#38414e] hover:bg-[#151a22]'
                      }`}
                    >
                      {/* Rotation Priority Badge */}
                      {silo.runOrder !== null && silo.runOrder !== undefined && !isOffline && (
                        <div
                          className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[#d7c4a3] text-[11px] font-mono font-bold text-[#0c0f14] shadow-md ring-2 ring-[#0c0f14]"
                          title={`Rotation Order: #${silo.runOrder}`}
                        >
                          {silo.runOrder}
                        </div>
                      )}

                      {/* Interactive Telemetry Hover Tooltip */}
                      <div className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 z-40 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 w-52 rounded-xl bg-[#0e1218]/98 backdrop-blur-md border border-[#353e4c] p-3 shadow-2xl text-left">
                        <div className="flex items-center justify-between border-b border-[#242b36] pb-1.5 mb-1.5">
                          <span className="text-xs font-mono font-bold text-[#e7e1d6]">
                            SILO #{silo.siloNumber}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                              isOffline
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {isOffline ? 'OFFLINE' : 'ONLINE'}
                          </span>
                        </div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-[#8c96a3]">
                            <span>On Hand:</span>
                            <span className="font-bold text-[#e7e1d6]">
                              {Math.round(silo.onHandLbs).toLocaleString()} lbs
                            </span>
                          </div>
                          <div className="flex justify-between text-[#8c96a3]">
                            <span>Tons:</span>
                            <span className="text-[#d7c4a3] font-semibold">
                              {formatTons(silo.onHandTons)}
                            </span>
                          </div>
                          <div className="flex justify-between text-[#8c96a3]">
                            <span>Runway:</span>
                            <span className="font-bold text-[#e7e1d6]">
                              {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stgs
                            </span>
                          </div>
                          {silo.plannedPullLbs > 0 && (
                            <div className="flex justify-between text-[#8c96a3] pt-1 border-t border-[#242b36]">
                              <span>Planned Pull:</span>
                              <span className="font-bold text-[#d7c4a3]">
                                {formatLbs(silo.plannedPullLbs)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Engineered Vector Silo */}
                      <svg viewBox="0 0 130 192" className="mx-auto h-48 w-full select-none">
                        <defs>
                          {/* Tank Metallic Outer Gradient */}
                          <linearGradient id={`tank-shell-${silo.siloNumber}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#1a2028" />
                            <stop offset="25%" stopColor="#2c3642" />
                            <stop offset="50%" stopColor="#3d4957" />
                            <stop offset="75%" stopColor="#2c3642" />
                            <stop offset="100%" stopColor="#1a2028" />
                          </linearGradient>

                          {/* Sand Mass Fill Gradient */}
                          <linearGradient id={`sand-fill-${silo.siloNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={sandFillStart} />
                            <stop offset="100%" stopColor={sandFillEnd} />
                          </linearGradient>

                          {/* Internal Cavity ClipPath */}
                          <clipPath id={`hopper-clip-${silo.siloNumber}`}>
                            <path d="M 28 32 C 28 22, 102 22, 102 32 V 122 L 78 154 H 52 L 28 122 Z" />
                          </clipPath>

                          {/* Specular Glare */}
                          <linearGradient id="glass-sheen" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
                            <stop offset="35%" stopColor="rgba(255,255,255,0.14)" />
                            <stop offset="70%" stopColor="rgba(255,255,255,0.02)" />
                            <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
                          </linearGradient>
                        </defs>

                        {/* Ground Shadow */}
                        <ellipse cx="65" cy="182" rx="46" ry="6" fill="#000000" opacity="0.65" />

                        {/* Heavy Structural Steel Columns & Bracing */}
                        <rect x="30" y="122" width="6" height="58" fill="#1e252f" stroke="#313c49" strokeWidth="0.8" />
                        <rect x="94" y="122" width="6" height="58" fill="#1e252f" stroke="#313c49" strokeWidth="0.8" />
                        <line x1="36" y1="134" x2="94" y2="166" stroke="#313c49" strokeWidth="1.5" strokeDasharray="3 2" />
                        <line x1="94" y1="134" x2="36" y2="166" stroke="#313c49" strokeWidth="1.5" strokeDasharray="3 2" />
                        {/* Steel Footing Base Plates */}
                        <rect x="26" y="178" width="14" height="4" rx="1" fill="#424f5e" />
                        <rect x="90" y="178" width="14" height="4" rx="1" fill="#424f5e" />

                        {/* Conical Hopper Drop Nozzle & Flange */}
                        <path d="M 58 154 H 72 V 168 H 58 Z" fill="#12161d" stroke="#3d4957" strokeWidth="1" />
                        <rect x="56" y="168" width="18" height="3" rx="1" fill="#586777" />

                        {/* Vessel Shell (Cylindrical Pressure Tank with Conical Base) */}
                        <path
                          d="M 26 32 C 26 18, 104 18, 104 32 V 122 L 78 156 H 52 L 26 122 Z"
                          fill={`url(#tank-shell-${silo.siloNumber})`}
                          stroke={isSelected ? '#d7c4a3' : '#3d4957'}
                          strokeWidth={isSelected ? '2.5' : '1.2'}
                        />

                        {/* Top Pressure Dome */}
                        <ellipse
                          cx="65"
                          cy="30"
                          rx="39"
                          ry="9"
                          fill="#28323e"
                          stroke={isSelected ? '#d7c4a3' : '#4d5c6d'}
                          strokeWidth={isSelected ? '2' : '1'}
                        />

                        {/* Pressure Relief Vent Hatch */}
                        <rect x="61" y="17" width="8" height="5" rx="1" fill="#4d5c6d" />
                        <ellipse cx="65" cy="17" rx="6" ry="2" fill="#718294" />

                        {/* LIVE SAND MASS WITH SIGHT GLASS */}
                        <g clipPath={`url(#hopper-clip-${silo.siloNumber})`}>
                          {/* Vessel Interior Chamber */}
                          <rect x="26" y="18" width="78" height="142" fill="#0a0d12" />

                          {/* Sand Fill Mass */}
                          {!isOffline && percent > 0 && (
                            <>
                              <rect
                                x="26"
                                y={fillY}
                                width="78"
                                height={fillHeight + 10}
                                fill={`url(#sand-fill-${silo.siloNumber})`}
                                opacity="0.94"
                              />
                              {/* Meniscus curved top surface */}
                              <ellipse
                                cx="65"
                                cy={fillY}
                                rx="37"
                                ry="5"
                                fill={sandFillStart}
                                opacity="0.95"
                              />
                              <line
                                x1="28"
                                y1={fillY}
                                x2="102"
                                y2={fillY}
                                stroke="#fff5df"
                                strokeWidth="1.5"
                                opacity="0.8"
                              />
                            </>
                          )}

                          {isOffline && (
                            <rect x="26" y="18" width="78" height="142" fill="#1b212b" opacity="0.75" />
                          )}

                          {/* Specular Highlight Glare */}
                          <rect x="26" y="18" width="78" height="142" fill="url(#glass-sheen)" pointerEvents="none" />
                        </g>

                        {/* Welded Stiffener Rib Lines */}
                        <line x1="26" y1="58" x2="104" y2="58" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                        <line x1="26" y1="88" x2="104" y2="88" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                        <line x1="26" y1="118" x2="104" y2="118" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

                        {/* Digital Level Reading Plate */}
                        <g>
                          <rect
                            x="43"
                            y="70"
                            width="44"
                            height="20"
                            rx="4"
                            fill="rgba(10, 13, 18, 0.88)"
                            stroke={isSelected ? 'rgba(215, 196, 163, 0.6)' : 'rgba(88, 103, 119, 0.5)'}
                            strokeWidth="1"
                          />
                          <text
                            x="65"
                            y="84"
                            textAnchor="middle"
                            fontFamily="monospace"
                            fontSize="11"
                            fontWeight="bold"
                            fill={isOffline ? '#64748b' : isLow ? '#ef4444' : '#f1ede4'}
                          >
                            {isOffline ? 'OFF' : `${Math.round(percent)}%`}
                          </text>
                        </g>
                      </svg>

                      {/* Silo Data & Labels */}
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-xs font-bold tracking-tight ${
                              isSelected ? 'text-[#d7c4a3]' : 'text-[#e7e1d6]'
                            }`}
                          >
                            SILO {silo.siloNumber < 10 ? `0${silo.siloNumber}` : silo.siloNumber}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase ${
                              isOffline
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isLow
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'text-emerald-400'
                            }`}
                          >
                            {isOffline ? 'OFFLINE' : `${silo.stagesLeft.toFixed(1)} STG`}
                          </span>
                        </div>

                        {/* Live Pounds Readout */}
                        <div className="font-mono text-sm sm:text-base font-bold tracking-tight text-white">
                          {Math.round(silo.onHandLbs).toLocaleString()}{' '}
                          <span className="text-[10px] font-normal text-[#8c96a3]">LBS</span>
                        </div>

                        {/* Sand Type Mesh Tag */}
                        <div
                          className={`truncate rounded border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${sandTagStyle}`}
                          title={silo.sandType || 'Unassigned'}
                        >
                          {silo.sandType || 'EMPTY'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
