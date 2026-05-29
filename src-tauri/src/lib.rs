pub mod cloudflare;
pub mod commands;
pub mod domain;
pub mod error;
pub mod services;
pub mod store;

pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::health::health_check,
            commands::profile::get_profile,
            commands::profile::get_profiles,
            commands::profile::validate_and_save_profile,
            commands::profile::set_active_profile,
            commands::profile::delete_profile,
            commands::route::get_routes,
            commands::route::add_route,
            commands::route::update_route,
            commands::route::delete_route,
        ])
        .run(tauri::generate_context!())
}
