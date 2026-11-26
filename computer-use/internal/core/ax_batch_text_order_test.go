package core

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/microsoft/Hybrid-Computer-Use/computer-use/internal/contract"
)

type textOrderBackend struct {
	*reportBackend
	platform string
	failAck  bool
}

func (b *textOrderBackend) ResolveAndAct(request ProviderActionRequest) (ProviderAccessibilityResult, error) {
	if request.RequireInputAck && b.failAck {
		b.actionRequests = append(b.actionRequests, request)
		result := ProviderAccessibilityResult{OK: false, Error: "receiver acknowledgement unavailable",
			Failure:  &ProviderFailure{Code: "input_order_unconfirmed", Phase: "input_acknowledgement", FactsComplete: true},
			Mutation: &ProviderMutationFacts{InputEventsEmitted: true, MutationUnknown: true}}
		result.PrepareForService()
		return result, nil
	}
	return b.reportBackend.ResolveAndAct(request)
}

func (b *textOrderBackend) HostInfo() HostBackendInfo {
	return HostBackendInfo{Platform: b.platform}
}

func TestWindowsDocumentReplacementRequiresPriorInputAcknowledgement(t *testing.T) {
	for _, tc := range []struct {
		name, first, second string
		failAck             bool
	}{
		{"key-document", "keypress", "set_value", false},
		{"clear-document-type", "set_value", "type", false},
		{"clear-document-document", "set_value", "set_value", false},
		{"document-alone", "", "set_value", false},
		{"unconfirmed-key-document", "keypress", "set_value", true},
		{"unconfirmed-clear-type", "set_value", "type", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, report := reportService(t, reportMain())
			s.Backend = &textOrderBackend{reportBackend: report, platform: "windows", failAck: tc.failAck}
			window, refs := reportObserve(t, s, "Size")
			actions := []any{}
			if tc.first == "keypress" {
				actions = append(actions, map[string]any{"type": "keypress", "keys": []any{"CTRL+A"}})
			}
			if tc.first == "set_value" {
				actions = append(actions, map[string]any{"type": "set_value", "ref": refs["Size"], "value": ""})
			}
			last := map[string]any{"type": tc.second}
			if tc.second == "type" {
				last["text"] = "marker"
			} else {
				last["value"] = "marker"
				last["ref"] = refs["Size"]
			}
			actions = append(actions, last)
			result := s.callTool(contract.PublicToolAX, map[string]any{"mode": "act", "window_ref": window, "actions": actions})
			if result.IsError != tc.failAck {
				t.Fatalf("stop=%v want %v: %s", result.IsError, tc.failAck, ResultText(result))
			}
			if tc.first != "" {
				request := report.actionRequests[0]
				encoded, err := json.Marshal(request)
				if err != nil {
					t.Fatal(err)
				}
				if !request.RequireInputAck || !strings.Contains(string(encoded), `"require_input_ack":true`) {
					t.Fatalf("receiver acknowledgement requirement lost: %s", encoded)
				}
			}
			if tc.failAck && len(report.actionRequests) != 1 {
				t.Fatalf("unconfirmed input sent a later action: %#v", report.actionRequests)
			}
			if !tc.failAck && report.actionRequests[len(report.actionRequests)-1].RequireInputAck {
				t.Fatal("last action unnecessarily required an acknowledgement")
			}
		})
	}
}

func TestWindowsBatchRequestsInputAcknowledgementBeforeText(t *testing.T) {
	for _, first := range []string{"keypress", "click", "scroll"} {
		for _, platform := range []string{"windows", "linux"} {
			t.Run(platform+"/"+first, func(t *testing.T) {
				s, report := reportService(t, reportMain())
				s.Backend = &textOrderBackend{reportBackend: report, platform: platform}
				window, refs := reportObserve(t, s, "Size")
				step := map[string]any{"type": first}
				if first == "keypress" {
					step["keys"] = []any{"CTRL+A"}
				} else {
					step["ref"] = refs["Size"]
					if first == "scroll" {
						step["direction"] = "down"
					}
				}
				result := s.callTool(contract.PublicToolAX, map[string]any{
					"mode": "act", "window_ref": window, "actions": []any{
						step, map[string]any{"type": "type", "text": "marker"},
					},
				})
				if result.IsError || len(report.actionRequests) != 2 {
					t.Fatalf("ordered batch did not complete: %s", ResultText(result))
				}
				if report.actionRequests[0].RequireInputAck != (platform == "windows") ||
					report.actionRequests[1].RequireInputAck {
					t.Fatalf("incorrect acknowledgement scope: %#v", report.actionRequests)
				}
				public := axPublicEvidence(result.StructuredContent, result.IsError, result.Content)
				encodedPublic, _ := json.Marshal(public)
				if strings.Contains(string(encodedPublic), "runtime_action_evidence") || strings.Contains(string(encodedPublic), "semantic_action") {
					t.Fatalf("private route leaked: %s", encodedPublic)
				}
				if strings.Contains(string(encodedPublic), "require_input_ack") {
					t.Fatalf("private receipt flag leaked: %s", encodedPublic)
				}
			})
		}
	}
}

func TestWindowsBatchWaitRetainsInputAcknowledgement(t *testing.T) {
	s, report := reportService(t, reportMain())
	s.Backend = &textOrderBackend{reportBackend: report, platform: "windows"}
	window, refs := reportObserve(t, s, "Size")
	result := s.callTool(contract.PublicToolAX, map[string]any{
		"mode": "act", "window_ref": window, "actions": []any{
			map[string]any{"type": "type", "text": "prefix"},
			map[string]any{"type": "keypress", "keys": []any{"CTRL+A"}},
			map[string]any{"type": "wait", "ref": refs["Size"], "value": "12"},
			map[string]any{"type": "type", "text": "replacement"},
		},
	})
	if result.IsError || len(report.actionRequests) != 3 ||
		report.actionRequests[0].RequireInputAck ||
		!report.actionRequests[1].RequireInputAck ||
		report.actionRequests[2].RequireInputAck {
		t.Fatalf("wait lost acknowledgement scope: %s; %#v", ResultText(result), report.actionRequests)
	}
}
