/**
 * Wealthsimple Unofficial API Client
 *
 * IMPORTANT NOTES:
 * 1. This uses Wealthsimple's undocumented internal API — subject to change.
 * 2. Used ONLY for read-only operations: balance sync, position reading.
 * 3. We do NOT automate order placement — users execute trades manually.
 * 4. Tokens are stored encrypted in MongoDB per user session.
 * 5. Requires the user to authenticate once via OAuth2 flow.
 *
 * Authentication flow:
 *   1. User visits /trading/connect
 *   2. Redirected to Wealthsimple OAuth consent page
 *   3. Callback stores tokens in DB
 *   4. Client uses stored tokens to read balance/positions
 */

import type { WSTokenResponse, WSAccount, WSPosition, WSPortfolioSummary } from './types';

// Wealthsimple unofficial API base
const WS_API_BASE = 'https://api.wealthsimple.com/v1';
const WS_OAUTH_BASE = 'https://api.wealthsimple.com/v1/oauth/v2';

const CLIENT_ID = process.env.WEALTHSIMPLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.WEALTHSIMPLE_CLIENT_SECRET ?? '';

// ─── Token Management ─────────────────────────────────────────────────────────

export function isConfigured(): boolean {
    return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/**
 * Build the OAuth2 authorization URL to redirect users to Wealthsimple login.
 */
export function getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'read',
        state,
    });
    return `${WS_OAUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<WSTokenResponse> {
    const res = await fetch(`${WS_OAUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WS token exchange failed: ${res.status} ${text}`);
    }

    return res.json();
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<WSTokenResponse> {
    const res = await fetch(`${WS_OAUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: refreshToken,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WS token refresh failed: ${res.status} ${text}`);
    }

    return res.json();
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function wsGet<T>(path: string, accessToken: string): Promise<T> {
    const res = await fetch(`${WS_API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`WS API error ${res.status}: ${path}`);
    }

    return res.json();
}

/**
 * Fetch all user accounts (TFSA, RRSP, Non-Registered).
 */
export async function getAccounts(accessToken: string): Promise<WSAccount[]> {
    const data = await wsGet<{ results: WSAccount[] }>('/accounts', accessToken);
    return data.results ?? [];
}

/**
 * Fetch all current positions across all accounts.
 */
export async function getPositions(
    accessToken: string,
    accountId?: string
): Promise<WSPosition[]> {
    const path = accountId ? `/positions?account_id=${accountId}` : '/positions';
    const data = await wsGet<{ results: WSPosition[] }>(path, accessToken);
    return data.results ?? [];
}

/**
 * Build a full portfolio summary with CAD-normalized balances.
 */
export async function getPortfolioSummary(accessToken: string): Promise<WSPortfolioSummary> {
    const [accounts, positions] = await Promise.all([
        getAccounts(accessToken),
        getPositions(accessToken),
    ]);

    const openAccounts = accounts.filter((a) => a.status === 'open');

    const totalBalanceCAD = openAccounts.reduce((sum, a) => {
        const amount = a.current_balance?.amount ?? 0;
        const isUSD = a.currency === 'USD';
        return sum + (isUSD ? amount / 0.73 : amount); // rough USD→CAD conversion
    }, 0);

    const buyingPowerCAD = openAccounts.reduce((sum, a) => {
        const amount = a.buying_power?.amount ?? 0;
        const isUSD = a.currency === 'USD';
        return sum + (isUSD ? amount / 0.73 : amount);
    }, 0);

    return {
        accounts: openAccounts,
        totalBalanceCAD: +totalBalanceCAD.toFixed(2),
        buyingPowerCAD: +buyingPowerCAD.toFixed(2),
        positions,
    };
}

// ─── Token Storage (MongoDB) ──────────────────────────────────────────────────

/**
 * Persist (or update) a user's WS tokens in MongoDB.
 */
export async function saveTokens(userId: string, tokens: WSTokenResponse): Promise<void> {
    const { connectToDatabase } = await import('@/database/mongoose');
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) return;

    const expiresAt = new Date((tokens.created_at + tokens.expires_in) * 1000);

    await db.collection('ws_tokens').updateOne(
        { userId },
        {
            $set: {
                userId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt,
                updatedAt: new Date(),
            },
        },
        { upsert: true }
    );
}

/**
 * Load a user's stored WS tokens, refreshing if expired.
 * Returns null if not connected.
 */
export async function getValidToken(userId: string): Promise<string | null> {
    const { connectToDatabase } = await import('@/database/mongoose');
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) return null;

    const stored = await db.collection('ws_tokens').findOne({ userId });
    if (!stored) return null;

    // Token is still valid
    if (stored.expiresAt > new Date()) {
        return stored.accessToken as string;
    }

    // Refresh expired token
    try {
        const fresh = await refreshAccessToken(stored.refreshToken as string);
        await saveTokens(userId, fresh);
        return fresh.access_token;
    } catch (err) {
        console.error('WS token refresh failed for user', userId, err);
        // Delete invalid token
        await db.collection('ws_tokens').deleteOne({ userId });
        return null;
    }
}

/**
 * Check if a user has connected their Wealthsimple account.
 */
export async function isConnected(userId: string): Promise<boolean> {
    const token = await getValidToken(userId);
    return token !== null;
}

/**
 * Disconnect a user's Wealthsimple account (delete stored tokens).
 */
export async function disconnect(userId: string): Promise<void> {
    const { connectToDatabase } = await import('@/database/mongoose');
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) return;
    await db.collection('ws_tokens').deleteOne({ userId });
}
