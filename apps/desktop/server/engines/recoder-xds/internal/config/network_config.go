// Package config defines the NetworkConfig — the Recoder network subsystem's
// input from which a real Envoy data-plane configuration is derived.
//
// This struct mirrors the TypeScript NetworkConfig in
// docker-backend/src/network/types.ts. The TS side GENERATES a static Envoy
// bootstrap (served at GET /api/network/envoy-config). This Go control plane
// consumes the SAME config shape and serves the DYNAMIC equivalent over the xDS
// gRPC API (LDS/CDS/RDS via ADS) so a running Envoy gets live updates.
//
// Hostile-by-default: ext_authz fails closed unless explicitly overridden.
package config

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Upstream is a single service the Envoy data plane can route to. Mirrors
// NetworkUpstream in the TS types.
type Upstream struct {
	// Name is the Envoy cluster name (also the route target).
	Name string `json:"name"`
	// Host is the upstream host (docker service name or DNS name).
	Host string `json:"host"`
	// Port is the upstream port.
	Port uint32 `json:"port"`
	// HostHeader is an optional host header / SNI to present (defaults to Host).
	HostHeader string `json:"hostHeader,omitempty"`
	// TLSUpstream, when true, makes Envoy speak TLS to the upstream.
	TLSUpstream bool `json:"tlsUpstream,omitempty"`
}

// TLS holds the downstream (client-facing) HTTPS listener material. Mirrors
// NetworkTls. Paths are container paths inside the Envoy container.
type TLS struct {
	CertPath string `json:"certPath"`
	KeyPath  string `json:"keyPath"`
	// ClientCAPath, when set, requires + verifies client certs (mTLS).
	ClientCAPath string `json:"clientCaPath,omitempty"`
	// MinVersion is "TLSv1_2" or "TLSv1_3". Defaults to TLSv1_2.
	MinVersion string `json:"minVersion,omitempty"`
}

// ExtAuthz is the ext_authz target: where the data plane asks "allow or deny?".
// Mirrors the TS extAuthz block.
type ExtAuthz struct {
	Cluster   string `json:"cluster"`
	Host      string `json:"host"`
	Port      uint32 `json:"port"`
	Path      string `json:"path"`
	TimeoutMS int    `json:"timeoutMs"`
	// FailureModeAllow: when false (default), unreachable authz DENIES. Never
	// set true in production.
	FailureModeAllow bool `json:"failureModeAllow,omitempty"`
}

// RateLimit is the listener-local token-bucket rate limit. Mirrors NetworkRateLimit.
type RateLimit struct {
	MaxTokens      uint32 `json:"maxTokens"`
	TokensPerFill  uint32 `json:"tokensPerFill"`
	FillIntervalMS int    `json:"fillIntervalMs"`
}

// AccessLog is where Envoy writes its JSON access log (the XDR feed).
type AccessLog struct {
	Path string `json:"path"`
}

// NetworkConfig is the full control-plane input. Field shapes mirror the TS
// NetworkConfig so a JSON document produced by either side round-trips.
type NetworkConfig struct {
	AdminAddress  string     `json:"adminAddress"`
	AdminPort     uint32     `json:"adminPort"`
	ListenAddress string     `json:"listenAddress"`
	ListenPort    uint32     `json:"listenPort"`
	TLS           TLS        `json:"tls"`
	Upstreams     []Upstream `json:"upstreams"`
	ExtAuthz      ExtAuthz   `json:"extAuthz"`
	RateLimit     RateLimit  `json:"rateLimit"`
	AccessLog     AccessLog  `json:"accessLog"`
}

// Validate enforces the load-bearing invariants. Fail fast at the boundary.
func (c *NetworkConfig) Validate() error {
	if c.ListenAddress == "" || c.ListenPort == 0 {
		return fmt.Errorf("network config: listen address/port required")
	}
	if c.ExtAuthz.Cluster == "" || c.ExtAuthz.Host == "" || c.ExtAuthz.Port == 0 {
		return fmt.Errorf("network config: ext_authz cluster/host/port required")
	}
	if c.ExtAuthz.Path == "" {
		return fmt.Errorf("network config: ext_authz path required")
	}
	if len(c.Upstreams) == 0 {
		return fmt.Errorf("network config: at least one upstream required")
	}
	seen := make(map[string]struct{}, len(c.Upstreams))
	for i, u := range c.Upstreams {
		if u.Name == "" || u.Host == "" || u.Port == 0 {
			return fmt.Errorf("network config: upstream[%d] name/host/port required", i)
		}
		if _, dup := seen[u.Name]; dup {
			return fmt.Errorf("network config: duplicate upstream cluster name %q", u.Name)
		}
		seen[u.Name] = struct{}{}
	}
	if _, dup := seen[c.ExtAuthz.Cluster]; dup {
		return fmt.Errorf("network config: ext_authz cluster name %q collides with an upstream", c.ExtAuthz.Cluster)
	}
	if c.TLS.MinVersion != "" && c.TLS.MinVersion != "TLSv1_2" && c.TLS.MinVersion != "TLSv1_3" {
		return fmt.Errorf("network config: invalid TLS minVersion %q", c.TLS.MinVersion)
	}
	return nil
}

// Default returns the production-shaped NetworkConfig for the recoder service
// mesh. Hosts/ports match the documented surfaces; env overrides let deploys
// point at real material without code edits. Mirrors defaultNetworkConfig() in
// envoy-config.ts.
func Default(getenv func(string) string) NetworkConfig {
	if getenv == nil {
		getenv = os.Getenv
	}
	authzHost := envStr(getenv, "NETWORK_AUTHZ_HOST", "docker-backend")
	authzPort := envU32(getenv, "NETWORK_AUTHZ_PORT", 3100)

	return NetworkConfig{
		AdminAddress:  "127.0.0.1",
		AdminPort:     envU32(getenv, "ENVOY_ADMIN_PORT", 9901),
		ListenAddress: "0.0.0.0",
		ListenPort:    envU32(getenv, "ENVOY_LISTEN_PORT", 8443),
		TLS: TLS{
			CertPath:     envStr(getenv, "ENVOY_TLS_CERT", "/etc/envoy/certs/server.crt"),
			KeyPath:      envStr(getenv, "ENVOY_TLS_KEY", "/etc/envoy/certs/server.key"),
			ClientCAPath: getenv("ENVOY_MTLS_CA"), // optional: enables mTLS when present
			MinVersion:   "TLSv1_2",
		},
		Upstreams: []Upstream{
			{Name: "docker-backend", Host: envStr(getenv, "SVC_DOCKER_BACKEND_HOST", "docker-backend"), Port: 3100},
			{Name: "recoder-app", Host: envStr(getenv, "SVC_RECODER_APP_HOST", "recoder-app"), Port: 3000},
			{Name: "recoder-agents", Host: envStr(getenv, "SVC_RECODER_AGENTS_HOST", "recoder-agents"), Port: 3001},
			{Name: "recoder-pm", Host: envStr(getenv, "SVC_RECODER_PM_HOST", "recoder-pm"), Port: 8000},
			{Name: "recoder-agency", Host: envStr(getenv, "SVC_RECODER_AGENCY_HOST", "recoder-agency"), Port: 3002},
		},
		ExtAuthz: ExtAuthz{
			Cluster:          "recoder_ext_authz",
			Host:             authzHost,
			Port:             authzPort,
			Path:             "/internal/network/authz",
			TimeoutMS:        envInt(getenv, "NETWORK_AUTHZ_TIMEOUT_MS", 500),
			FailureModeAllow: false, // hostile-by-default: fail closed
		},
		RateLimit: RateLimit{
			MaxTokens:      envU32(getenv, "NETWORK_RL_MAX_TOKENS", 200),
			TokensPerFill:  envU32(getenv, "NETWORK_RL_TOKENS_PER_FILL", 200),
			FillIntervalMS: envInt(getenv, "NETWORK_RL_FILL_INTERVAL_MS", 1000),
		},
		AccessLog: AccessLog{
			Path: envStr(getenv, "ENVOY_ACCESS_LOG", "/var/log/envoy/access.json.log"),
		},
	}
}

// LoadFromFile reads a NetworkConfig JSON document from disk and validates it.
func LoadFromFile(path string) (NetworkConfig, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return NetworkConfig{}, fmt.Errorf("read config file %q: %w", path, err)
	}
	return parse(raw)
}

// LoadFromBackend fetches the static Envoy bootstrap source from the
// docker-backend network endpoint and decodes a NetworkConfig from it.
//
// The TS endpoint GET /api/network/envoy-config can return either:
//   - the generated Envoy bootstrap (when ?format=... is set), or
//   - the source NetworkConfig.
//
// We only consume the NetworkConfig shape here, so callers should point this at
// an endpoint that returns the config (e.g. /api/network/config). If the body
// is a bootstrap, parsing fails fast rather than guessing — honest failure.
func LoadFromBackend(client *http.Client, url string) (NetworkConfig, error) {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	resp, err := client.Get(url)
	if err != nil {
		return NetworkConfig{}, fmt.Errorf("fetch network config from %q: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return NetworkConfig{}, fmt.Errorf("fetch network config from %q: status %d", url, resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return NetworkConfig{}, fmt.Errorf("read network config body: %w", err)
	}
	return parse(raw)
}

func parse(raw []byte) (NetworkConfig, error) {
	var cfg NetworkConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return NetworkConfig{}, fmt.Errorf("decode network config JSON: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return NetworkConfig{}, err
	}
	return cfg, nil
}

func envStr(getenv func(string) string, key, def string) string {
	if v := getenv(key); v != "" {
		return v
	}
	return def
}

func envU32(getenv func(string) string, key string, def uint32) uint32 {
	if v := getenv(key); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil {
			return uint32(n)
		}
	}
	return def
}

func envInt(getenv func(string) string, key string, def int) int {
	if v := getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
