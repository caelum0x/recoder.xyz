//! Integration tests for the orchestration-lane `PolicyEngine` (priority eval).

use recoder_governance_kernel::{
    DiffScope, LaneBlocker, LaneContext, PolicyAction, PolicyCondition, PolicyEngine, PolicyRule,
    ReviewStatus,
};
use std::time::Duration;

fn context(
    green: u8,
    review: ReviewStatus,
    scope: DiffScope,
    blocker: LaneBlocker,
    completed: bool,
) -> LaneContext {
    LaneContext::new(
        "lane-1",
        green,
        Duration::from_secs(0),
        blocker,
        review,
        scope,
        completed,
    )
}

#[test]
fn priority_order_is_respected_with_stable_ties() {
    let engine = PolicyEngine::new(vec![
        PolicyRule::new(
            "closeout",
            PolicyCondition::And(vec![]),
            PolicyAction::CloseoutLane,
            30,
        ),
        PolicyRule::new(
            "notify-ops",
            PolicyCondition::And(vec![]),
            PolicyAction::Notify {
                channel: "ops".to_string(),
            },
            10,
        ),
        PolicyRule::new(
            "notify-review",
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
    let actions = engine.evaluate(&context(
        0,
        ReviewStatus::Pending,
        DiffScope::Full,
        LaneBlocker::None,
        false,
    ));
    assert_eq!(
        actions,
        vec![
            PolicyAction::Notify {
                channel: "ops".to_string()
            },
            PolicyAction::Notify {
                channel: "review".to_string()
            },
            PolicyAction::MergeToDev,
            PolicyAction::CloseoutLane,
        ]
    );
}

#[test]
fn merge_to_dev_only_when_green_scoped_and_reviewed() {
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

    // All conditions met -> merge.
    let ok = engine.evaluate(&context(
        3,
        ReviewStatus::Approved,
        DiffScope::Scoped,
        LaneBlocker::None,
        false,
    ));
    assert_eq!(ok, vec![PolicyAction::MergeToDev]);

    // Review not approved -> no action.
    let blocked = engine.evaluate(&context(
        3,
        ReviewStatus::Pending,
        DiffScope::Scoped,
        LaneBlocker::None,
        false,
    ));
    assert!(blocked.is_empty());
}

#[test]
fn startup_blocked_escalates_and_completed_closes_out() {
    let engine = PolicyEngine::new(vec![
        PolicyRule::new(
            "startup",
            PolicyCondition::StartupBlocked,
            PolicyAction::Escalate {
                reason: "stuck".to_string(),
            },
            5,
        ),
        PolicyRule::new(
            "closeout",
            PolicyCondition::LaneCompleted,
            PolicyAction::CloseoutLane,
            10,
        ),
    ]);
    let actions = engine.evaluate(&context(
        0,
        ReviewStatus::Pending,
        DiffScope::Full,
        LaneBlocker::Startup,
        true,
    ));
    assert_eq!(
        actions,
        vec![
            PolicyAction::Escalate {
                reason: "stuck".to_string()
            },
            PolicyAction::CloseoutLane,
        ]
    );
}
