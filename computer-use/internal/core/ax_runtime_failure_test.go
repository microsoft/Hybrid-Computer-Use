package core

import (
	"strings"
	"testing"
)

func TestInvalidKeyKeepsPublicArgumentErrorAndAcceptedSpelling(t *testing.T) {
	response := ProviderAccessibilityResult{
		Error: "Unsupported key: KP_AD. Use KP_ADD.",
		Failure: &ProviderFailure{
			Code: "invalid_argument", Phase: "precondition", FactsComplete: true,
		},
	}
	result := NewService().runtimeReportedFailure("", AXServiceRequest{}, response)
	result = prependAXBatchSummary(result, "Stopped at action 1/1 (keypress).", map[string]any{
		"actions_requested": 1, "actions_completed_without_call_error": 0,
	})
	public := axPublicEvidence(result.StructuredContent, result.IsError, result.Content)
	if public["code"] != "invalid_argument" || public["input_emitted"] != false || public["completed"] != 0 {
		t.Fatalf("invalid key classification lost: %#v", public)
	}
	if message, _ := public["message"].(string); !strings.Contains(message, "Use KP_ADD") {
		t.Fatalf("accepted spelling lost behind batch summary: %#v", public)
	}
	if hint, _ := public["hint"].(string); hint == "" {
		t.Fatalf("invalid key has no correction hint: %#v", public)
	}
}
