namespace ComputerUse.Windows.Runtime;

internal static class UiaComboBoxOptionSearch
{
    internal static T? FindUnique<T>(
        T owner,
        string requested,
        Func<T, T?> firstChild,
        Func<T, T?> nextSibling,
        Func<T, string> role,
        Func<T, string> name,
        Func<T, bool> enabled,
        Func<bool> withinDeadline)
        where T : class
    {
        T? found = null;
        var count = 0;

        string Inspect(T node)
        {
            if (++count > 256 || !withinDeadline())
                throw new ProviderFailureException("capability_unsupported", "precondition",
                    "The combobox option list could not be read completely within its bound.");
            var nodeRole = role(node);
            if (nodeRole == "listitem" &&
                string.Equals(name(node), requested, StringComparison.Ordinal))
            {
                if (found is not null)
                    throw new ProviderFailureException("capability_unsupported", "precondition",
                        "The combobox has multiple options with that exact value; no option was selected.");
                found = node;
            }
            return nodeRole;
        }

        var child = firstChild(owner);
        while (child is not null)
        {
            if (Inspect(child) == "list")
            {
                // ControlView can retain the native List container. Descend
                // exactly this one edge, matching the raw ownership proof.
                var option = firstChild(child);
                while (option is not null)
                {
                    Inspect(option);
                    option = nextSibling(option);
                }
            }
            child = nextSibling(child);
        }
        if (found is not null && !enabled(found))
            throw new ProviderFailureException("target_not_enabled", "precondition",
                "The requested combobox option is disabled; no option was selected.",
                factsComplete: true);
        return found;
    }
}
