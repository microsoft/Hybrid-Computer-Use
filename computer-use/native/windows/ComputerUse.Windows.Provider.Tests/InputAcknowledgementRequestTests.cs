using System.Text.Json.Nodes;
using ComputerUse.Windows.Runtime;

internal static class InputAcknowledgementRequestTests
{
    internal static void Run()
    {
        foreach (var value in new[] { "true", "false", "null", "\"true\"", "1", "[]" })
        {
            var request = JsonNode.Parse(
                """
                {"protocol":"computer-use-provider","schema_version":2,
                 "request_id":"ack","operation":"resolve_and_act",
                 "action":{"protocol_version":2,"intent":"keypress","app":"Editor",
                  "window_handle":"w2:fixture","require_input_ack":true,
                  "input":{"key":"CTRL+A"}}}
                """)!.AsObject();
            request["action"]!["require_input_ack"] = JsonNode.Parse(value);
            var accepted = true;
            try { ProviderServer.ValidateRequest(request); }
            catch (ProviderFailureException) { accepted = false; }
            if (accepted != (value is "true" or "false"))
                throw new InvalidDataException($"Incorrect acknowledgement validation for {value}");
            if (value != "true") { continue; }
            request["action"]!["intent"] = "type";
            request["action"]!["input"] = new JsonObject { ["text"] = "hello" };
            try
            {
                ProviderServer.ValidateRequest(request);
                throw new InvalidDataException("Synchronous text accepted a queued input requirement");
            }
            catch (ProviderFailureException) { }
        }
    }
}
