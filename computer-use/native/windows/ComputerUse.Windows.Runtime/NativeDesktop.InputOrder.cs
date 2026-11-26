namespace ComputerUse.Windows.Runtime;

internal static partial class NativeDesktop
{
    private const int InputOrderTimeoutMilliseconds = 3000;
    [ThreadStatic] private static OrderedInputScope? _orderedInput;
    private static long _inputReceiptTag = Random.Shared.Next(1, int.MaxValue);

    internal interface IInputAcknowledgement : IDisposable
    {
        nint Root { get; }
        bool TargetIsCurrent { get; }
        bool Processed { get; }
        void Arm(nuint tag, uint message, uint alternate, uint word, bool checkWord);
    }

    internal static OrderedInputScope BeginOrderedInput(nint window)
    {
        if (_orderedInput is not null)
            throw new InvalidOperationException("Nested ordered input is unsupported.");
        return _orderedInput = new OrderedInputScope(InstallInputAcknowledgement(window));
    }

    internal sealed class OrderedInputScope(IInputAcknowledgement receiver) : IDisposable
    {
        private bool _inputEmitted;
        private bool _receiptLost;
        private bool _disposed;
        internal nint Root => receiver.Root;

        internal void Emitted(bool emitted) => _inputEmitted |= emitted;
        internal void ReceiptLost() => _receiptLost = true;

        internal void Arm(nuint tag, uint message, uint alternate, uint word, bool checkWord) =>
            receiver.Arm(tag, message, alternate, word, checkWord);

        internal void Complete()
        {
            if (!_inputEmitted) return;
            var started = InputOrderTicks();
            while (!_receiptLost && receiver.TargetIsCurrent &&
                InputOrderTicks() - started < InputOrderTimeoutMilliseconds)
            {
                if (receiver.Processed) return;
                InputOrderPause();
            }
            throw new ProviderFailureException(
                "input_order_unconfirmed", "input_acknowledgement",
                "The original receiver did not confirm processing the queued input. " +
                "Later actions were not sent. Observe fresh focus and selection before continuing; do not replay the earlier input.",
                inputEventsEmitted: true, mutationUnknown: true);
        }
        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _orderedInput = null;
            receiver.Dispose();
        }
    }

    private static void ArmOrderedInput(Input[] values)
    {
        if (_orderedInput is { } receiver)
        {
            ref var last = ref values[^1];
            // Mouse queues retain only the low DWORD of SendInput's extra
            // information. Positive 31-bit tags also avoid sign extension.
            nuint tag;
            do { tag = unchecked((nuint)(Interlocked.Increment(ref _inputReceiptTag) & int.MaxValue)); }
            while (tag == 0);
            if (last.Type == InputKeyboard)
            {
                last.Union.Keyboard.ExtraInfo = tag;
                var up = (last.Union.Keyboard.Flags & KeyEventKeyUp) != 0;
                receiver.Arm(tag, up ? 0x101U : 0x100U, up ? 0x105U : 0x104U,
                    last.Union.Keyboard.VirtualKey, true);
            }
            else
            {
                last.Union.Mouse.ExtraInfo = tag;
                var message = last.Union.Mouse.Flags switch
                {
                    var flags when (flags & MouseLeftUp) != 0 => (0x202U, 0xA2U),
                    var flags when (flags & MouseRightUp) != 0 => (0x205U, 0xA5U),
                    var flags when (flags & MouseMiddleUp) != 0 => (0x208U, 0xA8U),
                    var flags when (flags & MouseXUp) != 0 => (0x20CU, 0xACU),
                    var flags when (flags & MouseLeftDown) != 0 => (0x201U, 0xA1U),
                    var flags when (flags & MouseRightDown) != 0 => (0x204U, 0xA4U),
                    var flags when (flags & MouseMiddleDown) != 0 => (0x207U, 0xA7U),
                    var flags when (flags & MouseXDown) != 0 => (0x20BU, 0xABU),
                    var flags when (flags & MouseWheel) != 0 => (0x20AU, 0x20AU),
                    var flags when (flags & MouseHWheel) != 0 => (0x20EU, 0x20EU),
                    _ => (0x200U, 0xA0U),
                };
                receiver.Arm(tag, message.Item1, message.Item2, 0, false);
            }
        }
    }

    private static bool IsInputRelease(Input input) =>
        input.Type == InputKeyboard
            ? (input.Union.Keyboard.Flags & KeyEventKeyUp) != 0
            : input.Union.Mouse.Flags is MouseLeftUp or MouseRightUp or MouseMiddleUp or MouseXUp;
}
