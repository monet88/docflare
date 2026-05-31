use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidateAndSaveProfileInput {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub profile_name: Option<String>,
    pub api_token: String,
    pub account_id: String,
    pub zone_id: String,
}

impl ValidateAndSaveProfileInput {
    pub fn trimmed(&self) -> Self {
        Self {
            profile_id: self
                .profile_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            profile_name: self
                .profile_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            api_token: self.api_token.trim().to_string(),
            account_id: self.account_id.trim().to_string(),
            zone_id: self.zone_id.trim().to_string(),
        }
    }

    pub fn has_required_fields(&self) -> bool {
        !self.api_token.trim().is_empty()
            && !self.account_id.trim().is_empty()
            && !self.zone_id.trim().is_empty()
    }

    pub fn has_valid_resource_ids(&self) -> bool {
        is_cloudflare_id(&self.account_id) && is_cloudflare_id(&self.zone_id)
    }
}

pub fn is_valid_profile_id(value: &str) -> bool {
    let length = value.len();
    (1..=80).contains(&length)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn is_cloudflare_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudflareProfileMetadata {
    pub profile_id: String,
    #[serde(default = "default_display_name")]
    pub display_name: String,
    pub account_id: String,
    pub zone_id: String,
    pub token_secret_ref: String,
    pub last_validated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedProfiles {
    pub profiles: Vec<SavedProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedProfile {
    pub profile_key: String,
    pub profile_id: String,
    pub display_name: String,
    pub account_id: String,
    pub zone_id: String,
    pub token_present: bool,
    pub last_validated_at: String,
    pub is_active: bool,
}

impl SavedProfile {
    pub fn from_metadata(
        metadata: CloudflareProfileMetadata,
        active_profile_id: Option<&str>,
    ) -> Self {
        Self {
            profile_key: metadata.profile_id.clone(),
            profile_id: mask_identifier(&metadata.profile_id),
            display_name: metadata.display_name,
            account_id: mask_identifier(&metadata.account_id),
            zone_id: mask_identifier(&metadata.zone_id),
            token_present: !metadata.token_secret_ref.is_empty(),
            last_validated_at: metadata.last_validated_at,
            is_active: active_profile_id == Some(metadata.profile_id.as_str()),
        }
    }
}

fn default_display_name() -> String {
    "Cloudflare profile".to_string()
}

fn mask_identifier(value: &str) -> String {
    let trimmed = value.trim();
    let length = trimmed.chars().count();
    if length <= 4 {
        return "••••".to_string();
    }

    let prefix_len = std::cmp::min(4, length / 3);
    let suffix_len = std::cmp::min(4, length - prefix_len - 1);
    let prefix: String = trimmed.chars().take(prefix_len).collect();
    let suffix: String = trimmed.chars().skip(length - suffix_len).collect();
    format!("{prefix}…{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_full_cloudflare_identifiers() {
        let metadata = CloudflareProfileMetadata {
            profile_id: "default".to_string(),
            display_name: "Production".to_string(),
            account_id: "1234567890abcdef1234567890abcdef".to_string(),
            zone_id: "abcdef1234567890abcdef1234567890".to_string(),
            token_secret_ref: "ref".to_string(),
            last_validated_at: "2026-05-29T00:00:00Z".to_string(),
        };

        let saved = SavedProfile::from_metadata(metadata, Some("default"));

        assert_eq!(saved.profile_id, "de…ault");
        assert_eq!(saved.display_name, "Production");
        assert_eq!(saved.account_id, "1234…cdef");
        assert_eq!(saved.zone_id, "abcd…7890");
        assert!(saved.token_present);
        assert!(saved.is_active);
    }

    #[test]
    fn masks_short_values_completely() {
        assert_eq!(mask_identifier("ab"), "••••");
        assert_eq!(mask_identifier("abcd"), "••••");
    }

    #[test]
    fn validates_local_profile_ids() {
        assert!(is_valid_profile_id("default"));
        assert!(is_valid_profile_id("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_profile_id("../secret"));
        assert!(!is_valid_profile_id(""));
    }
}
