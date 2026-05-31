use std::time::Duration;

use async_trait::async_trait;
use reqwest::StatusCode;

use crate::cloudflare::models::{CloudflareResponse, ListResult, ZoneResult};
use crate::domain::profile::ValidateAndSaveProfileInput;
use crate::error::{AppError, AppResult};

const CLOUDFLARE_API_BASE: &str = "https://api.cloudflare.com/client/v4";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[async_trait]
pub trait CloudflarePreflight: Send + Sync {
    async fn preflight(&self, input: &ValidateAndSaveProfileInput) -> AppResult<()>;
}

#[derive(Clone)]
pub struct CloudflareClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for CloudflareClient {
    fn default() -> Self {
        Self {
            http: build_http_client(),
            base_url: CLOUDFLARE_API_BASE.to_string(),
        }
    }
}

impl CloudflareClient {
    pub fn new(base_url: String) -> Self {
        Self {
            http: build_http_client(),
            base_url,
        }
    }

    async fn get<T>(&self, token: &str, path: &str, context: ProbeContext) -> AppResult<T>
    where
        T: serde::de::DeserializeOwned,
    {
        let url = format!("{}{}", self.base_url, path);
        let response = self
            .http
            .get(url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| AppError::CloudflareUnavailable)?;

        map_status(response.status(), context)?;
        response
            .json::<T>()
            .await
            .map_err(|_| AppError::CloudflareUnavailable)
    }
}

#[async_trait]
impl CloudflarePreflight for CloudflareClient {
    async fn preflight(&self, input: &ValidateAndSaveProfileInput) -> AppResult<()> {
        if !input.has_valid_resource_ids() {
            return Err(AppError::InvalidInput);
        }

        // /user/tokens/verify returns 401 for cfat_ tokens — skip it.
        // Zone validation also checks that the zone belongs to the
        // submitted account via zone.account.id.
        let zone_path = format!("/zones/{}", input.zone_id);
        let zone = self
            .get::<CloudflareResponse<ZoneResult>>(&input.api_token, &zone_path, ProbeContext::Zone)
            .await?;
        let zone = zone.result.ok_or(AppError::ZoneNotFoundOrMismatch)?;
        if zone.id != input.zone_id
            || zone
                .account
                .map(|account| account.id != input.account_id)
                .unwrap_or(true)
        {
            return Err(AppError::ZoneNotFoundOrMismatch);
        }

        let dns_path = format!("/zones/{}/dns_records?per_page=1", input.zone_id);
        let dns = self
            .get::<ListResult<serde_json::Value>>(&input.api_token, &dns_path, ProbeContext::Dns)
            .await?;
        if !dns.success {
            return Err(AppError::InsufficientPermissions { area: "DNS" });
        }

        let tunnel_path = format!("/accounts/{}/cfd_tunnel?per_page=1", input.account_id);
        let tunnel = self
            .get::<ListResult<serde_json::Value>>(
                &input.api_token,
                &tunnel_path,
                ProbeContext::Tunnel,
            )
            .await?;
        if !tunnel.success {
            return Err(AppError::InsufficientPermissions { area: "tunnel" });
        }

        Ok(())
    }
}

#[derive(Clone, Copy)]
enum ProbeContext {
    Zone,
    Dns,
    Tunnel,
}

fn map_status(status: StatusCode, context: ProbeContext) -> AppResult<()> {
    if status == StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::CloudflareRateLimited);
    }

    if status.is_success() {
        return Ok(());
    }

    match context {
        ProbeContext::Zone
            if status == StatusCode::FORBIDDEN || status == StatusCode::NOT_FOUND =>
        {
            Err(AppError::ZoneNotFoundOrMismatch)
        }
        ProbeContext::Dns if status == StatusCode::FORBIDDEN => {
            Err(AppError::InsufficientPermissions { area: "DNS" })
        }
        ProbeContext::Tunnel if status == StatusCode::FORBIDDEN => {
            Err(AppError::InsufficientPermissions { area: "tunnel" })
        }
        _ => Err(AppError::CloudflareUnavailable),
    }
}

/// Builds an HTTP client with bounded connect/request timeouts so a stalled
/// Cloudflare endpoint surfaces as `CloudflareUnavailable` instead of hanging.
fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_maps_for_every_probe() {
        for context in [ProbeContext::Zone, ProbeContext::Dns, ProbeContext::Tunnel] {
            let result = map_status(StatusCode::TOO_MANY_REQUESTS, context);
            assert!(matches!(result, Err(AppError::CloudflareRateLimited)));
        }
    }

    #[test]
    fn success_status_passes_for_every_probe() {
        for context in [ProbeContext::Zone, ProbeContext::Dns, ProbeContext::Tunnel] {
            assert!(map_status(StatusCode::OK, context).is_ok());
        }
    }

    #[test]
    fn zone_failures_map_to_zone_mismatch() {
        assert!(matches!(
            map_status(StatusCode::FORBIDDEN, ProbeContext::Zone),
            Err(AppError::ZoneNotFoundOrMismatch)
        ));
        assert!(matches!(
            map_status(StatusCode::NOT_FOUND, ProbeContext::Zone),
            Err(AppError::ZoneNotFoundOrMismatch)
        ));
    }

    #[test]
    fn permission_probes_map_to_insufficient_permissions() {
        assert!(matches!(
            map_status(StatusCode::FORBIDDEN, ProbeContext::Dns),
            Err(AppError::InsufficientPermissions { area: "DNS" })
        ));
        assert!(matches!(
            map_status(StatusCode::FORBIDDEN, ProbeContext::Tunnel),
            Err(AppError::InsufficientPermissions { area: "tunnel" })
        ));
    }

    #[test]
    fn unexpected_status_maps_to_unavailable() {
        assert!(matches!(
            map_status(StatusCode::INTERNAL_SERVER_ERROR, ProbeContext::Zone),
            Err(AppError::CloudflareUnavailable)
        ));
        assert!(matches!(
            map_status(StatusCode::BAD_GATEWAY, ProbeContext::Dns),
            Err(AppError::CloudflareUnavailable)
        ));
    }
}
