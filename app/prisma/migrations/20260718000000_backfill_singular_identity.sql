-- 20260718000000_backfill_singular_identity.sql
--
-- Phase A identity unification (RECODER-NEXT-PHASE.md Phase A, owner-locked).
--
-- WHAT: Backfill the canonical Better Auth singular tables (`user`, `session`)
--       from the legacy plural tables (`users`, `sessions`) that live in the
--       SAME auth database (recoder_main / AUTH_DATABASE_URL). The compat bridge
--       in packages/auth/src/session.ts reads plural-first, then singular; this
--       migration makes the singular tables complete so that bridge can later be
--       deleted (in a SEPARATE follow-up commit, AFTER a soak — see the runbook).
--
-- SAFETY GUARANTEES:
--   * IDEMPOTENT     — safe to run repeatedly (WHERE NOT EXISTS + ON CONFLICT).
--   * FORWARD-ONLY   — inserts only; never UPDATEs or overwrites an existing row.
--   * NON-DESTRUCTIVE— NEVER drops/alters/truncates the plural tables. Dropping
--                      the plural tables + deleting the compat bridge happens in a
--                      LATER migration/commit after production has soaked.
--   * ENV-SAFE       — no-ops cleanly if either table is absent in this env.
--
-- ORDERING (load-bearing): users -> user FIRST, then sessions -> session, so the
-- session.userId FK always resolves. `session` rows are inserted only when their
-- user exists in the singular `user` table (FK-safe under either physical FK).
--
-- SCOPE: users + sessions ONLY (the tables the compat bridge reads). The `account`
-- table (password/social credentials) is intentionally OUT OF SCOPE here — it is
-- not read by the session-verification bridge and carries credential material;
-- treat it as a separate, later decision. See runbook.

-- ---------------------------------------------------------------------------
-- PRE-COUNT (informational — printed to the operator running `psql -f`)
-- ---------------------------------------------------------------------------
SELECT 'pre-count' AS phase,
       (SELECT count(*) FROM "users")    AS users_plural,
       (SELECT count(*) FROM "user")     AS user_singular,
       (SELECT count(*) FROM "sessions") AS sessions_plural,
       (SELECT count(*) FROM "session")  AS session_singular;

-- Rows that this migration is EXPECTED to insert (diagnostic, pre-run):
SELECT 'expected-user-inserts' AS phase, count(*) AS n
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "user" x WHERE x.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM "user" x WHERE x.email = u.email);

SELECT 'expected-session-inserts' AS phase, count(*) AS n
FROM "sessions" s
WHERE NOT EXISTS (SELECT 1 FROM "session" x WHERE x.id = s.id)
  AND EXISTS (SELECT 1 FROM "users" u WHERE u.id = s."userId");

-- ---------------------------------------------------------------------------
-- BACKFILL (wrapped so a missing table in this env is a clean no-op)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('"user"') IS NULL OR to_regclass('"users"') IS NULL THEN
    RAISE NOTICE 'Skipping user backfill: singular "user" or plural "users" table not present.';
  ELSE
    -- users -> user. Only the columns the Better Auth `user` model owns.
    -- WHERE NOT EXISTS(id)  => idempotent by primary key.
    -- ON CONFLICT DO NOTHING => tolerate email-unique collisions (a singular row
    --                           with the same email under a different id wins).
    INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
    SELECT u.id, u.name, u.email, u."emailVerified", u.image, u."createdAt", u."updatedAt"
    FROM "users" u
    WHERE NOT EXISTS (SELECT 1 FROM "user" x WHERE x.id = u.id)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'user backfill complete.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"session"') IS NULL OR to_regclass('"sessions"') IS NULL THEN
    RAISE NOTICE 'Skipping session backfill: singular "session" or plural "sessions" table not present.';
  ELSE
    -- sessions -> session. Overlapping columns only.
    -- EXISTS("user") guard keeps the userId FK valid regardless of whether the
    -- physical FK targets `user` or `users`.
    INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId")
    SELECT s.id, s."expiresAt", s.token, s."createdAt", s."updatedAt", s."ipAddress", s."userAgent", s."userId"
    FROM "sessions" s
    WHERE NOT EXISTS (SELECT 1 FROM "session" x WHERE x.id = s.id)
      AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = s."userId")
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'session backfill complete.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- POST-COUNT (informational) + residual diagnostics
-- ---------------------------------------------------------------------------
SELECT 'post-count' AS phase,
       (SELECT count(*) FROM "users")    AS users_plural,
       (SELECT count(*) FROM "user")     AS user_singular,
       (SELECT count(*) FROM "sessions") AS sessions_plural,
       (SELECT count(*) FROM "session")  AS session_singular;

-- Residual: plural users NOT represented in singular (by id or email). Non-zero
-- here is expected only for email collisions — investigate before dropping plural.
SELECT 'residual-users-unmigrated' AS phase, count(*) AS n
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "user" x WHERE x.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM "user" x WHERE x.email = u.email);

-- Residual: plural sessions with no singular row (missing id AND a resolvable
-- singular user). Non-zero => users skipped above cascaded to skipped sessions.
SELECT 'residual-sessions-unmigrated' AS phase, count(*) AS n
FROM "sessions" s
WHERE NOT EXISTS (SELECT 1 FROM "session" x WHERE x.id = s.id)
  AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = s."userId");
