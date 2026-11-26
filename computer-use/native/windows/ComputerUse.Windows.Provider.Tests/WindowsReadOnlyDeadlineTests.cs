namespace ComputerUse.Windows.Runtime;

internal static class WindowsReadOnlyDeadlineTests
{
    internal static void Run()
    {
        var retired = 0;
        var finished = new WindowsReadOnlyDeadline(Timeout.InfiniteTimeSpan,
            () => Interlocked.Increment(ref retired));
        using var callbackReady = new ManualResetEventSlim();
        using var releaseCallback = new ManualResetEventSlim();
        var queuedCallback = Task.Run(() =>
        {
            callbackReady.Set();
            Check(releaseCallback.Wait(TimeSpan.FromSeconds(5)), "The callback barrier was not released.");
            finished.Expire();
        });
        Check(callbackReady.Wait(TimeSpan.FromSeconds(5)), "The callback did not reach its barrier.");
        finished.Dispose();
        releaseCallback.Set();
        queuedCallback.GetAwaiter().GetResult();
        Check(retired == 0, "A queued callback must not retire a finished read or a later request.");

        var expired = new WindowsReadOnlyDeadline(Timeout.InfiniteTimeSpan,
            () => Interlocked.Increment(ref retired));
        expired.Expire();
        Check(retired == 1, "The timeout must own sidecar retirement.");
        var continued = false;
        try
        {
            expired.Dispose();
            continued = true;
        }
        catch (InvalidOperationException) { }
        Check(!continued && retired == 2,
            "A read returning after timeout must not return to the provider request loop.");
        expired.Expire();
        Check(retired == 2, "A timeout scope must not schedule retirement more than once.");

        retired = 0;
        using var retirementEntered = new ManualResetEventSlim();
        using var releaseRetirement = new ManualResetEventSlim();
        var racing = new WindowsReadOnlyDeadline(Timeout.InfiniteTimeSpan, () =>
        {
            if (Interlocked.Increment(ref retired) == 1)
            {
                retirementEntered.Set();
                Check(releaseRetirement.Wait(TimeSpan.FromSeconds(5)), "The retirement barrier was not released.");
            }
        });
        var timeout = Task.Run(racing.Expire);
        Check(retirementEntered.Wait(TimeSpan.FromSeconds(5)), "The timeout did not reach retirement.");
        continued = false;
        try
        {
            racing.Dispose();
            continued = true;
        }
        catch (InvalidOperationException) { }
        finally
        {
            releaseRetirement.Set();
        }
        timeout.GetAwaiter().GetResult();
        Check(!continued, "A native return racing retirement must not start another request.");
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) { throw new InvalidOperationException(message); }
    }
}
