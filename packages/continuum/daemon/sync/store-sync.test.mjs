// store-sync — content-addressed, conflict-free multi-device merge. Two in-memory stores bridged
// by a fake transport; zero real network. Asserts: pull brings missing, dedup by content_hash,
// push sends only-new, fullSync converges, idempotent re-sync is a no-op, ordering stable.
import { createStoreSync } from './store-sync.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

const ep = (content_hash, t) => ({ content_hash, t, text: content_hash });
const hset = (eps) => [...new Set(eps.map((e) => e.content_hash))].sort();
const sameSet = (a, b) => JSON.stringify(hset(a)) === JSON.stringify(hset(b));

// naive append-only store (sync guarantees no dup append; store stays dumb)
function makeStore(seed = []) {
  const eps = [...seed];
  return { eps, load: () => eps.slice(), append: (e) => eps.push(e) };
}

// shared "server" buffer — append-only, dedup by content_hash on push (the remote is honest)
function makeRemote(seed = []) {
  const eps = [], set = new Set();
  const add = (e) => { if (!set.has(e.content_hash)) { set.add(e.content_hash); eps.push(e); } };
  seed.forEach(add);
  return { eps, add };
}
// cursor-based transport: pull returns episodes after the cursor index
const cursorTransport = (remote) => ({
  push: (batch) => batch.forEach(remote.add),
  pull: (since) => ({ episodes: remote.eps.slice(since || 0), cursor: remote.eps.length }),
});
// re-delivering transport: pull always returns ALL remote episodes (exercises content_hash dedup)
const fullTransport = (remote) => ({
  push: (batch) => batch.forEach(remote.add),
  pull: () => ({ episodes: remote.eps.slice(), cursor: remote.eps.length }),
});

console.log('\nstore-sync (content-addressed multi-device merge)\n');

// 1. pull brings missing episodes + 2. dedup by content_hash (no dup on re-sync)
{
  const remote = makeRemote([ep('e1', 10), ep('e2', 20)]);
  const store = makeStore();
  const sync = createStoreSync({ transport: fullTransport(remote), localEpisodes: store.load, appendLocal: store.append });

  const r1 = sync.pull();
  ok('pull brings missing episodes', store.eps.length === 2 && sameSet(store.eps, remote.eps), JSON.stringify(store.eps));
  ok('pull reports what it added', r1.added.length === 2);

  const r2 = sync.pull();   // full transport re-delivers e1,e2 — must NOT duplicate
  ok('dedup by content_hash on re-sync', store.eps.length === 2 && r2.added.length === 0);
}

// 3. push sends only-new (tracked sent-set), re-push is a no-op
{
  const remote = makeRemote();
  const store = makeStore([ep('a1', 10), ep('a2', 20)]);
  const sync = createStoreSync({ transport: cursorTransport(remote), localEpisodes: store.load, appendLocal: store.append });

  const p1 = sync.push();
  ok('push sends local episodes remote lacks', remote.eps.length === 2 && p1.pushed.length === 2);

  store.append(ep('a3', 30));
  const p2 = sync.push();
  ok('push sends only-new', p2.pushed.length === 1 && p2.pushed[0].content_hash === 'a3' && remote.eps.length === 3);

  const p3 = sync.push();
  ok('re-push is a no-op', p3.pushed.length === 0 && remote.eps.length === 3);
}

// 4. fullSync converges both stores + 5. idempotent re-sync is a no-op
{
  const remote = makeRemote();
  const A = makeStore([ep('a1', 10), ep('a2', 30)]);
  const B = makeStore([ep('b1', 20)]);
  const syncA = createStoreSync({ transport: cursorTransport(remote), localEpisodes: A.load, appendLocal: A.append });
  const syncB = createStoreSync({ transport: cursorTransport(remote), localEpisodes: B.load, appendLocal: B.append });

  syncA.fullSync(); syncB.fullSync(); syncA.fullSync();   // gossip rounds
  ok('fullSync converges both stores to same set', sameSet(A.eps, B.eps) && A.eps.length === 3,
    `A=${JSON.stringify(hset(A.eps))} B=${JSON.stringify(hset(B.eps))}`);
  ok('converged set is the union', sameSet(A.eps, [ep('a1'), ep('a2'), ep('b1')]));

  const before = [A.eps.length, B.eps.length];
  const rA = syncA.fullSync(), rB = syncB.fullSync();
  ok('idempotent re-sync is a no-op',
    rA.added.length === 0 && rA.pushed.length === 0 && rB.added.length === 0 && rB.pushed.length === 0 &&
    A.eps.length === before[0] && B.eps.length === before[1]);

  // never duplicated: every content_hash appears exactly once per store
  const noDup = (eps) => eps.length === new Set(eps.map((e) => e.content_hash)).size;
  ok('no episode is ever duplicated', noDup(A.eps) && noDup(B.eps));
}

// 6. deterministic ordering — pulled episodes appended in (t, content_hash) order regardless of arrival
{
  const remote = makeRemote([ep('z', 30), ep('a', 10), ep('m', 20), ep('b', 10)]);   // out of order; tie at t=10
  const store = makeStore();
  const sync = createStoreSync({ transport: fullTransport(remote), localEpisodes: store.load, appendLocal: store.append });
  sync.pull();
  const order = store.eps.map((e) => e.content_hash).join(',');
  ok('ordering stable by t then content_hash', order === 'a,b,m,z', order);
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
