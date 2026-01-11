import { onMount } from "svelte";
import { on } from "svelte/events";
import type { UserPrefs } from "./prefs.svelte";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = typeof THEMES[number];

export class ThemeManager {
    private systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    public readonly currentTheme: Theme;

    constructor(private userPrefs: UserPrefs) {
        this.currentTheme = $derived(this.userPrefs.app.theme);
        $effect(() => {
            if (this.currentTheme === "system") {
                this.setTheme(this.systemDark.matches ? "dark" : "light");
            } else {
                this.setTheme(this.currentTheme);
            }
        });

        onMount(() => on(this.systemDark, "change", this.systemThemeChanged.bind(this)));
    }

    private systemThemeChanged(evt: MediaQueryListEvent) {
        if (this.currentTheme !== "system") return;
        this.setTheme(evt.matches ? "dark" : "light");
    }

    private setTheme(theme: "dark" | "light") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(theme);
    }
}
