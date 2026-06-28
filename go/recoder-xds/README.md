# recoder-xds — Envoy xDS control plane

A real Envoy [xDS](https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol)
control plane for the Recoder service mesh, built on the official
[`github.com/envoyproxy/go-control-plane`](https://github.com/envoyproxy/go-control-plane)
library. It serves **dynamic** LDS / CDS / RDS over the ADS gRPC API.

## Why this exists

`docker-backend/src/network` already **generates a static Envoy bootstrap**
(listeners / clusters / ext_authz / access-log) from a `NetworkConfig` and serves
it at `GET /api/network/envoy-config`. That is fine for a one-shot `envoy -c`
boot, but it cannot push live changes.

`recoder-xds` serves the **dynamic equivalent** of that same `NetworkConfig`. A
running Envoy configured with an ADS `dynamic_resources` stanza pointing at this
server receives live listener/cluster/route updates without a restart. The Go
`NetworkConfig` struct mirrors the TypeScript one field-for-field, so a JSON
config produced by either side round-trips.

It is **hostile-by-default**: the HTTP filter chain wires `ext_authz`
(fail-closed) and a local rate limit *before* the router, exactly like the static
generator.

## Layout

```
cmd/recoder-xds/        boot: load config -> build snapshot -> serve ADS + /healthz
internal/config/        NetworkConfig (mirrors docker-backend/src/network/types.ts)
internal/snapshot/      NetworkConfig -> real Envoy v3 protos -> cache.Snapshot
internal/server/        ADS gRPC server over a go-control-plane SnapshotCache
```

## What the snapshot contains

- **Clusters** (CDS): one `STRICT_DNS` cluster per recoder upstream
  (`docker-backend`, `recoder-app`, `recoder-agents`, `recoder-pm`,
  `recoder-agency`) plus the `recoder_ext_authz` cluster.
- **Listener** (LDS): a single HTTPS ingress listener whose filter chain has a
  downstream TLS transport socket (optionally mTLS / require-client-cert) and an
  HTTP Connection Manager.
- **HCM http filters**, in order: `local_ratelimit` → `ext_authz` (fail-closed,
  pointed at the `recoder_ext_authz` cluster over HTTP) → `router`.
- **Route config** (RDS): a catch-all virtual host that path-routes `/<service>/`
  prefixes to each upstream cluster. Delivered dynamically via RDS, not inlined.
- **Access log**: JSON file access log with the exact key set the XDR parser
  (`docker-backend/src/network/xdr`) expects.

## Run

```bash
cd go/recoder-xds
go build ./...

# Env-derived defaults (matches the static generator's defaultNetworkConfig):
./recoder-xds

# From a NetworkConfig JSON file:
./recoder-xds --config-file ./network.json

# Or fetch the config from a backend endpoint that returns a NetworkConfig:
./recoder-xds --config-url http://docker-backend:3100/api/network/config
```

### Flags / env

| Flag            | Env                  | Default     | Meaning                                   |
| --------------- | -------------------- | ----------- | ----------------------------------------- |
| `--xds-addr`    | `XDS_LISTEN_ADDR`    | `:18000`    | xDS gRPC listen address                   |
| `--health-addr` | `XDS_HEALTH_ADDR`    | `:18001`    | HTTP `/healthz` listen address            |
| `--config-file` | `XDS_CONFIG_FILE`    | _(unset)_   | NetworkConfig JSON file                   |
| `--config-url`  | `XDS_CONFIG_URL`     | _(unset)_   | URL returning a NetworkConfig JSON doc    |
| `--log-level`   | `XDS_LOG_LEVEL`      | `info`      | `debug` \| `info` \| `warn` \| `error`    |

The same `SVC_*`, `ENVOY_*`, `NETWORK_*` env vars used by the TS
`defaultNetworkConfig` are honored here.

## Point Envoy at it

Minimal Envoy bootstrap to consume this control plane over ADS:

```yaml
node:
  id: recoder-mesh            # must equal server.NodeID
  cluster: recoder-mesh
dynamic_resources:
  ads_config:
    api_type: GRPC
    transport_api_version: V3
    grpc_services:
      - envoy_grpc: { cluster_name: xds_cluster }
  cds_config: { ads: {}, resource_api_version: V3 }
  lds_config: { ads: {}, resource_api_version: V3 }
static_resources:
  clusters:
    - name: xds_cluster
      type: STRICT_DNS
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config: { http2_protocol_options: {} }
      load_assignment:
        cluster_name: xds_cluster
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address: { socket_address: { address: recoder-xds, port_value: 18000 } }
```

## Verify

```bash
go mod tidy
go build ./...
go vet ./...
go test -race ./...
```

Tests assert the built snapshot is `Consistent()`, has the expected clusters,
has a listener whose HCM carries the `ext_authz` filter (fail-closed, ordered
before the router), and that a real gRPC ADS client streamed the clusters back
from the running server.
