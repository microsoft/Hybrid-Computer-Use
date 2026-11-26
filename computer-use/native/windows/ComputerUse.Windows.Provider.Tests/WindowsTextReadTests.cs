using System.Text;

namespace ComputerUse.Windows.Runtime;

internal static class WindowsTextReadTests
{
    internal static void Run()
    {
        var text = string.Concat(Enumerable.Repeat("中🙂e\u0301\r\n", 12000));
        var received = new System.Text.StringBuilder();
        var position = 0;
        var total = text.EnumerateRunes().Count();
        while (position < total)
        {
            var page = Read(text, position, 4000);
            Check(page.Start == position && page.End - page.Start <= 4000 &&
                page.Total == total && page.Text.EnumerateRunes().Count() == page.End - page.Start,
                "Unicode pages must count code points rather than UTF-16 units.");
            received.Append(page.Text);
            position = page.End;
        }
        Check(received.ToString() == text, "Long text must round-trip across page boundaries.");
        Check(Read("", 0, 4000) == new WindowsTextPage("value", 0, 0, 0, ""),
            "An empty value is a complete empty page.");
        Check(Read("A🙂B", 1, 1) == new WindowsTextPage("value", 1, 2, 3, "🙂"),
            "A page must not split a surrogate pair.");
        Check(Read("A🙂B", 3, 1) == new WindowsTextPage("value", 3, 3, 3, ""),
            "Start at the live end must return an empty page.");
        Refuses("invalid_argument", () => Read("A🙂B", 4, 1));
        Refuses("invalid_argument", () => Read("abc", int.MaxValue, 4000));
        Refuses("text_read_failed", () => Read("a\ud800b", 0, 1));
        Refuses("text_read_failed", () => Read("\udc00", 0, 1));
        Refuses("text_read_limit", () => Read(new string('x', WindowsTextRead.MaxSourceUtf16Length + 1), 0, 1));

        foreach (var field in new[] { "name", "value", "description" })
        {
            var page = WindowsTextRead.Read(field, 1, 2, () => "标签🙂x", () => false, () => { });
            Check(page.Field == field && page.Text == "签🙂" && page.Total == 4,
                "Every supported field must retain exact Unicode text.");
        }

        var reads = 0;
        string Value() { reads++; return "secret"; }
        foreach (var protection in new bool?[] { true, null })
        {
            Refuses("text_protected", () => WindowsTextRead.Read(
                "value", 0, 10, Value, () => protection, () => { }));
        }
        Check(reads == 0, "Protected or unknown-protection text must not be queried.");
        var protectionChecks = 0;
        Refuses("text_protected", () => WindowsTextRead.Read("name", 0, 10, Value,
            () => ++protectionChecks == 1 ? false : true, () => { }));
        Check(reads == 1, "A control becoming protected must reject without a second text read.");

        var values = new Queue<string>(["same length A", "same length B"]);
        Refuses("text_changed", () => WindowsTextRead.Read(
            "value", 0, 3, values.Dequeue, () => false, () => { }));
        Refuses("text_read_unavailable", () => WindowsTextRead.Read(
            "value", 0, 3, () => null, () => false, () => { }));

        reads = 0;
        Refuses("stale_element_ref", () => WindowsTextRead.Read("value", 0, 2,
            Value, () => false, () => throw new ProviderFailureException(
                "stale_element_ref", "precondition", "Foreign or retired target.")));
        Check(reads == 0, "A stale or foreign target must reject before the value is read.");
        foreach (var (field, start, limit) in new[]
        {
            ("wrong", 0, 1), ("value", -1, 1), ("value", 0, 0), ("value", 0, 4001),
        })
        {
            Refuses("invalid_argument", () => WindowsTextRead.Read(
                field, start, limit, Value, () => false, () => { }));
        }
        Check(reads == 0, "Invalid ranges must reject before querying native text.");

        var multiline = "第一行 中\n第二行🙂";
        var counted = WindowsTextRead.ReadCountedSource(
            () => multiline.Length, count => multiline[..count], () => { });
        Check(counted == multiline, "A counted accessibility source must preserve line breaks and surrogate pairs.");
        var textQueries = 0;
        string Query(int count) { textQueries++; return new string('x', count); }
        Check(WindowsTextRead.ReadCountedSource(() => 0, Query, () => { }) == "" &&
            textQueries == 0, "An empty counted source must not query a nonempty text range.");
        Refuses("text_read_limit", () => WindowsTextRead.ReadCountedSource(
            () => WindowsTextRead.MaxSourceUtf16Length + 1, Query, () => { }));
        Refuses("text_read_failed", () => WindowsTextRead.ReadCountedSource(
            () => -1, Query, () => { }));
        Check(textQueries == 0, "An invalid or oversized count must reject before acquiring text.");
        Refuses("text_read_failed", () => WindowsTextRead.ReadCountedSource(
            () => 5, _ => "abc", () => { }));
        Refuses("text_read_failed", () => WindowsTextRead.ReadCountedSource(
            () => 3, _ => null, () => { }));
        var counts = new Queue<int>([4, 5]);
        Refuses("text_changed", () => WindowsTextRead.ReadCountedSource(
            counts.Dequeue, Query, () => { }));
        var ownerChecks = 0;
        textQueries = 0;
        Refuses("stale_element_ref", () => WindowsTextRead.ReadCountedSource(
            () => 4, Query, () =>
            {
                if (++ownerChecks == 2)
                {
                    throw new ProviderFailureException("stale_element_ref", "precondition",
                        "The text service changed owners.");
                }
            }));
        Check(textQueries == 0, "A mismatched text-service owner must reject before the text query.");
    }

    private static WindowsTextPage Read(string text, int start, int limit) =>
        WindowsTextRead.Read("value", start, limit, () => text, () => false, () => { });

    private static void Refuses(string code, Action read)
    {
        try
        {
            read();
            throw new InvalidOperationException($"Expected text read failure {code}.");
        }
        catch (ProviderFailureException error)
        {
            Check(error.Code == code && !error.InputEventsEmitted && !error.MutationUnknown,
                $"Expected a no-input {code} failure, got {error.Code}.");
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) { throw new InvalidOperationException(message); }
    }
}
