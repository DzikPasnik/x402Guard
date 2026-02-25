//! EIP-7702 session key verification middleware.
//!
//! Validates that the session key used by an agent:
//! - Is properly delegated via EIP-7702
//! - Has not been revoked
//! - Is within its time and scope limits
//! - Has sufficient remaining allowance
//!
//! Implementation coming in Phase 2.
