// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"encoding/json"

	"github.com/recoder/recoder-terminal/tsunami/engine"
)

// ActionHandler handles a named action invocation. args is the raw JSON payload
// passed by the caller (may be nil/empty when the action takes no arguments). The
// returned value is JSON-encoded and returned to the caller.
type ActionHandler = func(args json.RawMessage) (any, error)

// ActionMeta provides optional metadata about a named action for discovery via the
// /api/actions and /api/schemas endpoints.
type ActionMeta struct {
	Desc string // short, user-facing description of what the action does
}

// RegisterAction registers a named, agent-invokable action on the default client.
// Actions are the "operate" surface of a widget (start a timer, add an item,
// trigger a refresh) - distinct from data (read) and config (reconfigure). The
// action is discoverable by name through the /api/actions and /api/schemas
// endpoints and invocable through /api/action.
func RegisterAction(name string, handler ActionHandler) {
	engine.GetDefaultClient().RegisterAction(name, "", handler)
}

// RegisterActionWithMeta registers a named action along with descriptive metadata
// surfaced through the action discovery endpoints.
func RegisterActionWithMeta(name string, meta *ActionMeta, handler ActionHandler) {
	var desc string
	if meta != nil {
		desc = meta.Desc
	}
	engine.GetDefaultClient().RegisterAction(name, desc, handler)
}
