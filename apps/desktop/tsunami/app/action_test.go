// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"encoding/json"
	"testing"

	"github.com/recoder/recoder-terminal/tsunami/engine"
)

func TestRegisterActionDelegatesToClient(t *testing.T) {
	RegisterActionWithMeta("app_test_double", &ActionMeta{Desc: "doubles the n arg"},
		func(args json.RawMessage) (any, error) {
			var p struct {
				N int `json:"n"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return nil, err
			}
			return p.N * 2, nil
		})

	client := engine.GetDefaultClient()

	got, err := client.InvokeAction("app_test_double", json.RawMessage(`{"n":21}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 42 {
		t.Fatalf("got %v, want 42", got)
	}

	var found bool
	var desc string
	for _, m := range client.GetActionMetas() {
		if m.Name == "app_test_double" {
			found = true
			desc = m.Description
		}
	}
	if !found {
		t.Fatalf("registered action not present in discovery metas")
	}
	if desc != "doubles the n arg" {
		t.Fatalf("expected description to propagate, got %q", desc)
	}
}
