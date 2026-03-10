CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  checklist_type TEXT DEFAULT 'workspace' CHECK (checklist_type IN ('workspace', 'agent', 'team', 'custom')),
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checklists_user ON onboarding_checklists(user_id);
CREATE INDEX idx_checklists_type ON onboarding_checklists(checklist_type);
CREATE INDEX idx_checklist_items_checklist ON onboarding_checklist_items(checklist_id, sort_order);
CREATE INDEX idx_checklist_items_user ON onboarding_checklist_items(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
