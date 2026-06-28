//! Orchestration **lane** policy engine (merged from claw `policy_engine.rs`).
//!
//! This is the policy surface the *coordination* subsystem uses to decide what
//! to do with a work lane: merge to dev, merge forward, recover, escalate, close
//! out, clean up, notify, or block. It is intentionally separate from the
//! action-level [`decide`](crate::pipeline::decide) pipeline — a lane decision is
//! about orchestration flow, not a single tool call.
//!
//! [`PolicyEngine::new`] sorts rules by ascending `priority`, and
//! [`PolicyEngine::evaluate`] returns the flattened actions of every matching
//! rule in that priority order (stable on ties). `Chain` actions are flattened
//! recursively so a caller always sees a flat action list.

use std::time::Duration;

/// A 0-based "how green is CI" level used by [`PolicyCondition::GreenAt`].
pub type GreenLevel = u8;

/// A branch older than this is considered stale by [`PolicyCondition::StaleBranch`].
pub const STALE_BRANCH_THRESHOLD: Duration = Duration::from_secs(60 * 60);

/// A single priority-ordered lane policy rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRule {
    /// Human-readable rule name (for audit / tracing).
    pub name: String,
    /// The condition that must hold for the rule to fire.
    pub condition: PolicyCondition,
    /// The action(s) to take when the condition holds.
    pub action: PolicyAction,
    /// Lower priority evaluates first.
    pub priority: u32,
}

impl PolicyRule {
    /// Construct a rule.
    #[must_use]
    pub fn new(
        name: impl Into<String>,
        condition: PolicyCondition,
        action: PolicyAction,
        priority: u32,
    ) -> Self {
        Self {
            name: name.into(),
            condition,
            action,
            priority,
        }
    }

    /// Whether this rule fires for the given lane context.
    #[must_use]
    pub fn matches(&self, context: &LaneContext) -> bool {
        self.condition.matches(context)
    }
}

/// A boolean condition over a [`LaneContext`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyCondition {
    /// All sub-conditions must hold (empty = always true).
    And(Vec<PolicyCondition>),
    /// Any sub-condition must hold (empty = never true).
    Or(Vec<PolicyCondition>),
    /// CI green level is at least `level`.
    GreenAt {
        /// The minimum green level.
        level: GreenLevel,
    },
    /// The branch is older than [`STALE_BRANCH_THRESHOLD`].
    StaleBranch,
    /// The lane is blocked on startup.
    StartupBlocked,
    /// The lane has completed.
    LaneCompleted,
    /// Review has been approved.
    ReviewPassed,
    /// The diff is scoped (not a full-repo change).
    ScopedDiff,
    /// The branch has been idle for at least `duration`.
    TimedOut {
        /// The idle duration that triggers the condition.
        duration: Duration,
    },
}

impl PolicyCondition {
    /// Evaluate the condition against a lane context.
    #[must_use]
    pub fn matches(&self, context: &LaneContext) -> bool {
        match self {
            Self::And(conditions) => conditions.iter().all(|c| c.matches(context)),
            Self::Or(conditions) => conditions.iter().any(|c| c.matches(context)),
            Self::GreenAt { level } => context.green_level >= *level,
            Self::StaleBranch => context.branch_freshness >= STALE_BRANCH_THRESHOLD,
            Self::StartupBlocked => context.blocker == LaneBlocker::Startup,
            Self::LaneCompleted => context.completed,
            Self::ReviewPassed => context.review_status == ReviewStatus::Approved,
            Self::ScopedDiff => context.diff_scope == DiffScope::Scoped,
            Self::TimedOut { duration } => context.branch_freshness >= *duration,
        }
    }
}

/// An orchestration action a lane rule can emit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyAction {
    /// Merge the lane into the development branch.
    MergeToDev,
    /// Merge the parent forward into the lane.
    MergeForward,
    /// Attempt one automatic recovery.
    RecoverOnce,
    /// Escalate to a human with a reason.
    Escalate {
        /// Why the lane escalated.
        reason: String,
    },
    /// Close out the lane.
    CloseoutLane,
    /// Clean up the lane's session.
    CleanupSession,
    /// Notify a channel.
    Notify {
        /// The channel to notify.
        channel: String,
    },
    /// Block the lane with a reason.
    Block {
        /// Why the lane is blocked.
        reason: String,
    },
    /// A sequence of actions, flattened during evaluation.
    Chain(Vec<PolicyAction>),
}

impl PolicyAction {
    /// Flatten a (possibly nested) `Chain` into `actions`, depth-first.
    fn flatten_into(&self, actions: &mut Vec<PolicyAction>) {
        match self {
            Self::Chain(chained) => {
                for action in chained {
                    action.flatten_into(actions);
                }
            }
            other => actions.push(other.clone()),
        }
    }
}

/// What is blocking a lane.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaneBlocker {
    /// Nothing is blocking.
    None,
    /// The lane is blocked during startup.
    Startup,
    /// The lane is blocked by an external dependency.
    External,
}

/// The review status of a lane's diff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewStatus {
    /// Review is pending.
    Pending,
    /// Review was approved.
    Approved,
    /// Review was rejected.
    Rejected,
}

/// The scope of a lane's diff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffScope {
    /// A full / broad change.
    Full,
    /// A narrowly scoped change.
    Scoped,
}

/// The context a lane policy evaluates against.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneContext {
    /// The lane identifier.
    pub lane_id: String,
    /// CI green level.
    pub green_level: GreenLevel,
    /// How long since the branch last advanced.
    pub branch_freshness: Duration,
    /// What is blocking the lane.
    pub blocker: LaneBlocker,
    /// The review status.
    pub review_status: ReviewStatus,
    /// The diff scope.
    pub diff_scope: DiffScope,
    /// Whether the lane is complete.
    pub completed: bool,
}

impl LaneContext {
    /// Construct a lane context.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        lane_id: impl Into<String>,
        green_level: GreenLevel,
        branch_freshness: Duration,
        blocker: LaneBlocker,
        review_status: ReviewStatus,
        diff_scope: DiffScope,
        completed: bool,
    ) -> Self {
        Self {
            lane_id: lane_id.into(),
            green_level,
            branch_freshness,
            blocker,
            review_status,
            diff_scope,
            completed,
        }
    }
}

/// The priority-ordered lane policy engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEngine {
    rules: Vec<PolicyRule>,
}

impl PolicyEngine {
    /// Build an engine, sorting the rules by ascending priority (stable).
    #[must_use]
    pub fn new(mut rules: Vec<PolicyRule>) -> Self {
        rules.sort_by_key(|rule| rule.priority);
        Self { rules }
    }

    /// The sorted rules.
    #[must_use]
    pub fn rules(&self) -> &[PolicyRule] {
        &self.rules
    }

    /// Evaluate the engine against a context, returning the flattened actions of
    /// every matching rule in priority order.
    #[must_use]
    pub fn evaluate(&self, context: &LaneContext) -> Vec<PolicyAction> {
        evaluate(self, context)
    }
}

/// Free-function form of [`PolicyEngine::evaluate`].
#[must_use]
pub fn evaluate(engine: &PolicyEngine, context: &LaneContext) -> Vec<PolicyAction> {
    let mut actions = Vec::new();
    for rule in &engine.rules {
        if rule.matches(context) {
            rule.action.flatten_into(&mut actions);
        }
    }
    actions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_context() -> LaneContext {
        LaneContext::new(
            "lane-7",
            0,
            Duration::from_secs(0),
            LaneBlocker::None,
            ReviewStatus::Pending,
            DiffScope::Full,
            false,
        )
    }

    #[test]
    fn merge_to_dev_fires_for_green_scoped_reviewed_lane() {
        let engine = PolicyEngine::new(vec![PolicyRule::new(
            "merge-to-dev",
            PolicyCondition::And(vec![
                PolicyCondition::GreenAt { level: 2 },
                PolicyCondition::ScopedDiff,
                PolicyCondition::ReviewPassed,
            ]),
            PolicyAction::MergeToDev,
            20,
        )]);
        let context = LaneContext::new(
            "lane-7",
            3,
            Duration::from_secs(5),
            LaneBlocker::None,
            ReviewStatus::Approved,
            DiffScope::Scoped,
            false,
        );
        assert_eq!(engine.evaluate(&context), vec![PolicyAction::MergeToDev]);
    }

    #[test]
    fn startup_blocked_recovers_then_escalates() {
        let engine = PolicyEngine::new(vec![PolicyRule::new(
            "startup-recovery",
            PolicyCondition::StartupBlocked,
            PolicyAction::Chain(vec![
                PolicyAction::RecoverOnce,
                PolicyAction::Escalate {
                    reason: "startup remained blocked".to_string(),
                },
            ]),
            15,
        )]);
        let context = LaneContext::new(
            "lane-7",
            0,
            Duration::from_secs(0),
            LaneBlocker::Startup,
            ReviewStatus::Pending,
            DiffScope::Full,
            false,
        );
        assert_eq!(
            engine.evaluate(&context),
            vec![
                PolicyAction::RecoverOnce,
                PolicyAction::Escalate {
                    reason: "startup remained blocked".to_string(),
                },
            ]
        );
    }

    #[test]
    fn completed_lane_closes_out_and_cleans_up() {
        let engine = PolicyEngine::new(vec![PolicyRule::new(
            "lane-closeout",
            PolicyCondition::LaneCompleted,
            PolicyAction::Chain(vec![
                PolicyAction::CloseoutLane,
                PolicyAction::CleanupSession,
            ]),
            30,
        )]);
        let mut context = default_context();
        context.completed = true;
        assert_eq!(
            engine.evaluate(&context),
            vec![PolicyAction::CloseoutLane, PolicyAction::CleanupSession]
        );
    }

    #[test]
    fn matching_rules_returned_in_priority_order_with_stable_ties() {
        let engine = PolicyEngine::new(vec![
            PolicyRule::new(
                "late-cleanup",
                PolicyCondition::And(vec![]),
                PolicyAction::CleanupSession,
                30,
            ),
            PolicyRule::new(
                "first-notify",
                PolicyCondition::And(vec![]),
                PolicyAction::Notify {
                    channel: "ops".to_string(),
                },
                10,
            ),
            PolicyRule::new(
                "second-notify",
                PolicyCondition::And(vec![]),
                PolicyAction::Notify {
                    channel: "review".to_string(),
                },
                10,
            ),
            PolicyRule::new(
                "merge",
                PolicyCondition::And(vec![]),
                PolicyAction::MergeToDev,
                20,
            ),
        ]);
        assert_eq!(
            evaluate(&engine, &default_context()),
            vec![
                PolicyAction::Notify {
                    channel: "ops".to_string(),
                },
                PolicyAction::Notify {
                    channel: "review".to_string(),
                },
                PolicyAction::MergeToDev,
                PolicyAction::CleanupSession,
            ]
        );
    }

    #[test]
    fn stale_branch_fires_at_threshold() {
        let engine = PolicyEngine::new(vec![PolicyRule::new(
            "merge-forward",
            PolicyCondition::StaleBranch,
            PolicyAction::MergeForward,
            10,
        )]);
        let mut context = default_context();
        context.branch_freshness = STALE_BRANCH_THRESHOLD;
        assert_eq!(engine.evaluate(&context), vec![PolicyAction::MergeForward]);
    }

    #[test]
    fn empty_or_never_fires_and_nested_chains_flatten() {
        let engine = PolicyEngine::new(vec![
            PolicyRule::new(
                "empty-or",
                PolicyCondition::Or(vec![]),
                PolicyAction::Block {
                    reason: "should not fire".to_string(),
                },
                10,
            ),
            PolicyRule::new(
                "nested",
                PolicyCondition::Or(vec![PolicyCondition::StartupBlocked]),
                PolicyAction::Chain(vec![
                    PolicyAction::Notify {
                        channel: "alerts".to_string(),
                    },
                    PolicyAction::Chain(vec![
                        PolicyAction::MergeForward,
                        PolicyAction::CleanupSession,
                    ]),
                ]),
                15,
            ),
        ]);
        let mut context = default_context();
        context.blocker = LaneBlocker::Startup;
        assert_eq!(
            engine.evaluate(&context),
            vec![
                PolicyAction::Notify {
                    channel: "alerts".to_string(),
                },
                PolicyAction::MergeForward,
                PolicyAction::CleanupSession,
            ]
        );
    }
}
