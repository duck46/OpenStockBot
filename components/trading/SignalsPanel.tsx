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

const STRATEGY_TOOLTIPS: Record<string, string> = {
    MOMENTUM: 'The stock is already moving up strongly. We jump on while the wave lasts.',
    GAP: 'The stock jumped up at market open. We buy the first small dip after that jump.',
    BREAKOUT: 'The stock just pushed through a price ceiling it was stuck at. Big moves often follow.',
    MEAN_REVERSION: 'The stock fell too far too fast and is likely to bounce back up.',
};

// ─── Inline tooltip — no external dependency needed ──────────────────────────
function InfoTooltip({ text }: { text: string }) {
    return (
        <span className="relative group inline-flex items-center cursor-help">
            <span className="ml-1 text-zinc-600 hover:text-zinc-400 text-xs font-bold select-none">?</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-snug shadow-xl">
                {text}
            </span>
        </span>
    );
}

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

// ─── Step-by-step Wealthsimple instructions ───────────────────────────────────
function WealthsimpleSteps({ signal }: { signal: Signal }) {
    const steps = [
        <>Open Wealthsimple and search for <strong className="text-white">{signal.symbol}</strong></>,
        <>Tap <strong className="text-white">"Buy"</strong> → select <strong className="text-white">"Market Order"</strong> (this buys at the current price)</>,
        <>Enter amount: <strong className="text-teal-400">${signal.suggestedAllocCAD.toFixed(2)} CAD</strong></>,
        <>Tap <strong className="text-white">"Review"</strong> then <strong className="text-white">"Confirm"</strong> to complete the purchase</>,
        <>After buying, tap the <strong className="text-white">🔔 bell icon</strong> on the {signal.symbol} page to set price alerts</>,
        <>Set a price alert at <strong className="text-red-400">${signal.stopLoss.toFixed(2)}</strong> — <span className="text-zinc-400">if you get this alert, sell immediately to cap your loss</span></>,
        <>Set another alert at <strong className="text-emerald-400">${signal.takeProfit.toFixed(2)}</strong> — <span className="text-zinc-400">when this fires, sell to lock in your profit</span></>,
    ];

    return (
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-4">
            <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-3">
                How to do this trade on Wealthsimple
            </p>
            <ol className="space-y-2">
                {steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-zinc-400">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center font-bold">
                            {i + 1}
                        </span>
                        <span className="leading-snug">{step}</span>
                    </li>
                ))}
            </ol>
            <p className="text-xs text-zinc-600 mt-3 italic">
                Note: Wealthsimple doesn&apos;t have automatic stop-loss orders — price alerts are your manual safety net.
            </p>
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
        const interval = setInterval(fetchSignals, 60_000);
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
                    Scanner runs every 5 min during market hours (9:30 AM – 4:00 PM ET).
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {signals.map((signal) => {
                const isOpen = expanded === signal._id;
                const riskPct = (
                    ((signal.entryHigh - signal.stopLoss) / signal.entryHigh) * 100
                ).toFixed(1);
                const rewardPct = (
                    ((signal.takeProfit - signal.entryLow) / signal.entryLow) * 100
                ).toFixed(1);
                const rrRatio = (Number(rewardPct) / Number(riskPct)).toFixed(1);

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
                            {/* Strategy badge with tooltip */}
                            <span className="relative group inline-flex items-center cursor-help flex-shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded border ${STRATEGY_COLORS[signal.strategy] ?? 'bg-zinc-700 text-zinc-400'}`}>
                                    {signal.strategy}
                                </span>
                                <span className="absolute top-full left-0 mt-1 w-56 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-snug shadow-xl">
                                    {STRATEGY_TOOLTIPS[signal.strategy] ?? signal.strategy}
                                </span>
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

                                {/* Entry / Protect / Profit — renamed for beginners */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-zinc-800 rounded-lg p-3">
                                        <p className="text-xs text-zinc-500 mb-1">Buy when price is</p>
                                        <p className="text-sm font-mono text-white">
                                            ${signal.entryLow.toFixed(2)}–${signal.entryHigh.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-red-950/40 rounded-lg p-3 border border-red-900/30">
                                        <p className="text-xs text-red-400 mb-1">
                                            Protect yourself at
                                            <InfoTooltip text="Your safety net price. If the stock drops here, sell immediately to keep your loss small." />
                                            <span className="text-red-600 ml-1">({riskPct}% risk)</span>
                                        </p>
                                        <p className="text-sm font-mono text-red-300">
                                            ${signal.stopLoss.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-emerald-950/40 rounded-lg p-3 border border-emerald-900/30">
                                        <p className="text-xs text-emerald-400 mb-1">
                                            Sell for profit
                                            <InfoTooltip text="Your profit target. When the stock reaches this price, sell and take your gain." />
                                            <span className="text-emerald-600 ml-1">(+{rewardPct}%)</span>
                                        </p>
                                        <p className="text-sm font-mono text-emerald-300">
                                            ${signal.takeProfit.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                {/* Technical indicators with tooltips */}
                                <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                                    {signal.indicators.rsi !== undefined && (
                                        <span className="flex items-center">
                                            RSI: <span className="text-zinc-300 ml-1">{signal.indicators.rsi.toFixed(0)}</span>
                                            <InfoTooltip text="Measures if too many people are buying (>70) or selling (<30). Best trades happen between 45–65." />
                                        </span>
                                    )}
                                    {signal.indicators.volumeRatio !== undefined && (
                                        <span className="flex items-center">
                                            Vol: <span className="text-zinc-300 ml-1">{signal.indicators.volumeRatio.toFixed(1)}×</span>
                                            <InfoTooltip text="How much busier this stock is than normal. 2× means twice as many people are trading it — confirms the move is real." />
                                        </span>
                                    )}
                                    {signal.indicators.gapPercent !== undefined && Math.abs(signal.indicators.gapPercent) > 0.5 && (
                                        <span className="flex items-center">
                                            Gap:
                                            <span className={`ml-1 ${signal.indicators.gapPercent > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {signal.indicators.gapPercent > 0 ? '+' : ''}{signal.indicators.gapPercent.toFixed(1)}%
                                            </span>
                                            <InfoTooltip text="How much the price jumped up when the market opened vs. yesterday's close. Bigger gap = stronger morning move." />
                                        </span>
                                    )}
                                    <span className="flex items-center">
                                        Reward vs Risk: <span className="text-zinc-300 ml-1">1:{rrRatio}</span>
                                        <InfoTooltip text="For every $1 you could lose, you stand to gain this much. 1:3 means you could gain $3 for every $1 at risk. Higher is better." />
                                    </span>
                                </div>

                                {/* AI Reasoning — now written in plain English by the new prompt */}
                                <div className="border-l-2 border-teal-600 pl-3">
                                    <p className="text-xs text-teal-600 uppercase tracking-wider mb-1 font-semibold">Why the bot likes this trade</p>
                                    <p className="text-sm text-zinc-400 leading-relaxed">{signal.reasoning}</p>
                                </div>

                                {/* Risk flags */}
                                {signal.catalysts.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {signal.catalysts.map((c, i) => (
                                            <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Step-by-step Wealthsimple instructions */}
                                <WealthsimpleSteps signal={signal} />

                                <p className="text-xs text-zinc-600 italic text-center">
                                    After executing, come back and log the trade below so we can track your profit.
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
