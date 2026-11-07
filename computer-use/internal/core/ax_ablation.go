package core

import (
	"fmt"

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

