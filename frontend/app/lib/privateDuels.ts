import { SIGNALING_URL } from "./signaling";

export interface SeriesState {
    id: string;
    gameMode: "emoji" | "celebrity" | "facesync";
    totalRounds: number;
    currentRound: number;
    state: string;
    version: number;
    readinessGeneration: number;
    role: "host" | "guest";
    myPoints: number;
    partnerPoints: number;
    myReady: boolean;
    partnerReady: boolean;
    partnerJoined: boolean;
    partnerConnected: boolean;
    partnerName: string | null;
    expiresAt: number;
    results: {
        matchId: string;
        roundNumber: number;
        myScore: number;
        partnerScore: number;
    }[];
}
export const terminalSeries = (state: string) => ["completed", "cancelled", "aborted", "expired"].includes(state);
export async function duelRequest<T>(token: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${SIGNALING_URL}/api/duels${path}`, {
        method: body === undefined ? "GET" : "POST", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204)
        return undefined as T;
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.detail || "Could not load this 1v1.");
    return data as T;
}
