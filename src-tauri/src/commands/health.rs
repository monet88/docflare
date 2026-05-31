use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResponse {
    pub ok: bool,
    pub app: &'static str,
}

#[tauri::command]
pub fn health_check() -> HealthCheckResponse {
    HealthCheckResponse {
        ok: true,
        app: "docflare",
    }
}
