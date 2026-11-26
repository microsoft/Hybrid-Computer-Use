using System.Runtime.InteropServices;
using FlaUI.Core.Exceptions;

namespace ComputerUse.Windows.Runtime;

internal static class UiaElementReadRecovery
{
    // UIAutomationCore uses this HRESULT for a retired or virtualized element.
    // Generic COM error text gives it an unrelated event-system description.
    private const int ElementNotAvailable = unchecked((int)0x80040201);

    internal static bool IsElementNotAvailable(Exception error) =>
        error is ElementNotAvailableException ||
        error is COMException && error.HResult == ElementNotAvailable;

    internal static bool ValidateLease(Action read, bool semanticRebindAuthorized)
    {
        try
        {
            read();
            return true;
        }
        catch (Exception error) when (IsElementNotAvailable(error))
        {
            if (semanticRebindAuthorized) { return false; }
            throw Stale();
        }
    }

    internal static T Read<T>(Func<T> read)
    {
        try { return read(); }
        catch (Exception error) when (IsElementNotAvailable(error))
        {
            throw Stale();
        }
    }

    internal static ProviderFailureException Stale() => new(
        "stale_element_ref", "precondition",
        "The observed UIA element is no longer available; no input was emitted.",
        factsComplete: true, subject: "element");
}
