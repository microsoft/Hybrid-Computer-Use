package contract

import (
	"strings"
	"testing"
)

func TestParseAblations(t *testing.T) {
	for raw, want := range map[string]string{
		"":                         "",
		"  ":                       "",
		"wait":                     "wait",
		" guard , batching":        "batching,guard",
		"batching,wait,diff,guard": "batching,wait,diff,guard",
		"diff,wait":                "wait,diff",
	} {
		ablated, err := ParseAblations(raw)
		if err != nil {
			t.Fatalf("%q: %v", raw, err)
		}
		got := []string{}
		for _, name := range AblationNames {
			if ablated[name] {
				got = append(got, name)
			}
		}
		if strings.Join(got, ",") != want {
			t.Fatalf("%q: got %v want %s", raw, got, want)
		}
	}
	for _, raw := range []string{"waits", "wait,", "Wait", "wait,wait", "compact", ","} {
		if _, err := ParseAblations(raw); err == nil {
			t.Fatalf("%q must be rejected", raw)
		}
	}
}

func TestValidateAblationsAtStartup(t *testing.T) {
	env := func(values map[string]string) func(string) string {
		return func(key string) string { return values[key] }
	}
	for _, check := range []struct {
		goos   string
		values map[string]string
		fails  string
	}{
		{"linux", map[string]string{}, ""},
		{"linux", map[string]string{AblationEnv: "batching,wait,diff"}, ""},
		{"darwin", map[string]string{AblationEnv: "wait"}, ""},
		{"linux", map[string]string{AblationEnv: "diffs"}, "unknown ablation"},
		{"linux", map[string]string{AblationEnv: "guard"}, GuardLogEnv},
		{"linux", map[string]string{AblationEnv: "guard", GuardLogEnv: "/tmp/g.jsonl"}, ""},
		{"darwin", map[string]string{AblationEnv: "guard", GuardLogEnv: "/tmp/g.jsonl"}, "only by the Linux provider"},
		{"windows", map[string]string{AblationEnv: "guard", GuardLogEnv: "/tmp/g.jsonl"}, "only by the Linux provider"},
	} {
		err := ValidateAblations(check.goos, env(check.values))
		switch {
		case check.fails == "" && err != nil:
			t.Fatalf("%s %v: %v", check.goos, check.values, err)
		case check.fails != "" && (err == nil || !strings.Contains(err.Error(), check.fails)):
			t.Fatalf("%s %v: got %v, want an error with %q", check.goos, check.values, err, check.fails)
		}
	}
}

func TestPublishedTextWithoutAblationIsTheReleaseText(t *testing.T) {
	t.Setenv(AblationEnv, "")
	if PublishedServerInstructions() != ServerInstructions {
		t.Fatal("server instructions changed without an ablation")
	}
	if publishedAXToolDescription() != axToolDescription {
		t.Fatal("AX description changed without an ablation")
	}
	t.Setenv(AblationEnv, "wait,diff")
	if !strings.Contains(PublishedServerInstructions(), "returns controls as rN refs, and acts on them.") ||
		!strings.Contains(PublishedServerInstructions(), "before input, and outside input makes their refs stale.") {
		t.Fatalf("instructions: %s", PublishedServerInstructions())
	}
}
