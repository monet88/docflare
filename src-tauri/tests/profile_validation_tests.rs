use async_trait::async_trait;
use docflare_lib::cloudflare::client::CloudflarePreflight;
use docflare_lib::domain::profile::ValidateAndSaveProfileInput;
use docflare_lib::error::{AppError, AppResult};
use docflare_lib::services::validation_service::ValidationService;
use docflare_lib::store::fake_secret_store::FakeSecretStore;
use docflare_lib::store::profile_config_store::ProfileConfigStore;

// Imports used only by the unix-only failed-replacement test below.
#[cfg(unix)]
use docflare_lib::domain::profile::CloudflareProfileMetadata;
#[cfg(unix)]
use docflare_lib::store::profile_config_store::AppConfig;
#[cfg(unix)]
use docflare_lib::store::secret_store::SecretStore;

#[derive(Clone)]
struct FakePreflight {
    result: AppResult<()>,
}

#[async_trait]
impl CloudflarePreflight for FakePreflight {
    async fn preflight(&self, _input: &ValidateAndSaveProfileInput) -> AppResult<()> {
        self.result.clone()
    }
}

#[tokio::test]
async fn validation_failure_stores_nothing() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    let secret_store = FakeSecretStore::default();
    let service = ValidationService::new(
        FakePreflight {
            result: Err(AppError::InvalidToken),
        },
        ProfileConfigStore::new(config_path.clone()),
        secret_store.clone(),
    );

    let result = service.validate_and_save_profile(valid_input(None)).await;

    assert!(matches!(result, Err(AppError::InvalidToken)));
    assert_eq!(secret_store.len(), 0);
    assert!(!config_path.exists());
}

#[tokio::test]
async fn successful_save_returns_redacted_profile_and_metadata_only_config() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    let secret_store = FakeSecretStore::default();
    let service = ValidationService::new(
        FakePreflight { result: Ok(()) },
        ProfileConfigStore::new(config_path.clone()),
        secret_store.clone(),
    );

    let saved = service
        .validate_and_save_profile(valid_input(Some("production")))
        .await
        .unwrap();
    let config = std::fs::read_to_string(config_path).expect("config exists");

    assert_eq!(saved.profile_key, "production");
    assert_eq!(saved.profile_id, "pro…tion");
    assert_eq!(saved.display_name, "Production");
    assert_eq!(saved.account_id, "1234…cdef");
    assert_eq!(saved.zone_id, "abcd…7890");
    assert!(saved.is_active);
    assert!(!saved
        .account_id
        .contains("1234567890abcdef1234567890abcdef"));
    assert!(!saved.zone_id.contains("abcdef1234567890abcdef1234567890"));
    assert!(saved.token_present);
    assert_eq!(secret_store.len(), 1);
    assert!(config.contains("profiles"));
    assert!(config.contains("activeProfileId"));
    assert!(config.contains("tokenSecretRef"));
    assert!(config.contains("1234567890abcdef1234567890abcdef"));
    assert!(!config.contains(&placeholder_api_token()));
    assert!(!config.contains("\"profile\""));
}

#[tokio::test]
async fn multiple_profiles_can_switch_and_delete_active_profile() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    let secret_store = FakeSecretStore::default();
    let service = ValidationService::new(
        FakePreflight { result: Ok(()) },
        ProfileConfigStore::new(config_path),
        secret_store.clone(),
    );

    service
        .validate_and_save_profile(valid_input(Some("production")))
        .await
        .unwrap();
    service
        .validate_and_save_profile(staging_input())
        .await
        .unwrap();

    let switched = service
        .set_active_profile("production".to_string())
        .expect("set active");
    assert!(switched
        .profiles
        .iter()
        .any(|profile| profile.profile_key == "production" && profile.is_active));

    let after_delete = service
        .delete_profile("production".to_string())
        .expect("delete active");

    assert_eq!(after_delete.profiles.len(), 1);
    assert_eq!(after_delete.profiles[0].profile_key, "staging");
    assert!(after_delete.profiles[0].is_active);
    assert_eq!(secret_store.len(), 1);
}

#[tokio::test]
async fn legacy_config_reads_as_single_active_profile() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    std::fs::write(
        &config_path,
        r#"{
  "profile": {
    "profileId": "default",
    "displayName": "Legacy",
    "accountId": "1234567890abcdef1234567890abcdef",
    "zoneId": "abcdef1234567890abcdef1234567890",
    "tokenSecretRef": "legacy-ref",
    "lastValidatedAt": "2026-05-28T00:00:00Z"
  }
}"#,
    )
    .unwrap();
    let service = ValidationService::new(
        FakePreflight { result: Ok(()) },
        ProfileConfigStore::new(config_path),
        FakeSecretStore::default(),
    );

    let profiles = service.get_profiles().unwrap();

    assert_eq!(profiles.profiles.len(), 1);
    assert_eq!(profiles.profiles[0].profile_key, "default");
    assert!(profiles.profiles[0].is_active);
    assert_eq!(profiles.profiles[0].account_id, "1234…cdef");
}

#[cfg(unix)]
#[tokio::test]
async fn failed_replacement_preserves_previous_profile_and_removes_candidate_secret() {
    use std::os::unix::fs::PermissionsExt;

    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    let config_store = ProfileConfigStore::new(config_path.clone());
    let old_secret_ref = "cf-tunnel-desktop/default/api-token/old";
    let old_config = AppConfig {
        profiles: vec![CloudflareProfileMetadata {
            profile_id: "production".to_string(),
            display_name: "Production".to_string(),
            account_id: "old-account".to_string(),
            zone_id: "old-zone".to_string(),
            token_secret_ref: old_secret_ref.to_string(),
            last_validated_at: "2026-05-28T00:00:00Z".to_string(),
        }],
        active_profile_id: Some("production".to_string()),
        routes: vec![],
    };
    config_store.write(&old_config).unwrap();

    let secret_store = FakeSecretStore::default();
    secret_store.put(old_secret_ref, "old-token").unwrap();
    std::fs::set_permissions(temp_dir.path(), std::fs::Permissions::from_mode(0o555)).unwrap();

    let service = ValidationService::new(
        FakePreflight { result: Ok(()) },
        ProfileConfigStore::new(config_path.clone()),
        secret_store.clone(),
    );
    let result = service
        .validate_and_save_profile(valid_input(Some("production")))
        .await;

    std::fs::set_permissions(temp_dir.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    let config = std::fs::read_to_string(config_path).expect("old config preserved");

    assert!(matches!(result, Err(AppError::ConfigWriteFailed)));
    assert!(secret_store.contains(old_secret_ref));
    assert_eq!(secret_store.len(), 1);
    assert!(config.contains("old-account"));
    assert!(!config.contains("1234567890abcdef1234567890abcdef"));
}

fn valid_input(profile_id: Option<&str>) -> ValidateAndSaveProfileInput {
    ValidateAndSaveProfileInput {
        profile_id: profile_id.map(str::to_string),
        profile_name: Some("Production".to_string()),
        api_token: placeholder_api_token(),
        account_id: "1234567890abcdef1234567890abcdef".to_string(),
        zone_id: "abcdef1234567890abcdef1234567890".to_string(),
    }
}

fn staging_input() -> ValidateAndSaveProfileInput {
    ValidateAndSaveProfileInput {
        profile_id: Some("staging".to_string()),
        profile_name: Some("Staging".to_string()),
        api_token: placeholder_api_token(),
        account_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
        zone_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
    }
}

fn placeholder_api_token() -> String {
    ["test", "token", "placeholder"].join("-")
}
