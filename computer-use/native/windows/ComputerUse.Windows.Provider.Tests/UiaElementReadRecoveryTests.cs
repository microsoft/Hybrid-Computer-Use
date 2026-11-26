using System.Runtime.InteropServices;

namespace ComputerUse.Windows.Runtime;

internal static class UiaElementReadRecoveryTests
{
    internal static void Run()
    {
        var calls = 0;
        if (!UiaElementReadRecovery.ValidateLease(() => calls++, true) || calls != 1)
            throw new InvalidDataException("A live lease must be read once and retained.");

        if (UiaElementReadRecovery.ValidateLease(
                () => throw Retired(), semanticRebindAuthorized: true))
            throw new InvalidDataException("An authorized retired lease must allow fresh resolution.");

        try
        {
            UiaElementReadRecovery.ValidateLease(
                () => throw Retired(), semanticRebindAuthorized: false);
            throw new InvalidDataException("A retired lease was reused without rebind authorization.");
        }
        catch (ProviderFailureException error) when (
            error.Code == "stale_element_ref" && error.Phase == "precondition" &&
            !error.InputEventsEmitted && !error.MutationUnknown && error.Subject == "element")
        {
        }

        try
        {
            UiaElementReadRecovery.Read<int>(() => throw Retired());
            throw new InvalidDataException("A retired read escaped as an internal COM failure.");
        }
        catch (ProviderFailureException error) when (
            error.Code == "stale_element_ref" && !error.InputEventsEmitted && !error.MutationUnknown)
        {
        }

        foreach (var error in new Exception[]
                 {
                     new COMException("access denied", unchecked((int)0x80070005)),
                     new InvalidOperationException("unexpected failure"),
                     new ProviderFailureException("action_dispatch_outcome_unknown", "emission",
                         "mutation may have occurred", mutationUnknown: true),
                 })
        {
            try
            {
                UiaElementReadRecovery.ValidateLease(() => throw error, true);
                throw new InvalidDataException("A non-stale failure was ignored.");
            }
            catch (Exception observed) when (ReferenceEquals(observed, error)) { }
        }
    }

    private static COMException Retired() => new(
        "An event was unable to invoke any of the subscribers", unchecked((int)0x80040201));
}
