import { describe, expect, test } from "vitest";
import { newestRelease } from "./updater.svelte";

const release = (tag_name: string, assetNames = ["latest.json"]) => ({
    tag_name,
    prerelease: false,
    assets: assetNames.map(name => ({ name, browser_download_url: `https://example.com/${tag_name}/${name}` })),
});

describe("newestRelease", () => {
    test("picks the highest version regardless of release order", () => {
        expect(newestRelease([release("v1.0.4"), release("v1.1.0-beta.1"), release("v1.0.3")])?.manifest)
            .toBe("https://example.com/v1.1.0-beta.1/latest.json");
    });

    test("a stable release outranks its own pre-releases", () => {
        expect(newestRelease([release("v1.1.0-beta.2"), release("v1.1.0")])?.manifest)
            .toBe("https://example.com/v1.1.0/latest.json");
    });

    test("skips releases without an updater manifest or a version tag", () => {
        expect(newestRelease([release("v2.0.0", ["Gary.AppImage"]), release("desktop-preview"), release("v1.0.0")])?.manifest)
            .toBe("https://example.com/v1.0.0/latest.json");
        expect(newestRelease([])).toBeUndefined();
    });
});
