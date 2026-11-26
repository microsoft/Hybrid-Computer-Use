using System.Text.Json.Nodes;

namespace ComputerUse.Windows.Runtime;

internal static class ReadTextProviderTests
{
    internal static void Run()
    {
        foreach (var field in new[] { "name", "value", "description" })
        {
            var request = Request(field, 1, 1);
            ProviderServer.ValidateRequest(request);
            using var server = new ProviderServer();
            var response = server.Dispatch(request)["accessibility"]!.AsObject();
            if (response["ok"]?.GetValue<bool>() != true ||
                response["text_read"]?["field"]?.GetValue<string>() != field ||
                response["text_read"]?["text"]?.GetValue<string>() != "🙂" ||
                response["text_read"]?["total"]?.GetValue<int>() != 3 ||
                response["mutation"]?["input_events_emitted"]?.GetValue<bool>() != false)
            {
                throw new InvalidDataException("Windows read_text dispatch lost the page or no-input evidence.");
            }
        }
        foreach (var malformed in new JsonNode?[]
        {
            null, JsonValue.Create("not an object"),
            new JsonObject { ["field"] = "value", ["start"] = 0 },
            new JsonObject { ["field"] = "other", ["start"] = 0, ["limit"] = 1 },
            new JsonObject { ["field"] = "value", ["start"] = -1, ["limit"] = 1 },
            new JsonObject { ["field"] = "value", ["start"] = 0, ["limit"] = 4001 },
            new JsonObject { ["field"] = "value", ["start"] = 0.5, ["limit"] = 1 },
            new JsonObject { ["field"] = "value", ["start"] = 0, ["limit"] = 1, ["extra"] = true },
        })
        {
            var request = Request("value", 0, 1);
            request["action"]!["observation"]!["text_read"] = malformed;
            Invalid(request);
        }
        var mutation = Request("value", 0, 1);
        mutation["action"]!["intent"] = "click";
        mutation["action"]!["input"] = new JsonObject { ["click_count"] = 1 };
        Invalid(mutation);
        var observe = Request("value", 0, 1);
        observe["operation"] = "observe";
        var payload = observe["action"]!.DeepClone().AsObject();
        payload.Remove("intent");
        payload.Remove("target");
        observe.Remove("action");
        observe["observe"] = payload;
        Invalid(observe);
    }

    private static JsonObject Request(string field, int start, int limit) => new()
    {
        ["protocol"] = "computer-use-provider",
        ["schema_version"] = 2,
        ["request_id"] = "read-text",
        ["operation"] = "resolve_and_act",
        ["action"] = new JsonObject
        {
            ["protocol_version"] = 2,
            ["intent"] = "resolve_target",
            ["app"] = "ReadText",
            ["target"] = new JsonObject { ["selector"] = "textbox", ["hasName"] = false },
            ["observation"] = new JsonObject
            {
                ["text_read"] = new JsonObject { ["field"] = field, ["start"] = start, ["limit"] = limit },
                ["capture_snapshot"] = false,
                ["include_screenshot"] = false,
            },
        },
    };

    private static void Invalid(JsonObject request)
    {
        try
        {
            ProviderServer.ValidateRequest(request);
            throw new InvalidDataException("Invalid text read request was accepted.");
        }
        catch (ProviderFailureException error) when (error.Code == "invalid_request") { }
    }
}

// ProviderServer's contract tests use the partial UiaProvider from ProviderStubs.
internal sealed partial class UiaProvider
{
    internal JsonObject ReadText(JsonObject request)
    {
        var read = request["observation"]!["text_read"]!.AsObject();
        var page = WindowsTextRead.Read(read["field"]!.GetValue<string>(),
            read["start"]!.GetValue<int>(), read["limit"]!.GetValue<int>(),
            () => "A🙂B", () => false, () => { });
        return new JsonObject
        {
            ["ok"] = true,
            ["text_read"] = page.ToJson(),
            ["mutation"] = new JsonObject { ["input_events_emitted"] = false },
        };
    }
}
