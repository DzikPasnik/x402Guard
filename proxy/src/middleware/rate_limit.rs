//! Rate limiting middleware backed by Redis sorted-set sliding window.

use anyhow::Context;
use redis::Client;

/// Result of a rate limit check.
#[derive(Debug, Clone)]
pub struct RateLimitResult {
    pub allowed: bool,
    #[allow(dead_code)]
    pub remaining: u32,
    #[allow(dead_code)]
    pub retry_after_secs: Option<u64>,
}

/// Redis-backed sliding window rate limiter.
#[derive(Clone)]
pub struct RateLimiter {
    client: Client,
}

impl RateLimiter {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// Check if a request is allowed under the rate limit.
    ///
    /// Uses a Redis sorted set sliding window:
    /// - ZREMRANGEBYSCORE to evict old entries
    /// - ZADD to add current timestamp with unique member
    /// - ZCARD to count entries in window
    ///
    /// SECURITY: Uses monotonic counter to ensure each request gets a unique
    /// sorted set member, preventing same-millisecond request deduplication bypass.
    pub async fn check(
        &self,
        key: &str,
        max_requests: u32,
        window_secs: u64,
    ) -> anyhow::Result<RateLimitResult> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let redis_key = format!("x402:rate:{key}");
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is before UNIX epoch")
            .as_millis() as f64;

        let window_start = now_ms - (window_secs as f64 * 1000.0);

        // Use timestamp + atomic counter as unique member.
        // Prevents same-millisecond requests from being deduplicated in the sorted set.
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let member = format!("{now_ms}:{counter}");

        // Atomic pipeline: evict old, add new, count, set TTL
        let mut pipe = redis::pipe();
        pipe.atomic()
            .cmd("ZREMRANGEBYSCORE")
            .arg(&redis_key)
            .arg(0.0f64)
            .arg(window_start)
            .ignore()
            .cmd("ZADD")
            .arg(&redis_key)
            .arg(now_ms)
            .arg(&member)
            .ignore()
            .cmd("ZCARD")
            .arg(&redis_key)
            .cmd("EXPIRE")
            .arg(&redis_key)
            .arg(window_secs * 2)
            .ignore();

        let results: Vec<u32> = pipe.query_async(&mut conn).await?;
        let count = results.first().copied().unwrap_or(0);

        if count > max_requests {
            // Over limit — remove the entry we just added
            let _: Result<(), _> = redis::cmd("ZREM")
                .arg(&redis_key)
                .arg(&member)
                .query_async(&mut conn)
                .await;

            Ok(RateLimitResult {
                allowed: false,
                remaining: 0,
                retry_after_secs: Some(1),
            })
        } else {
            Ok(RateLimitResult {
                allowed: true,
                remaining: max_requests.saturating_sub(count),
                retry_after_secs: None,
            })
        }
    }
}

/// Global rate limit configuration (FR-5.3).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct GlobalRateLimitConfig {
    pub requests_per_second: u32,
}

#[allow(dead_code)]
impl GlobalRateLimitConfig {
    pub fn new(requests_per_second: u32) -> Self {
        Self { requests_per_second }
    }
}

/// Create and validate a Redis client from a connection URL.
///
/// Validates connectivity at startup (fail-fast principle).
pub async fn create_redis_client(url: &str) -> anyhow::Result<Client> {
    let client = Client::open(url).context("failed to parse Redis URL")?;

    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .context("failed to connect to Redis")?;

    redis::cmd("PING")
        .query_async::<String>(&mut conn)
        .await
        .context("Redis PING failed")?;

    Ok(client)
}
