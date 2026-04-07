'use client';

import { useEffect, useState } from 'react';

interface Position {
    _id: string;
    symbol: string;
    strategy: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    allocatedCAD: number;
    stopLoss: number;
    takeProfit: number;
    unrealizedPnlCAD: number;
    unrealizedPnlPercent: number;
    exitSignal: 'STOP_LOSS' | 'TAKE_PROFIT' | null;
    openedAt: string;
}

export default function PositionsTable({ onClose }: { onClose?: () => void }) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState<string | null>(null);

    const fetchPositions = async () => {
        try {
            const res = await fetch('/api/trading/positions');
            if (res.ok) {
                const data = await res.json();
                setPositions(data.positions ?? []);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPositions();
        const interval = setInterval(fetchPositions, 15_000); // refresh every 15s
        return () => clearInterval(interval);
    }, []);

    const closePosition = async (id: string, currentPrice: number) => {
        setClosing(id);
        try {
            const res = await fetch(`/api/trading/trades/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exitPrice: currentPrice, status: 'CLOSED' }),
            });
            if (res.ok) {
                await fetchPositions();
                onClose?.();
            }
        } finally {
            setClosing(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-2">
                {[1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-zinc-800 animate-pulse" />
                ))}
            </div>
        );
    }

    if (positions.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
                <p className="text-zinc-500 text-sm">No open positions.</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="border-b border-zinc-800">
                    <tr className="text-xs text-zinc-500 uppercase tracking-wider">
                        <th className="text-left p-3 pl-4">Symbol</th>
                        <th className="text-right p-3">Entry</th>
                        <th className="text-right p-3">Current</th>
                        <th className="text-right p-3">P&L</th>
                        <th className="text-right p-3">SL / TP</th>
                        <th className="text-right p-3 pr-4">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                    {positions.map((pos) => {
                        const pnlPos = pos.unrealizedPnlCAD >= 0;
                        const hitAlert = pos.exitSignal;
                        return (
                            <tr
                                key={pos._id}
                                className={`${hitAlert === 'TAKE_PROFIT' ? 'bg-emerald-950/20' : hitAlert === 'STOP_LOSS' ? 'bg-red-950/20' : ''}`}
                            >
                                <td className="p-3 pl-4">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-white">{pos.symbol}</span>
                                        <span className="text-xs text-zinc-600">{pos.strategy}</span>
                                    </div>
                                    {hitAlert && (
                                        <span className={`text-xs font-semibold ${hitAlert === 'TAKE_PROFIT' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {hitAlert === 'TAKE_PROFIT' ? '✅ TAKE PROFIT HIT' : '🛑 STOP LOSS HIT'}
                                        </span>
                                    )}
                                </td>
                                <td className="p-3 text-right font-mono text-zinc-400">
                                    ${pos.entryPrice.toFixed(2)}
                                </td>
                                <td className="p-3 text-right font-mono text-white">
                                    ${pos.currentPrice.toFixed(2)}
                                </td>
                                <td className="p-3 text-right">
                                    <div className={`font-semibold ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {pnlPos ? '+' : ''}${pos.unrealizedPnlCAD.toFixed(2)}
                                    </div>
                                    <div className={`text-xs ${pnlPos ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {pnlPos ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%
                                    </div>
                                </td>
                                <td className="p-3 text-right">
                                    <div className="text-xs text-red-400">${pos.stopLoss.toFixed(2)}</div>
                                    <div className="text-xs text-emerald-400">${pos.takeProfit.toFixed(2)}</div>
                                </td>
                                <td className="p-3 pr-4 text-right">
                                    <button
                                        onClick={() => closePosition(pos._id, pos.currentPrice)}
                                        disabled={closing === pos._id}
                                        className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        {closing === pos._id ? 'Closing...' : 'Close'}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
