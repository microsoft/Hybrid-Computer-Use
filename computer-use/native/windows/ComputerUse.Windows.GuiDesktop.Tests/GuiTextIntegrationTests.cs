using System.Text.Json.Nodes;
using ComputerUse.Windows.Runtime;

internal static class GuiTextIntegrationTests
{
    internal static void Run()
    {
        NativeDesktop.Reset();
        var malformed = Batch(
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d },
            new JsonObject { ["type"] = "type", ["text"] = "later\ud800" });
        var failure = Fails(() => DesktopProvider.ExecuteBatch(malformed));
        Check(failure.Code == "invalid_argument" && !failure.InputEventsEmitted &&
            NativeDesktop.Calls.Count == 0 && NativeDesktop.TextMessages.Count == 0 &&
            NativeDesktop.Captures.Count == 0,
            "Malformed later text must reject before the preceding click or any capture.");

        NativeDesktop.Reset();
        NativeDesktop.OnTextMessage = _ => false;
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(Text("ab"))));
        Check(!failure.InputEventsEmitted && failure.MutationUnknown &&
            failure.DispatchedActions == 0 &&
            failure.ActionEvidence?["attempted_messages"]?.GetValue<int>() == 1 &&
            failure.ActionEvidence?["unknown_message_index"]?.GetValue<int>() == 0 &&
            NativeDesktop.TextMessages.Count == 1,
            "The first unknown message must retain uncertainty and its attempted index without claiming delivery.");

        NativeDesktop.Reset();
        NativeDesktop.OnTextMessage = count => count < 2;
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "screenshot" },
            Text("abc"), new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d })));
        Check(failure.InputEventsEmitted && failure.MutationUnknown &&
            failure.DispatchedActions == 1 && failure.DispatchedInputActions == 0 &&
            failure.ActionEvidence?["returned_messages"]?.GetValue<int>() == 1 &&
            failure.ActionEvidence?["unknown_message_index"]?.GetValue<int>() == 1 &&
            failure.ActionEvidence?["route"]?.GetValue<string>() == "input.window_messages" &&
            NativeDesktop.TextMessages.Count == 2 && NativeDesktop.Calls.Count == 0,
            "GUI wrapping must retain the completed prefix, native failure evidence, and stop before the later click.");

        NativeDesktop.Reset();
        var result = DesktopProvider.ExecuteBatch(Batch(Text("")));
        Check(result["mutation"]?["input_events_emitted"]?.GetValue<bool>() == false &&
            result["gui_result"]?["input_actions_dispatched"]?.GetValue<int>() == 0 &&
            NativeDesktop.TextMessages.Count == 0 && NativeDesktop.InputIdleWaits == 0,
            "Empty text must not claim emission or consume a keyboard processing barrier.");
        // Without receiver acknowledgement, stop at the queued action.
        foreach (var pointer in new[] {
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d },
            new JsonObject { ["type"] = "double_click", ["x"] = 5d, ["y"] = 5d },
            new JsonObject { ["type"] = "move", ["x"] = 5d, ["y"] = 5d },
            new JsonObject { ["type"] = "scroll", ["x"] = 5d, ["y"] = 5d, ["scroll_y"] = 100d },
            new JsonObject { ["type"] = "drag", ["path"] = new JsonArray(
                new JsonObject { ["x"] = 5d, ["y"] = 5d },
                new JsonObject { ["x"] = 6d, ["y"] = 6d }) },
        })
        foreach (var intermediate in new[] {
            new JsonObject { ["type"] = "screenshot" },
            new JsonObject { ["type"] = "wait" },
            new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray("LEFT") },
        })
        {
            NativeDesktop.Reset();
            NativeDesktop.AcknowledgementProcessed = false;
            var oldFocus = NativeDesktop.Focus;
            failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
                pointer.DeepClone(), intermediate.DeepClone(), Text("marker"),
                new JsonObject { ["type"] = "click", ["x"] = 9d, ["y"] = 9d })));
            Check(failure.Code == "input_order_unconfirmed" && failure.InputEventsEmitted &&
                failure.MutationUnknown && failure.DispatchedActions == 1 &&
                NativeDesktop.Focus == oldFocus && NativeDesktop.TextMessages.Count == 0 &&
                NativeDesktop.TextSelections.Count == 0 && NativeDesktop.TextWakes.Count == 0,
                $"Pending {pointer["type"]} then {intermediate["type"]} must stop text: " +
                $"{failure.Code}, dispatched={failure.DispatchedActions}, emitted={failure.InputEventsEmitted}, unknown={failure.MutationUnknown}: {failure.Message}");
        }
        foreach (var keys in new[] { "CTRL+A", "TAB", "LEFT", "CTRL", "ALT+TAB" })
        {
            NativeDesktop.Reset();
            NativeDesktop.AcknowledgementProcessed = false;
            failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
                new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray(keys) },
                Text("marker"))));
            Check(failure.InputEventsEmitted && failure.MutationUnknown &&
                failure.DispatchedActions == 1 && NativeDesktop.Calls.Count == 2 &&
                NativeDesktop.TextMessages.Count == 0 && NativeDesktop.TextSelections.Count == 0,
                "An unchanged focus/selection cannot prove that a queued key was processed.");
        }
        NativeDesktop.Reset();
        result = DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d }, Text("")));
        Check(result["ok"]!.GetValue<bool>() && NativeDesktop.TextMessages.Count == 0,
            "Empty text after pointer input needs no focus settlement.");
        NativeDesktop.Reset();
        result = DesktopProvider.ExecuteBatch(Batch(Text("first"),
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d }));
        Check(result["ok"]!.GetValue<bool>() && NativeDesktop.TextMessages.Count == 5,
            "Text preceding pointer input must retain its existing behavior.");

        NativeDesktop.Reset();
        NativeDesktop.AcknowledgementAvailable = false;
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(Text("prefix"),
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d }, Text("later"))));
        Check(!failure.InputEventsEmitted && NativeDesktop.Calls.Count == 0 &&
            NativeDesktop.TextMessages.Count == 0 && NativeDesktop.Captures.Count == 0,
            "A missing acknowledgement helper must reject the whole mixed batch before its prefix.");

        NativeDesktop.Reset();
        NativeDesktop.OnAcknowledgement = () => NativeDesktop.Focus =
            new(9, 10, 20, 21, 20, 22, 9);
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d }, Text("wrong app"))));
        Check(failure.InputEventsEmitted && NativeDesktop.TextMessages.Count == 0 &&
            NativeDesktop.AcknowledgementDisposals == 1,
            "Text must retain the acknowledged original root if foreground changes afterward.");

        NativeDesktop.Reset();
        NativeDesktop.TextControlClass = "Edit";
        NativeDesktop.OnTextSelection = _ =>
        {
            Check(NativeDesktop.AcknowledgementChecks >=
                (NativeDesktop.TextSelections[^1].Text == "é" ? 3 : 2),
                "Text overtook the click or selection acknowledgement.");
            return true;
        };
        result = DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d },
            new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray("CTRL+A") },
            Text("中😀"),
            new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray("TAB") },
            Text("é")));
        Check(result["ok"]!.GetValue<bool>() &&
            string.Concat(NativeDesktop.TextSelections.Select(item => item.Text)) == "中😀é" &&
            NativeDesktop.AcknowledgementDisposals == 3 &&
            NativeDesktop.InputAcknowledgements[^1].Message == 0x101 &&
            NativeDesktop.InputAcknowledgements[^1].Word == 0x09 &&
            NativeDesktop.InputAcknowledgements.Select(item => item.Tag).Distinct().Count() ==
                NativeDesktop.InputAcknowledgements.Count,
            "Multi-field ordered input lost Unicode, receipt identity, final keyup or hook cleanup.");

        NativeDesktop.Reset();
        NativeDesktop.AfterSend = () =>
        {
            if (NativeDesktop.Calls.Count == 2) NativeDesktop.AcknowledgementTargetCurrent = false;
        };
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "drag", ["path"] = new JsonArray(
                new JsonObject { ["x"] = 5d, ["y"] = 5d },
                new JsonObject { ["x"] = 6d, ["y"] = 6d }) }, Text("never"))));
        Check(failure.InputEventsEmitted && failure.MutationUnknown &&
            NativeDesktop.Calls.Count == 3 && NativeDesktop.Calls[^1][0].Flags == 4 &&
            NativeDesktop.TextMessages.Count == 0,
            "Losing the drag receiver must still release its held button and stop text.");

        NativeDesktop.Reset();
        NativeDesktop.AfterSend = () => NativeDesktop.AcknowledgementTargetCurrent = false;
        failure = Fails(() => DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray("CTRL", "A") }, Text("never"))));
        Check(failure.InputEventsEmitted && failure.MutationUnknown &&
            NativeDesktop.Calls.Count == 2 && NativeDesktop.Calls[^1].All(value => (value.Flags & 2) != 0) &&
            NativeDesktop.TextMessages.Count == 0,
            "Losing the keyboard receiver must release the entire chord and stop text.");

        NativeDesktop.Reset();
        NativeDesktop.ReceiptSequence = int.MaxValue - 1;
        result = DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "click", ["x"] = 5d, ["y"] = 5d }, Text("x")));
        Check(result["ok"]!.GetValue<bool>() &&
            NativeDesktop.InputAcknowledgements[0].Tag == int.MaxValue &&
            NativeDesktop.InputAcknowledgements[1].Tag == 1,
            "Mouse receipt tags must survive DWORD truncation, sign extension and counter wrap.");

        NativeDesktop.Reset();
        NativeDesktop.OnAcknowledgement = () => NativeDesktop.AcknowledgementProcessed =
            NativeDesktop.OrderTicks >= 17;
        result = DesktopProvider.ExecuteBatch(Batch(
            new JsonObject { ["type"] = "keypress", ["keys"] = new JsonArray("LEFT") }, Text("x")));
        Check(result["ok"]!.GetValue<bool>() && NativeDesktop.OrderTicks == 17 &&
            NativeDesktop.TextMessages.Count == 1,
            "Ordering must wait for actual acknowledgement, not a fixed number of polls.");
        Console.WriteLine("GUI text validation and ordered input integration tests passed.");
    }

    private static JsonObject Text(string value) => new() { ["type"] = "type", ["text"] = value };
    private static JsonObject Batch(params JsonNode[] actions) => new() { ["actions"] = new JsonArray(actions) };
    private static ProviderFailureException Fails(Action action)
    {
        try { action(); }
        catch (ProviderFailureException error) { return error; }
        throw new InvalidOperationException("Expected a provider failure.");
    }
    private static void Check(bool condition, string message)
    {
        if (!condition) { throw new InvalidOperationException(message); }
    }
}
