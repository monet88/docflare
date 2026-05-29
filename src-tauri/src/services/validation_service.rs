use chrono::Utc;

use crate::cloudflare::client::CloudflarePreflight;
use crate::domain::profile::{
    is_valid_profile_id, CloudflareProfileMetadata, SavedProfile, SavedProfiles,
    ValidateAndSaveProfileInput,
};
use crate::error::{AppError, AppResult};
use crate::store::config_lock::config_mutation_guard;
use crate::store::profile_config_store::{AppConfig, ProfileConfigStore};
use crate::store::secret_store::SecretStore;

const SECRET_REF_PREFIX: &str = "cf-tunnel-desktop/profile/api-token";

pub struct ValidationService<C, S> {
    cloudflare: C,
    config_store: ProfileConfigStore,
    secret_store: S,
}

impl<C, S> ValidationService<C, S>
where
    C: CloudflarePreflight,
    S: SecretStore,
{
    pub fn new(cloudflare: C, config_store: ProfileConfigStore, secret_store: S) -> Self {
        Self {
            cloudflare,
            config_store,
            secret_store,
        }
    }

    pub fn get_profile(&self) -> AppResult<Option<SavedProfile>> {
        let config = self.config_store.read()?;
        let active_profile_id = config.active_profile_id.as_deref();
        Ok(config
            .profiles
            .into_iter()
            .find(|profile| Some(profile.profile_id.as_str()) == active_profile_id)
            .map(|profile| SavedProfile::from_metadata(profile, active_profile_id)))
    }

    pub fn get_profiles(&self) -> AppResult<SavedProfiles> {
        let config = self.config_store.read()?;
        Ok(saved_profiles(config))
    }

    pub async fn validate_and_save_profile(
        &self,
        input: ValidateAndSaveProfileInput,
    ) -> AppResult<SavedProfile> {
        if !input.has_required_fields() {
            return Err(AppError::InvalidInput);
        }

        let input = input.trimmed();
        if !input.has_valid_resource_ids() {
            return Err(AppError::InvalidInput);
        }

        self.cloudflare.preflight(&input).await?;

        let _guard = config_mutation_guard()?;
        let profile_id = match input.profile_id.as_deref() {
            Some(profile_id) if is_valid_profile_id(profile_id) => profile_id.to_string(),
            Some(_) => return Err(AppError::InvalidInput),
            None => uuid::Uuid::new_v4().to_string(),
        };
        let display_name = input.profile_name.clone().unwrap_or_else(|| {
            format!(
                "Cloudflare profile {}",
                profile_id.chars().take(8).collect::<String>()
            )
        });

        let current_config = self.config_store.read()?;
        let old_secret_ref = current_config
            .profiles
            .iter()
            .find(|profile| profile.profile_id == profile_id)
            .map(|profile| profile.token_secret_ref.clone());
        let candidate_secret_ref = candidate_secret_ref(&profile_id);

        self.secret_store
            .put(&candidate_secret_ref, &input.api_token)
            .inspect_err(|_| {
                let _ = self.secret_store.delete(&candidate_secret_ref);
            })?;

        let metadata = CloudflareProfileMetadata {
            profile_id: profile_id.clone(),
            display_name,
            account_id: input.account_id,
            zone_id: input.zone_id,
            token_secret_ref: candidate_secret_ref.clone(),
            last_validated_at: Utc::now().to_rfc3339(),
        };
        let next_config = upsert_profile(current_config, metadata.clone());

        if let Err(error) = self.config_store.write(&next_config) {
            let _ = self.secret_store.delete(&candidate_secret_ref);
            return Err(error);
        }

        if let Some(old_secret_ref) = old_secret_ref {
            if old_secret_ref != candidate_secret_ref {
                let _ = self.secret_store.delete(&old_secret_ref);
            }
        }

        Ok(SavedProfile::from_metadata(metadata, Some(&profile_id)))
    }

    pub fn set_active_profile(&self, profile_id: String) -> AppResult<SavedProfiles> {
        if !is_valid_profile_id(&profile_id) {
            return Err(AppError::InvalidInput);
        }

        let _guard = config_mutation_guard()?;
        let mut config = self.config_store.read()?;
        if !config
            .profiles
            .iter()
            .any(|profile| profile.profile_id == profile_id)
        {
            return Err(AppError::InvalidInput);
        }

        config.active_profile_id = Some(profile_id);
        self.config_store.write(&config)?;
        Ok(saved_profiles(config))
    }

    pub fn delete_profile(&self, profile_id: String) -> AppResult<SavedProfiles> {
        if !is_valid_profile_id(&profile_id) {
            return Err(AppError::InvalidInput);
        }

        let _guard = config_mutation_guard()?;
        let current_config = self.config_store.read()?;
        let deleted_secret_ref = current_config
            .profiles
            .iter()
            .find(|profile| profile.profile_id == profile_id)
            .map(|profile| profile.token_secret_ref.clone());
        let mut remaining_profiles: Vec<CloudflareProfileMetadata> = current_config
            .profiles
            .into_iter()
            .filter(|profile| profile.profile_id != profile_id)
            .collect();

        if deleted_secret_ref.is_none() {
            return Err(AppError::InvalidInput);
        }

        let active_profile_id = match current_config.active_profile_id.as_deref() {
            Some(active_id) if active_id != profile_id => current_config.active_profile_id,
            _ => remaining_profiles
                .first()
                .map(|profile| profile.profile_id.clone()),
        };
        let remaining_routes = current_config
            .routes
            .into_iter()
            .filter(|route| route.profile_id != profile_id)
            .collect();
        let next_config = AppConfig {
            profiles: std::mem::take(&mut remaining_profiles),
            active_profile_id,
            routes: remaining_routes,
        };

        self.config_store.write(&next_config)?;

        if let Some(secret_ref) = deleted_secret_ref {
            let _ = self.secret_store.delete(&secret_ref);
        }

        Ok(saved_profiles(next_config))
    }
}

fn upsert_profile(config: AppConfig, metadata: CloudflareProfileMetadata) -> AppConfig {
    let profile_id = metadata.profile_id.clone();
    let mut replaced = false;
    let mut profiles: Vec<CloudflareProfileMetadata> = config
        .profiles
        .into_iter()
        .map(|profile| {
            if profile.profile_id == profile_id {
                replaced = true;
                metadata.clone()
            } else {
                profile
            }
        })
        .collect();

    if !replaced {
        profiles.push(metadata);
    }

    AppConfig {
        profiles,
        active_profile_id: Some(profile_id),
        routes: config.routes,
    }
}

fn saved_profiles(config: AppConfig) -> SavedProfiles {
    let active_profile_id = config.active_profile_id.as_deref();
    SavedProfiles {
        profiles: config
            .profiles
            .into_iter()
            .map(|profile| SavedProfile::from_metadata(profile, active_profile_id))
            .collect(),
    }
}

fn candidate_secret_ref(profile_id: &str) -> String {
    format!(
        "{SECRET_REF_PREFIX}/{profile_id}/candidate-{}",
        uuid::Uuid::new_v4()
    )
}
