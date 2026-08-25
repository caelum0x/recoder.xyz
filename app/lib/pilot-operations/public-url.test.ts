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
  });
});
