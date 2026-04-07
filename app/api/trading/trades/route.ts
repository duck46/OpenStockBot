import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { DailyBudget } from '@/database/models/daily-budget.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { todayET, DAILY_BUDGET_CAD, canOpenTrade, calculateShares } from '@/lib/trading/risk-manager';

// GET /api/trading/trades
// Returns trade history for the authenticated user (last 30 days by default).
export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const days = Number(searchParams.get('days') ?? 30);
        const status = searchParams.get('status'); // optional filter

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const query: Record<string, unknown> = {
            userId: session.user.id,
            openedAt: { $gte: since },
        };
        if (status) query.status = status;

        await connectToDatabase();

        const trades = await Trade.find(query).sort({ openedAt: -1 }).lean();

        return NextResponse.json({ trades, count: trades.length });
    } catch (err) {
        console.error('GET /api/trading/trades error:', err);
        return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }
}

// POST /api/trading/trades
// Log a manually executed trade from Wealthsimple.
export async function POST(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            symbol,
            strategy,
            direction,
            entryPrice,
            quantity,
            allocatedCAD,
            stopLoss,
            takeProfit,
            signalStrength = 50,
            notes,
        } = body;

        if (!symbol || !strategy || !direction || !entryPrice || !quantity || !allocatedCAD || !stopLoss || !takeProfit) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const userId = session.user.id;
        const today = todayET();

        await connectToDatabase();

        // Load or create today's budget
        let budget = await DailyBudget.findOne({ userId, date: today });
        if (!budget) {
            budget = await DailyBudget.create({
                userId,
                date: today,
                totalCAD: DAILY_BUDGET_CAD,
                usedCAD: 0,
                remainingCAD: DAILY_BUDGET_CAD,
                realizedPnlCAD: 0,
                unrealizedPnlCAD: 0,
                tradeIds: [],
            });
        }

        // Check open position count
        const openCount = await Trade.countDocuments({ userId, status: 'OPEN' });

        const canTrade = canOpenTrade(
            budget.usedCAD,
            budget.realizedPnlCAD,
            openCount,
            budget.remainingCAD
        );

        if (!canTrade.allowed) {
            return NextResponse.json(
                { error: canTrade.reason ?? 'Trade not allowed by risk manager' },
                { status: 422 }
            );
        }

        // Create trade
        const trade = await Trade.create({
            userId,
            symbol: symbol.toUpperCase(),
            strategy,
            direction,
            entryPrice,
            quantity,
            allocatedCAD,
            stopLoss,
            takeProfit,
            status: 'OPEN',
            signalStrength,
            notes,
            openedAt: new Date(),
        });

        // Update budget
        await DailyBudget.findByIdAndUpdate(budget._id, {
            $inc: { usedCAD: allocatedCAD, remainingCAD: -allocatedCAD },
            $push: { tradeIds: trade._id },
        });

        return NextResponse.json({ trade }, { status: 201 });
    } catch (err) {
        console.error('POST /api/trading/trades error:', err);
        return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
    }
}

// PUT /api/trading/trades/[id] is handled in a separate dynamic route
