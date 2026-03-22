# Phase 8: Deploy, Test & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy all Phase 7 changes to production, run the comprehensive test suites, close verified issues, and polish remaining rough edges.

**Architecture:** Four sub-phases: (8A) deploy all local changes, (8B) run test suites and fix failures, (8C) close verified issues in plan.md, (8D) polish — Sentry, performance, remaining UI fixes.

**Tech Stack:** rsync + PM2 (deployment), Bash test scripts, Vitest, Docker rebuild

---

## Sub-Phase 8A: Deploy

### Task 1: Deploy backend changes (stale run cleanup)
### Task 2: Deploy recoder-agents changes (branding + tests)
### Task 3: Deploy recoder-web Docker rebuild (model registry + LSP + chat history fix)
### Task 4: Deploy PM changes (model default fix)
### Task 5: Deploy Agency changes (AI fixes + shared helper)
### Task 6: Deploy docker-backend changes (A2A workflows + LSP)

## Sub-Phase 8B: Run Test Suites

### Task 7: Run verification script
### Task 8: Run backend API test suite
### Task 9: Run platform e2e test suite
### Task 10: Run monitoring test suite
### Task 11: Run agents Vitest suite
### Task 12: Fix any test failures

## Sub-Phase 8C: Issue Closure

### Task 13: Update all 19 issues based on test results

## Sub-Phase 8D: Polish

### Task 14: Set up Sentry error monitoring
### Task 15: Performance audit — bundle sizes, cold starts
### Task 16: Update plan.md with Phase 8 completion
