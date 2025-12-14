import { check, type Update } from "@tauri-apps/plugin-updater";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import r from "$lib/app/utils/reporting";
import { ResultAsync } from "neverthrow";

export async function checkForAppUpdates(isCheckManual = false) {
    const updateRes = await ResultAsync.fromPromise(check(), (e) => e as string);
    if (updateRes.isErr()) {
        r.error("Could not check for updates", {
            details: `${updateRes.error}`,
            target: "updater",
            toast: isCheckManual,
        });
        return;
    }
    const update = updateRes.value;
    if (!update) {
        if (isCheckManual) {
            await message("You are using the latest version.", "No update available");
        }
        r.info("No update available");
        return;
    }
    r.success("Update available!", {
        details: `Version ${update.version} is available`,
        toast: {
            closeButton: true,
            action: {
                label: "Update",
                onClick: promptForUpdate
            }
        }
    });
}

export type UpdateData = {
    update?: Update
};

export const updateData: UpdateData = $state({
    update: undefined
});

export async function promptForUpdate() {
    const update = updateData.update;
    if (!update) return;

    const answer = await message(
        `Update from ${update.currentVersion} to ${update.version}?\n\nRelease notes: ${update.body}`,
        {
            title: "Update Available",
            kind: "info",
            buttons: { ok: "Update", cancel: "Cancel" },
            // buttons: { yes: "Update", no: "Skip this version", cancel: "Cancel" },
        },
    );
    switch (answer) {
        case 'Yes':
        case 'Ok':
            await update.downloadAndInstall();
            await relaunch();
            return;
        case 'No':
            await message("Sorry", "TODO");
            return;
        case 'Cancel': return;
        default:
            await message(
                "Consider wrapping your computer in 15cm thick lead foil (or moving out from Radiationopolis)",
                "Cosmic bit flip detected"
            );
    }
}