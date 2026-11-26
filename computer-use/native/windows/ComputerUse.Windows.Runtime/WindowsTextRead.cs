using System.Text.Json.Nodes;

namespace ComputerUse.Windows.Runtime;

internal sealed record WindowsTextPage(string Field, int Start, int End, int Total, string Text)
{
    internal JsonObject ToJson() => new()
    {
        ["field"] = Field,
        ["start"] = Start,
        ["end"] = End,
        ["total"] = Total,
        ["text"] = Text,
    };
}

internal static class WindowsTextRead
{
    internal const int MaxPageCharacters = 4000;
    // Refuse a larger acquisition instead of labelling a bounded prefix
    // as the complete text.
    internal const int MaxSourceUtf16Length = 1024 * 1024;

    internal static string ReadCountedSource(
        Func<int> characterCount, Func<int, string?> read, Action verifyIdentity)
    {
        verifyIdentity();
        var count = characterCount();
        if (count < 0)
        {
            throw Failure("text_read_failed", "The text provider returned an invalid character count.");
        }
        if (count > MaxSourceUtf16Length)
        {
            throw Failure("text_read_limit",
                "The target's text exceeds the Windows acquisition limit; select a smaller text-bearing element.");
        }
        verifyIdentity();
        var text = count == 0 ? string.Empty : read(count);
        verifyIdentity();
        var after = characterCount();
        verifyIdentity();
        if (after != count)
        {
            throw Failure("text_changed", "The text changed during the read; observe the target again.");
        }
        if (text is null || text.Length != count)
        {
            throw Failure("text_read_failed", "The text provider did not return the complete requested range.");
        }
        return text;
    }

    internal static WindowsTextPage Read(
        string field, int start, int limit, Func<string?> read,
        Func<bool?> isProtected, Action verifyIdentity)
    {
        if (field is not ("name" or "value" or "description") ||
            start < 0 || limit < 1 || limit > MaxPageCharacters)
        {
            throw Failure("invalid_argument", "Invalid text field or page range.");
        }

        CheckCurrent();
        var text = ReadComplete();
        CheckCurrent();
        var after = ReadComplete();
        CheckCurrent();
        if (!string.Equals(text, after, StringComparison.Ordinal))
        {
            throw Failure("text_changed", "The text changed during the read; observe the target again.");
        }
        return Page(field, text, start, limit);

        void CheckCurrent()
        {
            verifyIdentity();
            var protectedText = isProtected();
            if (protectedText != false)
            {
                throw Failure("text_protected", protectedText == true
                    ? "Protected text cannot be read."
                    : "The target's text protection status is unavailable.");
            }
        }

        string ReadComplete()
        {
            var value = read();
            if (value is null)
            {
                throw Failure("text_read_unavailable", $"The target's {field} text is unavailable.");
            }
            if (value.Length > MaxSourceUtf16Length)
            {
                throw Failure("text_read_limit",
                    "The target's text exceeds the Windows acquisition limit; select a smaller text-bearing element.");
            }
            return value;
        }
    }

    internal static WindowsTextPage Page(string field, string text, int start, int limit)
    {
        var total = 0;
        var startUtf16 = -1;
        var endUtf16 = -1;
        for (var offset = 0; offset < text.Length; offset++)
        {
            if (total == start) { startUtf16 = offset; }
            if ((long)total == (long)start + limit) { endUtf16 = offset; }
            if (char.IsSurrogate(text[offset]))
            {
                if (!char.IsHighSurrogate(text[offset]) || offset + 1 >= text.Length ||
                    !char.IsLowSurrogate(text[offset + 1]))
                {
                    throw Failure("text_read_failed", "The provider returned invalid UTF-16 text.");
                }
                offset++;
            }
            total++;
        }
        if (start > total)
        {
            throw Failure("invalid_argument", "Text start exceeds the live character count.");
        }
        if (startUtf16 < 0) { startUtf16 = text.Length; }
        if (endUtf16 < 0) { endUtf16 = text.Length; }
        var end = start + Math.Min(limit, total - start);
        return new(field, start, end, total, text[startUtf16..endUtf16]);
    }

    private static ProviderFailureException Failure(string code, string message) =>
        new(code, "readback", message, inputEventsEmitted: false, mutationUnknown: false);
}
