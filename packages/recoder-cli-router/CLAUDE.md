# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Recoder CLI Router codebase.

## Commands

-   **Build the project**:
    ```bash
    npm run build
    ```
-   **Start the router server**:
    ```bash
    rcr start
    # or
    recoder-router start
    ```
-   **Stop the router server**:
    ```bash
    rcr stop
    # or
    recoder-router stop
    ```
-   **Check the server status**:
    ```bash
    rcr status
    # or
    recoder-router status
    ```
-   **Run Recoder CLI through the router**:
    ```bash
    rcr code "<your prompt>"
    # or
    recoder-router code "<your prompt>"
    ```
-   **Release a new version**:
    ```bash
    npm run release
    ```

## Architecture

This project is a TypeScript-based router for Recoder CLI requests. It allows routing requests to different large language models (LLMs) including Kimi K2, Qwen 3, DeepSeek R1, and other providers based on custom rules.

-   **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, and `code`.
-   **Server**: The `rcr start` command launches a server that listens for requests from Recoder CLI. The server logic is initiated from `src/index.ts`.
-   **Configuration**: The router is configured via a JSON file located at `~/.recoder-cli-router/config.json`. This file defines API providers, routing rules, and custom transformers. An example can be found in `config.example.json`.
-   **Routing**: The core routing logic determines which LLM provider and model to use for a given request. It supports default routes for different scenarios (`default`, `background`, `think`, `longContext`, `webSearch`) and can be extended with a custom JavaScript router file. The router logic is likely in `src/utils/router.ts`.
-   **Providers and Transformers**: The application supports multiple LLM providers. Transformers adapt the request and response formats for different provider APIs.
-   **Recoder CLI Integration**: When a user runs `rcr code`, the command is forwarded to the running router service. The service then processes the request, applies routing rules, and sends it to the configured LLM. If the service isn't running, `rcr code` will attempt to start it automatically.
-   **Dependencies**: The project is built with `esbuild`. It has a key local dependency `@musistudio/llms`, which probably contains the core logic for interacting with different LLM APIs.
-   `@musistudio/llms` is implemented based on `fastify` and exposes `fastify`'s hook and middleware interfaces, allowing direct use of `server.addHook`.