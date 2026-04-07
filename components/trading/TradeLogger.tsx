'use client';

import { useState } from 'react';

interface TradeLoggerProps {
    onTradeLogged?: () => void;
}

const STRATEGIES = ['MOMENTUM', 'GAP', 'BREAKOUT', 'MEAN_REVERSION'];

export default function TradeLogger({ onTradeLogged }: TradeLoggerProps) {
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        symbol: '',
        strategy: 'MOMENTUM',
        direction: 'LONG',
        entryPrice: '',
        quantity: '',
        allocatedCAD: '',
        stopLoss: '',
        takeProfit: '',
        signalStrength: '65',
        notes: '',
    });

    const update = (field: string, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    // Auto-calculate stop/target from entry if not filled
    const autoFill = () => {
        if (!form.entryPrice) return;
        const price = parseFloat(form.entryPrice);
        if (isNaN(price)) return;
        if (!form.stopLoss) update('stopLoss', (price * 0.975).toFixed(2)); // -2.5%
        if (!form.takeProfit) update('takeProfit', (price * 1.075).toFixed(2)); // +7.5%
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch('/api/trading/trades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: form.symbol.toUpperCase(),
                    strategy: form.strategy,
                    direction: form.direction,
                    entryPrice: parseFloat(form.entryPrice),
                    quantity: parseFloat(form.quantity),
                    allocatedCAD: parseFloat(form.allocatedCAD),
                    stopLoss: parseFloat(form.stopLoss),
                    takeProfit: parseFloat(form.takeProfit),
                    signalStrength: parseInt(form.signalStrength),
                    notes: form.notes,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error ?? 'Failed to log trade');
                return;
            }

            // Reset form
            setForm({
                symbol: '', strategy: 'MOMENTUM', direction: 'LONG',
                entryPrice: '', quantity: '', allocatedCAD: '',
                stopLoss: '', takeProfit: '', signalStrength: '65', notes: '',
            });
            setOpen(false);
            onTradeLogged?.();
        } catch {
            setError('Network error — try again');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900">
            <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/40 transition-colors rounded-xl"
                onClick={() => setOpen(!open)}
            >
                <span className="font-semibold text-white text-sm">Log a Trade</span>
                <span className="text-xs text-zinc-500">
                    {open ? 'Cancel ▲' : 'Record a Wealthsimple execution ▼'}
                </span>
            </button>

            {open && (
                <form onSubmit={submit} className="border-t border-zinc-800 p-4 space-y-4">
                    {error && (
                        <p className="text-sm text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    {/* Row 1 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                            <label className="label-sm">Symbol</label>
                            <input
                                required
                                value={form.symbol}
                                onChange={(e) => update('symbol', e.target.value.toUpperCase())}
                                placeholder="TSLA"
                                className="input-sm"
                            />
                        </div>
                        <div>
                            <label className="label-sm">Strategy</label>
                            <select
                                value={form.strategy}
                                onChange={(e) => update('strategy', e.target.value)}
                                className="input-sm"
                            >
                                {STRATEGIES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label-sm">Direction</label>
                            <select
                                value={form.direction}
                                onChange={(e) => update('direction', e.target.value)}
                                className="input-sm"
                            >
                                <option value="LONG">LONG</option>
                                <option value="SHORT">SHORT</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-sm">Signal Strength</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={form.signalStrength}
                                onChange={(e) => update('signalStrength', e.target.value)}
                                className="input-sm"
                            />
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="label-sm">Entry Price (USD)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                value={form.entryPrice}
                                onChange={(e) => update('entryPrice', e.target.value)}
                                onBlur={autoFill}
                                placeholder="123.45"
                                className="input-sm"
                            />
                        </div>
                        <div>
                            <label className="label-sm">Quantity (shares)</label>
                            <input
                                required
                                type="number"
                                step="0.000001"
                                value={form.quantity}
                                onChange={(e) => update('quantity', e.target.value)}
                                placeholder="0.05"
                                className="input-sm"
                            />
                        </div>
                        <div>
                            <label className="label-sm">Allocated (CAD)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min={1}
                                max={10}
                                value={form.allocatedCAD}
                                onChange={(e) => update('allocatedCAD', e.target.value)}
                                placeholder="7.00"
                                className="input-sm"
                            />
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-sm">Stop Loss (USD)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                value={form.stopLoss}
                                onChange={(e) => update('stopLoss', e.target.value)}
                                placeholder="120.35"
                                className="input-sm"
                            />
                        </div>
                        <div>
                            <label className="label-sm">Take Profit (USD)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                value={form.takeProfit}
                                onChange={(e) => update('takeProfit', e.target.value)}
                                placeholder="132.58"
                                className="input-sm"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="label-sm">Notes (optional)</label>
                        <input
                            value={form.notes}
                            onChange={(e) => update('notes', e.target.value)}
                            placeholder="Bought on gap-up, news catalyst..."
                            className="input-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                        {submitting ? 'Logging...' : 'Log Trade'}
                    </button>
                </form>
            )}
        </div>
    );
}
