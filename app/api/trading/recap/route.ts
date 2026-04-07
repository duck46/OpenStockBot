import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { DailyBudget } from '@/database/models/daily-budget.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { DAILY_BUDGET_CAD } from '@/lib/trading/risk-manager';

// GET /api/trading/recap
// Returns weekly + daily performance summary.
export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const days = Number(searchParams.get('days') ?? 7);

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const userId = session.user.id;

        await connectToDatabase();

        const closedTrades = await Trade.find({
            userId,
            status: 'CLOSED',
            closedAt: { $gte: since },
        })
            .sort({ closedAt: -1 })
            .lean();

        const totalTrades = closedTrades.length;
        const winners = closedTrades.filter((t) => (t.pnlCAD ?? 0) > 0);
        const losers = closedTrades.filter((t) => (t.pnlCAD ?? 0) <= 0);
        const totalPnlCAD = closedTrades.reduce((s, t) => s + (t.pnlCAD ?? 0), 0);
        const winRate = totalTrades > 0 ? (winners.length / totalTrades) * 100 : 0;
        const avgWinCAD =
            winners.length > 0
                ? winners.reduce((s, t) => s + (t.pnlCAD ?? 0), 0) / winners.length
                : 0;
        const avgLossCAD =
            losers.length > 0
                ? losers.reduce((s, t) => s + (t.pnlCAD ?? 0), 0) / losers.length
                : 0;

        const bestTrade = closedTrades.reduce(
            (best, t) => (!best || (t.pnlCAD ?? 0) > (best.pnlCAD ?? 0) ? t : best),
            null as (typeof closedTrades)[0] | null
        );
        const worstTrade = closedTrades.reduce(
            (worst, t) => (!worst || (t.pnlCAD ?? 0) < (worst.pnlCAD ?? 0) ? t : worst),
            null as (typeof closedTrades)[0] | null
        );

        // Strategy breakdown
        const byStrategy: Record<string, { trades: number; pnl: number; wins: number }> = {};
        for (const t of closedTrades) {
            if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { trades: 0, pnl: 0, wins: 0 };
            byStrategy[t.strategy].trades++;
            byStrategy[t.strategy].pnl += t.pnlCAD ?? 0;
            if ((t.pnlCAD ?? 0) > 0) byStrategy[t.strategy].wins++;
        }

        // Daily budgets for the period
        const budgets = await DailyBudget.find({
            userId,
            date: { $gte: since.toISOString().split('T')[0] },
        })
            .sort({ date: 1 })
            .lean();

        const weeklyStartCAD = DAILY_BUDGET_CAD;
        const weeklyGoalCAD = weeklyStartCAD * 2; // double the budget
        const weeklyCurrentCAD = weeklyStartCAD + totalPnlCAD;

        return NextResponse.json({
            period: `${days}d`,
            performance: {
                totalTrades,
                winners: winners.length,
                losers: losers.length,
                winRate: +winRate.toFixed(1),
                totalPnlCAD: +totalPnlCAD.toFixed(2),
                avgWinCAD: +avgWinCAD.toFixed(2),
                avgLossCAD: +avgLossCAD.toFixed(2),
                profitFactor:
                    avgLossCAD !== 0
                        ? +Math.abs(avgWinCAD / avgLossCAD).toFixed(2)
                        : null,
                bestTrade: bestTrade
                    ? { symbol: bestTrade.symbol, pnlCAD: bestTrade.pnlCAD }
                    : null,
                worstTrade: worstTrade
                    ? { symbol: worstTrade.symbol, pnlCAD: worstTrade.pnlCAD }
                    : null,
            },
            weeklyGoal: {
                startCAD: weeklyStartCAD,
                goalCAD: weeklyGoalCAD,
                currentCAD: +weeklyCurrentCAD.toFixed(2),
                progressPct: +((weeklyCurrentCAD / weeklyGoalCAD) * 100).toFixed(1),
                remainingCAD: +(weeklyGoalCAD - weeklyCurrentCAD).toFixed(2),
                onTrack: weeklyCurrentCAD >= weeklyStartCAD,
            },
            byStrategy,
            dailyBudgets: budgets,
            recentTrades: closedTrades.slice(0, 10),
        });
    } catch (err) {
        console.error('GET /api/trading/recap error:', err);
        return NextResponse.json({ error: 'Failed to fetch recap' }, { status: 500 });
    }
}
