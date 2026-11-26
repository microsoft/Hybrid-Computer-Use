using System.Diagnostics;
using System.Runtime.InteropServices;

namespace ComputerUse.Windows.Runtime;

internal static partial class NativeDesktop
{
    private static readonly Lazy<InputHookLibrary> InputHooks = new(() => new());
    private static long InputOrderTicks() => Environment.TickCount64;
    private static void InputOrderPause() => Thread.Sleep(1);

    internal static void RequireInputAcknowledgementSupport()
    {
        _ = InputHooks.Value;
    }

    internal static nint KeyboardInputWindow()
    {
        var foreground = GetForegroundWindow();
        var thread = GetWindowThreadProcessId(foreground, out _);
        var info = new GuiThreadInfo { Size = (uint)Marshal.SizeOf<GuiThreadInfo>() };
        return thread != 0 && GetGUIThreadInfo(thread, ref info) && info.Focus != 0
            ? info.Focus : foreground;
    }

    internal static nint PointerInputWindow(double x, double y) =>
        WindowAtPoint(new System.Drawing.Point((int)Math.Round(x), (int)Math.Round(y)));

    private static IInputAcknowledgement InstallInputAcknowledgement(nint window) =>
        new InputHookReceipt(InputHooks.Value, window);

    private sealed class InputHookLibrary
    {
        internal readonly nint Module;
        internal readonly ConfigureReceipt Configure;
        internal readonly ReceiptProcessed Processed;
        internal readonly nint MessageHook;
        internal readonly nint IdleHook;

        internal InputHookLibrary()
        {
            var directory = Path.Combine(Path.GetTempPath(), "hcu-input-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(directory);
                var path = Path.Combine(directory, "computer-use-input-ack.dll");
                File.Copy(Path.Combine(AppContext.BaseDirectory, "computer-use-input-ack.dll"), path);
                // The shared PE section must be private to this provider.
                // Keep this module loaded while receiver hooks can still return.
                Module = NativeLibrary.Load(path);
                Configure = Marshal.GetDelegateForFunctionPointer<ConfigureReceipt>(
                    NativeLibrary.GetExport(Module, "Configure"));
                Processed = Marshal.GetDelegateForFunctionPointer<ReceiptProcessed>(
                    NativeLibrary.GetExport(Module, "Processed"));
                MessageHook = NativeLibrary.GetExport(Module, "MessageHook");
                IdleHook = NativeLibrary.GetExport(Module, "IdleHook");
                AppDomain.CurrentDomain.ProcessExit += (_, _) =>
                {
                    try { Directory.Delete(directory, true); }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                };
            }
            catch (Exception error)
            {
                throw new ProviderFailureException("input_order_unavailable", "precondition",
                    "The Windows input acknowledgement helper is unavailable; no ordered input was sent. " +
                    error.Message);
            }
        }
    }

    private sealed class InputHookReceipt : IInputAcknowledgement
    {
        private readonly InputHookLibrary _library;
        private readonly nint _window;
        private readonly uint _thread;
        private readonly uint _process;
        private readonly uint _rootThread;
        private readonly uint _rootProcess;
        private nint _messages;
        private nint _idle;
        public nint Root { get; }
        public bool TargetIsCurrent =>
            GetWindowThreadProcessId(_window, out var process) == _thread && process == _process &&
            GetWindowThreadProcessId(Root, out var rootProcess) == _rootThread && rootProcess == _rootProcess;
        public bool Processed => GetForegroundWindow() == Root && _library.Processed() != 0;

        internal InputHookReceipt(InputHookLibrary library, nint window)
        {
            _library = library;
            _window = window;
            Root = RootWindow(window);
            _thread = GetWindowThreadProcessId(window, out _process);
            _rootThread = GetWindowThreadProcessId(Root, out _rootProcess);
            if (window == 0 || Root == 0 || _thread == 0 || _rootThread == 0)
                throw Unavailable("The original input receiver is unavailable.");
            RequireMatchingArchitecture(_process);
            _messages = SetWindowsHookExW(3, library.MessageHook, library.Module, _thread);
            if (_messages != 0)
                _idle = SetWindowsHookExW(11, library.IdleHook, library.Module, _thread);
            if (_messages == 0 || _idle == 0)
            {
                var error = Marshal.GetLastPInvokeError();
                Dispose();
                throw Unavailable($"Cannot install receiver input acknowledgement (Win32 error {error}).");
            }
        }

        public void Arm(nuint tag, uint message, uint alternate, uint word, bool checkWord)
        {
            if (!TargetIsCurrent)
                throw Unavailable("The original input receiver disappeared before input.");
            _library.Configure(_thread, unchecked((nuint)Root), tag,
                message, alternate, word, checkWord ? 1U : 0U);
        }

        public void Dispose()
        {
            if (_messages != 0) _ = UnhookWindowsHookEx(_messages);
            if (_idle != 0) _ = UnhookWindowsHookEx(_idle);
            _messages = _idle = 0;
        }

        private static ProviderFailureException Unavailable(string message) =>
            new("input_order_unavailable", "precondition", message);

        private static void RequireMatchingArchitecture(uint processId)
        {
            using var process = Process.GetProcessById(unchecked((int)processId));
            if (!IsWow64Process2(process.Handle, out var machine, out var nativeMachine))
                throw Unavailable("The input receiver's architecture could not be verified.");
            var actual = machine == 0 ? nativeMachine : machine;
            var expected = RuntimeInformation.ProcessArchitecture switch
            {
                Architecture.X64 => 0x8664,
                Architecture.Arm64 => 0xAA64,
                _ => 0,
            };
            if (expected == 0 || actual != expected)
                throw Unavailable("Ordered input requires a receiver with the provider's native architecture.");
        }
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void ConfigureReceipt(uint thread, nuint window, nuint tag,
        uint message, uint alternate, nuint word, uint checkWord);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int ReceiptProcessed();
    [DllImport("user32.dll", SetLastError = true)]
    private static extern nint SetWindowsHookExW(int kind, nint callback, nint module, uint thread);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(nint hook);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsWow64Process2(nint process, out ushort machine, out ushort nativeMachine);
}
