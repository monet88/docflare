use docflare_lib::domain::profile::CloudflareProfileMetadata;
use docflare_lib::domain::route::{CreateRouteInput, UpdateRouteInput};
use docflare_lib::services::route_service::RouteService;
use docflare_lib::store::profile_config_store::{AppConfig, ProfileConfigStore};

fn setup() -> (RouteService, ProfileConfigStore, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let config_path = temp_dir.path().join("profile.json");
    let config_store = ProfileConfigStore::new(config_path);

    let config = AppConfig {
        profiles: vec![test_profile("profile-1"), test_profile("profile-2")],
        active_profile_id: Some("profile-1".to_string()),
        routes: vec![],
    };
    config_store.write(&config).unwrap();

    let service = RouteService::new(ProfileConfigStore::new(
        temp_dir.path().join("profile.json"),
    ));
    (service, config_store, temp_dir)
}

fn test_profile(id: &str) -> CloudflareProfileMetadata {
    CloudflareProfileMetadata {
        profile_id: id.to_string(),
        display_name: id.to_string(),
        account_id: "1234567890abcdef1234567890abcdef".to_string(),
        zone_id: "abcdef1234567890abcdef1234567890".to_string(),
        token_secret_ref: format!("ref-{id}"),
        last_validated_at: "2026-05-29T00:00:00Z".to_string(),
    }
}

#[test]
fn add_and_list_routes() {
    let (service, _, _dir) = setup();

    let route = service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    assert_eq!(route.hostname, "app.example.com");
    assert_eq!(route.target, "http://localhost:3000");
    assert_eq!(route.profile_id, "profile-1");

    let routes = service.list_routes("profile-1").unwrap();
    assert_eq!(routes.len(), 1);
    assert_eq!(routes[0].id, route.id);

    let other_routes = service.list_routes("profile-2").unwrap();
    assert!(other_routes.is_empty());
}

#[test]
fn rejects_duplicate_hostname_in_same_profile() {
    let (service, _, _dir) = setup();

    service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    let result = service.add_route(CreateRouteInput {
        profile_id: "profile-1".to_string(),
        hostname: "app.example.com".to_string(),
        target: "http://localhost:4000".to_string(),
    });

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.code(), "DuplicateHostname");
}

#[test]
fn allows_same_hostname_in_different_profiles() {
    let (service, _, _dir) = setup();

    service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    let result = service.add_route(CreateRouteInput {
        profile_id: "profile-2".to_string(),
        hostname: "app.example.com".to_string(),
        target: "http://localhost:4000".to_string(),
    });

    assert!(result.is_ok());
}

#[test]
fn update_route_with_ownership_check() {
    let (service, _, _dir) = setup();

    let route = service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    let updated = service
        .update_route(UpdateRouteInput {
            id: route.id.clone(),
            profile_id: "profile-1".to_string(),
            hostname: "new.example.com".to_string(),
            target: "http://localhost:4000".to_string(),
        })
        .unwrap();

    assert_eq!(updated.hostname, "new.example.com");
    assert_eq!(updated.target, "http://localhost:4000");

    let wrong_profile = service.update_route(UpdateRouteInput {
        id: route.id.clone(),
        profile_id: "profile-2".to_string(),
        hostname: "new.example.com".to_string(),
        target: "http://localhost:5000".to_string(),
    });
    assert!(wrong_profile.is_err());
    assert_eq!(wrong_profile.unwrap_err().code(), "RouteNotFound");
}

#[test]
fn delete_route_with_ownership_check() {
    let (service, _, _dir) = setup();

    let route = service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    let wrong_profile = service.delete_route(&route.id, "profile-2");
    assert!(wrong_profile.is_err());
    assert_eq!(wrong_profile.unwrap_err().code(), "RouteNotFound");

    service.delete_route(&route.id, "profile-1").unwrap();
    let routes = service.list_routes("profile-1").unwrap();
    assert!(routes.is_empty());
}

#[test]
fn enforces_max_100_routes_per_profile() {
    let (service, _, _dir) = setup();

    for i in 0..100 {
        service
            .add_route(CreateRouteInput {
                profile_id: "profile-1".to_string(),
                hostname: format!("app-{i}.example.com"),
                target: "http://localhost:3000".to_string(),
            })
            .unwrap();
    }

    let result = service.add_route(CreateRouteInput {
        profile_id: "profile-1".to_string(),
        hostname: "app-overflow.example.com".to_string(),
        target: "http://localhost:3000".to_string(),
    });

    assert!(result.is_err());
}

#[test]
fn cascade_delete_on_profile_removal() {
    let (service, config_store, _dir) = setup();

    service
        .add_route(CreateRouteInput {
            profile_id: "profile-1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
        })
        .unwrap();

    service
        .add_route(CreateRouteInput {
            profile_id: "profile-2".to_string(),
            hostname: "other.example.com".to_string(),
            target: "http://localhost:4000".to_string(),
        })
        .unwrap();

    let mut config = config_store.read().unwrap();
    config.profiles.retain(|p| p.profile_id != "profile-1");
    config.routes.retain(|r| r.profile_id != "profile-1");
    config_store.write(&config).unwrap();

    let routes = service.list_routes("profile-1").unwrap();
    assert!(routes.is_empty());

    let routes = service.list_routes("profile-2").unwrap();
    assert_eq!(routes.len(), 1);
}

#[test]
fn rejects_invalid_hostname() {
    let (service, _, _dir) = setup();

    let result = service.add_route(CreateRouteInput {
        profile_id: "profile-1".to_string(),
        hostname: "http://bad.com".to_string(),
        target: "http://localhost:3000".to_string(),
    });

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code(), "InvalidHostname");
}

#[test]
fn rejects_invalid_target() {
    let (service, _, _dir) = setup();

    let result = service.add_route(CreateRouteInput {
        profile_id: "profile-1".to_string(),
        hostname: "app.example.com".to_string(),
        target: "ftp://localhost:21".to_string(),
    });

    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code(), "InvalidTarget");
}
