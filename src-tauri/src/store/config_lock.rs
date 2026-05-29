use std::sync::{Mutex, MutexGuard};

use crate::error::{AppError, AppResult};

static CONFIG_MUTATION_LOCK: Mutex<()> = Mutex::new(());

pub fn config_mutation_guard() -> AppResult<MutexGuard<'static, ()>> {
    CONFIG_MUTATION_LOCK
        .lock()
        .map_err(|_| AppError::ConfigWriteFailed)
}
