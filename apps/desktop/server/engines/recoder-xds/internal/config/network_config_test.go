package config

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultIsValid(t *testing.T) {
	cfg := Default(func(string) string { return "" })
	if err := cfg.Validate(); err != nil {
		t.Fatalf("default config invalid: %v", err)
	}
	if len(cfg.Upstreams) != 5 {
		t.Errorf("default upstreams = %d, want 5", len(cfg.Upstreams))
	}
	if cfg.ExtAuthz.FailureModeAllow {
		t.Errorf("default ext_authz must be fail-closed")
	}
}

func TestDefaultEnvOverride(t *testing.T) {
	env := map[string]string{
		"ENVOY_LISTEN_PORT":     "9443",
		"NETWORK_AUTHZ_HOST":    "authz.internal",
		"NETWORK_AUTHZ_PORT":    "4000",
		"NETWORK_RL_MAX_TOKENS": "50",
		"SVC_RECODER_APP_HOST":  "app.internal",
		"ENVOY_MTLS_CA":         "/ca.pem",
	}
	cfg := Default(func(k string) string { return env[k] })
	if cfg.ListenPort != 9443 {
		t.Errorf("listen port = %d, want 9443", cfg.ListenPort)
	}
	if cfg.ExtAuthz.Host != "authz.internal" || cfg.ExtAuthz.Port != 4000 {
		t.Errorf("ext_authz = %s:%d, want authz.internal:4000", cfg.ExtAuthz.Host, cfg.ExtAuthz.Port)
	}
	if cfg.RateLimit.MaxTokens != 50 {
		t.Errorf("rate limit max tokens = %d, want 50", cfg.RateLimit.MaxTokens)
	}
	if cfg.TLS.ClientCAPath != "/ca.pem" {
		t.Errorf("mTLS CA = %q, want /ca.pem", cfg.TLS.ClientCAPath)
	}
}

func TestValidateRejectsBadConfig(t *testing.T) {
	cases := map[string]func(*NetworkConfig){
		"no upstreams":       func(c *NetworkConfig) { c.Upstreams = nil },
		"no listen port":     func(c *NetworkConfig) { c.ListenPort = 0 },
		"no authz path":      func(c *NetworkConfig) { c.ExtAuthz.Path = "" },
		"bad tls version":    func(c *NetworkConfig) { c.TLS.MinVersion = "SSLv3" },
		"dup upstream":       func(c *NetworkConfig) { c.Upstreams[1].Name = c.Upstreams[0].Name },
		"authz name collide": func(c *NetworkConfig) { c.ExtAuthz.Cluster = c.Upstreams[0].Name },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			cfg := Default(func(string) string { return "" })
			mutate(&cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatalf("expected validation error for %q", name)
			}
		})
	}
}

func TestLoadFromFileRoundTrip(t *testing.T) {
	cfg := Default(func(string) string { return "" })
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	path := filepath.Join(t.TempDir(), "network.json")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	loaded, err := LoadFromFile(path)
	if err != nil {
		t.Fatalf("LoadFromFile: %v", err)
	}
	if loaded.ListenPort != cfg.ListenPort || len(loaded.Upstreams) != len(cfg.Upstreams) {
		t.Errorf("round-trip mismatch: %+v vs %+v", loaded, cfg)
	}
}

func TestLoadFromBackend(t *testing.T) {
	cfg := Default(func(string) string { return "" })
	raw, _ := json.Marshal(cfg)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)
	}))
	defer srv.Close()

	loaded, err := LoadFromBackend(srv.Client(), srv.URL)
	if err != nil {
		t.Fatalf("LoadFromBackend: %v", err)
	}
	if loaded.ExtAuthz.Cluster != cfg.ExtAuthz.Cluster {
		t.Errorf("loaded ext_authz cluster = %q, want %q", loaded.ExtAuthz.Cluster, cfg.ExtAuthz.Cluster)
	}
}

func TestLoadFromBackendRejectsNonOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	if _, err := LoadFromBackend(srv.Client(), srv.URL); err == nil {
		t.Fatalf("expected error on non-200 backend response")
	}
}
