//! Task complexity scoring (merged from openfang `routing.rs`).
//!
//! The upstream router scored a runtime `CompletionRequest`. To keep this crate
//! self-contained (no LLM-driver dependency), we score a small, explicit
//! [`ScoringInput`] that carries exactly the heuristic signals: message text,
//! tool count, conversation depth, and system-prompt length.

/// The minimal signal set the complexity heuristic needs.
#[derive(Debug, Clone, Default)]
pub struct ScoringInput {
    /// The message bodies, oldest to newest.
    pub messages: Vec<String>,
    /// The number of tools available to the agent.
    pub tool_count: usize,
    /// The system prompt, if any.
    pub system: Option<String>,
}

impl ScoringInput {
    /// Build an input from message strings.
    #[must_use]
    pub fn from_messages(messages: Vec<String>) -> Self {
        Self {
            messages,
            tool_count: 0,
            system: None,
        }
    }

    /// Set the tool count.
    #[must_use]
    pub fn with_tools(mut self, tool_count: usize) -> Self {
        self.tool_count = tool_count;
        self
    }

    /// Set the system prompt.
    #[must_use]
    pub fn with_system(mut self, system: impl Into<String>) -> Self {
        self.system = Some(system.into());
        self
    }
}

/// Task complexity tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskComplexity {
    /// Quick lookup / simple Q&A — cheapest model.
    Simple,
    /// Standard conversational task — mid-tier model.
    Medium,
    /// Multi-step reasoning / code generation — best model.
    Complex,
}

impl std::fmt::Display for TaskComplexity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskComplexity::Simple => write!(f, "simple"),
            TaskComplexity::Medium => write!(f, "medium"),
            TaskComplexity::Complex => write!(f, "complex"),
        }
    }
}

/// Code markers that, when present in the last message, raise the score.
const CODE_MARKERS: &[&str] = &[
    "```",
    "fn ",
    "def ",
    "class ",
    "import ",
    "function ",
    "async ",
    "await ",
    "struct ",
    "impl ",
    "return ",
];

/// Compute the raw complexity score for an input (mirrors openfang heuristics).
///
/// - **Token proxy**: total chars / 4.
/// - **Tool count**: `+20` per tool.
/// - **Code markers**: `+30` per distinct marker in the last message.
/// - **Conversation depth**: `+15` per message beyond 10.
/// - **System prompt**: `+(len-500)/10` when over 500 chars.
#[must_use]
pub fn score_raw(input: &ScoringInput) -> u32 {
    let mut score: u32 = 0;

    // 1. Token proxy (~4 chars/token).
    let total_chars: usize = input.messages.iter().map(String::len).sum();
    score += (total_chars / 4) as u32;

    // 2. Tool availability.
    let tool_count = input.tool_count as u32;
    if tool_count > 0 {
        score += tool_count * 20;
    }

    // 3. Code markers in the last message.
    if let Some(last) = input.messages.last() {
        let lower = last.to_lowercase();
        let code_score = CODE_MARKERS
            .iter()
            .filter(|marker| lower.contains(*marker))
            .count() as u32;
        score += code_score * 30;
    }

    // 4. Conversation depth.
    let msg_count = input.messages.len() as u32;
    if msg_count > 10 {
        score += (msg_count - 10) * 15;
    }

    // 5. System prompt length.
    if let Some(system) = &input.system {
        let sys_len = system.len() as u32;
        if sys_len > 500 {
            score += (sys_len - 500) / 10;
        }
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_scores_low() {
        let input = ScoringInput::from_messages(vec!["Hello!".to_string()]);
        assert!(score_raw(&input) < 100);
    }

    #[test]
    fn code_markers_raise_score() {
        let plain = ScoringInput::from_messages(vec!["just chatting here".to_string()]);
        let code = ScoringInput::from_messages(vec![
            "Write a function:\n```rust\nfn main() { let x = await foo(); }\n```\nimpl struct return"
                .to_string(),
        ]);
        assert!(score_raw(&code) > score_raw(&plain));
    }

    #[test]
    fn tools_raise_score() {
        let no_tools = ScoringInput::from_messages(vec!["solve this".to_string()]);
        let with_tools = no_tools.clone().with_tools(15);
        assert_eq!(score_raw(&with_tools), score_raw(&no_tools) + 300);
    }

    #[test]
    fn long_conversation_raises_score() {
        let short = ScoringInput::from_messages(vec!["hi".to_string()]);
        let long = ScoringInput::from_messages((0..20).map(|i| format!("msg {i}")).collect());
        assert!(score_raw(&long) > score_raw(&short));
    }

    #[test]
    fn long_system_prompt_raises_score() {
        let base = ScoringInput::from_messages(vec!["hi".to_string()]);
        let with_system = base.clone().with_system("A".repeat(2000));
        assert!(score_raw(&with_system) > score_raw(&base));
    }

    #[test]
    fn complexity_display() {
        assert_eq!(TaskComplexity::Simple.to_string(), "simple");
        assert_eq!(TaskComplexity::Medium.to_string(), "medium");
        assert_eq!(TaskComplexity::Complex.to_string(), "complex");
    }
}
