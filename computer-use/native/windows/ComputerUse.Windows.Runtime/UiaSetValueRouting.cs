using System.Globalization;

namespace ComputerUse.Windows.Runtime;

internal static class UiaSetValueRouting
{
    internal static bool AllowsValueWrite(
        string canonicalRole, bool hasLegacyIAccessible, bool hasNativeRuntimeIdentity) =>
        canonicalRole != "cell" || !hasLegacyIAccessible || hasNativeRuntimeIdentity;

    internal static void RequireValueWriteAllowed(
        string canonicalRole, bool hasLegacyIAccessible, bool hasNativeRuntimeIdentity)
    {
        if (!AllowsValueWrite(canonicalRole, hasLegacyIAccessible, hasNativeRuntimeIdentity))
        {
            throw new ProviderFailureException(
                "capability_unsupported", "precondition",
                "MSAA-projected cell Value writes can change only accessibility state, without editing the cell. " +
                "No value was sent. Select the cell with pointer input, observe the current selection, then type and commit through keyboard input.");
        }
    }

    internal static bool PrefersDocumentInput(
        bool documentControl,
        bool writableValueAvailable,
        bool textPatternAvailable)
    {
        return documentControl &&
            writableValueAvailable &&
            textPatternAvailable;
    }

    internal static void RequireDocumentInputAllowed(bool requireSemanticWrite)
    {
        if (requireSemanticWrite)
            throw new ProviderFailureException("desktop_input_failed", "preparation",
                "Earlier queued input has not been confirmed processed; document selection and replacement were not sent. " +
                "Confirm focus and selection before sending the replacement separately; do not repeat the earlier input.");
    }

    internal static bool PrefersRange(
        string canonicalRole,
        bool writableRangeAvailable)
    {
        return writableRangeAvailable &&
            canonicalRole is "slider" or "spinbutton" or "scrollbar";
    }

    internal static bool TryParseFiniteRangeValue(
        string requested,
        out double value)
    {
        return double.TryParse(
                requested,
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out value) &&
            double.IsFinite(value);
    }

    internal static bool IsWithinRange(
        double requested,
        double minimum,
        double maximum)
    {
        return double.IsFinite(requested) &&
            double.IsFinite(minimum) &&
            double.IsFinite(maximum) &&
            minimum <= maximum &&
            requested >= minimum &&
            requested <= maximum;
    }
}
