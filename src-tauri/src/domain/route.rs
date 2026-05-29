use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub id: String,
    pub profile_id: String,
    pub hostname: String,
    pub target: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRouteInput {
    pub profile_id: String,
    pub hostname: String,
    pub target: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRouteInput {
    pub id: String,
    pub profile_id: String,
    pub hostname: String,
    pub target: String,
}

pub fn is_valid_hostname(value: &str) -> bool {
    if value.is_empty() || value.len() > 253 {
        return false;
    }
    if value.contains("://") {
        return false;
    }
    for label in value.split('.') {
        let len = label.len();
        if len == 0 || len > 63 {
            return false;
        }
        if label.starts_with('-') || label.ends_with('-') {
            return false;
        }
        if !label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return false;
        }
    }
    true
}

pub fn is_valid_target(value: &str) -> bool {
    if value.len() > 2048 {
        return false;
    }
    let stripped = if let Some(rest) = value.strip_prefix("https://") {
        rest
    } else if let Some(rest) = value.strip_prefix("http://") {
        rest
    } else {
        return false;
    };
    !stripped.is_empty()
}

pub fn is_unique_hostname_in_profile(
    hostname: &str,
    profile_id: &str,
    existing_routes: &[Route],
    exclude_route_id: Option<&str>,
) -> bool {
    !existing_routes.iter().any(|route| {
        route.profile_id == profile_id
            && route.hostname.eq_ignore_ascii_case(hostname)
            && exclude_route_id.is_none_or(|id| route.id != id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_hostnames() {
        assert!(is_valid_hostname("app.example.com"));
        assert!(is_valid_hostname("my-app.dev.example.io"));
        assert!(is_valid_hostname("a"));
        assert!(is_valid_hostname("sub1.sub2.example.com"));
    }

    #[test]
    fn rejects_empty_hostname() {
        assert!(!is_valid_hostname(""));
    }

    #[test]
    fn rejects_hostname_with_scheme() {
        assert!(!is_valid_hostname("http://example.com"));
        assert!(!is_valid_hostname("https://example.com"));
    }

    #[test]
    fn rejects_hostname_over_253_chars() {
        let long = format!("{}.example.com", "a".repeat(250));
        assert!(!is_valid_hostname(&long));
    }

    #[test]
    fn rejects_label_over_63_chars() {
        let long_label = format!("{}.example.com", "a".repeat(64));
        assert!(!is_valid_hostname(&long_label));
    }

    #[test]
    fn rejects_leading_trailing_hyphens() {
        assert!(!is_valid_hostname("-example.com"));
        assert!(!is_valid_hostname("example-.com"));
        assert!(!is_valid_hostname("sub.-example.com"));
    }

    #[test]
    fn rejects_invalid_chars_in_hostname() {
        assert!(!is_valid_hostname("app_name.example.com"));
        assert!(!is_valid_hostname("app name.com"));
        assert!(!is_valid_hostname("app@example.com"));
    }

    #[test]
    fn valid_targets() {
        assert!(is_valid_target("http://localhost:3000"));
        assert!(is_valid_target("https://127.0.0.1:8080"));
        assert!(is_valid_target("http://my-service:9000"));
        assert!(is_valid_target("https://example.com"));
    }

    #[test]
    fn rejects_non_http_target() {
        assert!(!is_valid_target("ftp://localhost:21"));
        assert!(!is_valid_target("tcp://localhost:5000"));
        assert!(!is_valid_target("localhost:3000"));
    }

    #[test]
    fn rejects_empty_target_host() {
        assert!(!is_valid_target("http://"));
        assert!(!is_valid_target("https://"));
    }

    #[test]
    fn rejects_target_over_2048_chars() {
        let long = format!("http://localhost/{}", "a".repeat(2040));
        assert!(!is_valid_target(&long));
    }

    #[test]
    fn duplicate_hostname_rejected_in_same_profile() {
        let routes = vec![Route {
            id: "r1".to_string(),
            profile_id: "p1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        assert!(!is_unique_hostname_in_profile(
            "app.example.com",
            "p1",
            &routes,
            None
        ));
        assert!(!is_unique_hostname_in_profile(
            "APP.EXAMPLE.COM",
            "p1",
            &routes,
            None
        ));
    }

    #[test]
    fn same_hostname_allowed_in_different_profile() {
        let routes = vec![Route {
            id: "r1".to_string(),
            profile_id: "p1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        assert!(is_unique_hostname_in_profile(
            "app.example.com",
            "p2",
            &routes,
            None
        ));
    }

    #[test]
    fn duplicate_hostname_allowed_when_excluding_self() {
        let routes = vec![Route {
            id: "r1".to_string(),
            profile_id: "p1".to_string(),
            hostname: "app.example.com".to_string(),
            target: "http://localhost:3000".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        assert!(is_unique_hostname_in_profile(
            "app.example.com",
            "p1",
            &routes,
            Some("r1")
        ));
    }
}
