'use client';

import { useEffect, useState } from 'react';

interface RecapData {
    performance: {
        totalTrades: number;
        winners: number;
        losers: number;
        winRate: number;
        totalPnlCAD: number;
        avgWinCAD: number;
        avgLossCAD: number;
        profitFactor: number | null;
        bestTrade: { symbol: string; pnlCAD: number } | null;
        worstTrade: { symbol: string; pnlCAD: number } | null;
    };
    weeklyGoal: {
        startCAD: number;
        goalCAD: number;
        currentCAD: number;
        progressPct: number;
        remainingCAD: number;
        onTrack: boolean;
    };
    byStrategy: Record<string, { trades: number; pnl: number; wins: number }>;
    period: string;
}

export default function RecapCard() {
    const [recap, setRecap] = useState<RecapData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch7d = async () => {
            try {
                const res = await fetch('/api/trading/recap?days=7');
                if (res.ok) setRecap(await res.json());
            } catch {
                // silently fail
            } finally {
                setLoading(false);
            }
        };
        fetch7d();
    }, []);

    if (loading) {
        return <div className="h-40 rounded-xl bg-zinc-800 animate-pulse" />;
    }

    if (!recap) return null;

    const { performance: p, weeklyGoal: wg } = recap;
    const goalBarWidth = Math.min(wg.progressPct, 100);
    const goalBarColor = wg.onTrack ? 'bg-emerald-500' : 'bg-amber-500';

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    Weekly Performance
                </h2>
                <span className="text-xs text-zinc-600">{recap.period}</span>
            </div>

            {/* Weekly goal bar */}
            <div>
                <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-zinc-500">
                        Goal: ${wg.startCAD} → ${wg.goalCAD} CAD
                    </span>
                    <span className={wg.onTrack ? 'text-emerald-400' : 'text-amber-400'}>
                        ${wg.currentCAD.toFixed(2)} ({wg.progressPct.toFixed(0)}%)
                    </span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${goalBarColor}`}
                        style={{ width: `${goalBarWidth}%` }}
                    />
                </div>
                <p className="text-xs text-zinc-600 mt-1">
                    ${wg.remainingCAD.toFixed(2)} remaining to goal
                </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Total P&L</p>
                    <p className={`text-base font-bold ${p.totalPnlCAD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.totalPnlCAD >= 0 ? '+' : ''}${p.totalPnlCAD.toFixed(2)}
                    </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Win Rate</p>
                    <p className="text-base font-bold text-white">
                        {p.winRate.toFixed(0)}%
                        <span className="text-xs text-zinc-500 ml-1">
                            ({p.winners}W/{p.losers}L)
                        </span>
                    </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Avg Win</p>
                    <p className="text-base font-bold text-emerald-400">
                        +${p.avgWinCAD.toFixed(2)}
                    </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Profit Factor</p>
                    <p className="text-base font-bold text-white">
                        {p.profitFactor !== null ? p.profitFactor.toFixed(2) : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Best/worst */}
            {(p.bestTrade || p.worstTrade) && (
                <div className="flex gap-3">
                    {p.bestTrade && (
                        <div className="flex-1 bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-3">
                            <p className="text-xs text-emerald-600 mb-1">Best Trade</p>
                            <p className="text-sm font-bold text-emerald-400">
                                {p.bestTrade.symbol} +${(p.bestTrade.pnlCAD ?? 0).toFixed(2)}
                            </p>
                        </div>
                    )}
                    {p.worstTrade && (
                        <div className="flex-1 bg-red-950/30 border border-red-900/30 rounded-lg p-3">
                            <p className="text-xs text-red-600 mb-1">Worst Trade</p>
                            <p className="text-sm font-bold text-red-400">
                                {p.worstTrade.symbol} ${(p.worstTrade.pnlCAD ?? 0).toFixed(2)}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Strategy breakdown */}
            {Object.keys(recap.byStrategy).length > 0 && (
                <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">By Strategy</p>
                    <div className="space-y-1.5">
                        {Object.entries(recap.byStrategy).map(([strat, data]) => (
                            <div key={strat} className="flex justify-between text-xs">
                                <span className="text-zinc-400">{strat}</span>
                                <span className="text-zinc-500">
                                    {data.trades} trades &middot;{' '}
                                    {data.trades > 0
                                        ? ((data.wins / data.trades) * 100).toFixed(0)
                                        : 0}% win &middot;{' '}
                                    <span className={data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                        {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
