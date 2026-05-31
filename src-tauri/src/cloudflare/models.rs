use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CloudflareResponse<T> {
    pub success: bool,
    pub result: Option<T>,
}

#[derive(Debug, Deserialize)]
pub struct TokenVerifyResult {
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AccountResult {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct ZoneResult {
    pub id: String,
    pub account: Option<AccountResult>,
}

#[derive(Debug, Deserialize)]
pub struct ListResult<T> {
    pub result: Option<Vec<T>>,
    pub success: bool,
}
