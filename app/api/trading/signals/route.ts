import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { TradingSignal } from '@/database/models/trading-signal.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

// GET /api/trading/signals
// Returns all non-expired signals sorted by strength desc.
// Query params: ?minStrength=50
export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const minStrength = Number(searchParams.get('minStrength') ?? 50);

        await connectToDatabase();

        const signals = await TradingSignal.find({
            expiresAt: { $gt: new Date() },
            strength: { $gte: minStrength },
        })
            .sort({ strength: -1 })
            .limit(20)
            .lean();

        return NextResponse.json({ signals, count: signals.length });
    } catch (err) {
        console.error('GET /api/trading/signals error:', err);
        return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
    }
}
