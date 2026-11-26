package core

import (
	"testing"

	"github.com/microsoft/Hybrid-Computer-Use/computer-use/internal/contract"
)

func TestWindowsGUIKeepsMixedBatchForNativeAcknowledgement(t *testing.T) {
	actions := []map[string]any{
		{"type": "click", "x": 1.0, "y": 2.0},
		{"type": "double_click", "x": 1.0, "y": 2.0},
		{"type": "move", "x": 1.0, "y": 2.0},
		{"type": "drag", "path": []any{
			map[string]any{"x": 1.0, "y": 2.0}, map[string]any{"x": 3.0, "y": 4.0},
		}},
		{"type": "scroll", "x": 1.0, "y": 2.0, "scroll_y": -1.0},
		{"type": "keypress", "keys": []any{"CTRL", "A"}},
	}
	for _, action := range actions {
		t.Run(action["type"].(string), func(t *testing.T) {
			backend := &recordingPlatformBackend{desktopResponse: &ProviderDesktopResult{OK: true}}
			s := NewServiceWithBackend(windowsRecordingBackend{backend})
			s.guiSnapshot = &AppSnapshot{FrameID: "f1", Width: 40, Height: 30}
			s.callTool(contract.PublicToolGUI, map[string]any{
				"actions": []any{
					map[string]any{"type": "type", "text": "prefix"},
					action,
					map[string]any{"type": "wait"},
					map[string]any{"type": "type", "text": "replacement"},
				},
			})
			if len(backend.desktopRequests) != 1 ||
				len(backend.desktopRequests[0].Actions) != 4 ||
				backend.desktopRequests[0].Actions[3].Text != "replacement" {
				t.Fatalf("mixed batch did not reach native acknowledgement intact: %#v",
					backend.desktopRequests)
			}
		})
	}
}

func TestWindowsGUITextCanPrecedeKeysOrFollowSeparateObservation(t *testing.T) {
	yes, count := true, 1
	response := &ProviderDesktopResult{
		OK: true,
		Snapshot: &AppSnapshot{
			ScreenshotPNGBase64: testPNGBase64(t, 40, 30),
			CoordinateSpace:     "screen_image_px", FrameID: "f1", Width: 40, Height: 30,
		},
		GUIResult: ProviderGUIResult{Dispatched: &count, InputEventsEmitted: &yes},
	}
	backend := &recordingPlatformBackend{desktopResponse: response}
	s := NewServiceWithBackend(windowsRecordingBackend{backend})
	for _, actions := range [][]any{
		{map[string]any{"type": "keypress", "keys": []any{"CTRL", "A"}}},
		{map[string]any{"type": "screenshot"}},
		{
			map[string]any{"type": "type", "text": "replacement"},
			map[string]any{"type": "keypress", "keys": []any{"ENTER"}},
		},
	} {
		result := s.callTool(contract.PublicToolGUI, map[string]any{"actions": actions})
		if result.IsError {
			t.Fatalf("separate sequence rejected: %s", ResultText(result))
		}
	}
	if len(backend.desktopRequests) != 3 {
		t.Fatalf("expected one provider call per valid batch, got %d", len(backend.desktopRequests))
	}
}

func TestNonWindowsGUIKeepsQueuedTextBatch(t *testing.T) {
	for _, platform := range []string{"linux", "darwin"} {
		t.Run(platform, func(t *testing.T) {
			backend := &recordingPlatformBackend{desktopResponse: &ProviderDesktopResult{OK: true}}
			s := NewServiceWithBackend(&platformRecordingBackend{backend, platform})
			s.callTool(contract.PublicToolGUI, map[string]any{
				"actions": []any{
					map[string]any{"type": "keypress", "keys": []any{"CTRL", "A"}},
					map[string]any{"type": "type", "text": "replacement"},
				},
			})
			if len(backend.desktopRequests) != 1 {
				t.Fatal("Windows ordering restriction affected another platform")
			}
		})
	}
}
