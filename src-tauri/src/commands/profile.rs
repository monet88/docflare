use tauri::{AppHandle, Manager};

use crate::cloudflare::client::CloudflareClient;
use crate::domain::profile::{SavedProfile, SavedProfiles, ValidateAndSaveProfileInput};
use crate::error::UiError;
use crate::services::validation_service::ValidationService;
use crate::store::keyring_secret_store::KeyringSecretStore;
use crate::store::profile_config_store::ProfileConfigStore;

#[tauri::command]
pub fn get_profile(app: AppHandle) -> Result<Option<SavedProfile>, UiError> {
    let service = profile_service(&app)?;
    service.get_profile().map_err(UiError::from)
}

#[tauri::command]
pub fn get_profiles(app: AppHandle) -> Result<SavedProfiles, UiError> {
    let service = profile_service(&app)?;
    service.get_profiles().map_err(UiError::from)
}

#[tauri::command]
pub async fn validate_and_save_profile(
    app: AppHandle,
    input: ValidateAndSaveProfileInput,
) -> Result<SavedProfile, UiError> {
    let service = profile_service(&app)?;
    service
        .validate_and_save_profile(input)
        .await
        .map_err(UiError::from)
}

#[tauri::command]
pub fn set_active_profile(app: AppHandle, profile_id: String) -> Result<SavedProfiles, UiError> {
    let service = profile_service(&app)?;
    service
        .set_active_profile(profile_id)
        .map_err(UiError::from)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, profile_id: String) -> Result<SavedProfiles, UiError> {
    let service = profile_service(&app)?;
    service.delete_profile(profile_id).map_err(UiError::from)
}

fn profile_service(
    app: &AppHandle,
) -> Result<ValidationService<CloudflareClient, KeyringSecretStore>, UiError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| UiError::from(crate::error::AppError::ConfigReadFailed))?;
    let config_store = ProfileConfigStore::new(config_dir.join("profile.json"));

    Ok(ValidationService::new(
        CloudflareClient::default(),
        config_store,
        KeyringSecretStore,
    ))
}
