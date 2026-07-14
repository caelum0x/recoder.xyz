-- 0000_extensions_and_ledger.sql
-- Foundational: extensions, the schema partitions, and the migration ledger.
--
-- Consolidates the three legacy logical DBs into ONE physical Postgres database
-- partitioned by schema (core / agent_os / pm / billing / kv). pgvector is
-- enabled once, globally. Every statement is idempotent so a re-run against an
-- already-migrated database is harmless.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists citext;
-- pgvector may be unavailable on some managed instances; the migration runner is
-- degrade-safe and records the failure without aborting boot.
create extension if not exists vector;

create schema if not exists core;
create schema if not exists agent_os;
create schema if not exists pm;
create schema if not exists billing;
create schema if not exists kv;

-- The migration ledger. One row per applied file; the runner records the file
-- name + a content checksum so an edited-after-apply file surfaces as drift.
create table if not exists core._recoder_migrations (
  filename    text primary key,
  checksum    text not null,
  applied_at  timestamptz not null default now()
);
