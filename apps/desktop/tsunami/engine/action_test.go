// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestInvokeAction(t *testing.T) {
	client := makeClient()
	client.RegisterAction("echo", "echoes the msg arg", func(args json.RawMessage) (any, error) {
		var payload struct {
			Msg string `json:"msg"`
		}
		if err := json.Unmarshal(args, &payload); err != nil {
			return nil, err
		}
		return payload.Msg, nil
	})
	client.RegisterAction("ping", "", func(_ json.RawMessage) (any, error) {
		return "pong", nil
	})
	client.RegisterAction("boom", "", func(_ json.RawMessage) (any, error) {
		return nil, fmt.Errorf("kaboom")
	})

	tests := []struct {
		name         string
		actionName   string
		args         json.RawMessage
		want         any
		wantErr      bool
		wantNotFound bool
	}{
		{name: "known action runs handler", actionName: "echo", args: json.RawMessage(`{"msg":"hi"}`), want: "hi"},
		{name: "no-arg action returns constant", actionName: "ping", args: nil, want: "pong"},
		{name: "handler error is propagated", actionName: "boom", args: nil, wantErr: true},
		{name: "unknown action is not found", actionName: "nope", args: nil, wantErr: true, wantNotFound: true},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			got, err := client.InvokeAction(tt.actionName, tt.args)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (result=%v)", got)
				}
				var notFound *ActionNotFoundError
				isNotFound := errors.As(err, &notFound)
				if tt.wantNotFound && !isNotFound {
					t.Fatalf("expected ActionNotFoundError, got %T: %v", err, err)
				}
				if !tt.wantNotFound && isNotFound {
					t.Fatalf("did not expect ActionNotFoundError, got %v", err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestInvokeActionPanicIsRecovered(t *testing.T) {
	client := makeClient()
	client.RegisterAction("panicky", "", func(_ json.RawMessage) (any, error) {
		panic("handler blew up")
	})

	got, err := client.InvokeAction("panicky", nil)
	if err == nil {
		t.Fatalf("expected error from panicking action, got nil")
	}
	if got != nil {
		t.Fatalf("expected nil result after panic, got %v", got)
	}
}

func TestGetActionMetasSorted(t *testing.T) {
	client := makeClient()
	client.RegisterAction("zebra", "z action", func(_ json.RawMessage) (any, error) { return nil, nil })
	client.RegisterAction("alpha", "a action", func(_ json.RawMessage) (any, error) { return nil, nil })

	metas := client.GetActionMetas()
	if len(metas) != 2 {
		t.Fatalf("expected 2 action metas, got %d", len(metas))
	}
	if metas[0].Name != "alpha" || metas[1].Name != "zebra" {
		t.Fatalf("expected sorted names [alpha zebra], got [%s %s]", metas[0].Name, metas[1].Name)
	}
	if metas[0].Description != "a action" {
		t.Fatalf("expected description 'a action', got %q", metas[0].Description)
	}
}

func TestHandleActionHTTP(t *testing.T) {
	client := makeClient()
	client.RegisterAction("greet", "greets a name", func(args json.RawMessage) (any, error) {
		var p struct {
			Name string `json:"name"`
		}
		_ = json.Unmarshal(args, &p)
		return "hello " + p.Name, nil
	})

	h := newHTTPHandlers(client)
	mux := http.NewServeMux()
	h.registerHandlers(mux, handlerOpts{})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	t.Run("invoke returns result", func(t *testing.T) {
		resp, err := http.Post(srv.URL+"/api/action", "application/json",
			strings.NewReader(`{"name":"greet","args":{"name":"ada"}}`))
		if err != nil {
			t.Fatalf("post failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
		}
		var out struct {
			Name   string `json:"name"`
			Result string `json:"result"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			t.Fatalf("decode failed: %v", err)
		}
		if out.Name != "greet" || out.Result != "hello ada" {
			t.Fatalf("unexpected response: %+v", out)
		}
	})

	t.Run("unknown action returns 404", func(t *testing.T) {
		resp, err := http.Post(srv.URL+"/api/action", "application/json",
			strings.NewReader(`{"name":"does-not-exist"}`))
		if err != nil {
			t.Fatalf("post failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("missing name returns 400", func(t *testing.T) {
		resp, err := http.Post(srv.URL+"/api/action", "application/json",
			strings.NewReader(`{"args":{}}`))
		if err != nil {
			t.Fatalf("post failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("GET is rejected", func(t *testing.T) {
		resp, err := http.Get(srv.URL + "/api/action")
		if err != nil {
			t.Fatalf("get failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("expected 405, got %d", resp.StatusCode)
		}
	})

	t.Run("actions endpoint lists names", func(t *testing.T) {
		resp, err := http.Get(srv.URL + "/api/actions")
		if err != nil {
			t.Fatalf("get failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var metas []ActionMeta
		if err := json.NewDecoder(resp.Body).Decode(&metas); err != nil {
			t.Fatalf("decode failed: %v", err)
		}
		if len(metas) != 1 || metas[0].Name != "greet" || metas[0].Description != "greets a name" {
			t.Fatalf("unexpected actions listing: %+v", metas)
		}
	})

	t.Run("schemas endpoint includes actions", func(t *testing.T) {
		resp, err := http.Get(srv.URL + "/api/schemas")
		if err != nil {
			t.Fatalf("get failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var out struct {
			Actions []ActionMeta `json:"actions"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			t.Fatalf("decode failed: %v", err)
		}
		if len(out.Actions) != 1 || out.Actions[0].Name != "greet" {
			t.Fatalf("expected schemas.actions to list greet, got %+v", out.Actions)
		}
	})
}

func TestActionsRaceSafe(t *testing.T) {
	client := makeClient()

	const n = 50
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			name := fmt.Sprintf("action-%d", i)
			client.RegisterAction(name, "", func(_ json.RawMessage) (any, error) {
				return name, nil
			})
		}()
	}
	wg.Wait()

	var wg2 sync.WaitGroup
	for i := 0; i < n; i++ {
		i := i
		wg2.Add(1)
		go func() {
			defer wg2.Done()
			name := fmt.Sprintf("action-%d", i)
			got, err := client.InvokeAction(name, nil)
			if err != nil {
				t.Errorf("action %s: unexpected error %v", name, err)
				return
			}
			if got != name {
				t.Errorf("action %s: got %v", name, got)
			}
			_ = client.GetActionMetas()
		}()
	}
	wg2.Wait()

	if metas := client.GetActionMetas(); len(metas) != n {
		t.Fatalf("expected %d actions, got %d", n, len(metas))
	}
}
