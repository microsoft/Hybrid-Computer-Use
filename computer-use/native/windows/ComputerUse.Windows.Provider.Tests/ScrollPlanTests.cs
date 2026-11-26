namespace ComputerUse.Windows.Runtime;

internal static class ScrollPlanTests
{
    internal static void Run()
    {
        foreach (var pages in new[] { 0.5, 1.0, 2.0 })
        {
            foreach (var direction in new[] { "up", "down", "left", "right" })
            {
                var plan = WindowsScrollPlan.Create(direction, pages);
                var (x, y) = plan.WheelDelta;
                var negative = direction is "up" or "left";
                var distance = negative ? -pages : pages;
                var horizontal = direction is "left" or "right";
                Require(x == (horizontal ? distance : 0) &&
                    y == (horizontal ? 0 : distance),
                    $"Wheel direction or distance changed for {direction} {pages}.");

                // The viewport is 10 units out of 110 content units. The
                // scrollable extent is 100, so one page moves 10 percent.
                var target = plan.TargetPercent(50, 100.0 / 11);
                Require(Math.Abs(target - (50 + distance * 10)) < 1e-9,
                    $"UIA page distance changed for {direction} {pages}.");
            }
        }
        Require(WindowsScrollPlan.Create("down", 100).TargetPercent(90, 50) == 100 &&
            WindowsScrollPlan.Create("up", 100).TargetPercent(10, 50) == 0,
            "Scroll must clamp at the start and end of the content.");
        Require(WindowsScrollPlan.Create("right", 0.5).TargetPercent(0, 50) == 50,
            "Half a viewport must remain half a viewport.");

        foreach (var pages in new[] { 0.0, -1, double.NaN, double.PositiveInfinity })
        {
            Reject(() => WindowsScrollPlan.Create("down", pages));
        }
        Reject(() => WindowsScrollPlan.Create("diagonal", 1));
        foreach (var view in new[] { 0.0, 100, -1, double.NaN, double.PositiveInfinity })
        {
            Reject(() => WindowsScrollPlan.Create("down", 1).TargetPercent(50, view));
        }
        foreach (var position in new[] { -1.0, 101, double.NaN })
        {
            Reject(() => WindowsScrollPlan.Create("down", 1).TargetPercent(position, 50));
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) { throw new InvalidDataException(message); }
    }

    private static void Reject(Action action)
    {
        try
        {
            action();
        }
        catch (ProviderFailureException error) when (
            !error.InputEventsEmitted && !error.MutationUnknown)
        {
            return;
        }
        throw new InvalidDataException("Invalid scroll geometry must reject before input.");
    }
}
