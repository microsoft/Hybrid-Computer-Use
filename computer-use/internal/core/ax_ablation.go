package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/microsoft/Hybrid-Computer-Use/computer-use/internal/contract"
)

// Behavior of the mechanism ablations in the AX service; contract/ablation.go
// says what each one removes.

// axActWithoutFeedback runs an act for the diff ablation. The batch runs
// exactly as with diff, including the post-action reads that time its
// return, but the model receives none of what those reads found:
// withoutAXActFeedback keeps only the execution evidence. The reads are not
// recorded as delivered, so a later observe compares with what the model
// actually saw and never answers "unchanged" from a hidden read.
func (s *Service) axActWithoutFeedback(request *axRequest, obs observation) ToolCallResult {
	s.observations.hidden = true
	defer func() { s.observations.hidden = false }()
	result := s.axBatchDecoded(request.actions, obs, request.windowRef).
		withEvidenceScope("delivery_or_local_ui")
	// Drop images here, before callTool registers a delivered image as the
	// GUI frame; the text goes in withoutAXActFeedback, after the evidence
	// line has taken the error message from it.
	kept := []ContentItem{}
	for _, item := range result.Content {
		if item.Type == "text" {
			kept = append(kept, item)
		}
	}
	result.Content = kept
	return WithAXModeEvidence(result, contract.AXModeAct)
}

// axActEvidenceFields are the public evidence fields an act keeps under the
// diff ablation: whether it succeeded, the error, and how far input went.
var axActEvidenceFields = append(append([]string{}, axPublicFields...),
	"failure_phase", "partial_input_possible", "retry_same_request")

// withoutAXActFeedback reduces a prepared act result to its execution
// evidence: no effect or windows lines, diff, tree, notes or selection
// readback.
func withoutAXActFeedback(result ToolCallResult) ToolCallResult {
	kept := map[string]any{}
	for _, key := range axActEvidenceFields {
		if value, present := result.StructuredContent[key]; present {
			kept[key] = value
		}
	}
	result.StructuredContent = kept
	result.Content = []ContentItem{}
	return result
}

// axCheckOneInputStep enforces the batching ablation: an act holds at most
// one input step. Wait steps send no input and may surround it.
func axCheckOneInputStep(earlier []axBatchAction, action axBatchAction, items []any, path string) *axArgError {
	if !contract.Ablated(contract.AblateBatching) || action.actionType == "wait" {
		return nil
	}
	for _, step := range earlier {
		if step.actionType != "wait" {
			return axInvalid(path, fmt.Sprintf(
				"act takes one input step per call, and %s is the second; send it in a later call", path), "").
				withRule(contract.ArgumentRuleOneInputStep).withFix(axSet("actions", items[:len(earlier)]))
		}
	}
	return nil
}

// shadowGuard reports whether the guard ablation lets input through that a
// guard decided to stop. It first appends the decision to
// COMPUTER_USE_GUARD_LOG, in the format of the Linux provider's
// guard_shadow.py, so both sides of one run share one log.
func shadowGuard(channel, guard, reason string, detail map[string]any) bool {
	if !contract.Ablated(contract.AblateGuard) {
		return false
	}
	record := map[string]any{
		"at": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "channel": channel,
		"guard": guard, "reason": reason, "would_block": true,
	}
	for key, value := range detail {
		record[key] = value
	}
	path := strings.TrimSpace(os.Getenv(contract.GuardLogEnv))
	line, err := json.Marshal(record)
	if path == "" || err != nil {
		return true
	}
	// A lost log line must not fail the input it describes.
	if dir := filepath.Dir(path); dir != "." {
		_ = os.MkdirAll(dir, 0o755)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return true
	}
	defer file.Close()
	_, _ = file.Write(append(line, '\n'))
	return true
}
