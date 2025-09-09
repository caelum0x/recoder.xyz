# Rust Code Execution Container
FROM rust:1.70-alpine

# Install security and build tools
RUN apk add --no-cache \
    dumb-init \
    su-exec \
    gcc \
    g++ \
    make \
    musl-dev \
    pkgconfig \
    openssl-dev \
    git

# Create non-root user for security
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install common Rust tools and crates
RUN cargo install --locked \
    cargo-watch \
    cargo-edit \
    cargo-tree \
    rustfmt \
    clippy

# Pre-compile common dependencies to speed up builds
RUN USER=coderunner cargo init --name temp_project /tmp/temp_project && \
    cd /tmp/temp_project && \
    echo 'serde = { version = "1.0", features = ["derive"] }' >> Cargo.toml && \
    echo 'tokio = { version = "1.0", features = ["full"] }' >> Cargo.toml && \
    echo 'reqwest = { version = "0.11", features = ["json"] }' >> Cargo.toml && \
    echo 'clap = { version = "4.0", features = ["derive"] }' >> Cargo.toml && \
    echo 'anyhow = "1.0"' >> Cargo.toml && \
    echo 'thiserror = "1.0"' >> Cargo.toml && \
    cargo build --release && \
    rm -rf /tmp/temp_project

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY execute.rs /execute.rs
COPY runner.sh /runner.sh
RUN chmod +x /entrypoint.sh /runner.sh

# Set Rust environment
ENV RUST_BACKTRACE=1
ENV CARGO_NET_RETRY=3

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
