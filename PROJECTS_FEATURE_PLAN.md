# 🎯 Claude-Style Projects Feature

## Current Situation
- ✅ Chat history exists (saved to database)
- ✅ Files are saved in chat sessions
- ❌ No "Projects" concept in UI
- ❌ Can't organize chats into projects
- ❌ Can't create empty projects

## Goal: Claude Projects Experience
Users should be able to:
1. Create projects (like Claude Projects)
2. Save chats as projects
3. Organize multiple chats under one project
4. Add files/context to projects
5. Switch between projects in sidebar

---

## 🏗️ Implementation Plan

### Phase 1: Database Schema (30 min)

**Add to chat_sessions table:**
```sql
ALTER TABLE chat_sessions ADD COLUMN project_id TEXT;
ALTER TABLE chat_sessions ADD COLUMN is_project BOOLEAN DEFAULT false;
```

**Create projects table:**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
```

**Create project_files table:**
```sql
CREATE TABLE project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_files_project_id ON project_files(project_id);
```

---

### Phase 2: Backend API (2-3 hours)

**Recoder-Web API Endpoints:**

```typescript
// /recoder-web/app/routes/api.projects.ts

// GET /api/projects - List all projects
// POST /api/projects - Create new project
// GET /api/projects/:id - Get project details
// PUT /api/projects/:id - Update project
// DELETE /api/projects/:id - Delete project

// POST /api/projects/:id/chats - Add chat to project
// DELETE /api/projects/:id/chats/:chatId - Remove chat from project

// POST /api/projects/:id/files - Add file to project
// GET /api/projects/:id/files - List project files
// DELETE /api/projects/:id/files/:fileId - Delete file
```

**Implementation:**
```typescript
// /recoder-web/app/routes/api.projects.ts
import { json } from '@remix-run/cloudflare';
import { getSession } from '~/lib/auth/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  // List all projects for user
  const projects = await db.query(`
    SELECT p.*, 
           COUNT(DISTINCT cs.id) as chat_count,
           COUNT(DISTINCT pf.id) as file_count
    FROM projects p
    LEFT JOIN chat_sessions cs ON cs.project_id = p.id
    LEFT JOIN project_files pf ON pf.project_id = p.id
    WHERE p.user_id = $1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `, [session.user.id]);

  return json({ success: true, projects });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const action = formData.get('action');

  switch (action) {
    case 'create':
      // Create new project
      const name = formData.get('name');
      const description = formData.get('description');
      
      const project = await db.query(`
        INSERT INTO projects (id, user_id, name, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [generateId(), session.user.id, name, description]);
      
      return json({ success: true, project: project[0] });

    case 'update':
      // Update project
      break;

    case 'delete':
      // Delete project
      break;
  }
}
```

---

### Phase 3: UI Components (3-4 hours)

#### 3.1 Projects Sidebar (1-2 hours)

**File:** `/recoder-web/app/components/sidebar/ProjectsList.tsx`

```tsx
import { useState, useEffect } from 'react';
import { FolderOpen, Plus, ChevronRight, ChevronDown } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  icon: string;
  color: string;
  chatCount: number;
  fileCount: number;
}

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const data = await response.json();
    if (data.success) setProjects(data.projects);
  }

  return (
    <div className="projects-list">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Projects</h3>
        <button onClick={() => createProject()} className="p-1 hover:bg-gray-100 rounded">
          <Plus size={16} />
        </button>
      </div>

      {projects.map(project => (
        <ProjectItem 
          key={project.id}
          project={project}
          expanded={expandedProjects.has(project.id)}
          onToggle={() => toggleProject(project.id)}
        />
      ))}
    </div>
  );
}
```

#### 3.2 Update Sidebar Menu (30 min)

**File:** `/recoder-web/app/components/sidebar/Menu.client.tsx`

Add projects section above chat history:
```tsx
// Add to Menu.client.tsx
import { ProjectsList } from './ProjectsList';

// In the sidebar render:
<div className="sidebar-content">
  <ProjectsList />  {/* NEW */}
  <div className="divider" />
  <ChatHistory />
</div>
```

#### 3.3 Create Project Modal (1 hour)

**File:** `/recoder-web/app/components/projects/CreateProjectModal.tsx`

```tsx
import { useState } from 'react';
import { Dialog } from '~/components/ui/Dialog';

export function CreateProjectModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');

  async function handleCreate() {
    const formData = new FormData();
    formData.append('action', 'create');
    formData.append('name', name);
    formData.append('description', description);
    formData.append('icon', icon);

    const response = await fetch('/api/projects', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      onClose();
      // Refresh projects list
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <h2>Create New Project</h2>
      <input 
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Project name"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      <button onClick={handleCreate}>Create Project</button>
    </Dialog>
  );
}
```

#### 3.4 Save Chat to Project (30 min)

**File:** `/recoder-web/app/components/chat/ChatActions.tsx`

Add "Save to Project" button in chat header:
```tsx
<button onClick={() => saveToProject(chatId)}>
  <FolderPlus size={16} />
  Save to Project
</button>
```

---

### Phase 4: Integration (1 hour)

#### 4.1 Update Chat Creation
When creating a new chat, optionally assign to project:
```typescript
// In chat creation flow
const projectId = selectedProject?.id;
await createChat({ projectId, ... });
```

#### 4.2 Project Context
Load project files as context when chatting:
```typescript
// When user is in a project, load project files
const projectFiles = await loadProjectFiles(projectId);
// Add to AI context
```

---

## 🎨 UI/UX Design

### Sidebar Layout:
```
┌─────────────────────────┐
│ 🏠 Home                 │
│ ⚙️  Settings            │
├─────────────────────────┤
│ Projects            [+] │
│                         │
│ 📁 My Website          │
│   └─ 3 chats, 12 files │
│                         │
│ 🎨 Design System       │
│   └─ 1 chat, 5 files   │
│                         │
│ 🚀 API Project         │
│   └─ 2 chats, 8 files  │
├─────────────────────────┤
│ Recent Chats            │
│ • Chat 1                │
│ • Chat 2                │
└─────────────────────────┘
```

### Project View:
```
┌─────────────────────────────────────┐
│ 📁 My Website                       │
│ A full-stack web application        │
├─────────────────────────────────────┤
│ Chats (3)                           │
│ • Initial setup                     │
│ • Add authentication                │
│ • Deploy to Vercel                  │
├─────────────────────────────────────┤
│ Files (12)                          │
│ • app/page.tsx                      │
│ • components/Header.tsx             │
│ • lib/auth.ts                       │
└─────────────────────────────────────┘
```

---

## 📊 Implementation Timeline

| Phase | Task | Time | Priority |
|-------|------|------|----------|
| 1 | Database schema | 30 min | P0 |
| 2 | Backend API | 2-3 hours | P0 |
| 3.1 | Projects sidebar | 1-2 hours | P0 |
| 3.2 | Update menu | 30 min | P0 |
| 3.3 | Create modal | 1 hour | P1 |
| 3.4 | Save to project | 30 min | P1 |
| 4 | Integration | 1 hour | P1 |

**Total Time:** 6-9 hours (1-2 days)

---

## 🚀 MVP Features (Day 1)

**Must Have:**
- ✅ Create projects
- ✅ List projects in sidebar
- ✅ Save chat to project
- ✅ View chats in project

**Nice to Have (Day 2):**
- Project files management
- Project settings
- Project sharing
- Project templates

---

## 🔄 Migration Strategy

**For existing chats:**
```sql
-- Create "Uncategorized" project for existing chats
INSERT INTO projects (id, user_id, name, description, icon)
SELECT 
  'uncategorized-' || user_id,
  user_id,
  'Uncategorized',
  'Chats not assigned to a project',
  '📂'
FROM users;

-- Assign existing chats to uncategorized
UPDATE chat_sessions 
SET project_id = 'uncategorized-' || user_id
WHERE project_id IS NULL;
```

---

## ✅ Success Criteria

1. Users can create projects from sidebar
2. Users can save chats to projects
3. Projects show chat count and file count
4. Clicking project shows all its chats
5. Projects persist across sessions
6. Projects sync between devices

---

**Status:** Ready to implement
**Estimated Completion:** 1-2 days
**Complexity:** Medium
