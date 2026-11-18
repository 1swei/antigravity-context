// Read-only context window breakdown reader for Antigravity conversation DBs.
// Extracts numeric category totals only; never retains prompt or message text.
import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { safeContextBreakdown } from './context.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_SYSTEM_PROMPT = 1;
const TOKEN_TOOLS = 2;
const TOKEN_RULES = 3;
const TOKEN_MCP_TOOLS = 4;
const TOKEN_SKILLS = 5;
const TOKEN_SUBAGENTS = 6;
const TOKEN_CHAT_MESSAGES = 7;
const TOKEN_WORKFLOWS = 8;
const TOKEN_PLUGINS = 9;
const TOKEN_FLOWS = 10;

const STEP_TYPE_PLANNER = 15;
const STEP_TYPE_CHECKPOINT = 23;
const STEP_STATUS_DONE = 3;
const STEP_FIELD_CHECKPOINT = 30;

const EXTENSION_PROMPT_CHILDREN = new Set([
  'mcp_servers', 'skills', 'subagents', 'featured_plugins',
  'user_rules', 'user_information', 'slash_commands', 'flows', 'workflows',
]);
const SYSTEM_CHAT_STEP_TYPES = new Set([
  'UNSPECIFIED', 'DUMMY', 'FINISH', 'SYSTEM_MESSAGE', 'CHECKPOINT',
]);
const MESSAGE_CHAT_STEP_TYPES = new Set([
  'USER_INPUT', 'PLANNER_RESPONSE',
]);

let sqliteModulePromise = null;
async function loadDatabaseSync() {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite').then(m => m.DatabaseSync).catch(() => null);
  }
  return sqliteModulePromise;
}

export function conversationsRoot(host = 'app') {
  if (!['app', 'ide'].includes(host)) throw Error('Unsupported conversation host');
  return join(homedir(), '.gemini', host === 'ide' ? 'antigravity-ide' : 'antigravity', 'conversations');
}

function readVarint(buf, start) {
  let val = 0n, shift = 0n, pos = start;
  while (pos < buf.length) {
    const b = BigInt(buf[pos++]);
    val |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) return [val, pos];
    shift += 7n;
    if (shift > 63n) return null;
  }
  return null;
}

function toSafeSignedInt(big) {
  if (typeof big !== 'bigint') return 0;
  let signed = big;
  if (signed >= (1n << 63n)) signed -= (1n << 64n);
  if (signed < 0n || signed > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
  return Number(signed);
}

export function parsePbMessage(buf, depth = 0) {
  const fields = new Map();
  if (!buf || !buf.length || depth > 16) return fields;
  const bytes = buf instanceof Uint8Array ? buf : Uint8Array.from(buf);
  let pos = 0;
  while (pos < bytes.length) {
    const tagRes = readVarint(bytes, pos);
    if (!tagRes) break;
    const tag = Number(tagRes[0]);
    pos = tagRes[1];
    const fn = tag >>> 3, wt = tag & 7;
    if (fn <= 0) break;
    let val;
    if (wt === 0) {
      const vRes = readVarint(bytes, pos);
      if (!vRes) break;
      val = vRes[0];
      pos = vRes[1];
    } else if (wt === 2) {
      const lenRes = readVarint(bytes, pos);
      if (!lenRes) break;
      const lenBig = lenRes[0];
      pos = lenRes[1];
      if (lenBig < 0n || lenBig > BigInt(bytes.length - pos)) break;
      const len = Number(lenBig);
      val = bytes.subarray(pos, pos + len);
      pos += len;
    } else if (wt === 1) {
      if (pos + 8 > bytes.length) break;
      val = bytes.subarray(pos, pos + 8);
      pos += 8;
    } else if (wt === 5) {
      if (pos + 4 > bytes.length) break;
      val = bytes.subarray(pos, pos + 4);
      pos += 4;
    } else {
      break;
    }
    if (!fields.has(fn)) fields.set(fn, []);
    fields.get(fn).push(val);
  }
  return fields;
}

function getMsg(fields, fn, depth = 0) {
  const list = fields.get(fn);
  if (!list?.length) return null;
  const last = list[list.length - 1];
  return last instanceof Uint8Array ? parsePbMessage(last, depth + 1) : null;
}

function getMsgs(fields, fn, depth = 0) {
  const list = fields.get(fn);
  if (!list?.length) return [];
  const out = [];
  for (const item of list) {
    if (item instanceof Uint8Array) out.push(parsePbMessage(item, depth + 1));
  }
  return out;
}

function getInt(fields, fn) {
  const list = fields.get(fn);
  if (!list?.length) return 0;
  return toSafeSignedInt(list[list.length - 1]);
}

function getAsciiStr(fields, fn, maxLen = 128) {
  const list = fields.get(fn);
  if (!list?.length) return '';
  const last = list[list.length - 1];
  if (!(last instanceof Uint8Array)) return '';
  const slice = last.length > maxLen ? last.subarray(0, maxLen) : last;
  return Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('utf8');
}

function parseChatItems(items) {
  if (!items.length) return null;
  let messagesTokens = 0, toolsTokens = 0, systemTokens = 0;
  for (const item of items) {
    const label = getAsciiStr(item, 1, 96);
    const sep = label.indexOf(': ');
    if (sep <= 0) return null;
    const stepIdxStr = label.slice(0, sep);
    const stepType = label.slice(sep + 2);
    if (!/^[+-]?\d+$/.test(stepIdxStr) || !stepType) return null;
    const tok = getInt(item, 3);
    if (MESSAGE_CHAT_STEP_TYPES.has(stepType)) messagesTokens += tok;
    else if (SYSTEM_CHAT_STEP_TYPES.has(stepType)) systemTokens += tok;
    else toolsTokens += tok;
  }
  return { messagesTokens, toolsTokens, systemTokens };
}

export function parseContextBreakdown({ genData, checkpointStepPayload = null, hasCheckpoint = Boolean(checkpointStepPayload), hasPlannerAfterCheckpoint = true } = {}) {
  if (!genData) return null;
  const gen = parsePbMessage(genData);
  const chat = getMsg(gen, 1);
  if (!chat) return null;
  const chatStart = getMsg(chat, 9);
  if (!chatStart) return null;

  if (hasCheckpoint && !hasPlannerAfterCheckpoint) {
    const ckStep = checkpointStepPayload ? parsePbMessage(checkpointStepPayload) : null;
    const ckPayload = ckStep ? getMsg(ckStep, STEP_FIELD_CHECKPOINT) : null;
    const ckIndex = ckPayload ? getInt(ckPayload, 1) : 0;
    const csCheckpointIdx = getInt(chatStart, 2);
    if (!chatStart.has(2) || ckIndex <= 0 || csCheckpointIdx < ckIndex) {
      return safeContextBreakdown({ source: 'compaction-pending' });
    }
  }

  const cwm = getMsg(chatStart, 10);
  if (!cwm) return null;
  const bd = getMsg(cwm, 3);
  if (!bd) return null;
  const groups = getMsgs(bd, 1);
  if (!groups.length) return null;

  let systemTokens = 0, extensionsTokens = 0, toolsTokens = 0, messagesTokens = 0;
  for (const g of groups) {
    const gtype = getInt(g, 2);
    const gtok = getInt(g, 4);
    if (gtype === TOKEN_SYSTEM_PROMPT) {
      let extracted = 0;
      for (const child of getMsgs(g, 5)) {
        const name = getAsciiStr(child, 1, 64);
        const ctok = getInt(child, 3);
        if (EXTENSION_PROMPT_CHILDREN.has(name)) {
          extensionsTokens += ctok;
          extracted += ctok;
        }
      }
      systemTokens += Math.max(0, gtok - extracted);
    } else if (gtype === TOKEN_TOOLS) {
      systemTokens += gtok;
    } else if ([TOKEN_RULES, TOKEN_MCP_TOOLS, TOKEN_SKILLS, TOKEN_SUBAGENTS, TOKEN_WORKFLOWS, TOKEN_PLUGINS, TOKEN_FLOWS].includes(gtype)) {
      extensionsTokens += gtok;
    } else if (gtype === TOKEN_CHAT_MESSAGES) {
      const parsed = parseChatItems(getMsgs(g, 5));
      if (parsed) {
        messagesTokens += parsed.messagesTokens;
        toolsTokens += parsed.toolsTokens;
        systemTokens += parsed.systemTokens;
      } else {
        messagesTokens += gtok;
      }
    }
  }

  return safeContextBreakdown({
    source: 'host-breakdown',
    systemTokens,
    extensionsTokens,
    toolsTokens,
    messagesTokens,
  });
}

const contains = (root, file) => {
  const r = relative(root, file);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
};

async function stampFile(file) {
  try {
    const s = await lstat(file, { bigint: true });
    if (s.isSymbolicLink() || !s.isFile()) return null;
    return [s.size, s.mtimeNs, s.ctimeNs, s.ino].map(String).join(':');
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
    throw e;
  }
}

export class ContextBreakdownReader {
  constructor({ root = conversationsRoot(), maxEntries = 16, loadSqlite = loadDatabaseSync } = {}) {
    this.root = root;
    this.maxEntries = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? Math.min(32, maxEntries) : 16;
    this.loadSqlite = loadSqlite;
    this.cache = new Map();
  }

  reset() {
    this.cache.clear();
  }

  async locate(id) {
    if (!GUID.test(id || '')) return null;
    const name = id.toLowerCase() + '.db';
    let rootReal;
    try { rootReal = await realpath(this.root); } catch { return null; }
    const candidate = join(this.root, name);
    try {
      const dbStamp = await stampFile(candidate);
      if (!dbStamp) return null;
      const file = await realpath(candidate);
      const expected = join(rootReal, name);
      const normalize = p => process.platform === 'win32' ? p.toLowerCase() : p;
      if (!contains(rootReal, file) || normalize(file) !== normalize(expected)) return null;
      const walStamp = (await stampFile(candidate + '-wal')) || 'none';
      return { file, stamp: dbStamp + '|' + walStamp };
    } catch {
      return null;
    }
  }

  async read(id) {
    const located = await this.locate(id);
    if (!located) return null;
    const key = id.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.stamp === located.stamp) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value;
    }

    const DatabaseSync = await this.loadSqlite();
    if (!DatabaseSync) return null;

    let db = null;
    let value = null;
    try {
      db = new DatabaseSync(located.file, { readOnly: true });
      const genRows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx DESC LIMIT 4').all();
      const ckRow = db.prepare(
        `SELECT idx, step_payload FROM steps WHERE step_type = ${STEP_TYPE_CHECKPOINT} AND status = ${STEP_STATUS_DONE} ORDER BY idx DESC LIMIT 1`
      ).get();
      let hasPlannerAfterCheckpoint = true;
      if (ckRow) {
        const after = db.prepare(
          `SELECT 1 FROM steps WHERE idx > ? AND step_type = ${STEP_TYPE_PLANNER} AND status = ${STEP_STATUS_DONE} LIMIT 1`
        ).get(ckRow.idx);
        hasPlannerAfterCheckpoint = Boolean(after);
      }
      for (const row of genRows) {
        const parsed = parseContextBreakdown({
          genData: row.data,
          checkpointStepPayload: ckRow?.step_payload || null,
          hasCheckpoint: Boolean(ckRow),
          hasPlannerAfterCheckpoint,
        });
        if (parsed) {
          value = parsed;
          break;
        }
      }
    } catch {
      value = null;
    } finally {
      try { db?.close(); } catch {}
    }

    this.cache.delete(key);
    this.cache.set(key, { stamp: located.stamp, value });
    while (this.cache.size > this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
    return value;
  }
}
