export function formatEventTime(timestamp: number, now: number): string {
    const age = Math.max(0, now - timestamp);
    if (age < 5_000) return "now";
    if (age < 60_000) return `${Math.floor(age / 5_000) * 5}s`;
    if (age < 60 * 60_000) return `${Math.floor(age / 60_000)}m`;

    return ">1h";
}
