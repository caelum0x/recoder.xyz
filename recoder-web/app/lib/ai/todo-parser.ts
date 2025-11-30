interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  inProgress: boolean;
}

export function parseTodos(content: string): TodoItem[] {
  const todos: TodoItem[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Match various todo formats
    const todoMatch = line.match(/^[\s-]*\[([x\s])\]\s*(.+)$/i);
    const numberMatch = line.match(/^\d+\.\s*(.+)$/);
    const dashMatch = line.match(/^-\s*(.+)$/);

    if (todoMatch) {
      todos.push({
        id: `todo-${index}`,
        text: todoMatch[2].trim(),
        completed: todoMatch[1].toLowerCase() === 'x',
        inProgress: false,
      });
    } else if (numberMatch) {
      todos.push({
        id: `todo-${index}`,
        text: numberMatch[1].trim(),
        completed: false,
        inProgress: false,
      });
    } else if (dashMatch && line.includes('TODO:')) {
      todos.push({
        id: `todo-${index}`,
        text: dashMatch[1].replace('TODO:', '').trim(),
        completed: false,
        inProgress: false,
      });
    }
  });

  return todos;
}

export function extractTodoSection(content: string): string {
  const todoMatch = content.match(/## Tasks?[\s\S]*?(?=\n##|$)/i);
  return todoMatch ? todoMatch[0] : '';
}
