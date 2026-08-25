// Run from app/: node --import tsx --test lib/pilot-operations/public-url.test.ts
//
// The pilot proof URL is operator-supplied and later fetched/surfaced as public
// evidence, so this guard is the SSRF trust boundary on the app/ Prisma path.
// A regression here would accept an internal/metadata host as public proof.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicHttpUrl } from './public-url';

describe('isPublicHttpUrl — proof-link SSRF guard (app/ Prisma path)', () => {
  it('accepts a real public HTTP(S) URL', () => {
    assert.equal(isPublicHttpUrl('https://acme.dev/proof'), true);
    assert.equal(isPublicHttpUrl('http://blog.example.com/p'), true);
  });

  it('rejects non-HTTP protocols and embedded credentials', () => {
    assert.equal(isPublicHttpUrl('ftp://acme.dev/proof'), false);
    assert.equal(isPublicHttpUrl('file:///etc/passwd'), false);
    assert.equal(isPublicHttpUrl('https://user:pass@acme.dev/proof'), false);
    assert.equal(isPublicHttpUrl('not a url'), false);
  });

  it('rejects loopback, link-local and internal names', () => {
    assert.equal(isPublicHttpUrl('http://localhost/x'), false);
    assert.equal(isPublicHttpUrl('http://build.internal/x'), false);
    assert.equal(isPublicHttpUrl('http://box.local/x'), false);
    assert.equal(isPublicHttpUrl('http://demo.test/x'), false);
  });

  it('rejects private and reserved IPv4 ranges', () => {
    assert.equal(isPublicHttpUrl('http://127.0.0.1/x'), false);
    assert.equal(isPublicHttpUrl('http://10.0.0.5/x'), false);
    assert.equal(isPublicHttpUrl('http://192.168.1.10/x'), false);
    assert.equal(isPublicHttpUrl('http://172.16.4.4/x'), false);
    assert.equal(isPublicHttpUrl('http://169.254.169.254/latest/meta-data'), false);
    assert.equal(isPublicHttpUrl('http://8.8.8.8/x'), true);
  });

  it('rejects IANA special-purpose IPv4 ranges (parity with the site/ guard)', () => {
    // These are non-globally-routable ranges the site/ pilot-proof guard already
    // blocks; the app/ guard must make the identical trust decision so the same
    // host can't be accepted as public proof on one funnel surface but not the other.
    assert.equal(isPublicHttpUrl('http://192.0.0.1/x'), false); // IETF protocol assignments
    assert.equal(isPublicHttpUrl('http://198.18.0.1/x'), false); // benchmarking 198.18.0.0/15
    assert.equal(isPublicHttpUrl('http://198.19.5.5/x'), false); // benchmarking 198.18.0.0/15
    assert.equal(isPublicHttpUrl('http://198.51.100.10/x'), false); // TEST-NET-2
    assert.equal(isPublicHttpUrl('http://203.0.113.5/x'), false); // TEST-NET-3
    // A neighbouring genuinely public host stays reachable (no over-block).
    assert.equal(isPublicHttpUrl('http://198.20.0.1/x'), true);
  });

  it('rejects reserved IPv6 including IPv4-mapped addresses', () => {
    assert.equal(isPublicHttpUrl('http://[::1]/x'), false);
    assert.equal(isPublicHttpUrl('http://[fe80::1]/x'), false);
    assert.equal(isPublicHttpUrl('http://[fd00::1]/x'), false);
    // URL canonicalises ::ffff:127.0.0.1 to hex (::ffff:7f00:1) — the guard must
    // still decode the embedded IPv4 rather than treat it as a public host.
    assert.equal(isPublicHttpUrl('http://[::ffff:127.0.0.1]/x'), false);
    assert.equal(isPublicHttpUrl('http://[::ffff:10.0.0.1]/x'), false);
    // Mapped cloud metadata address — the regression this rung closes.
    assert.equal(isPublicHttpUrl('http://[::ffff:169.254.169.254]/x'), false);
    assert.equal(isPublicHttpUrl('http://[::ffff:8.8.8.8]/x'), true);
    // IPv4-compatible IPv6 (::a.b.c.d) canonicalises to bare hex (::HHHH:HHHH)
    // with no ffff: prefix — the guard must decode it too or an internal host
    // tunnels past the denylist. ::a9fe:a9fe = ::169.254.169.254 (metadata),
    // ::7f00:1 = ::127.0.0.1 (loopback), ::a00:1 = ::10.0.0.1 (private).
    assert.equal(isPublicHttpUrl('http://[::a9fe:a9fe]/x'), false);
    assert.equal(isPublicHttpUrl('http://[::7f00:1]/x'), false);
    assert.equal(isPublicHttpUrl('http://[::a00:1]/x'), false);
    // The mapped-IPv4 decode must feed the FULL reserved denylist: a mapped
    // IANA special-purpose address must be rejected, not just the classic ranges.
    assert.equal(isPublicHttpUrl('http://[::ffff:198.18.0.1]/x'), false);
    assert.equal(isPublicHttpUrl('http://[::ffff:203.0.113.5]/x'), false);
  });
});
