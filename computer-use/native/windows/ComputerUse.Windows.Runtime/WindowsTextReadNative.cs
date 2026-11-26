using System.Runtime.InteropServices;
using System.Text;

namespace ComputerUse.Windows.Runtime;

internal static class WindowsTextReadNative
{
    // UIA/MSAA adapters can cap a native edit's Value at 4096 UTF-16 units.
    // WM_GETTEXT reads that exact edit HWND without focus or selection changes.
    internal static string Read(nint handle, int processId)
    {
        CheckWindow();
        var length = Send(0x000E, 0, null);
        if (length > WindowsTextRead.MaxSourceUtf16Length)
        {
            throw new ProviderFailureException("text_read_limit", "readback",
                "The target's text exceeds the Windows acquisition limit; select a smaller text-bearing element.");
        }
        CheckWindow();
        var text = new StringBuilder(checked((int)length + 1));
        var copied = Send(0x000D, (nuint)text.Capacity, text);
        CheckWindow();
        var after = Send(0x000E, 0, null);
        if (copied != length || after != length || (nuint)text.Length != copied)
        {
            throw new ProviderFailureException("text_changed", "readback",
                "The text changed during the read; observe the target again.");
        }
        return text.ToString();

        void CheckWindow()
        {
            if (!IsWindow(handle) ||
                GetWindowThreadProcessId(handle, out var currentProcessId) == 0 ||
                currentProcessId != processId)
            {
                throw new ProviderFailureException("stale_element_ref", "precondition",
                    "The text target's native window is no longer available.");
            }
            Marshal.SetLastPInvokeError(0);
            var style = GetWindowLong(handle, -16);
            if (style == 0 && Marshal.GetLastPInvokeError() != 0)
            {
                throw new ProviderFailureException("text_protected", "readback",
                    "The target's text protection status is unavailable.");
            }
            if ((style & 0x20) != 0)
            {
                throw new ProviderFailureException("text_protected", "readback",
                    "Protected text cannot be read.");
            }
        }

        nuint Send(uint message, nuint capacity, StringBuilder? buffer)
        {
            if (SendMessageTimeout(handle, message, capacity, buffer,
                0x0001 | 0x0002 | 0x0020, 1000, out var result) == 0)
            {
                throw new ProviderFailureException("text_read_timeout", "readback",
                    "The Windows text read did not complete within its native call deadline.");
            }
            return result;
        }
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindow(nint handle);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint handle, out int processId);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong(nint handle, int index);

    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW",
        CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint SendMessageTimeout(nint handle, uint message,
        nuint wParam, StringBuilder? lParam, uint flags, uint timeout, out nuint result);
}
