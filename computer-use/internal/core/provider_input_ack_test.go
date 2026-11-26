package core

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestProviderInputAcknowledgementWire(t *testing.T) {
	data := readProviderFixture(t, "input-ack.request.json")
	request, err := DecodeProviderWireRequest(data)
	if err != nil {
		t.Fatal(err)
	}
	if !request.Action.RequireInputAck {
		t.Fatal("receiver acknowledgement requirement was lost")
	}
	assertProviderFixtureRoundTrip(t, data, request)
	for _, value := range []string{"null", `"true"`, "1", "[]"} {
		invalid := strings.Replace(string(data), `"require_input_ack": true`,
			`"require_input_ack": `+value, 1)
		if _, err := DecodeProviderWireRequest([]byte(invalid)); err == nil {
			t.Fatalf("accepted acknowledgement value %s", value)
		}
	}
	invalid := strings.Replace(string(data), `"keypress"`, `"type"`, 1)
	invalid = strings.Replace(invalid, `"key": "CTRL+A"`, `"text": "hello"`, 1)
	if _, err := DecodeProviderWireRequest([]byte(invalid)); err == nil {
		t.Fatal("accepted acknowledgement requirement on synchronous text")
	}
	request.Action.RequireInputAck = false
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "require_input_ack") {
		t.Fatal("standalone actions should retain their existing wire shape")
	}
}

func TestProviderInputAcknowledgementFailureKeepsItsPhase(t *testing.T) {
	data := readProviderFixture(t, "input-ack-unknown.response.json")
	response, err := DecodeProviderWireResponse(data)
	if err != nil {
		t.Fatal(err)
	}
	assertProviderFixtureRoundTrip(t, data, response)
	result := response.Accessibility
	result.PrepareForService()
	if result.FailurePhase != "input_acknowledgement" ||
		result.UnderlyingFailureCode != "input_order_unconfirmed" ||
		!result.InputEventsEmitted || !result.MutationUnknown || result.FailureFactsComplete {
		t.Fatalf("receiver failure facts were changed: %#v", result)
	}
}
