import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { getQuote } from '@/lib/actions/finnhub.actions';
import { calculatePnl, checkExitCondition } from '@/lib/trading/risk-manager';

// GET /api/trading/positions
// Returns all open trades enriched with live price + unrealized P&L.
export async function GET() {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();

        const openTrades = await Trade.find({
            userId: session.user.id,
            status: 'OPEN',
        })
            .sort({ openedAt: -1 })
            .lean();

        if (openTrades.length === 0) {
            return NextResponse.json({ positions: [], count: 0 });
        }

        // Fetch live prices for all open positions in parallel
        const symbols = [...new Set(openTrades.map((t) => t.symbol))];
        const priceMap: Record<string, number> = {};

        await Promise.all(
            symbols.map(async (sym) => {
                try {
                    const quote = await getQuote(sym);
                    if (quote?.c) priceMap[sym] = quote.c;
                } catch {
                    // price fetch failed — use entry price as fallback
                }
            })
        );

        const positions = openTrades.map((trade) => {
            const currentPrice = priceMap[trade.symbol] ?? trade.entryPrice;
            const { pnlCAD, pnlPercent } = calculatePnl(
                trade.direction,
                trade.entryPrice,
                currentPrice,
                trade.quantity
            );
            const exitSignal = checkExitCondition(
                trade.direction,
                currentPrice,
                trade.stopLoss,
                trade.takeProfit
            );

            return {
                ...trade,
                currentPrice,
                unrealizedPnlCAD: pnlCAD,
                unrealizedPnlPercent: pnlPercent,
                exitSignal, // 'STOP_LOSS' | 'TAKE_PROFIT' | null
            };
        });

        const totalUnrealizedPnl = positions.reduce(
            (sum, p) => sum + p.unrealizedPnlCAD,
            0
        );

        return NextResponse.json({
            positions,
            count: positions.length,
            totalUnrealizedPnlCAD: +totalUnrealizedPnl.toFixed(2),
        });
    } catch (err) {
        console.error('GET /api/trading/positions error:', err);
        return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
}
