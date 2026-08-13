// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"testing"
)

func TestRecoderIsKnownServer(t *testing.T) {
	tests := []struct {
		name     string
		serverId string
		want     bool
	}{
		{"known retrieval", "recoder.retrieval", true},
		{"known coordination", "recoder.coordination", true},
		{"known pal-plan", "recoder.pal-plan", true},
		{"known memory", "recoder.memory", true},
		{"known beads", "recoder.beads", true},
		{"known repo", "recoder.repo", true},
		{"known approvals", "recoder.approvals", true},
		{"known artifacts", "recoder.artifacts", true},
		{"known github", "recoder.github", true},
		{"known browser", "recoder.browser", true},
		{"known browser-use", "recoder.browser-use", true},
		{"known preview", "recoder.preview", true},
		{"known deploy", "recoder.deploy", true},
		{"known billing", "recoder.billing", true},
		{"known workflow", "recoder.workflow", true},
		{"unknown empty", "", false},
		{"unknown arbitrary", "recoder.notaserver", false},
		{"unknown prefix only", "recoder.", false},
		{"unknown no prefix", "retrieval", false},
		{"unknown mixed case", "Recoder.retrieval", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := recoderIsKnownServer(tt.serverId)
			if got != tt.want {
				t.Errorf("recoderIsKnownServer(%q) = %v, want %v", tt.serverId, got, tt.want)
			}
		})
	}
}

func TestRecoderParseJSONArgs(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantNil bool
		wantErr bool
		wantKey string
		wantVal interface{}
	}{
		{
			name:    "empty string returns nil",
			input:   "",
			wantNil: true,
		},
		{
			name:    "whitespace-only returns nil",
			input:   "   \t\n  ",
			wantNil: true,
		},
		{
			name:    "null literal returns nil",
			input:   "null",
			wantNil: true,
		},
		{
			name:    "null with surrounding whitespace returns nil",
			input:   "  null  ",
			wantNil: true,
		},
		{
			name:    "valid object",
			input:   `{"key":"value"}`,
			wantKey: "key",
			wantVal: "value",
		},
		{
			name:    "valid object with whitespace",
			input:   `  { "k" : 42 }  `,
			wantKey: "k",
			wantVal: float64(42),
		},
		{
			name:    "invalid JSON — bare string",
			input:   "hello",
			wantErr: true,
		},
		{
			name:    "invalid JSON — array instead of object",
			input:   `[1,2,3]`,
			wantErr: true,
		},
		{
			name:    "invalid JSON — truncated",
			input:   `{"key":`,
			wantErr: true,
		},
		{
			name:    "invalid JSON — number literal",
			input:   "42",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := recoderParseJSONArgs(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("recoderParseJSONArgs(%q) expected error, got nil", tt.input)
				}
				return
			}
			if err != nil {
				t.Errorf("recoderParseJSONArgs(%q) unexpected error: %v", tt.input, err)
				return
			}
			if tt.wantNil {
				if got != nil {
					t.Errorf("recoderParseJSONArgs(%q) = %v, want nil", tt.input, got)
				}
				return
			}
			if got == nil {
				t.Errorf("recoderParseJSONArgs(%q) = nil, want non-nil map", tt.input)
				return
			}
			if tt.wantKey != "" {
				val, ok := got[tt.wantKey]
				if !ok {
					t.Errorf("recoderParseJSONArgs(%q) missing key %q in result %v", tt.input, tt.wantKey, got)
					return
				}
				if val != tt.wantVal {
					t.Errorf("recoderParseJSONArgs(%q)[%q] = %v (%T), want %v (%T)", tt.input, tt.wantKey, val, val, tt.wantVal, tt.wantVal)
				}
			}
		})
	}
}
