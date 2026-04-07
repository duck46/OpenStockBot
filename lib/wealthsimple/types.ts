/**
 * Wealthsimple API Types
 *
 * Based on reverse-engineered Wealthsimple Trade API.
 * Endpoints may change without notice — this is NOT an official API.
 * Used ONLY for read-only balance/position syncing.
 * All trade execution is done manually by the user.
 */

export interface WSTokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number; // seconds
    created_at: number; // unix timestamp
    scope: string;
}

export interface WSAccount {
    id: string;
    type: 'RRSP' | 'TFSA' | 'NON_REGISTERED' | 'CRYPTO' | string;
    status: 'open' | 'closed';
    currency: 'CAD' | 'USD';
    buying_power: {
        amount: number;
        currency: string;
    };
    current_balance: {
        amount: number;
        currency: string;
    };
    net_deposits: {
        amount: number;
        currency: string;
    };
    available_to_withdraw: {
        amount: number;
        currency: string;
    };
}

export interface WSPosition {
    id: string;
    stock: {
        id: string;
        symbol: string;
        name: string;
        primary_exchange: string;
        currency: string;
    };
    quantity: number;
    market_value: {
        amount: number;
        currency: string;
    };
    book_value: {
        amount: number;
        currency: string;
    };
    unrealized_gain?: {
        amount: number;
        currency: string;
    };
    account_id: string;
}

export interface WSOrder {
    id: string;
    account_id: string;
    symbol: string;
    order_type: 'buy_quantity' | 'sell_quantity' | 'buy_value' | 'sell_value';
    order_sub_type: 'market' | 'limit' | 'stop_limit';
    status: 'posted' | 'submitted' | 'filled' | 'cancelled' | 'rejected';
    quantity?: number;
    limit_price?: { amount: number; currency: string };
    filled_quantity?: number;
    filled_at_price?: { amount: number; currency: string };
    created_at: string;
    filled_at?: string;
}

export interface WSPortfolioSummary {
    accounts: WSAccount[];
    totalBalanceCAD: number;
    buyingPowerCAD: number;
    positions: WSPosition[];
}

export interface StoredWSToken {
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    updatedAt: Date;
}
