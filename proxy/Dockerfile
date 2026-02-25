# --- Build stage ---
FROM rust:1.85-slim AS builder
WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock* ./
COPY proxy/Cargo.toml proxy/Cargo.toml
RUN mkdir -p proxy/src && echo "fn main() {}" > proxy/src/main.rs
RUN cargo build --release --package x402-guard-proxy 2>/dev/null || true

# Build actual source
COPY proxy/src proxy/src
RUN touch proxy/src/main.rs && cargo build --release --package x402-guard-proxy

# --- Runtime stage ---
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/x402-guard-proxy /usr/local/bin/x402-guard-proxy

ENV RUST_LOG=info
EXPOSE 3402

CMD ["x402-guard-proxy"]
