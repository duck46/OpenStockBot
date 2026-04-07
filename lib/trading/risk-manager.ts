/**
 * Risk Manager — enforces the $50 CAD/day budget discipline.
 *
 * Rules (Wall Street trader discipline):
 *  1. Daily budget: $50 CAD (configurable via env)
 *  2. Max allocation per trade: $10 CAD (20% of daily budget)
 *  3. Max 3 concurrent open positions
 *  4. Never exceed 50% of budget in a single losing day (daily circuit breaker)
 *  5. Signal strength drives position size (higher conviction = larger bet)
 *  6. Stop trading for the day if cumulative loss > $25 CAD
 */

export const DAILY_BUDGET_CAD = Number(process.env.TRADING_DAILY_BUDGET_CAD ?? 50);
export const MAX_POSITION_CAD = Number(process.env.TRADING_MAX_POSITION_CAD ?? 10);
export const MAX_CONCURRENT_TRADES = 3;
export const DAILY_LOSS_LIMIT_CAD = DAILY_BUDGET_CAD * 0.5; // $25 CAD

export interface BudgetStatus {
    totalCAD: number;
    usedCAD: number;
    remainingCAD: number;
    realizedPnlCAD: number;
    openPositions: number;
    canTrade: boolean;
    reason?: string; // why canTrade is false
}

export interface PositionSize {
    allocatedCAD: number;
    shares: number; // fractional OK (Wealthsimple supports it)
}

/**
 * Determine how much CAD to allocate based on signal strength.
 *  80-100 → max ($10)
 *  60-79  → $7
 *  50-59  → $5
 *  <50    → 0 (skip)
 */
export function sizeFromStrength(strength: number, remainingBudget: number): number {
    let base: number;
    if (strength >= 80) base = MAX_POSITION_CAD;
    else if (strength >= 60) base = MAX_POSITION_CAD * 0.7;
    else if (strength >= 50) base = MAX_POSITION_CAD * 0.5;
    else base = 0;

    return +Math.min(base, remainingBudget).toFixed(2);
}

/**
 * Calculate number of shares (fractional) to buy given a CAD amount and price.
 * Price is in USD; cadToUsd conversion applies.
 */
export function calculateShares(
    allocatedCAD: number,
    priceUSD: number,
    cadToUsd = 0.73 // approximate — update from live FX if available
): PositionSize {
    const allocUSD = allocatedCAD * cadToUsd;
    const shares = allocUSD / priceUSD;
    return {
        allocatedCAD: +allocatedCAD.toFixed(2),
        shares: +shares.toFixed(6),
    };
}

/**
 * Determine if trading is allowed given current budget status.
 */
export function canOpenTrade(
    usedCAD: number,
    realizedPnlCAD: number,
    openPositions: number,
    remainingCAD: number
): { allowed: boolean; reason?: string } {
    if (openPositions >= MAX_CONCURRENT_TRADES) {
        return { allowed: false, reason: `Max ${MAX_CONCURRENT_TRADES} concurrent trades reached` };
    }
    if (realizedPnlCAD <= -DAILY_LOSS_LIMIT_CAD) {
        return { allowed: false, reason: `Daily loss limit hit (-$${DAILY_LOSS_LIMIT_CAD} CAD). No more trades today.` };
    }
    if (remainingCAD < 5) {
        return { allowed: false, reason: 'Insufficient remaining budget (< $5 CAD)' };
    }
    return { allowed: true };
}

/**
 * Calculate P&L for a closed trade.
 */
export function calculatePnl(
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    cadToUsd = 0.73
): { pnlCAD: number; pnlPercent: number } {
    const priceDiff = direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
    const pnlUSD = priceDiff * quantity;
    const pnlCAD = pnlUSD / cadToUsd;
    const pnlPercent = (priceDiff / entryPrice) * 100;
    return {
        pnlCAD: +pnlCAD.toFixed(2),
        pnlPercent: +pnlPercent.toFixed(2),
    };
}

/**
 * Check if price has hit stop-loss or take-profit.
 */
export function checkExitCondition(
    direction: 'LONG' | 'SHORT',
    currentPrice: number,
    stopLoss: number,
    takeProfit: number
): 'STOP_LOSS' | 'TAKE_PROFIT' | null {
    if (direction === 'LONG') {
        if (currentPrice <= stopLoss) return 'STOP_LOSS';
        if (currentPrice >= takeProfit) return 'TAKE_PROFIT';
    } else {
        if (currentPrice >= stopLoss) return 'STOP_LOSS';
        if (currentPrice <= takeProfit) return 'TAKE_PROFIT';
    }
    return null;
}

/**
 * Returns today's date as YYYY-MM-DD in ET timezone.
 */
export function todayET(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Returns true if current time is within US market hours (ET).
 */
export function isMarketHours(): boolean {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const hour = et.getHours();
    const min = et.getMinutes();
    const totalMin = hour * 60 + min;
    return totalMin >= 9 * 60 + 30 && totalMin <= 16 * 60; // 9:30 AM - 4:00 PM ET
}

/**
 * True if within pre-market window (8:00–9:30 AM ET on weekdays).
 */
export function isPreMarket(): boolean {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    if (day === 0 || day === 6) return false;
    const totalMin = et.getHours() * 60 + et.getMinutes();
    return totalMin >= 8 * 60 && totalMin < 9 * 60 + 30;
}
