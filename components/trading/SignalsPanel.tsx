'use client';

import { useEffect, useState } from 'react';

interface Signal {
    _id: string;
    symbol: string;
    strategy: string;
    direction: 'BUY' | 'SELL';
    strength: number;
    currentPrice: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit: number;
    suggestedAllocCAD: number;
    reasoning: string;
    catalysts: string[];
    indicators: {
        rsi?: number;
        volumeRatio?: number;
        gapPercent?: number;
    };
    expiresAt: string;
}

const STRATEGY_COLORS: Record<string, string> = {
    MOMENTUM: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    GAP: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    BREAKOUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    MEAN_REVERSION: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

function StrengthBar({ value }: { value: number }) {
    const color =
        value >= 80 ? 'bg-emerald-400' : value >= 65 ? 'bg-yellow-400' : 'bg-zinc-500';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
            </div>
            <span className="text-xs font-mono text-zinc-400 w-6">{value}</span>
        </div>
    );
}

export default function SignalsPanel() {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchSignals = async () => {
        try {
            const res = await fetch('/api/trading/signals?minStrength=50');
            if (res.ok) {
                const data = await res.json();
                setSignals(data.signals ?? []);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSignals();
        const interval = setInterval(fetchSignals, 60_000); // refresh every minute
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-zinc-800 animate-pulse" />
                ))}
            </div>
        );
    }

    if (signals.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                <p className="text-zinc-500 text-sm">No signals right now.</p>
                <p className="text-zinc-600 text-xs mt-1">
                    Scanner runs every 5 min during market hours.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {signals.map((signal) => {
                const isOpen = expanded === signal._id;
                const riskPct = (
                    ((signal.entryHigh - signal.stopLoss) / signal.entryHigh) *
                    100
                ).toFixed(1);
                const rewardPct = (
                    ((signal.takeProfit - signal.entryLow) / signal.entryLow) *
                    100
                ).toFixed(1);

                return (
                    <div
                        key={signal._id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
                    >
                        {/* Header row */}
                        <button
                            className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/50 transition-colors"
                            onClick={() => setExpanded(isOpen ? null : signal._id)}
                        >
                            {/* Direction dot */}
                            <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${signal.direction === 'BUY' ? 'bg-emerald-400' : 'bg-red-400'}`}
                            />
                            {/* Symbol */}
                            <span className="font-bold text-white text-sm w-14 flex-shrink-0">
                                {signal.symbol}
                            </span>
                            {/* Strategy badge */}
                            <span
                                className={`text-xs px-2 py-0.5 rounded border ${STRATEGY_COLORS[signal.strategy] ?? 'bg-zinc-700 text-zinc-400'}`}
                            >
                                {signal.strategy}
                            </span>
                            {/* Price */}
                            <span className="text-sm text-zinc-300 flex-shrink-0">
                                ${signal.currentPrice.toFixed(2)}
                            </span>
                            {/* Strength bar */}
                            <div className="flex-1">
                                <StrengthBar value={signal.strength} />
                            </div>
                            {/* Alloc */}
                            <span className="text-xs text-teal-400 font-semibold flex-shrink-0">
                                ${signal.suggestedAllocCAD} CAD
                            </span>
                            <span className="text-zinc-600 text-xs flex-shrink-0">
                                {isOpen ? '▲' : '▼'}
                            </span>
                        </button>

                        {/* Expanded detail */}
                        {isOpen && (
                            <div className="border-t border-zinc-800 p-4 space-y-4">
                                {/* Entry / SL / TP */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-zinc-800 rounded-lg p-3">
                                        <p className="text-xs text-zinc-500 mb-1">Entry Zone</p>
                                        <p className="text-sm font-mono text-white">
                                            ${signal.entryLow.toFixed(2)}–${signal.entryHigh.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-red-950/40 rounded-lg p-3 border border-red-900/30">
                                        <p className="text-xs text-red-400 mb-1">Stop Loss ({riskPct}%)</p>
                                        <p className="text-sm font-mono text-red-300">
                                            ${signal.stopLoss.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-emerald-950/40 rounded-lg p-3 border border-emerald-900/30">
                                        <p className="text-xs text-emerald-400 mb-1">Target (+{rewardPct}%)</p>
                                        <p className="text-sm font-mono text-emerald-300">
                                            ${signal.takeProfit.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                {/* Indicators */}
                                <div className="flex gap-4 text-xs text-zinc-500">
                                    {signal.indicators.rsi !== undefined && (
                                        <span>RSI: <span className="text-zinc-300">{signal.indicators.rsi.toFixed(0)}</span></span>
                                    )}
                                    {signal.indicators.volumeRatio !== undefined && (
                                        <span>Vol: <span className="text-zinc-300">{signal.indicators.volumeRatio.toFixed(1)}×</span></span>
                                    )}
                                    {signal.indicators.gapPercent !== undefined && Math.abs(signal.indicators.gapPercent) > 0.5 && (
                                        <span>Gap: <span className={signal.indicators.gapPercent > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {signal.indicators.gapPercent > 0 ? '+' : ''}{signal.indicators.gapPercent.toFixed(1)}%
                                        </span></span>
                                    )}
                                    <span>R:R <span className="text-zinc-300">1:{(Number(rewardPct) / Number(riskPct)).toFixed(1)}</span></span>
                                </div>

                                {/* AI Reasoning */}
                                <p className="text-sm text-zinc-400 leading-relaxed border-l-2 border-teal-600 pl-3">
                                    {signal.reasoning}
                                </p>

                                {/* Catalysts */}
                                {signal.catalysts.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {signal.catalysts.map((c, i) => (
                                            <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Action hint */}
                                <p className="text-xs text-zinc-600 italic">
                                    Execute manually on Wealthsimple, then log the trade below.
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
