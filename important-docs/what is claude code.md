Your code’s new collaborator
Unleash Claude’s raw power directly in your terminal. Search million-line codebases instantly. Turn hours-long workflows into a single command. Your tools. Your workflow. Your codebase, evolving at thought speed.

Try Claude Code on Max
Try Claude Code on Max
See our pricing options

 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
 
 ██████╗ ██████╗ ██████╗ ███████╗                
██╔════╝██╔═══██╗██╔══██╗██╔════╝                
██║     ██║   ██║██║  ██║█████╗                  
██║     ██║   ██║██║  ██║██╔══╝                  
╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
Trusted by engineers at
RampIntercomStubhubFigmaBrexStripeUberAsanaNotionRakutenPager DutyWorkatoPlaidZapierQuoraBunAnthropic
RampIntercomStubhubFigmaBrexStripeUberAsanaNotionRakutenPager DutyWorkatoPlaidZapierQuoraBunAnthropic
RampIntercomStubhubFigmaBrexStripeUberAsanaNotionRakutenPager DutyWorkatoPlaidZapierQuoraBunAnthropic
Command-line AI, from concept to commit
Watch as Claude Code tackles an unfamiliar Next.js project, builds new functionality, creates tests, and fixes what’s broken—all from the command line. Join Boris and Cat as they show you what coding feels like when you’re not doing it alone.

Video thumbnail: Introducing Claude Code
Deep coding at terminal velocity
Claude Code embeds Claude Opus 4.1—the same model our researchers and engineers use—right in your terminal. It has deep codebase awareness and the ability to edit files and run commands directly in your environment.

Interact with Claude Code
Example 1
Example 2
Terminal
Result
> Build an interactive ASCII art drawing tool with sound feedback. The application should:
 
1. Create a canvas where users can draw by clicking and dragging
2. Place different ASCII characters or symbols when the user draws
3. Play corresponding musical notes when each character is placed
4. Include multiple pattern sets with different characters and
corresponding note scales
5. Add a pattern switcher button to cycle through different
character/sound themes
6. Include a clear button to reset the canvas
7. Support both mouse and touch input for mobile compatibility
 
The application should be creative and fun to use, creating an audio-visual experience where patterns of characters create both visual art and musical patterns. Ensure the musical notes are harmonious when played in sequence.
 
⏺ I'll build an interactive ASCII art drawing tool with sound feedback. Let me set up the basic structure.
 
⏺ Let me create the necessary files for our ASCII art drawing tool.
 
⏺ Call(Create project files)…
  ⎿ Wrote 21 lines to index.html
  ⎿ Wrote 67 lines to styles.css
  ⎿ Wrote 189 lines to app.js
  ⎿ Wrote 35 lines to README.md
  ⎿  Done (4 tool uses · 0.2s)
 
⏺ Your interactive ASCII art drawing tool with sound feedback is ready! To use it:
 
1. Open the index.html file in your browser
2. Click and drag on the canvas to draw with ASCII characters
3. Each character will play a musical note when placed
4. Use the "Change Pattern" button to cycle through different
character/sound themes
5. Clear the canvas with the "Clear" button
 
The tool supports both mouse and touch input for mobile compatibility.
 
Click "Result" to try the Musical ASCII tool
Powerful intelligence
Uses agentic search to understand your entire codebase without manual context selection
Makes coordinated changes across multiple files
Optimized specifically for code understanding and generation with Claude Opus 4.1
Works where you work
Lives right inside your terminal—no context switching
Integrates with VS Code and JetBrains IDEs
Leverages your test suites and build systems
You’re in control
Never modifies your files without explicit approval
Adapts to your coding standards and patterns
Configurable; build on the SDK or run on GitHub Actions

Works with your IDEs
Claude works directly in VS Code and JetBrains, seeing your entire codebase instead of just isolated snippets. It understands your project structure and existing patterns, making suggestions that actually fit and presenting them directly in your code files. No copying and pasting—just building.

VS CodejetBrains
... and your favorite command line tools
Your terminal is where real work happens. Claude Code connects with the tools that power development—deployment, databases, monitoring, version control. Rather than adding another interface to juggle, it enhances your existing stack. Less context-switching.

Sentry
Datadog
AWS
Github
Terraform
Circle CI
Heroku
Stripe
New Relic
Kubernetes
Vercel
Elasticsearch
MongoDB
Gitlab
Atlassian
What could you do with Claude Code?
See examples
Code onboarding
Triage issues
Refactor code
> I'm new to this codebase. Can you explain it to me?
 
⏺ I'll analyze the Excalidraw codebase structure and provide a high-level overview.
 
⏺ Analyze(what: "Excalidraw codebase structure and provide a high-level overview of what it is, its main components, and how they're organized. Focus on understanding the project's purpose, architecture, and key features.")
 
Excalidraw is an open-source virtual whiteboard application with a hand-drawn style. It's designed for creating diagrams, wireframes, and collaborative drawings.
 
## Purpose
- Web-based drawing tool with infinite canvas
- Hand-drawn aesthetic with support for shapes, arrows, text
- End-to-end encrypted collaboration
- Works offline as a PWA (Progressive Web App)
 
## Architecture
The project is organized as a monorepo with these main components:
 
1. Core Package (packages/excalidraw)
- React component library for embedding Excalidraw in any application
- Handles drawing, rendering, and core functionality
- Uses roughjs for the hand-drawn style
- Includes export capabilities (PNG, SVG)
 
2. Web Application (excalidraw-app/)
- Full-featured web app at excalidraw.com
- Built on top of the core package
- Adds collaboration features, local storage, sharing
 
3. Support Packages
- common - Shared utilities and constants
- element - Element manipulation and type definitions
- math - Mathematical functions for drawing
- utils - General utility functions
 
4. Examples
- Integration examples (Next.js, browser script)
- Shows how to embed Excalidraw in different environments
 
5. Documentation (dev-docs/)
- API documentation
- Integration guides
- Component documentation
 
## Key Features
- Real-time collaboration with end-to-end encryption
- Export to various formats (PNG, SVG, JSON)
- Customizable drawing tools (rectangle, circle, arrows, freehand)
- Dark mode support
- Localization
- Library of shapes and components
- Arrow bindings and labels
- Image support
 
## Technology Stack
- React for UI
- TypeScript for type safety
- Firebase for collaboration backend
- Jotai for state management
- Vite for development and building
- IndexedDB/LocalStorage for offline storage
 
The architecture allows for both using Excalidraw as a component in other applications and as a standalone web application with additional features.
Install Node.js 18+, then run:

npm install -g @anthropic-ai/claude-code
Code onboarding
Claude Code maps and explains entire codebases in a few seconds. It uses agentic search to understand project structure and dependencies without you having to manually select context files.

Turn issues into PRs
Stop bouncing between tools. Claude Code integrates with GitHub, GitLab, and your command line tools to handle the entire workflow—reading issues, writing code, running tests, and submitting PRs—all from your terminal while you grab coffee.

Make powerful edits
Claude Code’s understanding of your codebase and dependencies enables it to make powerful, multi-file edits that actually work.


## Open Router API Integration Details

This document provides detailed information on the integration of the Open Router API within the Recoder Code project. It covers configuration, usage, and troubleshooting steps.

### Configuration

The Open Router API requires an API key for authentication. This key should be stored securely in the `.env` file:

```plaintext
OPENROUTER_API_KEY=your_api_key_here
```

### Usage

The `cli/run.js` file contains the main implementation for interacting with the Open Router API. The `callOpenRouter` method sends requests to the API and handles responses. The `executeToolCall` method processes tool calls returned by the API.

### Example

Here is an example of how the API is called in `cli/run.js`:

```javascript
const response = await axios.post(`${this.baseURL}/chat/completions`, payload, {
  headers: {
    'Authorization': `Bearer ${this.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': config.siteUrl,
    'X-Title': config.siteName
  }
});
```

### Testing

Ensure that the API integration is tested thoroughly. The `tests/app.test.ts` file should be extended to include tests for API interactions if necessary.
