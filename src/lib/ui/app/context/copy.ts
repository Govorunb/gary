import { toast } from "svelte-sonner";
import type { ContextRow } from "./formatters/types";

export function contextRowData(row: ContextRow) {
    return { ...row.event, text: row.rendered?.text ?? "" };
}

export async function copyContextText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    } catch (error) {
        toast.error("Failed to copy", {
            description: error instanceof Error ? error.message : String(error),
        });
    }
}
