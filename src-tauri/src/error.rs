use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error)]
pub enum AppError {
    #[error("invalid input")]
    InvalidInput,
    #[error("invalid token")]
    InvalidToken,
    #[error("account not accessible")]
    AccountNotAccessible,
    #[error("zone not found or mismatched")]
    ZoneNotFoundOrMismatch,
    #[error("insufficient permissions")]
    InsufficientPermissions { area: &'static str },
    #[error("cloudflare rate limited")]
    CloudflareRateLimited,
    #[error("cloudflare unavailable")]
    CloudflareUnavailable,
    #[error("secret store unavailable")]
    SecretStoreUnavailable,
    #[error("config read failed")]
    ConfigReadFailed,
    #[error("config write failed")]
    ConfigWriteFailed,
    #[error("duplicate hostname")]
    DuplicateHostname,
    #[error("route not found")]
    RouteNotFound,
    #[error("invalid hostname")]
    InvalidHostname,
    #[error("invalid target")]
    InvalidTarget,
}

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UiError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::InvalidInput => "InvalidInput",
            AppError::InvalidToken => "InvalidToken",
            AppError::AccountNotAccessible => "AccountNotAccessible",
            AppError::ZoneNotFoundOrMismatch => "ZoneNotFoundOrMismatch",
            AppError::InsufficientPermissions { .. } => "InsufficientPermissions",
            AppError::CloudflareRateLimited => "CloudflareRateLimited",
            AppError::CloudflareUnavailable => "CloudflareUnavailable",
            AppError::SecretStoreUnavailable => "SecretStoreUnavailable",
            AppError::ConfigReadFailed => "ConfigReadFailed",
            AppError::ConfigWriteFailed => "ConfigWriteFailed",
            AppError::DuplicateHostname => "DuplicateHostname",
            AppError::RouteNotFound => "RouteNotFound",
            AppError::InvalidHostname => "InvalidHostname",
            AppError::InvalidTarget => "InvalidTarget",
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            AppError::InvalidInput => "Enter an API token, account ID, and zone ID.".to_string(),
            AppError::InvalidToken => "Cloudflare rejected this API token.".to_string(),
            AppError::AccountNotAccessible => {
                "This token cannot access the submitted Cloudflare account.".to_string()
            }
            AppError::ZoneNotFoundOrMismatch => {
                "This zone was not found under the submitted account.".to_string()
            }
            AppError::InsufficientPermissions { area } => {
                format!("This token is missing required {area} permissions.")
            }
            AppError::CloudflareRateLimited => {
                "Cloudflare rate limited the validation request. Try again later.".to_string()
            }
            AppError::CloudflareUnavailable => {
                "Cloudflare could not be reached or returned an unusable response.".to_string()
            }
            AppError::SecretStoreUnavailable => {
                "The OS credential store is unavailable.".to_string()
            }
            AppError::ConfigReadFailed => "The local profile config could not be read.".to_string(),
            AppError::ConfigWriteFailed => {
                "The local profile config could not be saved.".to_string()
            }
            AppError::DuplicateHostname => {
                "This hostname is already used by another route in this profile.".to_string()
            }
            AppError::RouteNotFound => "The specified route was not found.".to_string(),
            AppError::InvalidHostname => {
                "Enter a valid hostname (e.g. app.example.com).".to_string()
            }
            AppError::InvalidTarget => {
                "Enter a valid target URL starting with http:// or https://.".to_string()
            }
        }
    }
}

impl From<AppError> for UiError {
    fn from(error: AppError) -> Self {
        Self {
            code: error.code().to_string(),
            message: error.user_message(),
        }
    }
}
