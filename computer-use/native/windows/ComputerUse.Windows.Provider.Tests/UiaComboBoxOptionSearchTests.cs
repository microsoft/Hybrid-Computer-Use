namespace ComputerUse.Windows.Runtime;

internal static class UiaComboBoxOptionSearchTests
{
    private sealed class Node(string role, string name = "", bool enabled = true)
    {
        internal string Role { get; } = role;
        internal string Name { get; } = name;
        internal bool Enabled { get; } = enabled;
        internal Node? Child { get; set; }
        internal Node? Next { get; set; }
    }

    internal static void Run()
    {
        var chosen = new Node("listitem", "Chosen");
        var other = new Node("listitem", "Other") { Next = chosen };
        var owner = new Node("combobox") { Child = other };
        AssertSame(chosen, Find(owner));

        var list = new Node("list") { Child = other };
        owner.Child = list;
        AssertSame(chosen, Find(owner));

        // A second exact match remains ambiguous even across the two shapes.
        list.Next = new Node("listitem", "Chosen");
        ExpectFailure(() => Find(owner), "capability_unsupported");
        list.Next = null;

        var nested = new Node("list") { Child = chosen };
        list.Child = nested;
        if (Find(owner) is not null)
            throw new InvalidDataException("Search followed a second List level.");
        owner.Child = new Node("group") { Child = chosen };
        if (Find(owner) is not null)
            throw new InvalidDataException("Search entered an arbitrary group.");

        owner.Child = new Node("listitem", "Chosen", enabled: false)
        {
            Next = new Node("listitem", "Other"),
        };
        ExpectFailure(() => Find(owner), "target_not_enabled");

        // An early exact match cannot succeed before the entire bounded list
        // has been inspected for another match.
        owner.Child = chosen;
        var last = chosen;
        for (var index = 0; index < 256; index++)
        {
            last.Next = new Node("listitem", $"Other {index}");
            last = last.Next;
        }
        ExpectFailure(() => Find(owner), "capability_unsupported");
        chosen.Next = null;
        ExpectFailure(() => Find(owner, withinDeadline: false), "capability_unsupported");
    }

    private static Node? Find(Node owner, bool withinDeadline = true) =>
        UiaComboBoxOptionSearch.FindUnique(
            owner, "Chosen", node => node.Child, node => node.Next,
            node => node.Role, node => node.Name, node => node.Enabled,
            () => withinDeadline);

    private static void AssertSame(Node expected, Node? actual)
    {
        if (!ReferenceEquals(expected, actual))
            throw new InvalidDataException("Search missed the exact combobox option.");
    }

    private static void ExpectFailure(Action read, string code)
    {
        try
        {
            read();
            throw new InvalidDataException("Unsafe combobox search succeeded.");
        }
        catch (ProviderFailureException error) when (
            error.Code == code && error.Phase == "precondition" &&
            !error.InputEventsEmitted && !error.MutationUnknown)
        {
        }
    }
}
