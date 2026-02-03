/**
 * Rainbow Brackets Extension for CodeMirror 6
 *
 * Provides colorful highlighting for nested brackets (), [], and {}
 * with different colors at each nesting level.
 */

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

// Rainbow colors that work well with dark themes
// Using a vibrant palette: yellow, magenta, cyan, green, orange, purple
const BRACKET_COLORS = [
  '#ffd700', // Gold/Yellow
  '#da70d6', // Orchid/Magenta
  '#00bfff', // Deep Sky Blue/Cyan
  '#98fb98', // Pale Green
  '#ffa500', // Orange
  '#ba55d3', // Medium Orchid/Purple
  '#00fa9a', // Medium Spring Green
  '#ff6b6b', // Coral Red
];

// Bracket pairs
const OPEN_BRACKETS = '([{';
const CLOSE_BRACKETS = ')]}';

// Create decorations for each color level
const bracketDecorations = BRACKET_COLORS.map((color, index) =>
  Decoration.mark({
    class: `cm-rainbow-bracket-${index}`,
    attributes: { style: `color: ${color}; font-weight: 500;` },
  })
);

// Decoration for mismatched brackets
const mismatchDecoration = Decoration.mark({
  class: 'cm-rainbow-bracket-mismatch',
  attributes: { style: 'color: #ff0000; font-weight: bold; text-decoration: wavy underline;' },
});

interface BracketInfo {
  pos: number;
  char: string;
  type: 'open' | 'close';
  bracketType: number; // 0 = (), 1 = [], 2 = {}
}

/**
 * Find all brackets in the document, respecting syntax tree to avoid
 * coloring brackets inside strings and comments
 */
function findBrackets(state: EditorState): BracketInfo[] {
  const brackets: BracketInfo[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;

  // Iterate through the document
  for (let pos = 0; pos < doc.length; pos++) {
    const char = doc.sliceString(pos, pos + 1);
    const openIndex = OPEN_BRACKETS.indexOf(char);
    const closeIndex = CLOSE_BRACKETS.indexOf(char);

    if (openIndex === -1 && closeIndex === -1) continue;

    // Check if this position is inside a string or comment using the syntax tree
    const nodeAt = tree.resolveInner(pos, 1);
    const nodeType = nodeAt.type.name.toLowerCase();

    // Skip if inside string, comment, template literal, or regex
    if (
      nodeType.includes('string') ||
      nodeType.includes('comment') ||
      nodeType.includes('template') ||
      nodeType.includes('regex') ||
      nodeType.includes('literal')
    ) {
      // But allow if it's specifically a bracket node type
      if (!nodeType.includes('bracket') && !nodeType.includes('brace') && !nodeType.includes('paren')) {
        continue;
      }
    }

    if (openIndex !== -1) {
      brackets.push({
        pos,
        char,
        type: 'open',
        bracketType: openIndex,
      });
    } else {
      brackets.push({
        pos,
        char,
        type: 'close',
        bracketType: closeIndex,
      });
    }
  }

  return brackets;
}

/**
 * Build decorations for rainbow brackets
 */
function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const brackets = findBrackets(state);

  // Stack to track nesting level for each bracket type
  const stacks: number[][] = [[], [], []]; // For (), [], {}

  // First pass: assign colors based on nesting depth
  const colorAssignments: { pos: number; colorIndex: number; mismatch: boolean }[] = [];

  for (const bracket of brackets) {
    if (bracket.type === 'open') {
      const depth = stacks[bracket.bracketType].length;
      const colorIndex = depth % BRACKET_COLORS.length;
      stacks[bracket.bracketType].push(bracket.pos);
      colorAssignments.push({ pos: bracket.pos, colorIndex, mismatch: false });
    } else {
      const stack = stacks[bracket.bracketType];
      if (stack.length > 0) {
        stack.pop();
        const depth = stack.length;
        const colorIndex = depth % BRACKET_COLORS.length;
        colorAssignments.push({ pos: bracket.pos, colorIndex, mismatch: false });
      } else {
        // Mismatched closing bracket
        colorAssignments.push({ pos: bracket.pos, colorIndex: 0, mismatch: true });
      }
    }
  }

  // Sort by position and add decorations
  colorAssignments.sort((a, b) => a.pos - b.pos);

  for (const assignment of colorAssignments) {
    const decoration = assignment.mismatch
      ? mismatchDecoration
      : bracketDecorations[assignment.colorIndex];
    builder.add(assignment.pos, assignment.pos + 1, decoration);
  }

  return builder.finish();
}

/**
 * ViewPlugin that updates rainbow bracket decorations
 */
const rainbowBracketsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = buildDecorations(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Theme extension for rainbow brackets
 * Provides CSS classes for each bracket color level
 */
const rainbowBracketsTheme = EditorView.baseTheme({
  '.cm-rainbow-bracket-0': { color: BRACKET_COLORS[0] },
  '.cm-rainbow-bracket-1': { color: BRACKET_COLORS[1] },
  '.cm-rainbow-bracket-2': { color: BRACKET_COLORS[2] },
  '.cm-rainbow-bracket-3': { color: BRACKET_COLORS[3] },
  '.cm-rainbow-bracket-4': { color: BRACKET_COLORS[4] },
  '.cm-rainbow-bracket-5': { color: BRACKET_COLORS[5] },
  '.cm-rainbow-bracket-6': { color: BRACKET_COLORS[6] },
  '.cm-rainbow-bracket-7': { color: BRACKET_COLORS[7] },
  '.cm-rainbow-bracket-mismatch': {
    color: '#ff0000',
    textDecoration: 'wavy underline',
  },
});

/**
 * Rainbow brackets extension for CodeMirror 6
 *
 * Usage:
 * ```
 * import { rainbowBrackets } from './rainbow-brackets';
 *
 * const view = new EditorView({
 *   extensions: [rainbowBrackets()],
 *   // ...
 * });
 * ```
 */
export function rainbowBrackets(): Extension {
  return [rainbowBracketsPlugin, rainbowBracketsTheme];
}

/**
 * Export the bracket colors for external use (e.g., in settings preview)
 */
export { BRACKET_COLORS };
