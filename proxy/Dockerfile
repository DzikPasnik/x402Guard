# =============================================================================
# x402Guard Proxy — Production Multi-Stage Dockerfile
# Optimized for Railway / any container platform
# =============================================================================

# --- Stage 1: Build dependencies (cached layer) ---
FROM rust:1.85-slim AS deps
WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy workspace manifests only (for dependency caching)
COPY Cargo.toml Cargo.lock ./
COPY proxy/Cargo.toml proxy/Cargo.toml

# Create dummy source to build dependencies
RUN mkdir -p proxy/src && echo "fn main() {}" > proxy/src/main.rs
RUN cargo build --release --package x402-guard-proxy 2>/dev/null || true
RUN rm -rf proxy/src

# --- Stage 2: Build application ---
FROM deps AS builder

COPY proxy/src proxy/src
COPY proxy/migrations proxy/migrations
RUN touch proxy/src/main.rs && \
    cargo build --release --package x402-guard-proxy

# --- Stage 3: Minimal runtime ---
FROM debian:bookworm-slim AS runtime

# Security: run as non-root
RUN groupadd -r x402 && useradd -r -g x402 -s /sbin/nologin x402

# Only ca-certificates for HTTPS calls
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/x402-guard-proxy /usr/local/bin/x402-guard-proxy

# Security: non-root user
USER x402

# Production defaults
ENV RUST_LOG=warn \
    PROXY_HOST=0.0.0.0 \
    PROXY_PORT=3402

EXPOSE 3402

# Health check for orchestrators (Railway uses /api/v1/health via railway.json)
HEALTHCHECK NONE

CMD ["x402-guard-proxy"]
