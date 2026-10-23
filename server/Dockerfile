FROM rust:1.85-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/realmforge-server /usr/local/bin/realmforge-server
ENV PORT=8080
EXPOSE 8080
CMD ["/usr/local/bin/realmforge-server"]
