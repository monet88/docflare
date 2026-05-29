use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use crate::domain::profile::CloudflareProfileMetadata;
use crate::domain::route::Route;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub profiles: Vec<CloudflareProfileMetadata>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub routes: Vec<Route>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAppConfig {
    #[serde(default)]
    profiles: Vec<CloudflareProfileMetadata>,
    #[serde(default)]
    active_profile_id: Option<String>,
    #[serde(default)]
    profile: Option<CloudflareProfileMetadata>,
    #[serde(default)]
    routes: Vec<Route>,
}

impl From<RawAppConfig> for AppConfig {
    fn from(raw: RawAppConfig) -> Self {
        if !raw.profiles.is_empty() {
            let active_profile_id = raw
                .active_profile_id
                .filter(|id| raw.profiles.iter().any(|profile| profile.profile_id == *id));
            return Self {
                active_profile_id: active_profile_id.or_else(|| {
                    raw.profiles
                        .first()
                        .map(|profile| profile.profile_id.clone())
                }),
                profiles: raw.profiles,
                routes: raw.routes,
            };
        }

        match raw.profile {
            Some(profile) => Self {
                active_profile_id: Some(profile.profile_id.clone()),
                profiles: vec![profile],
                routes: raw.routes,
            },
            None => Self {
                routes: raw.routes,
                ..Self::default()
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProfileConfigStore {
    path: PathBuf,
}

impl ProfileConfigStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn read(&self) -> AppResult<AppConfig> {
        if !self.path.exists() {
            return Ok(AppConfig::default());
        }

        let contents = fs::read_to_string(&self.path).map_err(|_| AppError::ConfigReadFailed)?;
        let raw: RawAppConfig =
            serde_json::from_str(&contents).map_err(|_| AppError::ConfigReadFailed)?;
        Ok(AppConfig::from(raw))
    }

    pub fn write(&self, config: &AppConfig) -> AppResult<()> {
        let parent = self.path.parent().ok_or(AppError::ConfigWriteFailed)?;
        fs::create_dir_all(parent).map_err(|_| AppError::ConfigWriteFailed)?;

        let contents =
            serde_json::to_string_pretty(config).map_err(|_| AppError::ConfigWriteFailed)?;

        let mut temp = NamedTempFile::new_in(parent).map_err(|_| AppError::ConfigWriteFailed)?;
        temp.write_all(contents.as_bytes())
            .map_err(|_| AppError::ConfigWriteFailed)?;
        temp.as_file()
            .sync_all()
            .map_err(|_| AppError::ConfigWriteFailed)?;

        persist_with_retry(temp, &self.path)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn persist_with_retry(mut temp: NamedTempFile, final_path: &Path) -> AppResult<()> {
    for attempt in 0..5 {
        match temp.persist(final_path) {
            Ok(_) => return Ok(()),
            Err(error) => {
                if attempt == 4 {
                    return Err(AppError::ConfigWriteFailed);
                }
                temp = error.file;
                thread::sleep(Duration::from_millis(50));
            }
        }
    }

    Err(AppError::ConfigWriteFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_legacy_single_profile_config() {
        let raw = RawAppConfig {
            profile: Some(profile("default", "ref")),
            ..RawAppConfig::default()
        };

        let config = AppConfig::from(raw);

        assert_eq!(config.profiles.len(), 1);
        assert_eq!(config.active_profile_id.as_deref(), Some("default"));
    }

    #[test]
    fn normalizes_missing_active_profile() {
        let raw = RawAppConfig {
            profiles: vec![profile("first", "ref-1"), profile("second", "ref-2")],
            active_profile_id: Some("missing".to_string()),
            profile: None,
            routes: vec![],
        };

        let config = AppConfig::from(raw);

        assert_eq!(config.active_profile_id.as_deref(), Some("first"));
    }

    fn profile(profile_id: &str, token_secret_ref: &str) -> CloudflareProfileMetadata {
        CloudflareProfileMetadata {
            profile_id: profile_id.to_string(),
            display_name: profile_id.to_string(),
            account_id: "1234567890abcdef1234567890abcdef".to_string(),
            zone_id: "abcdef1234567890abcdef1234567890".to_string(),
            token_secret_ref: token_secret_ref.to_string(),
            last_validated_at: "2026-05-29T00:00:00Z".to_string(),
        }
    }
}
