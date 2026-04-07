'use client';

import { useEffect, useState } from 'react';

interface BudgetData {
    totalCAD: number;
    usedCAD: number;
    remainingCAD: number;
    realizedPnlCAD: number;
    unrealizedPnlCAD: number;
    openPositions: number;
    weekGoalCAD: number;
}

export default function BudgetTracker() {
    const [budget, setBudget] = useState<BudgetData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBudget = async () => {
            try {
                const res = await fetch('/api/trading/budget');
                if (res.ok) setBudget(await res.json());
            } catch {
                // silently fail
            } finally {
                setLoading(false);
            }
        };
        fetchBudget();
        const interval = setInterval(fetchBudget, 30_000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 animate-pulse">
                <div className="h-4 bg-zinc-700 rounded w-32 mb-2" />
                <div className="h-8 bg-zinc-700 rounded w-24" />
            </div>
        );
    }

    if (!budget) return null;

    const totalPnl = budget.realizedPnlCAD + budget.unrealizedPnlCAD;
    const pnlPositive = totalPnl >= 0;
    const usedPct = budget.totalCAD > 0 ? (budget.usedCAD / budget.totalCAD) * 100 : 0;

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    Daily Budget
                </h2>
                <span className="text-xs text-zinc-500">
                    {budget.openPositions} open position{budget.openPositions !== 1 ? 's' : ''}
                </span>
            </div>

            {/* P&L headline */}
            <div className="flex items-end gap-3">
                <span
                    className={`text-3xl font-bold ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}
                >
                    {pnlPositive ? '+' : ''}${totalPnl.toFixed(2)}
                </span>
                <span className="text-sm text-zinc-500 mb-1">CAD today</span>
            </div>

            {/* Budget bar */}
            <div>
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>${budget.usedCAD.toFixed(2)} used</span>
                    <span>${budget.remainingCAD.toFixed(2)} remaining</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-teal-500 transition-all"
                        style={{ width: `${Math.min(usedPct, 100)}%` }}
                    />
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                    Total: ${budget.totalCAD.toFixed(2)} CAD/day
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-800 p-3">
                    <p className="text-xs text-zinc-500 mb-1">Realized P&L</p>
                    <p className={`text-sm font-semibold ${budget.realizedPnlCAD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {budget.realizedPnlCAD >= 0 ? '+' : ''}${budget.realizedPnlCAD.toFixed(2)}
                    </p>
                </div>
                <div className="rounded-lg bg-zinc-800 p-3">
                    <p className="text-xs text-zinc-500 mb-1">Unrealized</p>
                    <p className={`text-sm font-semibold ${budget.unrealizedPnlCAD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {budget.unrealizedPnlCAD >= 0 ? '+' : ''}${budget.unrealizedPnlCAD.toFixed(2)}
                    </p>
                </div>
            </div>
        </div>
    );
}
