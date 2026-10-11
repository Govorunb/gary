use serde::Serialize;
use tauri::{Manager, ResourceId, Runtime, Url, Webview};
use tauri_plugin_updater::UpdaterExt;
use time::format_description::well_known::Rfc3339;

/// Same shape as the updater plugin's metadata, so the frontend can wrap it in the plugin's `Update` class.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

/// The updater plugin's `check`, but against a manifest picked at runtime (the plugin's JS API can only use the configured endpoints).
#[tauri::command]
pub async fn check_update<R: Runtime>(webview: Webview<R>, endpoint: Url) -> Result<Option<UpdateMetadata>, String> {
    let updater = webview.updater_builder().endpoints(vec![endpoint]).and_then(|b| b.build()).map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update.date.and_then(|d| d.format(&Rfc3339).ok()),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}
