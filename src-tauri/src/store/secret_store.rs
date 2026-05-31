use crate::error::AppResult;

pub trait SecretStore: Send + Sync {
    fn put(&self, secret_ref: &str, value: &str) -> AppResult<()>;
    fn delete(&self, secret_ref: &str) -> AppResult<()>;
}
