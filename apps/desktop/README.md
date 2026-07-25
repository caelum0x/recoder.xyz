<p align="center">
  <a href="https://recoder.xyz">
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="./assets/wave-dark.png">
		<source media="(prefers-color-scheme: light)" srcset="./assets/wave-light.png">
		<img alt="Recoder Terminal Logo" src="./assets/wave-light.png" width="240">
	</picture>
  </a>
  <br/>
</p>

# Recoder Terminal

<div align="center">

[English](README.md) | [한국어](README.ko.md) | [繁體中文](README.zh-TW.md)

</div>

**Recoder is the self-hosted convergence layer for parallel coding agents. N agents in parallel. One trusted merge.**

The loop:

1. **Launch** any coding agent (Claude Code, Codex, Cursor, opencode, …) — in parallel, each in its own isolated git worktree.
2. **Review** the divergent diffs side by side.
3. **Merge** the winner as one trusted, shippable change — on infra you own, with your own keys.

Recoder Terminal is the desktop surface for that loop: an open-source, cross-platform terminal for macOS, Linux, and Windows. It works with any AI model — bring your own API keys for OpenAI, Claude, or Gemini, or run local models via Ollama and LM Studio. It also supports durable SSH sessions that survive network interruptions and restarts, a built-in graphical editor for remote files, and inline file previews without leaving the terminal.

![Recoder Terminal Screenshot](./assets/wave-screenshot.webp)

## Key Features

- Recoder AI - Context-aware terminal assistant that reads your terminal output, analyzes widgets, and performs file operations
- Durable SSH Sessions - Remote terminal sessions survive connection interruptions, network changes, and app restarts with automatic reconnection
- Flexible drag & drop interface to organize terminal blocks, editors, web browsers, and AI assistants
- Built-in editor for editing remote files with syntax highlighting and modern editor features
- Rich file preview system for remote files (markdown, images, video, PDFs, CSVs, directories)
- Quick full-screen toggle for any block - expand terminals, editors, and previews for better visibility, then instantly return to multi-block view
- AI chat widget with support for multiple models (OpenAI, Claude, Azure, Perplexity, Ollama)
- Command Blocks for isolating and monitoring individual commands
- One-click remote connections with full terminal and file system access
- Secure secret storage using native system backends - store API keys and credentials locally, access them across SSH sessions
- Rich customization including tab themes, terminal styles, and background images
- Powerful `wsh` command system for managing your workspace from the CLI and sharing data between terminal sessions
- Connected file management with `wsh file` - seamlessly copy and sync files between local and remote SSH hosts

## Recoder AI

Recoder AI is your context-aware terminal assistant with access to your workspace:

- **Terminal Context**: Reads terminal output and scrollback for debugging and analysis
- **File Operations**: Read, write, and edit files with automatic backups and user approval
- **CLI Integration**: Use `wsh ai` to pipe output or attach files directly from the command line
- **BYOK Support**: Bring your own API keys for OpenAI, Claude, Gemini, Azure, and other providers
- **Local Models**: Run local models with Ollama, LM Studio, and other OpenAI-compatible providers
- **Coming Soon**: Command execution (with approval)

Learn more in the in-repo AI docs: [Recoder AI](./docs/docs/waveai.mdx) and [Recoder AI Modes](./docs/docs/waveai-modes.mdx).

## Installation

Recoder Terminal works on macOS, Linux, and Windows.

Platform-specific installation instructions can be found in the [Getting Started guide](./docs/docs/gettingstarted.mdx).

### Minimum requirements

Recoder Terminal runs on the following platforms:

- macOS 11 or later (arm64, x64)
- Windows 10 1809 or later (x64)
- Linux based on glibc-2.28 or later (Debian 10, RHEL 8, Ubuntu 20.04, etc.) (arm64, x64)

The WSH helper runs on the following platforms:

- macOS 11 or later (arm64, x64)
- Windows 10 or later (x64)
- Linux Kernel 2.6.32 or later (x64), Linux Kernel 3.1 or later (arm64)

## Roadmap

Recoder Terminal is constantly improving! Our roadmap will be continuously updated with our goals for each release. You can find it [here](./ROADMAP.md).

## Links

- Homepage &mdash; https://recoder.xyz

## Building from Source

See [Building Recoder Terminal](BUILD.md).

## Contributing

Recoder Terminal uses GitHub Issues for issue tracking.

Find more information in our [Contributions Guide](CONTRIBUTING.md).

## License

Recoder Terminal is a derivative work of [Wave Terminal](https://github.com/wavetermdev/waveterm) (© Command Line Inc), licensed under the Apache-2.0 License. See [FORK.md](./FORK.md) for the fork relationship and [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md) for dependency attributions.
