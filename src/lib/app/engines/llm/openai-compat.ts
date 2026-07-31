import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { err, ok, type Result } from "neverthrow";
import { ConfigError } from ".";

// https://github.com/ollama/ollama/issues/10507
// https://github.com/Govorunb/gary/issues/7
const LOCAL_LLM_ORIGIN = "http://localhost";

function isLocalOrPrivateHttpEndpoint(endpoint: string): boolean {
    try {
        const url = new URL(endpoint);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        const host = url.hostname.toLowerCase();
        if (host === "localhost" || host.endsWith(".localhost")) return true;
        if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
        if (/^10\./.test(host)) return true;
        if (/^192\.168\./.test(host)) return true;
        const match = host.match(/^172\.(\d+)\./);
        if (!match) return false;
        const second = Number(match[1]);
        return second >= 16 && second <= 31;
    } catch {
        return false;
    }
}

function requestUrl(input: string | URL | Request): string {
    return input instanceof Request ? input.url : input.toString();
}

export const openAICompatFetch: typeof fetch = (input, init) => {
    if (!isTauri()) return globalThis.fetch(input, init);

    const url = requestUrl(input);
    if (!isLocalOrPrivateHttpEndpoint(url)) return tauriFetch(input, init);

    const headers = new Headers(init?.headers);
    headers.set("Origin", LOCAL_LLM_ORIGIN);
    return tauriFetch(input, { ...init, headers });
};

export function localApiEndpoint(serverUrl: string, path: string): Result<string, ConfigError> {
    try {
        const url = new URL(serverUrl);
        url.pathname = path;
        url.search = "";
        url.hash = "";
        return ok(url.toString());
    } catch {
        return err(new ConfigError("Local model server URL is invalid", ["serverUrl"]));
    }
}

export function authHeaders(apiKey?: string): HeadersInit | undefined {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
}
