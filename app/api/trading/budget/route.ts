import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { DailyBudget } from '@/database/models/daily-budget.model';
import { Trade } from '@/database/models/trade.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { todayET, DAILY_BUDGET_CAD } from '@/lib/trading/risk-manager';

// GET /api/trading/budget
// Returns today's budget status. Creates the record if it doesn't exist yet.
export async function GET() {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const today = todayET();

        await connectToDatabase();

        // Find or create today's budget record
        let budget = await DailyBudget.findOne({ userId, date: today }).lean();

        if (!budget) {
            const created = await DailyBudget.create({
                userId,
                date: today,
                totalCAD: DAILY_BUDGET_CAD,
                usedCAD: 0,
                remainingCAD: DAILY_BUDGET_CAD,
                realizedPnlCAD: 0,
                unrealizedPnlCAD: 0,
                tradeIds: [],
            });
            budget = created.toObject();
        }

        // Calculate unrealized P&L from open trades
        const openTrades = await Trade.find({
            userId,
            status: 'OPEN',
        }).lean();

        const unrealizedPnlCAD = openTrades.reduce(
            (sum, t) => sum + (t.pnlCAD ?? 0),
            0
        );

        return NextResponse.json({
            ...budget,
            unrealizedPnlCAD: +unrealizedPnlCAD.toFixed(2),
            openPositions: openTrades.length,
            weekGoalCAD: DAILY_BUDGET_CAD * 2, // double the daily budget goal
        });
    } catch (err) {
        console.error('GET /api/trading/budget error:', err);
        return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 });
    }
}
