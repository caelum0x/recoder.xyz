//! Integration tests for hot policy reload (`reload_policies`).

use recoder_governance_kernel::{
    Effect, GovernanceAction, GovernanceHandle, GovernanceKernel, GovernanceKernelConfig,
    GovernanceRequest,
};

fn kernel() -> GovernanceKernel {
    GovernanceKernel::new(GovernanceKernelConfig::default()).expect("valid config")
}

fn write_req(target: &str) -> GovernanceRequest {
    GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileWrite, target)
}

#[test]
fn reload_adds_a_forbidden_path_live() {
    let k = kernel();
    // Before reload: a file write is High tier, so it needs approval (but is not
    // hard-denied — the path is not forbidden yet).
    assert_eq!(
        k.decide(&write_req("src/feature/x.ts")).effect,
        Effect::NeedsApproval
    );

    let mut cfg = GovernanceKernelConfig::default();
    cfg.forbidden_paths.push("feature".to_string());
    k.reload_policies(cfg).expect("reload");

    // After reload: the same write is hard-denied (deny wins over approval).
    assert_eq!(
        k.decide(&write_req("src/feature/x.ts")).effect,
        Effect::Deny
    );
}

#[test]
fn reload_rejects_invalid_config_and_keeps_old_policy() {
    let k = kernel();
    let mut bad = GovernanceKernelConfig::default();
    bad.routing.simple_threshold = 9000;
    bad.routing.complex_threshold = 1;
    assert!(k.reload_policies(bad).is_err());

    // Old policy still live: a plain read is allowed.
    let read = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
    assert_eq!(k.decide(&read).effect, Effect::Allow);
}

#[test]
fn reload_preserves_the_audit_chain() {
    let k = kernel();
    let read = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
    k.decide(&read);
    let len_before = k.audit_len();

    k.reload_policies(GovernanceKernelConfig::default())
        .expect("reload");

    // The audit chain is not reset by a reload.
    assert_eq!(k.audit_len(), len_before);
    assert!(k.verify_audit().is_ok());
    k.decide(&read);
    assert_eq!(k.audit_len(), len_before + 1);
    assert!(k.verify_audit().is_ok());
}
