──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                                                                                         │
│                                                                                                                                           │
│ Fix "False-White" UI Components — Theme Token Migration                                                                                   │
│                                                                                                                                           │
│ Problem                                                                                                                                   │
│                                                                                                                                           │
│ ~21 component files use hardcoded colors (text-white, text-gray-*, inline hex like #ffffff, #a3a3a3, #252525, bg-black, etc.) instead of  │
│ the theme token system (text-bolt-elements-textPrimary, bg-bolt-elements-background-depth-2, var(--bolt-elements-*), etc.). This makes    │
│ components appear as bright/light spots on the dark background and breaks light-theme support.                                            │
│                                                                                                                                           │
│ Exclusions                                                                                                                                │
│                                                                                                                                           │
│ - Preview.tsx — explicitly excluded, white is fine                                                                                        │
│ - Search button — excluded per user request                                                                                               │
│ - text-white on accent backgrounds (bg-blue-600, bg-orange-500, bg-green-500/600, bg-red-500, bg-purple-600, bg-accent-500, gradient) —   │
│ keep as-is                                                                                                                                │
│ - Status indicator colors (text-green-400, text-red-400, text-yellow-400) — keep as-is                                                    │
│ - SendButton (color-white on accent bg) — keep as-is                                                                                      │
│                                                                                                                                           │
│ Replacement Rules                                                                                                                         │
│ ┌──────────────────────────────────────────────┬────────────────────────────────────────────────────┐                                     │
│ │                  Hardcoded                   │                    Theme Token                     │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ text-white                                   │ text-bolt-elements-textPrimary                     │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ text-gray-300/400                            │ text-bolt-elements-textSecondary                   │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ text-gray-500                                │ text-bolt-elements-textTertiary                    │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ hover:text-white                             │ hover:text-bolt-elements-textPrimary               │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ hover:text-gray-400                          │ hover:text-bolt-elements-textSecondary             │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ bg-black / bg-gray-900                       │ bg-bolt-elements-background-depth-1 or depth-2     │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ bg-gray-700/800                              │ bg-bolt-elements-background-depth-3                │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ bg-[#0a0a0a]                                 │ bg-bolt-elements-background-depth-1                │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ bg-gray-700/50                               │ bg-bolt-elements-background-depth-3/50             │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ border-gray-700                              │ border-bolt-elements-borderColor                   │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ placeholder:text-gray-500                    │ placeholder:text-bolt-elements-textTertiary        │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ ring-offset-black                            │ ring-offset-bolt-elements-background-depth-1       │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline color: '#ffffff'                      │ color: 'var(--bolt-elements-textPrimary)'          │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline color: '#a3a3a3'                      │ color: 'var(--bolt-elements-textSecondary)'        │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline color: '#404040'                      │ color: 'var(--bolt-elements-textTertiary)'         │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline backgroundColor: '#000000'/#0a0a0a    │ backgroundColor: 'var(--bolt-elements-bg-depth-1)' │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline backgroundColor: '#141414'            │ backgroundColor: 'var(--bolt-elements-bg-depth-2)' │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline backgroundColor: '#252525'/#333333    │ backgroundColor: 'var(--bolt-elements-bg-depth-3)' │                                     │
│ ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤                                     │
│ │ inline border.*#333 / borderColor: '#000000' │ var(--bolt-elements-borderColor)                   │                                     │
│ └──────────────────────────────────────────────┴────────────────────────────────────────────────────┘                                     │
│ Execution — 4 Parallel Agents                                                                                                             │
│                                                                                                                                           │
│ Agent 1: Header + Chat Components (4 files)                                                                                               │
│                                                                                                                                           │
│ - app/components/header/Header.tsx — bg-[#0a0a0a], text-white, text-gray-400                                                              │
│ - app/components/header/HeaderActionButtons.client.tsx — inline color hex (#ffffff, #a3a3a3, #404040)                                     │
│ - app/components/chat/ModelSelector.tsx — ~50 replacements: inline backgroundColor/borderColor hex, text-white, bg-black, text-gray-,     │
│ placeholder-gray-                                                                                                                         │
│ - app/components/chat/ParameterPanel.tsx — slider gradient hex (#f97316→var, #374151→var)                                                 │
│                                                                                                                                           │
│ Agent 2: Editor/Workbench Components (6 files)                                                                                            │
│                                                                                                                                           │
│ - app/components/workbench/EditorPanel.tsx — 5 sidebar tab buttons: text-white/text-gray-500/hover:text-gray-400                          │
│ - app/components/workbench/StatusBar.tsx — text-gray-400/500, hover:text-white in dropdowns                                               │
│ - app/components/workbench/SnapshotBar.tsx — bg-gray-700/800, border-gray-700, text-white, text-gray-500                                  │
│ - app/components/workbench/DiffViewer.tsx — text-white titles, text-gray-500 labels/line numbers                                          │
│ - app/components/workbench/PackageManagerPanel.tsx — text-white headings/inputs, text-gray-500, placeholder                               │
│ - app/components/workbench/EnhancedFileTree.tsx — text-white on active buttons, text-gray-500                                             │
│                                                                                                                                           │
│ Agent 3: UI Primitives + Deployment (8 files)                                                                                             │
│                                                                                                                                           │
│ - app/components/ui/Dialog.tsx — 4 inline style blocks with #252525, #a3a3a3, #141414, #333, #ffffff                                      │
│ - app/components/ui/simple-dialog.tsx — text-white title                                                                                  │
│ - app/components/ui/input.tsx — text-white, placeholder:text-gray-500, ring-offset-black                                                  │
│ - app/components/ui/textarea.tsx — same as input                                                                                          │
│ - app/components/ui/ErrorMessage.tsx — text-gray-400, hover:text-white, text-white in details                                             │
│ - app/components/deployment/DeploymentManager.tsx — text-white labels/headings/inputs, text-gray-400/500                                  │
│ - app/components/deployment/DeploymentModal.tsx — inline #252525/#a3a3a3, text-white, text-gray-400/500                                   │
│ - app/components/deployment/PlatformSelector.tsx — text-white, text-gray-400                                                              │
│                                                                                                                                           │
│ Agent 4: DatabaseExplorer (1 large file)                                                                                                  │
│                                                                                                                                           │
│ - app/components/workbench/DatabaseExplorer.tsx — 30+ replacements: text-white headings/labels/inputs, text-gray-400/500, bg-gray-600,    │
│ placeholder:text-gray-500                                                                                                                 │
│                                                                                                                                           │
│ Verification                                                                                                                              │
│                                                                                                                                           │
│ 1. npx tsc --noEmit — must remain at 0 errors                                                                                             │
│ 2. Grep check across modified files: no remaining hardcoded hex in inline styles, no text-white except on accent backgrounds              │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
                                                                                                                                             
⏺ I'll implement this theme token migration across all 4 agent groups in parallel. Let me launch all 4 agents simultaneously.                
                                                                                                                                             
⏺ 4 Task agents launched (ctrl+o to expand)                                                                                                  
   ├─ Agent 1: Header + Chat theme fix                                                                                                       
   │  ⎿  Running in the background (↓ to manage)                                                                                             
   ├─ Agent 2: Editor/Workbench theme fix                                                                                                    
   │  ⎿  Running in the background (↓ to manage)                                                                                             
   ├─ Agent 3: UI + Deployment theme fix                                                                                                     
   │  ⎿  Running in the background (↓ to manage)                                                                                             
   └─ Agent 4: DatabaseExplorer theme fix                                                                                                    
      ⎿  Running in the background (↓ to manage)                                  