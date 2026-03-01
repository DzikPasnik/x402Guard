//! Nonce deduplication backed by Redis.
//!
//! Prevents replay attacks by ensuring each EIP-3009 nonce is used at most once
//! within the payment's validity window.

/// Redis-backed nonce store for replay prevention.
#[derive(Clone)]
pub struct NonceStore {
    client: redis::Client,
}

impl NonceStore {
    pub fn new(client: redis::Client) -> Self {
        Self { client }
    }

    /// Check if a nonce has been seen before and store it if not.
    ///
    /// Uses `SET key 1 NX EX ttl` — atomic check-and-set.
    /// Returns `Ok(true)` if the nonce is new (allowed).
    /// Returns `Ok(false)` if the nonce was already used (replay).
    pub async fn check_and_store(&self, nonce_hex: &str, ttl_secs: u64) -> anyhow::Result<bool> {
        let key = format!("x402:nonce:{nonce_hex}");
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;

        // SET key 1 NX EX ttl — returns true if key was set (nonce is new)
        let was_set: bool = redis::cmd("SET")
            .arg(&key)
            .arg(1)
            .arg("NX")
            .arg("EX")
            .arg(ttl_secs)
            .query_async(&mut conn)
            .await
            .unwrap_or(false);

        Ok(was_set)
    }
}

/// Key prefix used for nonce storage in Redis.
#[allow(dead_code)]
pub const NONCE_KEY_PREFIX: &str = "x402:nonce:";
