package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/microsoft/Hybrid-Computer-Use/computer-use/internal/contract"
)

// ablationSets returns every subset of the ablations as a
// COMPUTER_USE_ABLATE value, the empty set first.
func ablationSets() []string {
	sets := []string{}
	for mask := 0; mask < 1<<len(contract.AblationNames); mask++ {
		names := []string{}
		for index, name := range contract.AblationNames {
			if mask&(1<<index) != 0 {
				names = append(names, name)
			}
		}
		sets = append(sets, strings.Join(names, ","))
	}
	return sets
}

// axVisibleText is what a model reads about AX: the server instructions,
// the AX tool and the GUI settle_ms text, which points to AX waits.
func axVisibleText(t *testing.T) (string, map[string]any) {
	t.Helper()
	var ax contract.ToolDefinition
	for _, tool := range contract.ToolDefinitions() {
		if tool.Name == contract.PublicToolAX {
			ax = tool
		}
	}
	encoded, err := json.Marshal(ax)
	if err != nil {
		t.Fatal(err)
	}
	settle := contract.GUIInputSchema()["oneOf"].([]any)[1].(map[string]any)["properties"].(map[string]any)["settle_ms"]
	settleText, _ := json.Marshal(settle)
	// The description also goes in unescaped, so quoted example steps match.
	return contract.PublishedServerInstructions() + "\n" + ax.Description + "\n" +
			string(encoded) + "\n" + string(settleText),
		ax.InputSchema["properties"].(map[string]any)
}

// The words of each mechanism; none may remain once it is ablated.
var ablatedWords = map[string][]*regexp.Regexp{
	contract.AblateWait: {
		regexp.MustCompile(`"wait"`), regexp.MustCompile(`(?i)wait step`),
		regexp.MustCompile(`settle needs|"settle"`), regexp.MustCompile(`timeout_ms|Wait timeouts`),
		regexp.MustCompile(`waits with`), regexp.MustCompile(`"gone"`),
	},
	contract.AblateDiff: {
		regexp.MustCompile(`\bdiffs?\b`), regexp.MustCompile(`report what changed`),
		regexp.MustCompile(`reports each target`), regexp.MustCompile(`selection read back`),
		regexp.MustCompile(`"none"`),
	},
	contract.AblateBatching: {
		regexp.MustCompile(`ordered steps`), regexp.MustCompile(`"type":"type"`),
	},
}

func TestAblatedTextOmitsTheRemovedMechanisms(t *testing.T) {
	full, _ := axVisibleText(t)
	fullDescription := findToolDefinition(t, contract.PublicToolAX).Description
	for _, set := range ablationSets() {
		t.Run("ablate="+set, func(t *testing.T) {
			t.Setenv(contract.AblationEnv, set)
			text, properties := axVisibleText(t)
			if set == "" || set == contract.AblateGuard {
				// guard changes no text: its errors only stop occurring.
				if text != full {
					t.Fatalf("text changed without a text-changing ablation")
				}
				return
			}
			for _, name := range strings.Split(set, ",") {
				for _, word := range ablatedWords[name] {
					if match := word.FindString(text); match != "" {
						t.Errorf("%s ablated, but %q remains", name, match)
					}
				}
			}
			if description := findToolDefinition(t, contract.PublicToolAX).Description; len(description) > len(fullDescription) {
				t.Errorf("AX description grew to %d bytes from %d", len(description), len(fullDescription))
			}
			actions := properties["actions"].(map[string]any)
			wantMax := contract.AXBatchMaxActions
			if strings.Contains(set, "batching") && strings.Contains(set, "wait") {
				wantMax = 1
			}
			if actions["maxItems"] != wantMax {
				t.Errorf("maxItems %v want %d", actions["maxItems"], wantMax)
			}
		})
	}
}

// Each text-changing ablation states how the ablated act behaves, so an
// agent does not have to learn it from rejected calls.
func TestAblatedDescriptionStatesTheChangedBehavior(t *testing.T) {
	statements := map[string]string{
		contract.AblateBatching: "act runs one input step with optional wait steps before or after it",
		contract.AblateWait:     "act cannot pause for a later state; to check one, read again with observe or find.",
		contract.AblateDiff:     "Its result reports only whether input was sent and how many steps completed",
	}
	for _, set := range ablationSets() {
		t.Run("ablate="+set, func(t *testing.T) {
			t.Setenv(contract.AblationEnv, set)
			description := findToolDefinition(t, contract.PublicToolAX).Description
			for name, statement := range statements {
				ablated := strings.Contains(","+set+",", ","+name+",")
				if name == contract.AblateBatching && strings.Contains(set, contract.AblateWait) {
					statement = "act runs one step"
				}
				if strings.Contains(description, statement) != ablated {
					t.Errorf("%s ablated=%v, description:\n%s", name, ablated, description)
				}
			}
		})
	}
}

func TestAblatedDescriptionsKeepTheirExamplesValid(t *testing.T) {
	example := regexp.MustCompile(`\{"mode":"act".*\}`)
	for _, set := range ablationSets() {
		t.Run("ablate="+set, func(t *testing.T) {
			t.Setenv(contract.AblationEnv, set)
			t.Setenv(contract.GuardLogEnv, filepath.Join(t.TempDir(), "guard.jsonl"))
			description := findToolDefinition(t, contract.PublicToolAX).Description
			call := example.FindString(description)
			if call == "" {
				t.Fatalf("no act example in %s", description)
			}
			if _, err := DecodeAXRequest(decodeTestArguments(t, call)); err != nil {
				t.Fatalf("example %s: %s", call, err.Message)
			}
			if argErr := contract.ValidateToolArguments(contract.PublicToolAX, decodeTestArguments(t, call)); argErr != nil {
				t.Fatalf("example %s: %s", call, argErr.Message)
			}
		})
	}
}

func TestBatchingAblationAllowsOneInputStep(t *testing.T) {
	t.Setenv(contract.AblationEnv, contract.AblateBatching)
	for _, raw := range []string{
		`{"mode":"act","actions":[{"type":"click","ref":"r1"}]}`,
		`{"mode":"act","actions":[{"type":"wait","window":"A"},{"type":"click","ref":"r1"},{"type":"wait","settle":true}]}`,
		`{"mode":"act","actions":[{"type":"close","ref":"w1"},{"type":"wait","window":"A","gone":true}]}`,
	} {
		if _, err := DecodeAXRequest(decodeTestArguments(t, raw)); err != nil {
			t.Fatalf("%s: %s", raw, err.Message)
		}
	}
	_, err := DecodeAXRequest(decodeTestArguments(t,
		`{"mode":"act","actions":[{"type":"click","ref":"r1"},{"type":"wait","window":"A"},{"type":"select","ref":"r2"}]}`))
	if err == nil || err.rule != contract.ArgumentRuleOneInputStep || err.path != "actions[2]" {
		t.Fatalf("second input step: %#v", err)
	}
	if !strings.Contains(err.Hint, `{"type":"wait","window":"A"}`) || strings.Contains(err.Hint, "select") {
		t.Fatalf("hint should keep the steps before the second input: %s", err.Hint)
	}

	t.Setenv(contract.AblationEnv, "batching,wait")
	_, err = DecodeAXRequest(decodeTestArguments(t,
		`{"mode":"act","actions":[{"type":"click","ref":"r1"},{"type":"click","ref":"r2"}]}`))
	if err == nil || err.Message != "act takes one action per call; send the others in later calls" {
		t.Fatalf("two actions without waits: %#v", err)
	}
}

func TestBatchingAblationKeepsGUIBatches(t *testing.T) {
	t.Setenv(contract.AblationEnv, "batching,wait,diff")
	args := decodeTestArguments(t, `{"actions":[{"type":"click","x":1,"y":2},{"type":"type","text":"a"},{"type":"keypress","keys":["ENTER"]}]}`)
	if err := contract.ValidateToolArguments(contract.PublicToolGUI, args); err != nil {
		t.Fatalf("GUI batch: %s", err.Message)
	}
}

func TestWaitAblationRemovesWaitSteps(t *testing.T) {
	t.Setenv(contract.AblationEnv, contract.AblateWait)
	_, err := DecodeAXRequest(decodeTestArguments(t, `{"mode":"act","actions":[{"type":"wait","window":"A"}]}`))
	if err == nil || !strings.HasPrefix(err.Message, "type must be one of click, type, keypress, set_value, select, scroll, activate, close;") ||
		strings.Contains(err.Hint, "wait") || err.path != "actions[0].type" {
		t.Fatalf("wait step: %#v", err)
	}
	_, err = DecodeAXRequest(decodeTestArguments(t,
		`{"mode":"act","actions":[{"type":"close","ref":"w1"},{"type":"keypress","keys":["ENTER"]}]}`))
	if err == nil || err.rule != contract.ArgumentRuleCloseNotLast || strings.Contains(err.Message+err.Hint, "wait") {
		t.Fatalf("input after close: %#v", err)
	}
	_, err = DecodeAXRequest(decodeTestArguments(t, `{"mode":"act","actions":[{"type":"click","ref":"r1","until":{"type":"exists","ref":"r2"}}]}`))
	if err == nil || strings.Contains(err.Message+err.Hint, "wait") {
		t.Fatalf("removed until field: %#v", err)
	}
	if strings.Contains(strings.Join(continuityNotesForUnchanged(t), "\n"), "wait step") {
		t.Fatal("the unchanged-snapshot note still suggests a wait step")
	}
}

// continuityNotesForUnchanged returns the notes for a snapshot identical to
// the delivered one.
func continuityNotesForUnchanged(t *testing.T) []string {
	t.Helper()
	previous := &AppSnapshot{SnapshotID: "s1", WindowHandle: "h1", WindowTitle: "T"}
	current := &AppSnapshot{SnapshotID: "s1", WindowHandle: "h1", WindowTitle: "T"}
	return continuityNotes(previous, current)
}

func TestDiffAblationReturnsOnlyExecutionEvidence(t *testing.T) {
	s, backend := reportService(t, reportMain())
	_, refs := reportObserve(t, s, "Interface")
	t.Setenv(contract.AblationEnv, contract.AblateDiff)
	backend.onAction = func(b *reportBackend) { b.checked = true }
	result := FinalizeForModel(contract.PublicToolAX, s.callTool(contract.PublicToolAX, map[string]any{
		"mode": "act", "actions": []any{map[string]any{"type": "click", "ref": refs["Interface"]}},
	}), false)
	if len(result.Content) != 1 {
		t.Fatalf("want only the evidence line, got %d items: %s", len(result.Content), ResultText(result))
	}
	line := result.Content[0].Text
	if line != `{"ok":true,"input_emitted":true,"completed":1,"requested":1}` {
		t.Fatalf("evidence line %s", line)
	}
	// The act's own read was never delivered, so observe returns the tree
	// instead of calling it unchanged.
	observed := ResultText(s.callTool(contract.PublicToolAX, map[string]any{"mode": "observe", "app": "Editor"}))
	if strings.Contains(observed, "Tree unchanged") || !strings.Contains(observed, `"Interface"`) {
		t.Fatalf("observe after a hidden act read:\n%s", observed)
	}
	_, err := DecodeAXRequest(map[string]any{"mode": "act", "observe": "tree",
		"actions": []any{map[string]any{"type": "click", "ref": "r1"}}})
	if err == nil || err.path != "observe" {
		t.Fatalf("act with observe: %#v", err)
	}
}

func TestDiffAblationKeepsTheErrorOfAFailedAct(t *testing.T) {
	s, _ := reportService(t, reportMain())
	reportObserve(t, s, "Interface")
	t.Setenv(contract.AblationEnv, contract.AblateDiff)
	result := FinalizeForModel(contract.PublicToolAX, s.callTool(contract.PublicToolAX, map[string]any{
		"mode": "act", "actions": []any{map[string]any{"type": "click", "ref": "r999"}},
	}), false)
	if len(result.Content) != 1 || !result.IsError {
		t.Fatalf("want one evidence line for the error: %s", ResultText(result))
	}
	var evidence map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &evidence); err != nil {
		t.Fatal(err)
	}
	if evidence["ok"] != false || evidence["code"] == nil || evidence["message"] == nil {
		t.Fatalf("error evidence %v", evidence)
	}
}

func TestGuardAblationLogsTheDecisionAndLetsInputThrough(t *testing.T) {
	log := filepath.Join(t.TempDir(), "logs", "guard.jsonl")
	t.Setenv(contract.GuardLogEnv, log)
	if shadowGuard("ax", "batch_window", "changed", nil) {
		t.Fatal("without the ablation the guard must stop the input")
	}
	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Fatal("a guard log was written without the ablation")
	}
	t.Setenv(contract.AblationEnv, contract.AblateGuard)
	if !shadowGuard("ax", "batch_window", "changed", map[string]any{"window_ref": "w1"}) {
		t.Fatal("with the ablation the guard must let the input through")
	}
	data, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]any
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatal(err)
	}
	if record["channel"] != "ax" || record["guard"] != "batch_window" || record["window_ref"] != "w1" ||
		record["would_block"] != true || record["at"] == nil {
		t.Fatalf("record %v", record)
	}
}
