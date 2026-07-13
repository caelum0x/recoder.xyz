// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/spf13/cobra"
)

// wsh recoder openfang drives the OpenFang agent engine that is compiled IN-PROCESS
// into the Recoder backend (NAPI native addon — no daemon, no HTTP-to-:4200). Each
// subcommand is a thin HTTP client for the backend's native engine edge at
// /api/agents/openfang/* (a normal terminal→backend client call, authenticated with
// the internal service key — same as the rest of `wsh recoder`). Degrade-safe: a
// missing key, a refused connection, or a non-2xx / ok=false body yields a clear
// error and non-zero exit — never a panic, never fake success.

var openfangCmd = &cobra.Command{
	Use:   "openfang",
	Short: "drive the in-process OpenFang agent engine",
	Long: `Call the OpenFang engine compiled into the Recoder backend. Reads (health,
hands, agents, models, skills) and writes (activate/pause/resume/stop a Hand;
activate/stop/kill/message an agent) all run in-process — no openfang daemon.`,
}

var openfangHealthCmd = &cobra.Command{
	Use:   "health",
	Short: "engine health (agents, active hands, build mode)",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/health", "openfang:health"),
}

var openfangHandsCmd = &cobra.Command{
	Use:   "hands",
	Short: "list the bundled Hand catalog",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/hands", "openfang:hands"),
}

var openfangActiveHandsCmd = &cobra.Command{
	Use:   "active-hands",
	Short: "list live Hand instances in the booted kernel",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/hands/active", "openfang:active-hands"),
}

var openfangAgentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "list agents registered in the engine",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/agents", "openfang:agents"),
}

var openfangModelsCmd = &cobra.Command{
	Use:   "models",
	Short: "list the model catalog",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/models", "openfang:models"),
}

var openfangSkillsCmd = &cobra.Command{
	Use:   "skills",
	Short: "list installed skills",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/skills", "openfang:skills"),
}

var openfangUsageCmd = &cobra.Command{
	Use:   "usage",
	Short: "usage / budget summary",
	Args:  cobra.NoArgs,
	RunE:  openfangGetRun("/usage", "openfang:usage"),
}

var openfangActivateCmd = &cobra.Command{
	Use:                   "activate [handId]",
	Short:                 "activate a bundled Hand by id",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/hands/%s/activate", "openfang:activate"),
}

var openfangPauseCmd = &cobra.Command{
	Use:                   "pause [instanceId]",
	Short:                 "pause a running Hand instance",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/hands/%s/pause", "openfang:pause"),
}

var openfangResumeCmd = &cobra.Command{
	Use:                   "resume [instanceId]",
	Short:                 "resume a paused Hand instance",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/hands/%s/resume", "openfang:resume"),
}

var openfangDeactivateCmd = &cobra.Command{
	Use:                   "deactivate [instanceId]",
	Short:                 "tear down a Hand instance",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/hands/%s/deactivate", "openfang:deactivate"),
}

var openfangAgentActivateCmd = &cobra.Command{
	Use:                   "agent-activate [agentId]",
	Short:                 "activate a registered agent",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/agents/%s/activate", "openfang:agent-activate"),
}

var openfangAgentStopCmd = &cobra.Command{
	Use:                   "agent-stop [agentId]",
	Short:                 "stop an agent's current run",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/agents/%s/stop", "openfang:agent-stop"),
}

var openfangAgentKillCmd = &cobra.Command{
	Use:                   "agent-kill [agentId]",
	Short:                 "kill an agent",
	Args:                  cobra.ExactArgs(1),
	DisableFlagsInUseLine: true,
	RunE:                  openfangPostIDRun("/agents/%s/kill", "openfang:agent-kill"),
}

var openfangMessageCmd = &cobra.Command{
	Use:                   "message [agentId] [text...]",
	Short:                 "run one real agent-loop turn (makes an LLM call)",
	Args:                  cobra.MinimumNArgs(2),
	DisableFlagsInUseLine: true,
	RunE:                  openfangMessageRun,
}

func init() {
	recoderCmd.AddCommand(openfangCmd)
	openfangCmd.AddCommand(
		openfangHealthCmd, openfangHandsCmd, openfangActiveHandsCmd, openfangAgentsCmd,
		openfangModelsCmd, openfangSkillsCmd, openfangUsageCmd,
		openfangActivateCmd, openfangPauseCmd, openfangResumeCmd, openfangDeactivateCmd,
		openfangAgentActivateCmd, openfangAgentStopCmd, openfangAgentKillCmd, openfangMessageCmd,
	)
}

// openfangRequest performs an HTTP call to the native engine edge and returns the
// raw JSON body on a 2xx response, or a clear error. The engine routes return a
// bare JSON object carrying their own `ok` flag (surfaced to the user as-is).
func openfangRequest(method, path string, body map[string]interface{}) (json.RawMessage, error) {
	if recoderServiceKey() == "" {
		return nil, recoderMissingKeyErr()
	}
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encoding request: %w", err)
		}
		reader = bytes.NewReader(buf)
	}
	reqURL := recoderBackendURL() + "/api/agents/openfang" + path
	req, err := recoderNewRequest(method, reqURL, reader)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: RecoderCallTimeout}).Do(req)
	if err != nil {
		return nil, recoderConnErr(err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusServiceUnavailable {
		return nil, fmt.Errorf("openfang engine not booted in-process (native addon not built, or no config)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := openfangReason(respBytes)
		if msg == "" {
			msg = fmt.Sprintf("openfang call failed (HTTP %d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return json.RawMessage(respBytes), nil
}

// openfangReason pulls a human-readable reason/error out of an engine error body.
func openfangReason(raw []byte) string {
	var obj struct {
		Reason string `json:"reason"`
		Error  string `json:"error"`
	}
	_ = json.Unmarshal(raw, &obj)
	return recoderFirstNonEmpty(obj.Reason, obj.Error)
}

func openfangGetRun(path, activity string) func(*cobra.Command, []string) error {
	return func(_ *cobra.Command, _ []string) (rtnErr error) {
		defer func() { sendActivity(activity, rtnErr == nil) }()
		raw, err := openfangRequest(http.MethodGet, path, nil)
		if err != nil {
			return err
		}
		recoderPrintValue(raw)
		return nil
	}
}

func openfangPostIDRun(pathTemplate, activity string) func(*cobra.Command, []string) error {
	return func(_ *cobra.Command, args []string) (rtnErr error) {
		defer func() { sendActivity(activity, rtnErr == nil) }()
		path := fmt.Sprintf(pathTemplate, url.PathEscape(strings.TrimSpace(args[0])))
		raw, err := openfangRequest(http.MethodPost, path, map[string]interface{}{})
		if err != nil {
			return err
		}
		recoderPrintValue(raw)
		return nil
	}
}

func openfangMessageRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() { sendActivity("openfang:message", rtnErr == nil) }()
	agentID := strings.TrimSpace(args[0])
	message := strings.TrimSpace(strings.Join(args[1:], " "))
	if agentID == "" || message == "" {
		OutputHelpMessage(cmd)
		return fmt.Errorf("an agent id and a message are required")
	}
	path := fmt.Sprintf("/agents/%s/message", url.PathEscape(agentID))
	raw, err := openfangRequest(http.MethodPost, path, map[string]interface{}{"message": message})
	if err != nil {
		return err
	}
	recoderPrintValue(raw)
	return nil
}
