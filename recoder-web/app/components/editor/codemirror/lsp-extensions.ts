import { hoverTooltip, EditorView } from '@codemirror/view';

interface HoverResponse {
  contents?: string | { value?: string };
}

interface DefinitionResponse {
  uri?: string;
  range?: { start: { line: number } };
}

export function lspHoverTooltip(projectId: string, filePath: string) {
  return hoverTooltip(async (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const lineNumber = line.number - 1;
    const character = pos - line.from;

    try {
      const res = await fetch(`/api/hover/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath, line: lineNumber, character }),
      });
      if (!res.ok) return null;
      const data = await res.json() as HoverResponse;
      if (!data.contents) return null;

      return {
        pos,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-hover-tooltip';
          dom.style.cssText = 'padding:4px 8px;font-size:12px;max-width:400px;overflow:auto;';
          dom.textContent = typeof data.contents === 'string' ? data.contents : (data.contents?.value || '');
          return { dom };
        },
      };
    } catch {
      return null;
    }
  }, { hideOnChange: true });
}

export function gotoDefinition(projectId: string, filePath: string, onGoto: (file: string, line: number) => void) {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!event.metaKey && !event.ctrlKey) return;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;

      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number - 1;
      const character = pos - line.from;

      fetch(`/api/definition/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath, line: lineNumber, character }),
      })
        .then(res => res.ok ? res.json() as Promise<DefinitionResponse> : null)
        .then((data) => {
          if (data?.uri && data?.range) {
            onGoto(data.uri.replace('file://', ''), data.range.start.line + 1);
          }
        })
        .catch(() => {});
    },
  });
}
