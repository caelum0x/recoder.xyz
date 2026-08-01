import { describe, it, expect } from 'vitest';
import { analyzeQuery, validateParamValues, sanitizeErrorMessage } from '../query/query-guards.js';

describe('analyzeQuery — classification', () => {
  it('classifies a SELECT as read-only, not modifying, not DDL', () => {
    const a = analyzeQuery('  SELECT * FROM core.kv_store WHERE key = $1');
    expect(a.isSelect).toBe(true);
    expect(a.isModifying).toBe(false);
    expect(a.isDDL).toBe(false);
    expect(a.suspicious).toBe(false);
    expect(a.warnings).toEqual([]);
  });

  it('classifies INSERT/UPDATE/DELETE/MERGE as modifying', () => {
    for (const verb of ['insert into t values (1)', 'UPDATE t SET a=1', 'delete from t', 'MERGE INTO t']) {
      const a = analyzeQuery(verb);
      expect(a.isModifying).toBe(true);
      expect(a.isSelect).toBe(false);
    }
  });

  it('classifies CREATE/ALTER/DROP/TRUNCATE/RENAME as DDL', () => {
    for (const verb of ['create table t (id int)', 'ALTER TABLE t ADD c int', 'drop table t', 'truncate t', 'rename table a to b']) {
      const a = analyzeQuery(verb);
      expect(a.isDDL).toBe(true);
    }
  });
});

describe('analyzeQuery — suspicious pattern detection (advisory)', () => {
  const attacks: Array<[string, string]> = [
    ['UNION SELECT', 'select id from users UNION SELECT password from admins'],
    ['statement terminator + comment', "select 1; --"],
    ['stacked DROP', "select 1; DROP TABLE users"],
    ['stacked DELETE', "select 1; DELETE FROM users"],
    ['stacked TRUNCATE', "select 1; TRUNCATE users"],
    ['pg_sleep time-based', 'select pg_sleep(10)'],
    ['sleep time-based', 'select SLEEP(5)'],
    ['benchmark time-based', 'select BENCHMARK(1000000, md5(1))'],
    ['into outfile exfil', "select * into outfile '/tmp/x'"],
    ['load_file read', 'select LOAD_FILE(0x2f)'],
    ['block comment', 'select 1 /* hidden */ from t'],
    ['exec', 'EXEC(0x41)'],
  ];

  it.each(attacks)('flags %s as suspicious with a warning', (_label, sql) => {
    const a = analyzeQuery(sql);
    expect(a.suspicious).toBe(true);
    expect(a.warnings.length).toBeGreaterThan(0);
    expect(a.warnings[0]).toContain('suspicious pattern');
  });

  it('does not flag a benign parameterized query', () => {
    const a = analyzeQuery('select id, key, value from core.kv_store where namespace = $1 and key = $2');
    expect(a.suspicious).toBe(false);
  });
});

describe('validateParamValues — accepts supported driver types', () => {
  it('accepts null, undefined, string, number, boolean, bigint, Date, Buffer', () => {
    const r = validateParamValues([null, undefined, 'a', 1, true, 10n, new Date(), Buffer.from('x')]);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('accepts arrays and plain JSON objects (already expanded / jsonb)', () => {
    expect(validateParamValues([[1, 2, 3]]).valid).toBe(true);
    expect(validateParamValues([{ a: 1, nested: { b: 2 } }]).valid).toBe(true);
  });
});

describe('validateParamValues — rejects unsupported types (fail-closed)', () => {
  it('rejects a function param with its index', () => {
    const r = validateParamValues([1, () => undefined]);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('parameter 1');
    expect(r.error).toContain('function');
  });

  it('rejects a symbol param', () => {
    const r = validateParamValues([Symbol('x')]);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('symbol');
  });

  it('rejects a non-plain class instance (not Object-constructed)', () => {
    class Widget {
      n = 1;
    }
    const r = validateParamValues([new Widget()]);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('unsupported object type');
  });

  it('rejects more than the 1000-param cap before touching values', () => {
    const tooMany = new Array(1001).fill(1);
    const r = validateParamValues(tooMany);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('too many parameters');
  });

  it('accepts exactly the 1000-param cap', () => {
    const atCap = new Array(1000).fill(1);
    expect(validateParamValues(atCap).valid).toBe(true);
  });
});

describe('sanitizeErrorMessage — never leaks internals to callers', () => {
  it('redacts a postgres connection string', () => {
    const out = sanitizeErrorMessage('connect failed postgres://user:pw@db:5432/recoder timeout');
    expect(out).toContain('[connection_string]');
    expect(out).not.toContain('postgres://');
    expect(out).not.toContain('5432');
  });

  it('redacts a mysql connection string', () => {
    const out = sanitizeErrorMessage('mysql://root:secret@host/db is unreachable');
    expect(out).toContain('[connection_string]');
    expect(out).not.toContain('mysql://');
  });

  it('redacts IPv4 addresses', () => {
    const out = sanitizeErrorMessage('no route to 10.0.12.34 on port');
    expect(out).toContain('[ip_address]');
    expect(out).not.toContain('10.0.12.34');
  });

  it('redacts inline password assignments', () => {
    const out = sanitizeErrorMessage('auth failed password=hunter2 for user');
    expect(out).toContain('password=[hidden]');
    expect(out).not.toContain('hunter2');
  });

  it('redacts filesystem paths', () => {
    const out = sanitizeErrorMessage('cannot read /etc/postgres/pg_hba.conf entry');
    expect(out).toContain('[path]');
    expect(out).not.toContain('pg_hba.conf');
  });

  it('leaves a clean message unchanged', () => {
    const clean = 'duplicate key value violates unique constraint';
    expect(sanitizeErrorMessage(clean)).toBe(clean);
  });
});
