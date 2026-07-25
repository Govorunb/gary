import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function detectWith(renderer?: string) {
    vi.stubGlobal("document", {
        createElement: () => ({
            getContext: () => ({
                getExtension: (name: string) => name === "WEBGL_debug_renderer_info" && renderer
                    ? { UNMASKED_RENDERER_WEBGL: 1 }
                    : null,
                getParameter: () => renderer,
            }),
        }),
    });

    const { hasHardwareAcceleration } = await import("./hardware-acceleration");
    return hasHardwareAcceleration();
}

describe("hasHardwareAcceleration", () => {
    test("rejects browsers without WebGL", async () => {
        vi.stubGlobal("document", {
            createElement: () => ({
                getContext: () => null,
            }),
        });

        const { hasHardwareAcceleration } = await import("./hardware-acceleration");
        expect(hasHardwareAcceleration()).toBe(false);
    });

    test("rejects software rendering", async () => {
        expect(await detectWith("llvmpipe (LLVM 19.1.7, 256 bits)")).toBe(false);
    });

    test("accepts hardware rendering", async () => {
        expect(await detectWith("ANGLE (Intel, Mesa Intel UHD Graphics)")).toBe(true);
    });

    test("accepts WebGL when renderer details are unavailable", async () => {
        expect(await detectWith()).toBe(true);
    });
});
