use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, AppResult};
use crate::store::secret_store::SecretStore;

#[derive(Clone, Default)]
pub struct FakeSecretStore {
    values: Arc<Mutex<HashMap<String, String>>>,
    fail_put: Arc<Mutex<bool>>,
}

impl FakeSecretStore {
    pub fn contains(&self, secret_ref: &str) -> bool {
        self.values
            .lock()
            .expect("secret store lock")
            .contains_key(secret_ref)
    }

    pub fn len(&self) -> usize {
        self.values.lock().expect("secret store lock").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn fail_puts(&self) {
        *self.fail_put.lock().expect("secret store lock") = true;
    }
}

impl SecretStore for FakeSecretStore {
    fn put(&self, secret_ref: &str, value: &str) -> AppResult<()> {
        if *self.fail_put.lock().expect("secret store lock") {
            return Err(AppError::SecretStoreUnavailable);
        }

        self.values
            .lock()
            .expect("secret store lock")
            .insert(secret_ref.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, secret_ref: &str) -> AppResult<()> {
        self.values
            .lock()
            .expect("secret store lock")
            .remove(secret_ref);
        Ok(())
    }
}
