// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/recoder/recoder-terminal/pkg/blockcontroller"
)

// statusForServer points a runtime status at an httptest server so the tsunami
// read callbacks (which dial http://localhost:<TsunamiPort>) hit the fake app.
func statusForServer(t *testing.T, srv *httptest.Server) *blockcontroller.BlockControllerRuntimeStatus {
	t.Helper()
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil {
		t.Fatalf("parse test server port: %v", err)
	}
	return &blockcontroller.BlockControllerRuntimeStatus{TsunamiPort: port}
}

// TestGetDataCallbackIncludesSchema proves the getdata tool returns the live data
// ALONGSIDE the generated data schema (field semantics) so the agent does not guess
// from bare JSON keys.
func TestGetDataCallbackIncludesSchema(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"remaining": 42}`))
	})
	mux.HandleFunc("/api/schemas", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"config":{},"data":{"remaining":{"type":"number","unit":"seconds"}},"actions":[]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cb := makeTsunamiGetDataCallback(statusForServer(t, srv))
	out, err := cb(nil, nil)
	if err != nil {
		t.Fatalf("callback error: %v", err)
	}

	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", out)
	}
	data, ok := m["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data map, got %T", m["data"])
	}
	if data["remaining"] != float64(42) {
		t.Errorf("expected data.remaining=42, got %v", data["remaining"])
	}
	schema, ok := m["schema"].(map[string]any)
	if !ok {
		t.Fatalf("expected schema map (field semantics), got %T", m["schema"])
	}
	if _, ok := schema["remaining"]; !ok {
		t.Errorf("expected schema to document the 'remaining' field, got %v", schema)
	}
}

// TestGetDataCallbackDegradesWithoutSchema proves the read still succeeds (data only)
// when the schema endpoint is unavailable — semantics are auxiliary, never a gate,
// and the absence is truthful (no fabricated schema key).
func TestGetDataCallbackDegradesWithoutSchema(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"remaining": 7}`))
	})
	mux.HandleFunc("/api/schemas", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cb := makeTsunamiGetDataCallback(statusForServer(t, srv))
	out, err := cb(nil, nil)
	if err != nil {
		t.Fatalf("callback should not fail when schema is unavailable: %v", err)
	}

	m := out.(map[string]any)
	if _, ok := m["data"]; !ok {
		t.Errorf("expected data present even without schema")
	}
	if _, ok := m["schema"]; ok {
		t.Errorf("expected NO schema key when the schema endpoint fails (no fabrication)")
	}
}

// TestGetDataCallbackPropagatesDataError proves an unavailable data endpoint is a
// truthful error, not a partial/faked success.
func TestGetDataCallbackPropagatesDataError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cb := makeTsunamiGetDataCallback(statusForServer(t, srv))
	if _, err := cb(nil, nil); err == nil {
		t.Errorf("expected an error when /api/data is unavailable")
	}
}

// TestGetConfigCallbackReturnsRaw proves the getconfig read path is unchanged (raw
// JSON, no schema wrapper).
func TestGetConfigCallbackReturnsRaw(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"url":"localhost:52848"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cb := makeTsunamiGetCallback(statusForServer(t, srv), "/api/config")
	out, err := cb(nil, nil)
	if err != nil {
		t.Fatalf("callback error: %v", err)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected raw config map, got %T", out)
	}
	if m["url"] != "localhost:52848" {
		t.Errorf("expected raw config passthrough, got %v", m)
	}
}
