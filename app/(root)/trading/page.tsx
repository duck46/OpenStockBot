import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BudgetTracker from '@/components/trading/BudgetTracker';
import SignalsPanel from '@/components/trading/SignalsPanel';
import PositionsTable from '@/components/trading/PositionsTable';
import TradeLogger from '@/components/trading/TradeLogger';
import RecapCard from '@/components/trading/RecapCard';
import { isMarketHours, isPreMarket } from '@/lib/trading/risk-manager';

export const metadata = {
    title: 'Trading Bot | OpenStock',
    description: 'AI-powered day trading signals — $50 CAD/day, Wall Street discipline.',
};

// Force dynamic so market-hour checks work
export const dynamic = 'force-dynamic';

export default async function TradingPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect('/sign-in');

    const marketOpen = isMarketHours();
    const preMarket = isPreMarket();

    const marketStatus = marketOpen
        ? { label: 'Market Open', color: 'text-emerald-400', dot: 'bg-emerald-400' }
        : preMarket
        ? { label: 'Pre-Market', color: 'text-amber-400', dot: 'bg-amber-400' }
        : { label: 'Market Closed', color: 'text-zinc-500', dot: 'bg-zinc-600' };

    return (
        <div className="min-h-screen p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Trading Bot</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        $50 CAD/day · Wall Street discipline · Manual execution on Wealthsimple
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${marketStatus.dot} animate-pulse`} />
                    <span className={`text-sm font-medium ${marketStatus.color}`}>
                        {marketStatus.label}
                    </span>
                    <span className="text-xs text-zinc-600">(NYSE/NASDAQ)</span>
                </div>
            </div>

            {/* Trader's note */}
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
                <p className="text-sm text-amber-300/80 leading-relaxed">
                    <strong className="text-amber-300">How this works:</strong> The bot scans 20+ high-volatility stocks every 5 min, generates AI-scored signals, and tells you exactly where to buy, set your stop-loss, and take profit. You execute the trade manually on Wealthsimple, then log it here. The bot tracks your P&L, monitors exit levels, and sends a daily recap email.
                </p>
            </div>

            {/* Budget + Signals (top row) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Budget (left) */}
                <div className="lg:col-span-1">
                    <BudgetTracker />
                </div>

                {/* Signals (right) */}
                <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                            Live Signals
                        </h2>
                        {!marketOpen && !preMarket && (
                            <span className="text-xs text-zinc-600 italic">
                                Signals refresh at 8:30 AM ET
                            </span>
                        )}
                    </div>
                    <SignalsPanel />
                </div>
            </div>

            {/* Open Positions */}
            <div>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    Open Positions
                </h2>
                <PositionsTable />
            </div>

            {/* Trade Logger */}
            <div>
                <TradeLogger />
            </div>

            {/* Weekly Recap */}
            <div>
                <RecapCard />
            </div>

            {/* Risk disclaimer */}
            <p className="text-xs text-zinc-700 text-center pb-4">
                Past signals do not guarantee future returns. Trading involves significant risk.
                Never risk more than you can afford to lose. This tool is for educational purposes.
            </p>
        </div>
    );
}
