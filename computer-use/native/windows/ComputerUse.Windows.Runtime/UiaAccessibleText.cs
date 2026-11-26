using System.Runtime.InteropServices;
using FlaUI.Core.AutomationElements;
using FlaUI.UIA3;
using FlaUI.UIA3.Patterns;
using Interop.UIAutomationClient;

namespace ComputerUse.Windows.Runtime;

internal static class UiaAccessibleText
{
    private static readonly Guid AccessibleService = new("618736E0-3C3D-11CF-810C-00AA00389B71");
    private static readonly Guid TextInterface = new("24FD2FFB-3AAD-4A08-8335-A3AD89C0FB4B");

    internal static string? Read(
        AutomationElement element, UIA3Automation automation, Action verifyIdentity)
    {
        try
        {
            var pattern = element.Patterns.LegacyIAccessible.PatternOrDefault as LegacyIAccessiblePattern;
            // A simple MSAA child shares its parent's COM object. Querying a
            // service on that object would read the parent, not this child.
            if (pattern is null || pattern.NativePattern.CurrentChildId != 0) { return null; }
            var original = pattern.NativePattern.GetIAccessible();
            if (original is not AccessibleServiceProvider services) { return null; }
            var service = AccessibleService;
            var iid = TextInterface;
            var status = services.QueryService(ref service, ref iid, out var pointer);
            try
            {
                if (status is 1 or unchecked((int)0x80004002) or unchecked((int)0x80004001))
                {
                    return null;
                }
                RequireSuccess(status);
                if (pointer == 0) { throw Failure("The accessibility text service returned no object."); }
                var supplied = Marshal.GetObjectForIUnknown(pointer);
                if (supplied is not AccessibleText text || supplied is not IAccessible textOwner)
                {
                    throw Failure("The accessibility text service could not establish its owner.");
                }
                var bound = automation.NativeAutomation.ElementFromIAccessible(original, 0);
                if (bound.GetRuntimeId() is not { Length: > 0 })
                {
                    throw Failure("The accessibility text owner has no stable identity.");
                }
                return WindowsTextRead.ReadCountedSource(Count, ReadRange, CheckOwner);

                int Count()
                {
                    RequireSuccess(text.NCharacters(out var count));
                    return count;
                }

                string? ReadRange(int count)
                {
                    RequireSuccess(text.Text(0, count, out var value));
                    return value;
                }

                void CheckOwner()
                {
                    verifyIdentity();
                    // Some MSAA hit-test elements have no UIA RuntimeId.
                    // Map both COM objects through the same UIA bridge so
                    // comparison uses their native object identities.
                    var current = automation.NativeAutomation.ElementFromIAccessible(original, 0);
                    var source = automation.NativeAutomation.ElementFromIAccessible(textOwner, 0);
                    if (automation.NativeAutomation.CompareElements(bound, current) == 0 ||
                        automation.NativeAutomation.CompareElements(current, source) == 0)
                    {
                        throw new ProviderFailureException("stale_element_ref", "precondition",
                            "The accessibility text service no longer belongs to the observed target.");
                    }
                }
            }
            finally
            {
                if (pointer != 0) { Marshal.Release(pointer); }
            }
        }
        catch (COMException error)
        {
            if (UiaElementReadRecovery.IsElementNotAvailable(error))
            {
                throw UiaElementReadRecovery.Stale();
            }
            throw Failure($"The accessibility text read failed (HRESULT 0x{error.HResult:X8}).");
        }
    }

    private static void RequireSuccess(int status)
    {
        if (status != 0)
        {
            throw Failure($"The accessibility text read failed (HRESULT 0x{status:X8}).");
        }
    }

    private static ProviderFailureException Failure(string message) =>
        new("text_read_failed", "readback", message);
}

[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface AccessibleServiceProvider
{
    [PreserveSig]
    int QueryService(ref Guid service, ref Guid iid, out nint result);
}

// IAccessibleText vtable order follows the IAccessible2 AccessibleText IDL.
// Only Text and NCharacters are used; the other slots preserve COM layout.
[ComImport, Guid("24FD2FFB-3AAD-4A08-8335-A3AD89C0FB4B"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface AccessibleText
{
    [PreserveSig] int AddSelection(int start, int end);
    [PreserveSig] int Attributes(int offset, out int start, out int end,
        [MarshalAs(UnmanagedType.BStr)] out string? attributes);
    [PreserveSig] int CaretOffset(out int offset);
    [PreserveSig] int CharacterExtents(int offset, int coordinates,
        out int x, out int y, out int width, out int height);
    [PreserveSig] int NSelections(out int count);
    [PreserveSig] int OffsetAtPoint(int x, int y, int coordinates, out int offset);
    [PreserveSig] int Selection(int index, out int start, out int end);
    [PreserveSig] int Text(int start, int end, [MarshalAs(UnmanagedType.BStr)] out string? text);
    [PreserveSig] int TextBeforeOffset(int offset, int boundary, out int start, out int end,
        [MarshalAs(UnmanagedType.BStr)] out string? text);
    [PreserveSig] int TextAfterOffset(int offset, int boundary, out int start, out int end,
        [MarshalAs(UnmanagedType.BStr)] out string? text);
    [PreserveSig] int TextAtOffset(int offset, int boundary, out int start, out int end,
        [MarshalAs(UnmanagedType.BStr)] out string? text);
    [PreserveSig] int RemoveSelection(int index);
    [PreserveSig] int SetCaretOffset(int offset);
    [PreserveSig] int SetSelection(int index, int start, int end);
    [PreserveSig] int NCharacters(out int count);
}
