//go:build windows || windows_sidecar_test

package provider

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/Hybrid-Computer-Use/computer-use/internal/core"
)

func TestWindowsTextReadExitIsNotReplayedAndNextObservationReplacesWorker(t *testing.T) {
	root := t.TempDir()
	startsPath := filepath.Join(root, "starts")
	requestsPath := filepath.Join(root, "requests")
	t.Setenv("COMPUTER_USE_WINDOWS_PROVIDER", currentWindowsTestExecutable(t))
	t.Setenv("GO_WANT_TEXT_READ_EXIT_HELPER", "1")
	t.Setenv("TEXT_READ_STARTS", startsPath)
	t.Setenv("TEXT_READ_REQUESTS", requestsPath)
	original := windowsProviderCommand
	windowsProviderCommand = func(path string) *exec.Cmd {
		return exec.Command(path, "-test.run=^TestWindowsTextReadExitHelper$")
	}
	t.Cleanup(func() { windowsProviderCommand = original })
	shutdownWindowsProviderProcess()
	t.Cleanup(shutdownWindowsProviderProcess)

	request := core.NewProviderWireRequest("text-read-exit", core.ProviderWireResolveAndAct)
	request.Action = &core.ProviderActionRequest{
		ProtocolVersion: core.ProviderProtocolVersion,
		Intent:          core.AccessibilityResolveTarget,
		App:             "Editor",
		Target:          &core.ProviderSemanticTarget{Selector: "textbox", HasName: false},
		Observation: core.ProviderObservationOptions{
			TextRead: &core.ProviderTextRead{Field: "value", Start: 0, Limit: 10},
		},
	}
	if response, err := runWindowsProvider(request); err == nil || response != nil {
		t.Fatalf("provider loss returned a text response: %#v, %v", response, err)
	}
	if windowsProviderProcesses.worker != nil {
		t.Fatal("the lost text provider was retained")
	}
	response, err := runWindowsProvider(validWindowsObserveAppsRequest("fresh-observation"))
	if err != nil || response.Accessibility == nil || !response.Accessibility.OK {
		t.Fatalf("fresh observation could not use a replacement provider: %#v, %v", response, err)
	}
	requests, err := os.ReadFile(requestsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(requests), "text-read-exit\n") != 1 ||
		strings.Count(string(requests), "fresh-observation\n") != 1 {
		t.Fatalf("a lost read was replayed: %q", requests)
	}
	starts, err := os.ReadFile(startsPath)
	if err != nil || strings.Count(string(starts), "start\n") != 2 {
		t.Fatalf("unexpected provider lifecycle: %q, %v", starts, err)
	}
}

func TestWindowsTextReadExitHelper(t *testing.T) {
	if os.Getenv("GO_WANT_TEXT_READ_EXIT_HELPER") == "" {
		return
	}
	appendLine := func(path, line string) {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			os.Exit(2)
		}
		_, _ = file.WriteString(line + "\n")
		_ = file.Close()
	}
	appendLine(os.Getenv("TEXT_READ_STARTS"), "start")
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		request, err := providerDecodeProviderWireRequest(scanner.Bytes())
		if err != nil {
			os.Exit(3)
		}
		appendLine(os.Getenv("TEXT_READ_REQUESTS"), request.RequestID)
		if request.Operation == core.ProviderWireResolveAndAct {
			os.Exit(55)
		}
		response := core.ProviderWireResponse{
			Protocol:      core.ProviderProtocolName,
			SchemaVersion: core.ProviderProtocolVersion,
			RequestID:     request.RequestID,
			Operation:     request.Operation,
			Accessibility: &core.ProviderAccessibilityResult{OK: true},
		}
		if err := json.NewEncoder(os.Stdout).Encode(response); err != nil {
			os.Exit(4)
		}
	}
	os.Exit(0)
}
