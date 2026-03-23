import { UNDERDOG_MULTIPLIER } from "@shared/constants";
import { formatNumber } from "../utils/format";

interface Slice {
  label: string;
  value: number;
  color: string;
}

function DonutChart({ slices, size = 140 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.55;

  let cumAngle = -Math.PI / 2;

  const paths = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const frac = slice.value / total;
      const angle = frac * 2 * Math.PI;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;
      cumAngle = endAngle;

      const largeArc = angle > Math.PI ? 1 : 0;
      const x1o = cx + outerR * Math.cos(startAngle);
      const y1o = cy + outerR * Math.sin(startAngle);
      const x2o = cx + outerR * Math.cos(endAngle);
      const y2o = cy + outerR * Math.sin(endAngle);
      const x1i = cx + innerR * Math.cos(endAngle);
      const y1i = cy + innerR * Math.sin(endAngle);
      const x2i = cx + innerR * Math.cos(startAngle);
      const y2i = cy + innerR * Math.sin(startAngle);

      const d = [
        `M ${x1o} ${y1o}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
        `L ${x1i} ${y1i}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
        "Z",
      ].join(" ");

      return <path key={slice.label} d={d} fill={slice.color} stroke="#e2e8f0" strokeWidth="1.5" />;
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {paths}
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-500 text-[9px]">
        Net Profit
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-900 text-sm font-bold">
        💰 {formatNumber(total, 0)}
      </text>
    </svg>
  );
}

interface Props {
  stake: number;
  basePoolShare: number;
  underdogBonus: number;
  streakBonus: number;
  totalPool: number;
  losingPool: number;
  totalWinningStake: number;
  underdogSide?: string;
  playerSide: string;
  isUnderdog: boolean;
}

export default function ProfitBreakdown({
  stake,
  basePoolShare,
  underdogBonus,
  streakBonus,
  totalPool,
  losingPool,
  totalWinningStake,
  underdogSide,
  playerSide,
  isUnderdog,
}: Props) {
  const slices: Slice[] = [];
  if (basePoolShare > 0) slices.push({ label: "Pool Share", value: basePoolShare, color: "#3b82f6" });
  if (underdogBonus > 0) slices.push({ label: "Underdog Bonus", value: underdogBonus, color: "#f59e0b" });
  if (streakBonus > 0) slices.push({ label: "Streak Bonus", value: streakBonus, color: "#8b5cf6" });

  const totalProfit = basePoolShare + underdogBonus + streakBonus;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <h3 className="text-xs font-semibold text-slate-500 px-3 py-2 border-b border-slate-200">
        Your profit breakdown
      </h3>

      <div className="px-3 py-4 flex items-start gap-4">
        <DonutChart slices={slices} />

        <div className="flex-1 space-y-2 min-w-0">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-slate-700 flex-1">{s.label}</span>
              <span className="text-slate-900 font-medium tabular-nums">
                💰 {formatNumber(s.value, 2)}
              </span>
              <span className="text-slate-500 w-10 text-right tabular-nums">
                {totalProfit > 0 ? Math.round((s.value / totalProfit) * 100) : 0}%
              </span>
            </div>
          ))}
          {slices.length === 0 && (
            <p className="text-slate-500 text-xs">No profit components to display.</p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 px-3 py-3 space-y-3">
        <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">How it's calculated</h4>

        {/* Pool share formula */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            Pool Share
          </div>
          <div className="bg-slate-50 rounded-lg px-2.5 py-2 font-mono text-[11px] text-slate-700 leading-relaxed border border-slate-200">
            <div className="flex flex-wrap items-center gap-x-1">
              <span className="text-slate-500">(</span>
              <span className="text-blue-400">your stake</span>
              <span className="text-slate-500">/</span>
              <span className="text-blue-400">total winning stake</span>
              <span className="text-slate-500">)</span>
              <span className="text-slate-500">×</span>
              <span className="text-blue-400">losing pool</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1 text-slate-900">
              <span className="text-slate-500">(</span>
              <span>{formatNumber(stake, 0)}</span>
              <span className="text-slate-500">/</span>
              <span>{formatNumber(totalWinningStake, 0)}</span>
              <span className="text-slate-500">)</span>
              <span className="text-slate-500">×</span>
              <span>{formatNumber(losingPool, 0)}</span>
              <span className="text-slate-500">=</span>
              <span className="text-blue-400 font-semibold">{formatNumber(basePoolShare, 2)}</span>
            </div>
          </div>
        </div>

        {/* Underdog bonus formula */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            Underdog Bonus
            {underdogSide && (
              <span className="text-amber-500/70 ml-1">({underdogSide} = underdog)</span>
            )}
          </div>
          {isUnderdog ? (
            <div className="bg-slate-50 rounded-lg px-2.5 py-2 font-mono text-[11px] text-slate-700 leading-relaxed border border-slate-200">
              <div className="flex flex-wrap items-center gap-x-1">
                <span className="text-amber-400">pool share</span>
                <span className="text-slate-500">×</span>
                <span className="text-slate-500">(</span>
                <span className="text-amber-400">{UNDERDOG_MULTIPLIER}×</span>
                <span className="text-slate-500">-</span>
                <span className="text-amber-400">1</span>
                <span className="text-slate-500">)</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-slate-900">
                <span>{formatNumber(basePoolShare, 2)}</span>
                <span className="text-slate-500">×</span>
                <span>{UNDERDOG_MULTIPLIER - 1}</span>
                <span className="text-slate-500">=</span>
                <span className="text-amber-400 font-semibold">{formatNumber(underdogBonus, 2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-[11px] px-1">
              You backed <span className="text-slate-700">{playerSide}</span> (favourite) — no underdog bonus.
            </p>
          )}
        </div>

        {/* Streak bonus formula */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
            Streak Bonus
          </div>
          {streakBonus > 0 ? (
            <div className="bg-slate-50 rounded-lg px-2.5 py-2 font-mono text-[11px] text-slate-700 leading-relaxed border border-slate-200">
              <div className="flex flex-wrap items-center gap-x-1 text-slate-900">
                <span>Consecutive-win tier reward</span>
                <span className="text-slate-500">=</span>
                <span className="text-purple-400 font-semibold">{formatNumber(streakBonus, 0)}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                2nd win → 100 · 3rd → 200 · 4th → 400 · 5th → 800
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-[11px] px-1">No streak bonus this match.</p>
          )}
        </div>

        {/* Total */}
        <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Total Profit</span>
          <span className="text-emerald-600 font-bold tabular-nums text-sm">
            +💰 {formatNumber(totalProfit, 2)}
          </span>
        </div>
        <p className="text-[10px] text-slate-500">
          Total pool: 💰 {formatNumber(totalPool, 0)} · Losers' pool: 💰 {formatNumber(losingPool, 0)} · Winners' stake: 💰 {formatNumber(totalWinningStake, 0)}
        </p>
      </div>
    </div>
  );
}
