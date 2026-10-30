# Hybrid Computer Use documentation

Hybrid Computer Use (HCU) is an MCP server, `computer-use`, that gives a
coding agent two desktop tools: `AX` for the accessibility tree and `GUI` for
screenshots and pointer and keyboard input. The agent keeps its own shell and
file tools. These pages explain how to install, connect, use, evaluate and
change HCU.

<p align="center">
  <img src="assets/hcu-architecture.svg" width="820" alt="HCU architecture: coding agents call the MCP server, shell scripts call the CLI, and Python code calls the SDK. All three reach one Go core with the contract, the AX engine, the GUI engine and the guards. The core drives a native provider for Linux, macOS or Windows." />
</p>

## Pick a reading path

| You want to | Read, in order |
| --- | --- |
| Connect Codex, Claude Code, Gemini CLI or Grok Build to a desktop | [Computer Use MCP](MCP.md): build, desktop runtime, agent configuration |
| Set up macOS or Windows | [Native platforms](PLATFORMS.md), then [Computer Use MCP](MCP.md#troubleshooting) |
| Script a desktop from the shell or from Python | [Code entry points](CODE.md): daemon, CLI, Python SDK |
| Let a model write code that calls `AX` and `GUI` | [Programmatic tool calling](CODE.md#programmatic-tool-calling) and [Codex code mode](CODE.md#codex-code-mode) |
| Look up a field, a step type or an error code | [Public contract](MCP.md#public-contract) and [Errors](MCP.md#errors) |
| Reproduce the OSWorld 1.0 and 2.0 evaluations | [Running OSWorld](OSWORLD.md) |
| Change the code | [Architecture](ARCHITECTURE.md), then [CONTRIBUTING.md](../CONTRIBUTING.md) |

## Pages

| Page | What it covers |
| --- | --- |
| [Computer Use MCP](MCP.md) | Build and run the server, prepare a desktop, configure agents, the `AX` and `GUI` contract, environment variables, troubleshooting |
| [Code entry points](CODE.md) | The shared daemon, the `computer-use` CLI, the `hcu_sdk` Python package, programmatic tool calling, Codex code mode |
| [Native platforms](PLATFORMS.md) | The Linux, macOS and Windows providers, their permissions and their selection support |
| [Running OSWorld](OSWORLD.md) | Install, model gateways, setup canary, single tasks, task panels, result files |
| [Architecture](ARCHITECTURE.md) | Go packages, the request path, the AX and GUI state models, the evidence model |

## Terms

| Term | Meaning |
| --- | --- |
| AX | Accessibility. The tree of controls that AT-SPI2 (Linux), AXUIElement (macOS) and UI Automation (Windows) expose, with roles, names, values, states and actions. Also the name of the HCU tool that reads and acts on that tree. |
| GUI | Full-desktop screenshots plus pointer and keyboard input in pixel coordinates. Also the name of the HCU tool for this channel. |
| Ref | A short name that the server gives to an application (`a1`), a top-level window (`w1`) or a control (`r12`). A ref stays bound to one window and fails as stale when that window goes away. |
| Working tree | The compact view of a window that the model reads. The server keeps the complete tree and resolves every ref against it. |
| Batch | An ordered list of actions in one `AX` or `GUI` call. The server checks the whole batch before the first action and stops at the first failure. |
| Wait | A step inside an `AX` batch that waits for a window, a control or a value before the next step runs. |
| Diff | The change in the AX tree that an `AX` call returns after its actions, in place of a new full tree. |
| Guard | A check that runs before input. `AX` checks that each ref still names the same live control. `GUI` checks that the window layout still matches the last screenshot. |
| Provider | The native process that talks to the operating system's accessibility, screenshot and input APIs. |
| Daemon | One background `computer-use` process per desktop. The CLI and the Python SDK share it, so refs carry over between them. |
