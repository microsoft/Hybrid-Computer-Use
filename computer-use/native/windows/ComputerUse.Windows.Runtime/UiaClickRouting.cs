namespace ComputerUse.Windows.Runtime;

internal enum UiaClickRoute
{
    Invoke,
    SelectionItem,
    Toggle,
    ExpandCollapse,
}

internal static class UiaClickRouting
{
    internal static UiaClickRoute? Select(
        string role,
        bool hasInvoke,
        bool hasSelectionItem,
        bool hasToggle,
        bool hasLegacyIAccessible = false,
        bool hasExpandCollapse = false,
        bool exactComboBoxOption = false)
    {
        var normalizedRole = role.Trim().ToLowerInvariant();
        if (normalizedRole == "combobox" && hasExpandCollapse && !hasInvoke)
        {
            return UiaClickRoute.ExpandCollapse;
        }
        if (normalizedRole == "radio")
        {
            // SelectionItem is the standard radio contract. A simultaneous
            // Toggle pattern is contradictory, so choose no UIA pattern and
            // let the caller take its single preselected pointer route.
            if (hasSelectionItem && hasToggle)
            {
                return null;
            }
            if (hasToggle)
            {
                return UiaClickRoute.Toggle;
            }
            if (hasSelectionItem)
            {
                // MSAA selection can change only accessibility state, or
                // require separate focus flags. Its radio default action
                // activates the control; otherwise use a checked pointer.
                return hasLegacyIAccessible
                    ? hasInvoke ? UiaClickRoute.Invoke : null
                    : UiaClickRoute.SelectionItem;
            }
            return hasInvoke ? UiaClickRoute.Invoke : null;
        }
        if (normalizedRole == "listitem")
        {
            if (hasSelectionItem)
            {
                // A bridged Select can change only accessibility state.
                // Invoke is equivalent only for a proven combobox option:
                // a file item's default action could open it instead.
                return hasLegacyIAccessible
                    ? exactComboBoxOption && hasInvoke ? UiaClickRoute.Invoke : null
                    : UiaClickRoute.SelectionItem;
            }
            if (hasInvoke)
            {
                return UiaClickRoute.Invoke;
            }
            return hasToggle ? UiaClickRoute.Toggle : null;
        }
        if (normalizedRole == "treeitem" && hasToggle)
        {
            return UiaClickRoute.Toggle;
        }
        if (normalizedRole is "checkbox" or "switch")
        {
            if (hasToggle)
            {
                return UiaClickRoute.Toggle;
            }
            if (hasInvoke)
            {
                return UiaClickRoute.Invoke;
            }
            return hasSelectionItem && !hasLegacyIAccessible
                ? UiaClickRoute.SelectionItem : null;
        }
        if (hasInvoke)
        {
            return UiaClickRoute.Invoke;
        }
        if (hasSelectionItem)
        {
            return hasLegacyIAccessible ? null : UiaClickRoute.SelectionItem;
        }
        return hasToggle ? UiaClickRoute.Toggle : null;
    }
}
