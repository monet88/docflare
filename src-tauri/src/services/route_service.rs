use chrono::Utc;

use crate::domain::route::{
    is_unique_hostname_in_profile, is_valid_hostname, is_valid_target, CreateRouteInput, Route,
    UpdateRouteInput,
};
use crate::error::{AppError, AppResult};
use crate::store::config_lock::config_mutation_guard;
use crate::store::profile_config_store::ProfileConfigStore;

const MAX_ROUTES_PER_PROFILE: usize = 100;

pub struct RouteService {
    config_store: ProfileConfigStore,
}

impl RouteService {
    pub fn new(config_store: ProfileConfigStore) -> Self {
        Self { config_store }
    }

    pub fn list_routes(&self, profile_id: &str) -> AppResult<Vec<Route>> {
        let config = self.config_store.read()?;
        Ok(config
            .routes
            .into_iter()
            .filter(|route| route.profile_id == profile_id)
            .collect())
    }

    pub fn add_route(&self, input: CreateRouteInput) -> AppResult<Route> {
        if !is_valid_hostname(&input.hostname) {
            return Err(AppError::InvalidHostname);
        }
        if !is_valid_target(&input.target) {
            return Err(AppError::InvalidTarget);
        }

        let _guard = config_mutation_guard()?;
        let mut config = self.config_store.read()?;

        if !config
            .profiles
            .iter()
            .any(|p| p.profile_id == input.profile_id)
        {
            return Err(AppError::InvalidInput);
        }

        let profile_route_count = config
            .routes
            .iter()
            .filter(|r| r.profile_id == input.profile_id)
            .count();
        if profile_route_count >= MAX_ROUTES_PER_PROFILE {
            return Err(AppError::InvalidInput);
        }

        if !is_unique_hostname_in_profile(&input.hostname, &input.profile_id, &config.routes, None)
        {
            return Err(AppError::DuplicateHostname);
        }

        let route = Route {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: input.profile_id,
            hostname: input.hostname,
            target: input.target,
            created_at: Utc::now().to_rfc3339(),
        };

        config.routes.push(route.clone());
        self.config_store.write(&config)?;
        Ok(route)
    }

    pub fn update_route(&self, input: UpdateRouteInput) -> AppResult<Route> {
        if !is_valid_hostname(&input.hostname) {
            return Err(AppError::InvalidHostname);
        }
        if !is_valid_target(&input.target) {
            return Err(AppError::InvalidTarget);
        }

        let _guard = config_mutation_guard()?;
        let mut config = self.config_store.read()?;

        let route_idx = config
            .routes
            .iter()
            .position(|r| r.id == input.id && r.profile_id == input.profile_id)
            .ok_or(AppError::RouteNotFound)?;

        if !is_unique_hostname_in_profile(
            &input.hostname,
            &input.profile_id,
            &config.routes,
            Some(&input.id),
        ) {
            return Err(AppError::DuplicateHostname);
        }

        config.routes[route_idx].hostname = input.hostname;
        config.routes[route_idx].target = input.target;

        let updated = config.routes[route_idx].clone();
        self.config_store.write(&config)?;
        Ok(updated)
    }

    pub fn delete_route(&self, route_id: &str, profile_id: &str) -> AppResult<()> {
        let _guard = config_mutation_guard()?;
        let mut config = self.config_store.read()?;

        let route_idx = config
            .routes
            .iter()
            .position(|r| r.id == route_id && r.profile_id == profile_id)
            .ok_or(AppError::RouteNotFound)?;

        config.routes.remove(route_idx);
        self.config_store.write(&config)?;
        Ok(())
    }
}
