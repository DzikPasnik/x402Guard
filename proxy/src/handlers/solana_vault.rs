//! Solana vault status API endpoint.
//!
//! Provides read-only vault state queries via the Solana JSON-RPC.
//! The proxy is non-custodial — it only reads on-chain state, never
//! submits transactions or holds keypairs.

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::error::AppError;
use crate::models::audit_event::{AuditEvent, AuditEventType};
use crate::services::solana_rpc;
use crate::state::AppState;

/// Response shape for `GET /api/v1/solana/vault/:owner_pubkey`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusResponse {
    pub owner: String,
    pub agent: String,
    pub is_active: bool,
    pub max_spend_per_tx: u64,
    pub max_spend_per_day: u64,
    pub spent_today: u64,
    pub usdc_balance: Option<u64>,
    pub agent_expires_at: i64,
    pub allowed_programs: Vec<String>,
}

/// Query vault status from Solana.
///
/// `GET /api/v1/solana/vault/:owner_pubkey`
///
/// Derives the vault PDA from the owner pubkey + program ID, fetches account
/// data via Solana RPC, deserializes VaultState, and fetches the vault's
/// USDC balance via the ATA.
///
/// SECURITY:
/// - Fail-closed: any RPC or deserialization error returns 502
/// - Owner pubkey validated as base58 before use
/// - RPC URL validated at config load time (HTTPS for mainnet)
async fn get_vault_status(
    State(state): State<AppState>,
    Path(owner_pubkey): Path<String>,
) -> Result<Json<VaultStatusResponse>, AppError> {
    // Validate Solana config is present
    let rpc_url = state
        .config
        .solana_rpc_url
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Solana support not configured".into()))?;
    let program_id_b58 = state
        .config
        .solana_program_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Solana program ID not configured".into()))?;
    let usdc_mint_b58 = state
        .config
        .solana_usdc_mint
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Solana USDC mint not configured".into()))?;

    // Validate owner pubkey
    let owner_bytes = solana_rpc::decode_pubkey(&owner_pubkey).map_err(|e| {
        AppError::BadRequest(format!("invalid owner pubkey: {}", e))
    })?;

    // Decode program ID and USDC mint
    let program_id_bytes = solana_rpc::decode_pubkey(program_id_b58).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("invalid configured program ID: {}", e))
    })?;
    let usdc_mint_bytes = solana_rpc::decode_pubkey(usdc_mint_b58).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("invalid configured USDC mint: {}", e))
    })?;

    // Derive vault PDA
    let (vault_pda, _bump) =
        solana_rpc::derive_vault_pda(&owner_bytes, &program_id_bytes).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("PDA derivation failed: {}", e))
        })?;

    let vault_pda_b58 = solana_rpc::encode_pubkey(&vault_pda);

    tracing::info!(
        owner = %owner_pubkey,
        vault_pda = %vault_pda_b58,
        "querying Solana vault status"
    );

    // Fetch vault account data from Solana RPC
    // SECURITY: Fail-closed — RPC errors reject the request
    let account_data = solana_rpc::get_account_info(
        &state.http_client,
        rpc_url,
        &vault_pda_b58,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Solana RPC getAccountInfo failed");
        AppError::Internal(anyhow::anyhow!("Solana RPC error: {}", e))
    })?;

    let raw_data = account_data.ok_or_else(|| {
        AppError::NotFound(format!("vault not found for owner {}", owner_pubkey))
    })?;

    // Deserialize VaultState from raw account bytes
    let vault = solana_rpc::VaultState::from_account_data(&raw_data).map_err(|e| {
        tracing::error!(error = %e, data_len = raw_data.len(), "VaultState deserialization failed");
        AppError::Internal(anyhow::anyhow!("failed to deserialize vault state: {}", e))
    })?;

    // Derive vault's USDC ATA and fetch balance
    let vault_ata = solana_rpc::derive_ata(&vault_pda, &usdc_mint_bytes).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("ATA derivation failed: {}", e))
    })?;
    let vault_ata_b58 = solana_rpc::encode_pubkey(&vault_ata);

    // Token balance is best-effort — vault may not have a token account yet
    let usdc_balance = match solana_rpc::get_token_account_balance(
        &state.http_client,
        rpc_url,
        &vault_ata_b58,
    )
    .await
    {
        Ok(balance) => Some(balance),
        Err(e) => {
            tracing::warn!(error = %e, "failed to fetch vault USDC balance — may not exist yet");
            None
        }
    };

    // Convert allowed_programs to base58 strings
    let allowed_programs: Vec<String> = vault
        .allowed_programs
        .iter()
        .map(solana_rpc::encode_pubkey)
        .collect();

    // AUDIT: SolanaVaultQueried
    state.audit.emit(AuditEvent {
        agent_id: None,
        session_key_id: None,
        event_type: AuditEventType::SolanaVaultQueried,
        metadata: serde_json::json!({
            "owner": owner_pubkey,
            "vault_pda": vault_pda_b58,
            "is_active": vault.is_active,
        }),
    });

    Ok(Json(VaultStatusResponse {
        owner: solana_rpc::encode_pubkey(&vault.owner),
        agent: solana_rpc::encode_pubkey(&vault.agent),
        is_active: vault.is_active,
        max_spend_per_tx: vault.max_spend_per_tx,
        max_spend_per_day: vault.max_spend_per_day,
        spent_today: vault.spent_today,
        usdc_balance,
        agent_expires_at: vault.agent_expires_at,
        allowed_programs,
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/solana/vault/{owner_pubkey}", get(get_vault_status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_status_response_serializes() {
        let response = VaultStatusResponse {
            owner: "11111111111111111111111111111111".into(),
            agent: "22222222222222222222222222222222".into(),
            is_active: true,
            max_spend_per_tx: 1_000_000,
            max_spend_per_day: 10_000_000,
            spent_today: 500_000,
            usdc_balance: Some(5_000_000),
            agent_expires_at: 1_800_000_000,
            allowed_programs: vec!["33333333333333333333333333333333".into()],
        };

        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["isActive"], true);
        assert_eq!(json["maxSpendPerTx"], 1_000_000);
        assert_eq!(json["maxSpendPerDay"], 10_000_000);
        assert_eq!(json["spentToday"], 500_000);
        assert_eq!(json["usdcBalance"], 5_000_000);
        assert_eq!(json["agentExpiresAt"], 1_800_000_000);
        assert_eq!(json["allowedPrograms"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn vault_status_response_null_balance() {
        let response = VaultStatusResponse {
            owner: "11111111111111111111111111111111".into(),
            agent: "22222222222222222222222222222222".into(),
            is_active: false,
            max_spend_per_tx: 0,
            max_spend_per_day: 0,
            spent_today: 0,
            usdc_balance: None,
            agent_expires_at: 0,
            allowed_programs: vec![],
        };

        let json = serde_json::to_value(&response).unwrap();
        assert!(json["usdcBalance"].is_null());
        assert_eq!(json["isActive"], false);
        assert!(json["allowedPrograms"].as_array().unwrap().is_empty());
    }
}
