---
name: HCU project page, Fluent light
version: 2
description: Visual and interaction rules for the Hybrid Computer Use project page. The style follows the Mage-VL-Cowork live workspace (Fluent 2 light theme).
colors:
  background: "#FFFFFF"
  background-alt: "#FAFAFA"
  surface: "#F5F5F5"
  line: "#E0E0E0"
  ink: "#242424"
  body: "#424242"
  muted: "#616161"
  brand: "#0F6CBD"
  brand-soft: "#EBF3FC"
  channel-code: "#038387"
  channel-ax: "#0F6CBD"
  channel-gui: "#BC4B09"
  baseline: "#C7C7C7"
  good: "#107C10"
typography:
  sans: "Segoe UI Variable, Segoe UI, system sans"
  mono: "Cascadia Mono, Consolas"
rounded:
  control: "4px"
  card: "8px"
---

## Files

- `index.html` contains all page content. Charts are HTML or inline SVG; the page does not embed paper figure images.
- `static/css/site.css` is the only stylesheet.
- `static/js/site.js` runs tabs, navigation state, code rendering, and the three demos.
- `static/js/charts.js` holds the results data and renders every chart: score bars, small multiples, scatter, dumbbell, delta grid, and stacked shares.
- `static/js/demo-data.js` and `static/js/ax-atlas-data.js` hold demo data only.

## Charts

- Every chart shares one axis style (light grid lines, 12.5 px tick labels), one tooltip (`data-tip`), and one draw-in animation that runs once when the chart first scrolls into view.
- Results tabs are chart-first: score on the left, effort and cost small multiples on the right, the full table inside "All numbers".
- Bars start at zero. Use a log axis when values span more than two orders of magnitude.
- Minimum text size is 12.5 px for labels and 11.5 px for code inside narrow outlook cells; body code is 13 px.

## Visual rules

- Use one component per job: `.tabs` switches panels, `.chips` picks an item inside a demo, `.card` groups content, `.table` compares numbers, `.bars` draws bar charts, `.code` shows code.
- In every comparison, baselines are gray and HCU is brand blue. Improvements use `good` green text.
- Code, AX, and GUI always use their channel colors. Do not reuse these colors for other meanings.
- Use sentence case for headings, labels, and buttons. Keep product names and acronyms.
- Use monospace only for code, refs, and commands.

## Do not add

- Eyebrow labels above section titles, status-dot pills, icon tiles above card titles, numbered circles for steps, or gradient and dot-grid backgrounds.
- Scroll-triggered fade-ins or count-up numbers. Content appears immediately.
- Repeated headline numbers in the same panel. Each number appears once in the lead sentence, chart, or table.
- Internal terms that readers cannot use, such as provider dumps, canonical trees, run IDs, trace line numbers, package paths, or evaluation flags.
- Default browser scrollbars. Prevent horizontal overflow; scroll regions use the thin scrollbar style.
- Controls that barely change what the reader sees. Show the variants side by side instead (for example, the three OS providers in one code block).

## Proportion

- Each section part should fit in one desktop screen (about 900 px tall). Split long material into two columns or tabs before adding height.
- Comparisons that happen at the same time are shown at the same time: the batched-execution replay runs three screens on one clock.
- Multi-platform support is shown with the Linux, Apple, and Windows marks (simple-icons, CC0) in the hero, the scoreboard, and the architecture diagram.

## Code rendering

`site.js` highlights all `pre.code` blocks with one light palette: JSON keys, strings, numbers, comments, Python keywords, and HCU refs (`a1`, `w1`, `r12`). AX diff lines are tinted by change type. A `.code-title` directly before a `pre.code` becomes a title bar with a copy button.
