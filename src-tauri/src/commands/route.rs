use tauri::{AppHandle, Manager};

use crate::domain::route::{CreateRouteInput, Route, UpdateRouteInput};
use crate::error::UiError;
use crate::services::route_service::RouteService;
use crate::store::profile_config_store::ProfileConfigStore;

#[tauri::command]
pub fn get_routes(app: AppHandle, profile_id: String) -> Result<Vec<Route>, UiError> {
    let service = route_service(&app)?;
    service.list_routes(&profile_id).map_err(UiError::from)
}

#[tauri::command]
pub fn add_route(app: AppHandle, input: CreateRouteInput) -> Result<Route, UiError> {
    let service = route_service(&app)?;
    service.add_route(input).map_err(UiError::from)
}

#[tauri::command]
pub fn update_route(app: AppHandle, input: UpdateRouteInput) -> Result<Route, UiError> {
    let service = route_service(&app)?;
    service.update_route(input).map_err(UiError::from)
}

#[tauri::command]
pub fn delete_route(
    app: AppHandle,
    route_id: String,
    profile_id: String,
) -> Result<(), UiError> {
    let service = route_service(&app)?;
    service
        .delete_route(&route_id, &profile_id)
        .map_err(UiError::from)
}

fn route_service(app: &AppHandle) -> Result<RouteService, UiError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| UiError::from(crate::error::AppError::ConfigReadFailed))?;
    let config_store = ProfileConfigStore::new(config_dir.join("profile.json"));
    Ok(RouteService::new(config_store))
}
