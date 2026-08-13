// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/recoder/recoder-terminal/tsunami/util"
)

// ActionHandler runs a named action. args is the raw JSON payload supplied by the
// caller (may be nil/empty when the action takes no arguments). The returned value
// is JSON-encoded and handed back to the caller.
type ActionHandler = func(args json.RawMessage) (any, error)

// ActionImpl is a registered named action stored on the client.
type ActionImpl struct {
	Name        string
	Description string
	Handler     ActionHandler
}

// ActionMeta describes a registered action for discovery. It intentionally omits
// the handler so it can be serialized to the discovery endpoints.
type ActionMeta struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ActionRequest is the wire payload accepted by the /api/action endpoint.
type ActionRequest struct {
	Name string          `json:"name"`
	Args json.RawMessage `json:"args,omitempty"`
}

// ActionNotFoundError is returned when an action name is not registered so callers
// can respond with a truthful 404 instead of faking success.
type ActionNotFoundError struct {
	Name string
}

func (e *ActionNotFoundError) Error() string {
	return fmt.Sprintf("action not found: %s", e.Name)
}

// RegisterAction registers a named action on the client. Registration is safe to
// call concurrently. Duplicate names, empty names, and nil handlers panic since
// they always indicate a programming error at wiring time.
func (c *ClientImpl) RegisterAction(name string, description string, handler ActionHandler) {
	c.ActionsLock.Lock()
	defer c.ActionsLock.Unlock()

	if name == "" {
		panic("action name cannot be empty")
	}
	if handler == nil {
		panic(fmt.Sprintf("action %q handler cannot be nil", name))
	}
	if _, ok := c.Actions[name]; ok {
		panic(fmt.Sprintf("action %q already exists", name))
	}
	c.Actions[name] = &ActionImpl{Name: name, Description: description, Handler: handler}
}

func (c *ClientImpl) getAction(name string) (*ActionImpl, bool) {
	c.ActionsLock.Lock()
	defer c.ActionsLock.Unlock()
	action, ok := c.Actions[name]
	return action, ok
}

// GetActionMetas returns the registered actions as discovery metadata, sorted by
// name for stable output.
func (c *ClientImpl) GetActionMetas() []ActionMeta {
	c.ActionsLock.Lock()
	defer c.ActionsLock.Unlock()

	metas := make([]ActionMeta, 0, len(c.Actions))
	for _, action := range c.Actions {
		metas = append(metas, ActionMeta{Name: action.Name, Description: action.Description})
	}
	sort.Slice(metas, func(i, j int) bool { return metas[i].Name < metas[j].Name })
	return metas
}

// InvokeAction looks up a named action and runs its handler under a panic guard.
// A recovered panic is converted into an error so a misbehaving handler can never
// crash the server. Unknown action names return an *ActionNotFoundError.
func (c *ClientImpl) InvokeAction(name string, args json.RawMessage) (result any, err error) {
	action, ok := c.getAction(name)
	if !ok {
		return nil, &ActionNotFoundError{Name: name}
	}

	defer func() {
		if panicErr := util.PanicHandler("action:"+name, recover()); panicErr != nil {
			result = nil
			err = panicErr
		}
	}()

	return action.Handler(args)
}
