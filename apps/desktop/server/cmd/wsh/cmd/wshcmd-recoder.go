// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// wsh recoder drives Recoder's governed capabilities. It is a pure HTTP client
// for the backend's GATED tool route (POST /api/mcp/tools/:serverId/:toolName/call)
// — the same route the capability bridge uses. It needs NO wshrpc RPC, so it omits
// PreRunE: preRunSetupRpcClient. Degrade-safe: a missing INTERNAL_SERVICE_KEY, a
// refused connection, or a non-2xx / non-completed response yields a clear message
// and a non-zero exit (via a returned error) — never a panic, never fake success.

const (
	RecoderDefaultBackendURL = "http://127.0.0.1:3100"
	RecoderAgentID           = "wsh"
	RecoderCallTimeout       = 30 * time.Second
)

// RecoderKnownServers is the truthful fallback for `wsh recoder tools` when the
// backend exposes no server-list endpoint (older backend). It mirrors the
// capability server ids the gated route understands.
var RecoderKnownServers = []string{
	"recoder.retrieval", "recoder.coordination", "recoder.pal-plan",
	"recoder.memory", "recoder.beads", "recoder.repo", "recoder.approvals",
	"recoder.artifacts", "recoder.github", "recoder.browser", "recoder.browser-use",
	"recoder.preview", "recoder.deploy", "recoder.billing", "recoder.workflow",
}

var errRecoderServersEndpointMissing = errors.New("recoder servers endpoint not found")

var (
	recoderRetrievalTopK int
	recoderLockHolder    string
	recoderLockTTL       int
	recoderPalScope      string
)

var recoderCmd = &cobra.Command{
	Use:   "recoder",
	Short: "drive Recoder's governed capabilities",
	Long: `Call Recoder's governed capabilities from any terminal block. Each subcommand
POSTs to the backend's gated MCP tool route, which runs the
authorize -> risk -> execute -> audit gate server-side.

Env: RECODER_BACKEND_URL / RECODER_INTERNAL_URL (default ` + RecoderDefaultBackendURL + `),
INTERNAL_SERVICE_KEY (required auth for the gated route).`,
}

var recoderRetrievalCmd = &cobra.Command{
	Use:   "retrieval",
	Short: "Recoder semantic retrieval (RAG)",
}

var recoderRetrievalSearchCmd = &cobra.Command{
	Use:                   "search [query...]",
	Short:                 "semantic search over the retrieval corpus",
	Args:                  cobra.MinimumNArgs(1),
	RunE:                  recoderRetrievalSearchRun,
	DisableFlagsInUseLine: true,
}

var recoderCoordinationCmd = &cobra.Command{
	Use:   "coordination",
	Short: "Recoder advisory work-locks",
}

var recoderCoordinationLockCmd = &cobra.Command{
	Use:                   "lock [resource...]",
	Short:                 "acquire an advisory lock on a shared resource",
	Args:                  cobra.MinimumNArgs(1),
	RunE:                  recoderCoordinationLockRun,
	DisableFlagsInUseLine: true,
}

var recoderPalCmd = &cobra.Command{
	Use:   "pal",
	Short: "Recoder planner (PAL)",
}

var recoderPalPlanCmd = &cobra.Command{
	Use:                   "plan [goal...]",
	Short:                 "ask the planner to decide runtime/risk/approval for a goal",
	Args:                  cobra.MinimumNArgs(1),
	RunE:                  recoderPalPlanRun,
	DisableFlagsInUseLine: true,
}

var recoderToolsCmd = &cobra.Command{
	Use:   "tools",
	Short: "list Recoder capability servers and their tools",
	Args:  cobra.NoArgs,
	RunE:  recoderToolsRun,
}

func init() {
	rootCmd.AddCommand(recoderCmd)

	recoderCmd.AddCommand(recoderRetrievalCmd)
	recoderRetrievalCmd.AddCommand(recoderRetrievalSearchCmd)
	recoderRetrievalSearchCmd.Flags().IntVar(&recoderRetrievalTopK, "top-k", 0, "max passages to return (backend default when 0)")

	recoderCmd.AddCommand(recoderCoordinationCmd)
	recoderCoordinationCmd.AddCommand(recoderCoordinationLockCmd)
	recoderCoordinationLockCmd.Flags().StringVar(&recoderLockHolder, "holder", "", "lock holder id (defaults to this agent)")
	recoderCoordinationLockCmd.Flags().IntVar(&recoderLockTTL, "ttl", 0, "lock time-to-live in ms (no expiry when 0)")

	recoderCmd.AddCommand(recoderPalCmd)
	recoderPalCmd.AddCommand(recoderPalPlanCmd)
	recoderPalPlanCmd.Flags().StringVar(&recoderPalScope, "scope", "", "optional scope/constraints for the task")

	recoderCmd.AddCommand(recoderToolsCmd)
}

func recoderBackendURL() string {
	for _, envKey := range []string{"RECODER_BACKEND_URL", "RECODER_INTERNAL_URL"} {
		if val := strings.TrimSpace(os.Getenv(envKey)); val != "" {
			return strings.TrimRight(val, "/")
		}
	}
	return RecoderDefaultBackendURL
}
func recoderServiceKey() string {
	return strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_KEY"))
}
func recoderNewRequest(method, reqURL string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, reqURL, body)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("x-internal-service-key", recoderServiceKey())
	req.Header.Set("x-internal-service-id", RecoderAgentID)
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	return req, nil
}

func recoderConnErr(err error) error {
	return fmt.Errorf("cannot reach Recoder backend at %s: %w\n(is the backend running? set RECODER_BACKEND_URL / RECODER_INTERNAL_URL if it is elsewhere)", recoderBackendURL(), err)
}
func recoderMissingKeyErr() error {
	return fmt.Errorf("Recoder capability host not configured (no INTERNAL_SERVICE_KEY). This command works inside a Recoder workspace")
}

type recoderCallData struct {
	Status string          `json:"status"`
	Reason string          `json:"reason"`
	Error  string          `json:"error"`
	Result json.RawMessage `json:"result"`
}

type recoderCallEnvelope struct {
	Error string          `json:"error"`
	Data  recoderCallData `json:"data"`
}

// recoderCallTool POSTs to the gated tool route and returns the raw result. It
// surfaces policy denials, approval needs, transport failures, and non-2xx
// responses as clear errors — it never fabricates a result.
func recoderCallTool(serverId, toolName string, args map[string]interface{}) (json.RawMessage, error) {
	if recoderServiceKey() == "" {
		return nil, recoderMissingKeyErr()
	}
	payload := map[string]interface{}{
		"actor": map[string]interface{}{
			"agentId":     RecoderAgentID,
			"permissions": map[string]interface{}{"toolRules": []interface{}{}},
		},
		"args": args,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encoding request: %w", err)
	}
	reqURL := fmt.Sprintf("%s/api/mcp/tools/%s/%s/call", recoderBackendURL(), url.PathEscape(serverId), url.PathEscape(toolName))
	req, err := recoderNewRequest(http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: RecoderCallTimeout}).Do(req)
	if err != nil {
		return nil, recoderConnErr(err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)
	var env recoderCallEnvelope
	_ = json.Unmarshal(respBytes, &env)
	if env.Data.Status == "denied" {
		return nil, fmt.Errorf("capability denied by policy: %s", recoderFirstNonEmpty(env.Data.Reason, "not allowed"))
	}
	if env.Data.Status == "needs_approval" {
		return nil, fmt.Errorf("capability needs approval before it can run: %s", recoderFirstNonEmpty(env.Data.Reason, "approval required"))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || env.Data.Status != "completed" {
		msg := recoderFirstNonEmpty(env.Data.Error, env.Error, env.Data.Reason)
		if msg == "" {
			msg = fmt.Sprintf("capability call failed (HTTP %d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return env.Data.Result, nil
}

func recoderPrintResult(raw json.RawMessage) {
	if len(raw) == 0 || string(raw) == "null" {
		WriteStdout("(no result)\n")
		return
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		if content, ok := obj["content"]; ok {
			recoderPrintValue(content)
			return
		}
	}
	recoderPrintValue(raw)
}

func recoderPrintValue(raw json.RawMessage) {
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		WriteStdout("%s\n", asString)
		return
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, raw, "", "  "); err == nil {
		WriteStdout("%s\n", pretty.String())
		return
	}
	WriteStdout("%s\n", string(raw))
}

func recoderFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func recoderRetrievalSearchRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("recoder:retrieval:search", rtnErr == nil)
	}()
	query := strings.TrimSpace(strings.Join(args, " "))
	if query == "" {
		OutputHelpMessage(cmd)
		return fmt.Errorf("a search query is required")
	}
	toolArgs := map[string]interface{}{"query": query}
	if recoderRetrievalTopK > 0 {
		toolArgs["topK"] = recoderRetrievalTopK
	}
	result, err := recoderCallTool("recoder.retrieval", "retrieval.search", toolArgs)
	if err != nil {
		return err
	}
	recoderPrintResult(result)
	return nil
}

func recoderCoordinationLockRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("recoder:coordination:lock", rtnErr == nil)
	}()
	resource := strings.TrimSpace(strings.Join(args, " "))
	if resource == "" {
		OutputHelpMessage(cmd)
		return fmt.Errorf("a resource to lock is required")
	}
	toolArgs := map[string]interface{}{"resource": resource}
	if recoderLockHolder != "" {
		toolArgs["holder"] = recoderLockHolder
	}
	if recoderLockTTL > 0 {
		toolArgs["ttlMs"] = recoderLockTTL
	}
	result, err := recoderCallTool("recoder.coordination", "coordination.acquire_lock", toolArgs)
	if err != nil {
		return err
	}
	recoderPrintResult(result)
	return nil
}

func recoderPalPlanRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("recoder:pal:plan", rtnErr == nil)
	}()
	goal := strings.TrimSpace(strings.Join(args, " "))
	if goal == "" {
		OutputHelpMessage(cmd)
		return fmt.Errorf("a goal is required")
	}
	toolArgs := map[string]interface{}{"goal": goal}
	if recoderPalScope != "" {
		toolArgs["scope"] = recoderPalScope
	}
	result, err := recoderCallTool("recoder.pal-plan", "pal.plan", toolArgs)
	if err != nil {
		return err
	}
	recoderPrintResult(result)
	return nil
}

type recoderServer struct {
	ServerId  string   `json:"serverId"`
	Kind      string   `json:"kind"`
	ToolNames []string `json:"toolNames"`
	Enabled   bool     `json:"enabled"`
}

type recoderServersEnvelope struct {
	Error string          `json:"error"`
	Data  []recoderServer `json:"data"`
}

func recoderListServers() ([]recoderServer, error) {
	if recoderServiceKey() == "" {
		return nil, recoderMissingKeyErr()
	}
	reqURL := recoderBackendURL() + "/api/mcp/servers"
	req, err := recoderNewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: RecoderCallTimeout}).Do(req)
	if err != nil {
		return nil, recoderConnErr(err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, errRecoderServersEndpointMissing
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var env recoderServersEnvelope
		_ = json.Unmarshal(respBytes, &env)
		msg := env.Error
		if msg == "" {
			msg = fmt.Sprintf("listing capability servers failed (HTTP %d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("%s", msg)
	}
	var env recoderServersEnvelope
	if err := json.Unmarshal(respBytes, &env); err != nil {
		return nil, fmt.Errorf("decoding server list: %w", err)
	}
	return env.Data, nil
}

func recoderToolsRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("recoder:tools", rtnErr == nil)
	}()
	servers, err := recoderListServers()
	if errors.Is(err, errRecoderServersEndpointMissing) {
		WriteStdout("Backend has no server-list endpoint; known capability servers:\n")
		for _, serverId := range RecoderKnownServers {
			WriteStdout("  - %s\n", serverId)
		}
		return nil
	}
	if err != nil {
		return err
	}
	if len(servers) == 0 {
		WriteStdout("No capability servers registered.\n")
		return nil
	}
	for _, server := range servers {
		status := "enabled"
		if !server.Enabled {
			status = "disabled"
		}
		WriteStdout("%s [%s] (%s)\n", server.ServerId, server.Kind, status)
		for _, toolName := range server.ToolNames {
			WriteStdout("  - %s\n", toolName)
		}
	}
	return nil
}
