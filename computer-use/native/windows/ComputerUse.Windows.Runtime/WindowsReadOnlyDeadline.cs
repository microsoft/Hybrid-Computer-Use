using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using Timer = System.Threading.Timer;

namespace ComputerUse.Windows.Runtime;

internal sealed class WindowsReadOnlyDeadline : IDisposable
{
    private const int Active = 0;
    private const int Finished = 1;
    private const int TimedOut = 2;
    internal const uint ExitCode = 0x48525549;

    private readonly Timer _timer;
    private readonly Action _retire;
    private int _state = Active;

    internal WindowsReadOnlyDeadline(TimeSpan timeout)
        : this(timeout, RetireCurrentProcess) { }

    internal WindowsReadOnlyDeadline(TimeSpan timeout, Action retire)
    {
        _retire = retire;
        _timer = new Timer(static scope => ((WindowsReadOnlyDeadline)scope!).Expire(),
            this, timeout, Timeout.InfiniteTimeSpan);
    }

    internal void Expire()
    {
        if (Interlocked.CompareExchange(ref _state, TimedOut, Active) == Active)
        {
            _retire();
        }
    }

    public void Dispose()
    {
        var previous = Interlocked.CompareExchange(ref _state, Finished, Active);
        _timer.Dispose();
        if (previous == TimedOut)
        {
            // Even if the native call returns while retirement starts, this
            // provider must never process another request.
            _retire();
            throw new InvalidOperationException("The timed-out provider was not retired.");
        }
    }

    [DoesNotReturn]
    private static void RetireCurrentProcess()
    {
        // The handle always identifies this sidecar, never the target app.
        // Do not write diagnostics here: a full stderr pipe can block.
        TerminateProcess(GetCurrentProcess(), ExitCode);
        Environment.FailFast("A read-only native deadline could not retire the provider.");
    }

    [DllImport("kernel32.dll")]
    private static extern nint GetCurrentProcess();

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(nint process, uint exitCode);
}
