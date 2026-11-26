namespace ComputerUse.Windows.Runtime;

internal static class UiaComboBoxOptionOwnerTests
{
    private sealed class Node(string role, Node? parent = null)
    {
        internal string Role { get; } = role;
        internal Node? Parent { get; set; } = parent;
        internal Node? SelectionContainer { get; set; }
    }

    internal static void Run()
    {
        var window = new Node("window");
        var combo = new Node("combobox", window);
        var list = new Node("list", combo);
        var option = new Node("listitem", list) { SelectionContainer = list };
        if (!ReferenceEquals(Resolve(option), combo))
            throw new InvalidDataException("A combobox's exact popup selection chain was not recognized.");

        var foreignList = new Node("list", new Node("combobox", window));
        option.SelectionContainer = foreignList;
        if (Resolve(option) is not null)
            throw new InvalidDataException("A foreign SelectionContainer authorized the popup item.");
        option.SelectionContainer = list;

        list.Parent = window;
        if (Resolve(option) is not null)
            throw new InvalidDataException("A file-list item was mistaken for a combobox option.");
        list.Parent = new Node("group", combo);
        if (Resolve(option) is not null)
            throw new InvalidDataException("Arbitrary ancestor traversal authorized an option.");
        list.Parent = combo;

        var direct = new Node("listitem", combo) { SelectionContainer = combo };
        if (!ReferenceEquals(Resolve(direct), combo))
            throw new InvalidDataException("A direct option/container relationship was rejected.");
        direct.Parent = null;
        if (Resolve(direct) is not null)
            throw new InvalidDataException("A retired option retained its owner.");

        if (UiaClickRouting.Select("listitem", true, true, false, true,
                exactComboBoxOption: true) != UiaClickRoute.Invoke ||
            UiaClickRouting.Select("listitem", true, true, false, true) is not null ||
            UiaClickRouting.Select("listitem", false, true, false, true,
                exactComboBoxOption: true) is not null ||
            UiaClickRouting.Select("listitem", true, true, false, false,
                exactComboBoxOption: true) != UiaClickRoute.SelectionItem)
        {
            throw new InvalidDataException("Option routing changed unrelated native or file-list selection.");
        }
    }

    private static Node? Resolve(Node option) => UiaComboBoxOptionOwner.Resolve(
        option, node => node.Role, node => node.Parent,
        node => node.SelectionContainer, ReferenceEquals);
}
