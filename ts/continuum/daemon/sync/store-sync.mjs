// Multi-device sync of the append-only episode store. Content-addressed and conflict-free:
// episodes are immutable facts keyed by a stable content_hash, so merging is set-union (append-merge),
// NEVER last-write-wins. We can never lose or duplicate an episode — dedup is purely by content_hash.
//
// Everything is injected so tests use in-memory fakes and never touch the network/disk:
//   transport     { push(episodes), pull(sinceCursor) -> { episodes, cursor } }
//                 real impl: HTTP to a sync endpoint, or a shared directory. Inject a fake for tests.
//   localEpisodes ()        -> Episode[]   (e.g. store.loadEpisodes)
//   appendLocal   (ep)                      (e.g. store.appendEpisode)
//   now           ()        -> ms           (clock, defaults to Date.now)
//
// Pure over those injected fns. Holds only sync bookkeeping (pull cursor + pushed-hash set), not data.

const noTransport = { push() {}, pull() { return { episodes: [], cursor: null }; } };

// Stable total order: t ascending, then content_hash lexicographic. Makes merge/push deterministic.
function byTThenHash(a, b) {
  const ta = a.t || 0, tb = b.t || 0;
  if (ta !== tb) return ta - tb;
  const ha = a.content_hash || '', hb = b.content_hash || '';
  return ha < hb ? -1 : ha > hb ? 1 : 0;
}

const hashesOf = (eps) => new Set(eps.map((e) => e.content_hash));

export function createStoreSync({
  transport = noTransport,
  localEpisodes = () => [],
  appendLocal = () => {},
  now = Date.now,
} = {}) {
  let cursor = null;            // opaque pull position handed back by the transport
  const pushed = new Set();     // content_hashes the remote already has (pushed or pulled)

  // Pull remote episodes the local store is missing; append-merge, dedup by content_hash.
  // Returns the episodes actually added (deterministically ordered) and the new cursor.
  function pull() {
    const res = transport.pull(cursor) || {};
    const incoming = Array.isArray(res.episodes) ? res.episodes : [];
    if (res.cursor !== undefined) cursor = res.cursor;

    const have = hashesOf(localEpisodes());
    const seen = new Set();     // guards dups within this same batch
    const added = [];
    for (const ep of incoming) {
      const h = ep.content_hash;
      pushed.add(h);            // remote clearly has it — don't echo it back on push
      if (!h || have.has(h) || seen.has(h)) continue;
      seen.add(h);
      added.push(ep);
    }
    added.sort(byTThenHash);
    for (const ep of added) appendLocal(ep);
    return { added, cursor };
  }

  // Push local episodes the remote lacks (tracked via the pushed-hash set). Sends only-new;
  // re-push of an already-synced set is a no-op. Deterministically ordered.
  function push() {
    const outgoing = localEpisodes()
      .filter((ep) => ep.content_hash && !pushed.has(ep.content_hash))
      .sort(byTThenHash);
    // dedup the outgoing batch itself by content_hash (immutable facts → first wins)
    const seen = new Set();
    const batch = outgoing.filter((ep) => (seen.has(ep.content_hash) ? false : seen.add(ep.content_hash)));
    if (batch.length) transport.push(batch);
    for (const ep of batch) pushed.add(ep.content_hash);
    return { pushed: batch };
  }

  // One round of convergence: pull remote → local, then push local → remote.
  function fullSync() {
    const pulled = pull();
    const pushedNow = push();
    return { added: pulled.added, pushed: pushedNow.pushed, at: now() };
  }

  return { pull, push, fullSync, get cursor() { return cursor; } };
}
