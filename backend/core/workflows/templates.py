# backend/core/workflows/templates.py

WORKFLOW_TEMPLATES = [
    {
        "name": "Daily Standup Report",
        "description": "Summarize recent agent activity and send a daily report",
        "category": "productivity",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Summarize Activity", "config": {"prompt": "Summarize the recent threads and agent runs from the last 24 hours. Focus on key outcomes and pending items."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "output", "label": "Send Report", "config": {"format": "markdown"}, "position_x": 250, "position_y": 300},
            ],
            "edges": [{"source": "t1", "target": "t2"}],
        },
        "is_featured": True,
    },
    {
        "name": "PR Review Pipeline",
        "description": "Review pull requests with AI and route for human approval",
        "category": "development",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Review Code", "config": {"prompt": "Review this pull request for bugs, security issues, and code quality."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "condition", "label": "Issues Found?", "config": {"expression": "issues_count > 0"}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "approval", "label": "Human Review", "config": {"ttl_seconds": 86400}, "position_x": 100, "position_y": 400},
                {"id": "t4", "node_type": "agent", "label": "Auto-Approve", "config": {"prompt": "Post approval comment on the PR."}, "position_x": 400, "position_y": 400},
                {"id": "t5", "node_type": "output", "label": "Done", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3", "condition": {"branch": "true"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "false"}},
                {"source": "t3", "target": "t5"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
    {
        "name": "Research & Report",
        "description": "Research a topic, write a report, and get approval before sharing",
        "category": "research",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "input", "label": "Research Topic", "config": {"prompt": "What topic should I research?"}, "position_x": 250, "position_y": 50},
                {"id": "t2", "node_type": "agent", "label": "Research", "config": {"prompt": "Research the given topic thoroughly using web search and knowledge base."}, "position_x": 250, "position_y": 200},
                {"id": "t3", "node_type": "agent", "label": "Write Report", "config": {"prompt": "Write a structured report based on the research findings."}, "position_x": 250, "position_y": 350},
                {"id": "t4", "node_type": "approval", "label": "Review Report", "config": {"ttl_seconds": 172800}, "position_x": 250, "position_y": 500},
                {"id": "t5", "node_type": "output", "label": "Publish", "config": {"format": "markdown"}, "position_x": 250, "position_y": 650},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3"},
                {"source": "t3", "target": "t4"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
    {
        "name": "Data Pipeline",
        "description": "Scrape, clean, and store data in knowledge base",
        "category": "data",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Scrape Data", "config": {"prompt": "Scrape the target URL and extract structured data."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "agent", "label": "Clean & Transform", "config": {"prompt": "Clean and normalize the scraped data."}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "agent", "label": "Store in KB", "config": {"prompt": "Store the cleaned data in the knowledge base."}, "position_x": 250, "position_y": 400},
                {"id": "t4", "node_type": "output", "label": "Summary", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3"},
                {"source": "t3", "target": "t4"},
            ],
        },
        "is_featured": False,
    },
    {
        "name": "Customer Support Triage",
        "description": "Classify incoming support requests and route to human or auto-reply",
        "category": "support",
        "definition": {
            "nodes": [
                {"id": "t1", "node_type": "agent", "label": "Classify Request", "config": {"prompt": "Classify this support request as 'urgent', 'standard', or 'faq'."}, "position_x": 250, "position_y": 100},
                {"id": "t2", "node_type": "condition", "label": "Urgency Check", "config": {"expression": "classification"}, "position_x": 250, "position_y": 250},
                {"id": "t3", "node_type": "approval", "label": "Escalate to Human", "config": {"ttl_seconds": 3600}, "position_x": 50, "position_y": 400},
                {"id": "t4", "node_type": "agent", "label": "Auto-Reply", "config": {"prompt": "Draft a helpful response for this standard support request."}, "position_x": 450, "position_y": 400},
                {"id": "t5", "node_type": "output", "label": "Resolved", "config": {}, "position_x": 250, "position_y": 550},
            ],
            "edges": [
                {"source": "t1", "target": "t2"},
                {"source": "t2", "target": "t3", "condition": {"branch": "urgent"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "standard"}},
                {"source": "t2", "target": "t4", "condition": {"branch": "faq"}},
                {"source": "t3", "target": "t5"},
                {"source": "t4", "target": "t5"},
            ],
        },
        "is_featured": True,
    },
]


def get_templates(category: str | None = None) -> list[dict]:
    if category:
        return [t for t in WORKFLOW_TEMPLATES if t["category"] == category]
    return WORKFLOW_TEMPLATES


def get_template(name: str) -> dict | None:
    for t in WORKFLOW_TEMPLATES:
        if t["name"] == name:
            return t
    return None
