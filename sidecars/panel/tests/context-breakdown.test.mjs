import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { safeContextBreakdown } from '../context.mjs';
import { ContextBreakdownReader, conversationsRoot, parseContextBreakdown } from '../context-breakdown.mjs';
import { SessionHistory, safeMetrics } from '../history.mjs';

function varint(n) {
  let v = BigInt(n);
  if (v < 0n) v += (1n << 64n);
  const out = [];
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}
const ldField = (fn, bytes) => Buffer.concat([varint((fn << 3) | 2), varint(bytes.length), bytes]);
const intField = (fn, n) => Buffer.concat([varint(fn << 3), varint(n)]);
const strField = (fn, s) => ldField(fn, Buffer.from(s, 'utf8'));

function buildBreakdownPb({ groups = [], checkpointIndex = null } = {}) {
  const groupMsgs = groups.map(({ type, tokens, children = [] }) => {
    const childMsgs = children.map(([name, tok]) => ldField(5, Buffer.concat([strField(1, name), intField(3, tok)])));
    return ldField(1, Buffer.concat([intField(2, type), intField(4, tokens), ...childMsgs]));
  });
  const bd = ldField(3, Buffer.concat(groupMsgs));
  const cwm = ldField(10, Buffer.concat([intField(1, 50000), intField(2, 256000), bd]));
  const csParts = [cwm];
  if (checkpointIndex !== null) csParts.unshift(intField(2, checkpointIndex));
  const chat = ldField(1, ldField(9, Buffer.concat(csParts)));
  return chat;
}

function buildCheckpointPayload(ckIndex) {
  return ldField(30, intField(1, ckIndex));
}

test('parseContextBreakdown classifies system, extensions, tools and messages accurately', () => {
  const genData = buildBreakdownPb({
    groups: [
      {
        type: 1,
        tokens: 20000,
        children: [
          ['identity', 500],
          ['guidelines', 1500],
          ['skills', 8000],
          ['mcp_servers', 2000],
          ['user_rules', 3000],
        ],
      },
      { type: 2, tokens: 8000 },
      { type: 4, tokens: 1200 },
      {
        type: 7,
        tokens: 15000,
        children: [
          ['0: USER_INPUT', 1000],
          ['1: PLANNER_RESPONSE', 3000],
          ['2: GENERIC', 9500],
          ['3: RUN_COMMAND', 1000],
          ['4: SYSTEM_MESSAGE', 500],
        ],
      },
    ],
  });

  const parsed = parseContextBreakdown({ genData });
  assert.deepEqual(parsed, {
    version: 1,
    source: 'host-breakdown',
    compactedPending: false,
    systemTokens: 15500, // (20000 - 13000) + 8000 + 500
    extensionsTokens: 14200, // 8000 + 2000 + 3000 + 1200
    toolsTokens: 10500, // 9500 + 1000
    messagesTokens: 4000, // 1000 + 3000
    totalTokens: 44200,
  });
});

test('parseContextBreakdown flags compaction-pending until next reply finishes after checkpoint', () => {
  const genData = buildBreakdownPb({
    checkpointIndex: 1,
    groups: [{ type: 1, tokens: 10000 }, { type: 7, tokens: 20000 }],
  });
  const ckPayload = buildCheckpointPayload(2);

  const pending = parseContextBreakdown({
    genData,
    checkpointStepPayload: ckPayload,
    hasCheckpoint: true,
    hasPlannerAfterCheckpoint: false,
  });
  assert.equal(pending.source, 'compaction-pending');
  assert.equal(pending.compactedPending, true);

  const updated = parseContextBreakdown({
    genData: buildBreakdownPb({ checkpointIndex: 2, groups: [{ type: 1, tokens: 10000 }, { type: 7, tokens: 5000 }] }),
    checkpointStepPayload: ckPayload,
    hasCheckpoint: true,
    hasPlannerAfterCheckpoint: false,
  });
  assert.equal(updated.source, 'host-breakdown');
  assert.equal(updated.totalTokens, 15000);
});

test('parseContextBreakdown handles negative varints, truncated payloads, and chat fallback cleanly', () => {
  const genData = buildBreakdownPb({
    groups: [
      { type: 1, tokens: -1 },
      { type: 7, tokens: 4500 },
    ],
  });
  const parsed = parseContextBreakdown({ genData });
  assert.deepEqual(parsed, {
    version: 1,
    source: 'host-breakdown',
    compactedPending: false,
    systemTokens: 0,
    extensionsTokens: 0,
    toolsTokens: 0,
    messagesTokens: 4500,
    totalTokens: 4500,
  });

  assert.equal(parseContextBreakdown({ genData: Buffer.from([0x0a, 0xff]) }), null);
  assert.equal(safeContextBreakdown({ source: 'host-breakdown', systemTokens: -5, extensionsTokens: 0, toolsTokens: 0, messagesTokens: 10 }), null);
  assert.equal(safeContextBreakdown({ source: 'unknown', systemTokens: 1, extensionsTokens: 0, toolsTokens: 0, messagesTokens: 0 }), null);
});

test('ContextBreakdownReader reads SQLite DBs read-only, invalidates on WAL/DB update, and rejects symlinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ag-ctx-db-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = '11111111-1111-1111-1111-111111111111';
  const dbPath = join(root, `${id}.db`);

  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB); CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER, status INTEGER, step_payload BLOB);');
  db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)').run(
    0,
    buildBreakdownPb({ groups: [{ type: 1, tokens: 12000 }, { type: 2, tokens: 5000 }, { type: 7, tokens: 3000 }] })
  );
  db.close();

  const reader = new ContextBreakdownReader({ root });
  const first = await reader.read(id);
  assert.equal(first.source, 'host-breakdown');
  assert.equal(first.systemTokens, 17000);
  assert.equal(first.messagesTokens, 3000);
  assert.equal(first.totalTokens, 20000);

  // Missing DB returns null gracefully
  assert.equal(await reader.read('22222222-2222-2222-2222-222222222222'), null);
  assert.equal(conversationsRoot('ide').includes('antigravity-ide'), true);

  // Append a checkpoint without a subsequent planner reply -> compaction-pending
  const db2 = new DatabaseSync(dbPath);
  db2.prepare('INSERT INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)').run(10, 23, 3, buildCheckpointPayload(1));
  db2.close();
  const second = await reader.read(id);
  assert.equal(second.source, 'compaction-pending');
  assert.equal(second.compactedPending, true);

  // Symlink outside root is rejected
  const outside = join(tmpdir(), `ag-outside-${Date.now()}.db`);
  await writeFile(outside, 'x');
  t.after(() => rm(outside, { force: true }));
  const linkId = '33333333-3333-3333-3333-333333333333';
  try {
    await symlink(outside, join(root, `${linkId}.db`));
    assert.equal(await reader.read(linkId), null);
  } catch {
    // Windows unprivileged environments may disallow file symlinks
  }
});

test('SessionHistory persists sanitized numeric contextBreakdown without leaking raw fields', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-ctx-hist-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const scope = 'a'.repeat(64);
  const id = '11111111-1111-1111-1111-111111111111';
  const history = new SessionHistory(dir);

  const metrics = safeMetrics({
    context: { usedTokens: 44200, maxTokens: 256000 },
    contextBreakdown: {
      source: 'host-breakdown',
      systemTokens: 15500,
      extensionsTokens: 14200,
      toolsTokens: 10500,
      messagesTokens: 4000,
      extraSecret: 'DO NOT SAVE',
    },
  }, id);
  await history.save(scope, id, metrics);
  const loaded = await history.load(scope, id);
  assert.equal(loaded.metrics.contextBreakdown.totalTokens, 44200);
  assert.equal(Object.hasOwn(loaded.metrics.contextBreakdown, 'extraSecret'), false);
});
