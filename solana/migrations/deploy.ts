// Anchor migration script for x402-guard program deployment.
// Run via: anchor deploy --provider.cluster devnet

const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider: any) {
  anchor.setProvider(provider);
  // Program is deployed automatically by `anchor deploy`.
  // This script runs any post-deployment setup if needed.
  console.log("x402-guard program deployed successfully.");
};
