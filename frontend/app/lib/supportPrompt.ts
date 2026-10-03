export const SUPPORT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const SUPPORT_KEY = "emoggle:support-prompt:v1";
export interface SupportRecord {
    completed: string[];
    count: number;
    lastShown: number;
}
export function parseSupportRecord(raw: string | null, now = Date.now()): SupportRecord {
    try {
        const value = JSON.parse(raw ?? "null");
        return {
            completed: Array.isArray(value?.completed) ? value.completed.filter((id: unknown) => typeof id === "string" && id.length <= 100).slice(-100) : [],
            count: Number.isSafeInteger(value?.count) ? Math.max(0, Math.min(1000000, value.count)) : 0,
            lastShown: Number.isFinite(value?.lastShown) && value.lastShown >= 0 && value.lastShown <= now ? value.lastShown : 0,
        };
    }
    catch {
        return { completed: [], count: 0, lastShown: 0 };
    }
}
export function completeSupportRound(record: SupportRecord, id: string, now = Date.now()) {
    if (!id || id.length > 100 || record.completed.includes(id))
        return { record, eligible: false };
    return { record: { ...record, count: Math.min(1000000, record.count + 1), completed: [...record.completed, id].slice(-100) }, eligible: !record.lastShown || now - record.lastShown >= SUPPORT_COOLDOWN_MS };
}
export function safeCheckoutUrl(raw: string): string | null {
    try {
        const url = new URL(raw);
        return url.protocol === "https:" && !url.username && !url.password && !url.port && ["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(url.hostname) ? url.href : null;
    }
    catch {
        return null;
    }
}
