namespace ComputerUse.Windows.Runtime;

internal readonly record struct WindowsScrollPlan(bool Horizontal, double Pages)
{
    internal static WindowsScrollPlan Create(string direction, double pages)
    {
        if (!double.IsFinite(pages) || pages <= 0)
        {
            throw new ProviderFailureException(
                "invalid_request", "precondition",
                "Scroll pages must be a finite positive number.");
        }
        return direction switch
        {
            "left" => new(true, -pages),
            "right" => new(true, pages),
            "up" => new(false, -pages),
            "down" => new(false, pages),
            _ => throw new ProviderFailureException(
                "invalid_request", "precondition",
                "Scroll direction must be up, down, left, or right."),
        };
    }

    internal (double X, double Y) WheelDelta =>
        Horizontal ? (Pages, 0) : (0, Pages);

    internal double TargetPercent(double currentPercent, double viewSize)
    {
        if (!double.IsFinite(currentPercent) || currentPercent < 0 || currentPercent > 100 ||
            !double.IsFinite(viewSize) || viewSize <= 0 || viewSize >= 100)
        {
            throw new ProviderFailureException(
                "capability_unsupported", "precondition",
                "The scroll target did not expose a usable position and viewport size.");
        }
        // UIA reports the view as a share of all content, but position as a
        // share of the remaining scrollable extent. One page is one view.
        return Math.Clamp(currentPercent + Pages * viewSize / (100 - viewSize) * 100, 0, 100);
    }
}
