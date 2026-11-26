using System.Diagnostics;
using System.Text.Json.Nodes;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace ComputerUse.Windows.Runtime;

internal sealed partial class UiaProvider
{
    private bool TrySetComboBoxValue(
        AutomationElement element,
        string requested,
        Action<string> beforeMutation,
        Action<AutomationElement> verifyOwner,
        Action<bool> recordReadback,
        out bool emitted)
    {
        emitted = false;
        if (element.ControlType != ControlType.ComboBox ||
            element.Patterns.ExpandCollapse.PatternOrDefault is not { } expansion ||
            element.Patterns.Value.PatternOrDefault is not { } value ||
            value.IsReadOnly.Value ||
            element.Patterns.Text.PatternOrDefault is not null ||
            element.FindFirstChild(condition => condition.ByControlType(ControlType.Edit)) is not null)
        {
            return false;
        }
        var state = expansion.ExpandCollapseState.Value;
        if (state is not (ExpandCollapseState.Collapsed or ExpandCollapseState.Expanded))
            return false;
        verifyOwner(element);
        if (string.Equals(value.Value.Value, requested, StringComparison.Ordinal))
        {
            recordReadback(true);
            return true;
        }
        var sent = false;
        try
        {
            if (state == ExpandCollapseState.Collapsed)
            {
                beforeMutation("uia.pattern.expand.combobox_value");
                expansion.Expand();
                sent = true;
            }
            var watch = Stopwatch.StartNew();
            AutomationElement? option;
            do
            {
                option = FindComboBoxOption(element, requested, watch);
                if (option is not null) { break; }
                if (watch.Elapsed >= LiveValueReadback.Timeout)
                    throw new ProviderFailureException("capability_unsupported", "precondition",
                        "No unique option with the requested value became available in the combobox.");
                Thread.Sleep(LiveValueReadback.PollInterval);
            }
            while (true);
            var owner = ComboBoxOptionOwner(option);
            if (owner is null || !_automation.Compare(owner, element))
                throw new ProviderFailureException("stale_element_ref", "precondition",
                    "The option no longer belongs to the exact combobox.");
            verifyOwner(owner);
            var invoke = option.Patterns.Invoke.PatternOrDefault;
            var selection = option.Patterns.SelectionItem.PatternOrDefault;
            var legacy = option.Patterns.LegacyIAccessible.PatternOrDefault is not null;
            if (legacy && invoke is null || !legacy && selection is null && invoke is null)
                throw new ProviderFailureException("capability_unsupported", "precondition",
                    "The exact combobox option exposes no equivalent native selection action.");
            if (legacy || selection is null)
            {
                beforeMutation("uia.pattern.invoke.combobox_value");
                invoke!.Invoke();
            }
            else
            {
                beforeMutation("uia.pattern.selection_item.combobox_value");
                selection.Select();
            }
            sent = true;
            FinishComboBoxOption(owner, requested, verifyOwner, recordReadback);
            emitted = true;
            return true;
        }
        catch (ProviderFailureException error) when (sent)
        {
            throw UiaMutationFailureAttribution.Preserve(error, true, new JsonObject());
        }
        catch (Exception error) when (sent)
        {
            throw UiaMutationFailureAttribution.FromUnexpected(error, true, new JsonObject());
        }
    }

    private AutomationElement? FindComboBoxOption(
        AutomationElement owner, string requested, Stopwatch watch)
    {
        using var cache = CacheRequest.ForceNoCache();
        var walker = _automation.TreeWalkerFactory.GetControlViewWalker();
        return UiaComboBoxOptionSearch.FindUnique(
            owner, requested, walker.GetFirstChild, walker.GetNextSibling,
            node => CanonicalRole(node.ControlType),
            node => node.Name, node => node.IsEnabled,
            () => watch.Elapsed <= LiveValueReadback.Timeout);
    }

    private AutomationElement? ComboBoxOptionOwner(AutomationElement element)
    {
        using var cache = CacheRequest.ForceNoCache();
        return UiaElementReadRecovery.Read(() =>
        {
            var walker = _automation.TreeWalkerFactory.GetRawViewWalker();
            var owner = UiaComboBoxOptionOwner.Resolve(
                element,
                node => CanonicalRole(node.ControlType),
                walker.GetParent,
                node => node.Patterns.SelectionItem.PatternOrDefault?.SelectionContainer.Value,
                _automation.Compare);
            if (owner is null) { return null; }
            if (owner.Patterns.ExpandCollapse.PatternOrDefault is not { } expansion ||
                expansion.ExpandCollapseState.Value != ExpandCollapseState.Expanded ||
                owner.Patterns.Value.PatternOrDefault is null)
            {
                return null;
            }
            return owner;
        });
    }

    private static void FinishComboBoxOption(
        AutomationElement owner,
        string expected,
        Action<AutomationElement> verifyOwner,
        Action<bool> recordReadback)
    {
        try
        {
            using var cache = CacheRequest.ForceNoCache();
            // MSAA-backed Invoke can commit the option without dismissing its
            // native popup. Collapse the same proven owner, never click outside it.
            verifyOwner(owner);
            var expansion = owner.Patterns.ExpandCollapse.PatternOrDefault;
            if (expansion?.ExpandCollapseState.Value == ExpandCollapseState.Expanded)
                expansion.Collapse();
            var verified = LiveValueReadback.Verify(
                expected, () =>
                    owner.Patterns.ExpandCollapse.PatternOrDefault?.ExpandCollapseState.Value ==
                        ExpandCollapseState.Collapsed
                    ? owner.Patterns.Value.PatternOrDefault?.Value.Value
                    : null);
            recordReadback(verified);
            if (!verified)
                throw new ProviderFailureException(
                    "readback_mismatch", "readback",
                    "The combobox option action returned, but its owner's value did not match.",
                    inputEventsEmitted: true, mutationUnknown: true);
        }
        catch (ProviderFailureException error) when (error.InputEventsEmitted) { throw; }
        catch (Exception error)
        {
            throw new ProviderFailureException(
                "post_action_observation_failed", "post_action_observation",
                $"The combobox option action returned, but its final state could not be read: {error.Message}",
                inputEventsEmitted: true, mutationUnknown: true);
        }
    }
}
