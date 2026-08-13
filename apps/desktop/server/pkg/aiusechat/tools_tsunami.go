// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package aiusechat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/recoder/recoder-terminal/pkg/aiusechat/uctypes"
	"github.com/recoder/recoder-terminal/pkg/blockcontroller"
	"github.com/recoder/recoder-terminal/pkg/util/utilfn"
	"github.com/recoder/recoder-terminal/pkg/waveobj"
	"github.com/recoder/recoder-terminal/pkg/wshrpc"
	"github.com/recoder/recoder-terminal/pkg/wstore"
)

func getTsunamiShortDesc(rtInfo *waveobj.ObjRTInfo) string {
	if rtInfo == nil || rtInfo.TsunamiAppMeta == nil {
		return ""
	}
	var appMeta wshrpc.AppMeta
	if err := utilfn.ReUnmarshal(&appMeta, rtInfo.TsunamiAppMeta); err == nil && appMeta.ShortDesc != "" {
		return appMeta.ShortDesc
	}
	return ""
}

func handleTsunamiBlockDesc(block *waveobj.Block) string {
	status := blockcontroller.GetBlockControllerRuntimeStatus(block.OID)
	if status == nil || status.ShellProcStatus != blockcontroller.Status_Running {
		return "tsunami framework widget that is currently not running"
	}

	blockORef := waveobj.MakeORef(waveobj.OType_Block, block.OID)
	rtInfo := wstore.GetRTInfo(blockORef)
	if shortDesc := getTsunamiShortDesc(rtInfo); shortDesc != "" {
		return fmt.Sprintf("tsunami widget - %s", shortDesc)
	}
	return "tsunami widget - unknown description"
}

// tsunamiGetJSON GETs apiPath from the running tsunami app HTTP server and decodes
// the JSON body. Shared by every read tool so the fetch/timeout/error handling lives
// in one place.
func tsunamiGetJSON(status *blockcontroller.BlockControllerRuntimeStatus, apiPath string) (any, error) {
	if status.TsunamiPort == 0 {
		return nil, fmt.Errorf("tsunami port not available")
	}

	url := fmt.Sprintf("http://localhost:%d%s", status.TsunamiPort, apiPath)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to tsunami: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tsunami returned status %d", resp.StatusCode)
	}

	var result any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode tsunami response: %w", err)
	}

	return result, nil
}

func makeTsunamiGetCallback(status *blockcontroller.BlockControllerRuntimeStatus, apiPath string) func(any, *uctypes.UIMessageDataToolUse) (any, error) {
	return func(input any, toolUseData *uctypes.UIMessageDataToolUse) (any, error) {
		return tsunamiGetJSON(status, apiPath)
	}
}

// makeTsunamiGetDataCallback returns the widget's live data ALONGSIDE its generated
// data schema (field descriptions, units like `ms`/`GiB`, enums) so the agent reasons
// over documented fields instead of guessing from bare JSON keys. The schema is
// best-effort context: if it cannot be fetched the data is still returned — semantics
// are auxiliary, never a gate on the read (and never faked when absent).
func makeTsunamiGetDataCallback(status *blockcontroller.BlockControllerRuntimeStatus) func(any, *uctypes.UIMessageDataToolUse) (any, error) {
	return func(input any, toolUseData *uctypes.UIMessageDataToolUse) (any, error) {
		data, err := tsunamiGetJSON(status, "/api/data")
		if err != nil {
			return nil, err
		}

		out := map[string]any{"data": data}
		if schemas, err := tsunamiGetJSON(status, "/api/schemas"); err == nil {
			if m, ok := schemas.(map[string]any); ok {
				if dataSchema, ok := m["data"]; ok {
					out["schema"] = dataSchema
				}
			}
		}
		return out, nil
	}
}

func makeTsunamiPostCallback(status *blockcontroller.BlockControllerRuntimeStatus, apiPath string) func(any, *uctypes.UIMessageDataToolUse) (any, error) {
	return func(input any, toolUseData *uctypes.UIMessageDataToolUse) (any, error) {
		if status.TsunamiPort == 0 {
			return nil, fmt.Errorf("tsunami port not available")
		}

		url := fmt.Sprintf("http://localhost:%d%s", status.TsunamiPort, apiPath)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var reqBody []byte
		var err error
		if input != nil {
			reqBody, err = json.Marshal(input)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal input: %w", err)
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBody)))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to make request to tsunami: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("tsunami returned status %d", resp.StatusCode)
		}

		return true, nil
	}
}

func GetTsunamiGetDataToolDefinition(block *waveobj.Block, rtInfo *waveobj.ObjRTInfo, status *blockcontroller.BlockControllerRuntimeStatus) *uctypes.ToolDefinition {
	blockIdPrefix := block.OID[:8]
	toolName := fmt.Sprintf("tsunami_getdata_%s", blockIdPrefix)

	desc := "tsunami widget"
	if shortDesc := getTsunamiShortDesc(rtInfo); shortDesc != "" {
		desc = shortDesc
	}

	return &uctypes.ToolDefinition{
		Name:        toolName,
		ToolLogName: "tsunami:getdata",
		Strict:      true,
		InputSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{},
			"additionalProperties": false,
		},
		ToolCallDesc: func(input any, output any, toolUseData *uctypes.UIMessageDataToolUse) string {
			return fmt.Sprintf("getting data from %s (%s)", desc, blockIdPrefix)
		},
		ToolAnyCallback: makeTsunamiGetDataCallback(status),
	}
}

func GetTsunamiGetConfigToolDefinition(block *waveobj.Block, rtInfo *waveobj.ObjRTInfo, status *blockcontroller.BlockControllerRuntimeStatus) *uctypes.ToolDefinition {
	blockIdPrefix := block.OID[:8]
	toolName := fmt.Sprintf("tsunami_getconfig_%s", blockIdPrefix)

	desc := "tsunami widget"
	if shortDesc := getTsunamiShortDesc(rtInfo); shortDesc != "" {
		desc = shortDesc
	}

	return &uctypes.ToolDefinition{
		Name:        toolName,
		ToolLogName: "tsunami:getconfig",
		Strict:      true,
		InputSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{},
			"additionalProperties": false,
		},
		ToolCallDesc: func(input any, output any, toolUseData *uctypes.UIMessageDataToolUse) string {
			return fmt.Sprintf("getting config from %s (%s)", desc, blockIdPrefix)
		},
		ToolAnyCallback: makeTsunamiGetCallback(status, "/api/config"),
	}
}

func GetTsunamiSetConfigToolDefinition(block *waveobj.Block, rtInfo *waveobj.ObjRTInfo, status *blockcontroller.BlockControllerRuntimeStatus) *uctypes.ToolDefinition {
	blockIdPrefix := block.OID[:8]
	toolName := fmt.Sprintf("tsunami_setconfig_%s", blockIdPrefix)

	var inputSchema map[string]any
	if rtInfo != nil && rtInfo.TsunamiSchemas != nil {
		if schemasMap, ok := rtInfo.TsunamiSchemas.(map[string]any); ok {
			if configSchema, exists := schemasMap["config"]; exists {
				inputSchema = configSchema.(map[string]any)
			}
		}
	}

	if inputSchema == nil {
		return nil
	}

	desc := "tsunami widget"
	if shortDesc := getTsunamiShortDesc(rtInfo); shortDesc != "" {
		desc = shortDesc
	}

	return &uctypes.ToolDefinition{
		Name:        toolName,
		ToolLogName: "tsunami:setconfig",
		InputSchema: inputSchema,
		ToolCallDesc: func(input any, output any, toolUseData *uctypes.UIMessageDataToolUse) string {
			return fmt.Sprintf("updating config for %s (%s)", desc, blockIdPrefix)
		},
		ToolAnyCallback: makeTsunamiPostCallback(status, "/api/config"),
	}
}

type tsunamiActionMeta struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// fetchTsunamiActions lists the named actions a running widget exposes via its
// /api/actions endpoint. Returns nil when the widget is unreachable or exposes no
// actions, so callers can decide whether to offer the action tool at all.
func fetchTsunamiActions(status *blockcontroller.BlockControllerRuntimeStatus) []tsunamiActionMeta {
	if status.TsunamiPort == 0 {
		return nil
	}

	url := fmt.Sprintf("http://localhost:%d/api/actions", status.TsunamiPort)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var actions []tsunamiActionMeta
	if err := json.NewDecoder(resp.Body).Decode(&actions); err != nil {
		return nil
	}
	return actions
}

// makeTsunamiActionCallback POSTs {name, args} to the widget's /api/action endpoint
// and returns the decoded handler result so the agent sees the outcome. A 404 is
// surfaced as a truthful "unknown action" error rather than a faked success.
func makeTsunamiActionCallback(status *blockcontroller.BlockControllerRuntimeStatus, apiPath string) func(any, *uctypes.UIMessageDataToolUse) (any, error) {
	return func(input any, toolUseData *uctypes.UIMessageDataToolUse) (any, error) {
		if status.TsunamiPort == 0 {
			return nil, fmt.Errorf("tsunami port not available")
		}

		url := fmt.Sprintf("http://localhost:%d%s", status.TsunamiPort, apiPath)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var reqBody []byte
		var err error
		if input != nil {
			reqBody, err = json.Marshal(input)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal input: %w", err)
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBody)))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to make request to tsunami: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("unknown tsunami action; call tsunami getconfig to discover available action names")
		}
		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("tsunami action returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		}

		var result any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("failed to decode tsunami response: %w", err)
		}
		return result, nil
	}
}

func GetTsunamiActionToolDefinition(block *waveobj.Block, rtInfo *waveobj.ObjRTInfo, status *blockcontroller.BlockControllerRuntimeStatus) *uctypes.ToolDefinition {
	actions := fetchTsunamiActions(status)
	if len(actions) == 0 {
		return nil
	}

	blockIdPrefix := block.OID[:8]
	toolName := fmt.Sprintf("tsunami_action_%s", blockIdPrefix)

	desc := "tsunami widget"
	if shortDesc := getTsunamiShortDesc(rtInfo); shortDesc != "" {
		desc = shortDesc
	}

	actionNames := make([]any, 0, len(actions))
	var actionList strings.Builder
	for _, a := range actions {
		actionNames = append(actionNames, a.Name)
		actionList.WriteString("\n- ")
		actionList.WriteString(a.Name)
		if a.Description != "" {
			actionList.WriteString(": ")
			actionList.WriteString(a.Description)
		}
	}

	description := fmt.Sprintf("Invoke a named action (a live operation such as starting a timer, adding an item, or triggering a refresh) on the %s widget (%s). "+
		"This is the OPERATE surface, distinct from getdata (read) and setconfig (reconfigure). "+
		"Use the tsunami getconfig tool (the widget's actions are listed under the 'actions' key of its schemas) to discover actions; the currently available actions are:%s\n"+
		"Call with the exact action 'name' and an optional 'args' JSON object.", desc, blockIdPrefix, actionList.String())

	return &uctypes.ToolDefinition{
		Name:        toolName,
		DisplayName: "Tsunami Action",
		Description: description,
		ToolLogName: "tsunami:action",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name": map[string]any{
					"type":        "string",
					"description": "The exact registered action name to invoke.",
					"enum":        actionNames,
				},
				"args": map[string]any{
					"type":        "object",
					"description": "Optional JSON arguments passed to the action handler.",
				},
			},
			"required":             []any{"name"},
			"additionalProperties": false,
		},
		ToolCallDesc: func(input any, output any, toolUseData *uctypes.UIMessageDataToolUse) string {
			name := ""
			if m, ok := input.(map[string]any); ok {
				if n, ok := m["name"].(string); ok {
					name = n
				}
			}
			if name == "" {
				return fmt.Sprintf("invoking action on %s (%s)", desc, blockIdPrefix)
			}
			return fmt.Sprintf("invoking action '%s' on %s (%s)", name, desc, blockIdPrefix)
		},
		ToolAnyCallback: makeTsunamiActionCallback(status, "/api/action"),
	}
}
