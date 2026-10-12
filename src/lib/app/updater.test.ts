import { describe, expect, test } from "vitest";
import { updateCandidates } from "./updater.svelte";

const release = (tag_name: string, { prerelease = false, assetNames = ["latest.json"] } = {}) => ({
    tag_name,
    prerelease,
    body_html: `<p>${tag_name}</p>`,
    assets: assetNames.map(name => ({ name, browser_download_url: `https://example.com/${tag_name}/${name}` })),
});
const versions = (...args: Parameters<typeof updateCandidates>) => updateCandidates(...args).map(r => r.version);

describe("updateCandidates", () => {
    test("sorts by version regardless of release order", () => {
        expect(versions([release("v1.0.4"), release("v1.1.0-beta.1", { prerelease: true }), release("v1.0.3")], "prerelease"))
            .toEqual(["1.1.0-beta.1", "1.0.4", "1.0.3"]);
    });

    test("a stable release outranks its own pre-releases", () => {
        expect(versions([release("v1.1.0-beta.2", { prerelease: true }), release("v1.1.0")], "prerelease"))
            .toEqual(["1.1.0", "1.1.0-beta.2"]);
    });

    test("the stable channel never sees pre-releases", () => {
        expect(versions([release("v1.1.0-beta.1", { prerelease: true }), release("v1.0.4")], "stable"))
            .toEqual(["1.0.4"]);
    });

    test("starts from the newest release with an updater manifest, keeping older ones without", () => {
        expect(versions([
            release("v2.0.0", { assetNames: ["Gary.AppImage"] }),
            release("desktop-preview"),
            release("v1.0.1"),
            release("v1.0.0", { assetNames: [] }),
        ], "stable")).toEqual(["1.0.1", "1.0.0"]);
        expect(updateCandidates([release("v1.0.0", { assetNames: [] })], "stable")).toEqual([]);
    });
});
