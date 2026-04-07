import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { DailyBudget } from '@/database/models/daily-budget.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { todayET, calculatePnl } from '@/lib/trading/risk-manager';

// PUT /api/trading/trades/[id]
// Close or update a trade (set exit price, change status, add notes).
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { exitPrice, status, notes } = body;

        await connectToDatabase();

        const trade = await Trade.findOne({ _id: id, userId: session.user.id });
        if (!trade) {
            return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
        }

        if (trade.status !== 'OPEN') {
            return NextResponse.json({ error: 'Trade is already closed' }, { status: 422 });
        }

        const updates: Record<string, unknown> = {};
        if (notes !== undefined) updates.notes = notes;

        if (exitPrice !== undefined && status === 'CLOSED') {
            const { pnlCAD, pnlPercent } = calculatePnl(
                trade.direction,
                trade.entryPrice,
                exitPrice,
                trade.quantity
            );
            updates.exitPrice = exitPrice;
            updates.status = 'CLOSED';
            updates.pnlCAD = pnlCAD;
            updates.pnlPercent = pnlPercent;
            updates.closedAt = new Date();

            // Update today's budget with realized P&L
            const today = todayET();
            await DailyBudget.findOneAndUpdate(
                { userId: session.user.id, date: today },
                {
                    $inc: {
                        realizedPnlCAD: pnlCAD,
                        // Return allocated capital + profit to remaining
                        remainingCAD: trade.allocatedCAD + pnlCAD,
                        usedCAD: -trade.allocatedCAD,
                    },
                }
            );
        } else if (status === 'CANCELLED') {
            updates.status = 'CANCELLED';
            updates.closedAt = new Date();
            // Refund allocation to budget
            const today = todayET();
            await DailyBudget.findOneAndUpdate(
                { userId: session.user.id, date: today },
                { $inc: { remainingCAD: trade.allocatedCAD, usedCAD: -trade.allocatedCAD } }
            );
        }

        const updated = await Trade.findByIdAndUpdate(id, updates, { new: true }).lean();
        return NextResponse.json({ trade: updated });
    } catch (err) {
        console.error('PUT /api/trading/trades/[id] error:', err);
        return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
    }
}
