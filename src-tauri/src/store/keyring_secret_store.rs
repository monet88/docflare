use keyring::Entry;

use crate::error::{AppError, AppResult};
use crate::store::secret_store::SecretStore;

const SERVICE_NAME: &str = "docflare";

pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn put(&self, secret_ref: &str, value: &str) -> AppResult<()> {
        let entry =
            Entry::new(SERVICE_NAME, secret_ref).map_err(|_| AppError::SecretStoreUnavailable)?;
        entry
            .set_password(value)
            .map_err(|_| AppError::SecretStoreUnavailable)
    }

    fn delete(&self, secret_ref: &str) -> AppResult<()> {
        let entry =
            Entry::new(SERVICE_NAME, secret_ref).map_err(|_| AppError::SecretStoreUnavailable)?;
        entry
            .delete_credential()
            .map_err(|_| AppError::SecretStoreUnavailable)
    }
}
