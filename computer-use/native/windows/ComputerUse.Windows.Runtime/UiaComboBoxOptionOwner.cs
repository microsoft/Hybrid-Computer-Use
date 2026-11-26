namespace ComputerUse.Windows.Runtime;

internal static class UiaComboBoxOptionOwner
{
    internal static T? Resolve<T>(
        T option,
        Func<T, string> role,
        Func<T, T?> parent,
        Func<T, T?> selectionContainer,
        Func<T, T, bool> same)
        where T : class
    {
        if (role(option) != "listitem") { return null; }
        var owner = parent(option);
        var container = selectionContainer(option);
        if (owner is null || container is null || !same(owner, container)) { return null; }
        if (role(owner) == "combobox") { return owner; }
        if (role(owner) != "list") { return null; }
        var combo = parent(owner);
        return combo is not null && role(combo) == "combobox" ? combo : null;
    }
}
