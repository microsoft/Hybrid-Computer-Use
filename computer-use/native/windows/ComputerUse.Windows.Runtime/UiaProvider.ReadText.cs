using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Nodes;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace ComputerUse.Windows.Runtime;

internal sealed partial class UiaProvider
{
    internal JsonObject ReadText(JsonObject request)
    {
        using var deadline = new WindowsReadOnlyDeadline(SnapshotSampleTimeout);
        using var windowSample = NativeDesktop.ReadOnlyWindowScope();
        var clock = Stopwatch.StartNew();
        var query = RequiredString(request, "app");
        var (process, scope) = ResolveApp(request, query);
        using (process)
        {
            var target = request["target"] as JsonObject;
            var record = request["element"] as JsonObject;
            var handle = OptionalString(request, "window_handle", string.Empty);
            var selected = ResolveWindow(process, target, handle, "stale_element_ref", scope);
            var currentHandle = OptionalString(target, "windowHandle", handle);
            WindowsWindowExpectation.ValidateCurrent(
                request["expected_window"] as JsonObject, handle, currentHandle,
                $"win32:pid:{process.Id}", currentHandle, ProcessGeneration(process), "window");
            var root = _automation.FromHandle(selected.Handle);
            var element = ResolveElement(root, target, record, process, selected,
                () => _automation.FromHandle(selected.Handle)) ??
                throw new ProviderFailureException("semantic_target_not_found", "precondition",
                    "read_text requires an exact target.");
            var options = request["observation"]?["text_read"]?.AsObject() ??
                throw new ProviderFailureException("invalid_request", "precondition",
                    "The text read options are missing.");
            var field = RequiredString(options, "field");
            var page = WindowsTextRead.Read(
                field, options["start"]!.GetValue<int>(), options["limit"]!.GetValue<int>(),
                () => ReadField(element, field, CheckCurrent),
                () => element.Properties.IsPassword.TryGetValue(out var value) ? value : null,
                CheckCurrent);
            return new JsonObject
            {
                ["ok"] = true,
                ["text_read"] = page.ToJson(),
                ["mutation"] = new JsonObject
                {
                    ["input_events_emitted"] = false,
                    ["desktop_state_mutated"] = false,
                    ["partial_input_possible"] = false,
                    ["mutation_unknown"] = false,
                },
            };

            void CheckCurrent()
            {
                if (clock.Elapsed >= SnapshotSampleTimeout)
                {
                    throw new ProviderFailureException("text_read_timeout", "readback",
                        "The Windows text read exceeded its sampling deadline.");
                }
                NativeDesktop.RefreshReadOnlyWindowScope();
                var liveWindow = ResolveWindow(process, target, handle, "stale_element_ref", scope);
                if (liveWindow.Handle != selected.Handle)
                {
                    throw new ProviderFailureException("stale_element_ref", "precondition",
                        "The text target's bound window changed.");
                }
                EnsureTargetStillMatches(element, target, record);
                EnsureTargetLogicalWindow(element, process, liveWindow);
            }
        }
    }

    private string? ReadField(AutomationElement element, string field, Action verifyIdentity) => field switch
    {
        "name" => element.Properties.Name.ValueOrDefault ?? string.Empty,
        "description" => element.Properties.HelpText.ValueOrDefault ?? string.Empty,
        "value" => ReadTextValue(element, verifyIdentity),
        _ => throw new ProviderFailureException("invalid_request", "precondition",
            "Unsupported text field."),
    };

    private string? ReadTextValue(AutomationElement element, Action verifyIdentity)
    {
        var handle = element.Properties.NativeWindowHandle.ValueOrDefault;
        if (element.ControlType == ControlType.Edit && handle != 0 &&
            _automation.Compare(element, _automation.FromHandle(handle)))
        {
            return WindowsTextReadNative.Read(handle, element.Properties.ProcessId.Value);
        }
        var accessibleText = UiaAccessibleText.Read(element, _automation, verifyIdentity);
        if (accessibleText is not null) { return accessibleText; }
        var value = element.Patterns.Value.PatternOrDefault;
        if (value is not null) { return value.Value.Value; }
        var text = element.Patterns.Text.PatternOrDefault;
        if (text is not null)
        {
            return text.DocumentRange.GetText(WindowsTextRead.MaxSourceUtf16Length + 1);
        }
        var range = element.Patterns.RangeValue.PatternOrDefault;
        return range?.Value.Value.ToString("R", CultureInfo.InvariantCulture);
    }
}
