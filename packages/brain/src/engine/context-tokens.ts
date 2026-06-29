import type { BrainContext } from "../domain/brain-context.types";
import type { ContextPack } from "@recoder/recodergit";
import { estimateTokens } from "./token-estimator";

/**
 * Estimate the real token cost of an assembled {@link BrainContext} by walking
 * every piece of material a runtime would otherwise re-read: recalled memories,
 * doc snippets, related tasks, desktop-activity rows, and the repo intelligence
 * (the heaviest part — its dependency-graph nodes/edges, ownership, impact, and
 * provenance refs). This is the number a cache HIT attributes as "tokens saved",
 * because it is exactly the assembly material that did not have to be recomputed
 * and re-fed to the model.
 *
 * Pure + deterministic: same context => same token count. Degrade-safe: any
 * missing/oddly-shaped field contributes 0 rather than throwing.
 */
export function estimateContextTokens(context: BrainContext): number {
  let total = 0;

  for (const memory of context.memories ?? []) {
    total += estimateTokens(memory.text);
  }

  for (const doc of context.docs ?? []) {
    total += estimateTokens(doc.snippet);
    if (doc.title) {
      total += estimateTokens(doc.title);
    }
  }

  for (const task of context.tasks ?? []) {
    total += estimateTokens(task.title);
    total += estimateTokens(task.status);
  }

  const activity = context.activity;
  if (activity) {
    for (const row of activity.recent ?? []) {
      total += estimateTokens(row.text);
    }
    if (activity.profile?.brief) {
      total += estimateTokens(activity.profile.brief);
    }
  }

  total += estimateRepoTokens(context.repo);

  return total;
}

/**
 * Estimate the token cost of the repo intelligence pack — typically the largest
 * single contributor to an assembled context, and the most expensive to recompute
 * (a tree-sitter parse + graph walk). We count its symbol/file names, edges,
 * ownership entries, impact report, and provenance refs.
 */
function estimateRepoTokens(repo: ContextPack | undefined): number {
  if (!repo || typeof repo !== "object") {
    return 0;
  }
  let total = 0;

  const graph = repo.dependencyGraph;
  if (graph) {
    for (const node of graph.nodes ?? []) {
      total += estimateTokens(node);
    }
    for (const edge of graph.edges ?? []) {
      total += estimateTokens(`${edge.from} ${edge.kind} ${edge.to}`);
    }
  }

  for (const entry of repo.ownershipMap?.entries ?? []) {
    total += estimateTokens(entry.pathGlob);
    total += estimateTokens((entry.owners ?? []).join(" "));
  }

  const impact = repo.impactReport;
  if (impact) {
    total += estimateTokens((impact.targetPaths ?? []).join(" "));
    total += estimateTokens((impact.impactedPackages ?? []).join(" "));
    for (const test of impact.relatedTests ?? []) {
      total += estimateTokens(`${test.pathGlob} ${test.reason ?? ""}`);
    }
    for (const risk of impact.changedFileRisks ?? []) {
      total += estimateTokens(`${risk.path} ${risk.reason ?? ""}`);
    }
  }

  for (const ref of repo.sourceRefs ?? []) {
    total += estimateTokens(`${ref.ref} ${ref.detail ?? ""}`);
  }

  return total;
}
