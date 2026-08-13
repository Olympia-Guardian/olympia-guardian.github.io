var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
var LODESTONE = "https://eu.finalfantasyxiv.com/lodestone";
var MOBILE_UA = "Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.76 Mobile Safari/537.36";
var CATALOG_BASE = "https://olympia-guardian.github.io/data/";
var CHAR_TTL = 36e5;
var ALL_KINDS = [
  "mounts",
  "minions",
  "cards",
  "fashions",
  "facewear",
  "hairstyles",
  "outfits",
  "armoires",
  "bardings",
  "emotes",
  "frames",
  "orchestrions",
  "spells"
];
var HIDDEN_KINDS = ALL_KINDS.filter((k) => k !== "mounts" && k !== "minions");
var MAX_DOC_BYTES = 16384;
var MAX_MEMBERS = 100;
var catalogCache = null;
var catalogAt = 0;
function norm(s) {
  return s.normalize("NFKD").replace(/’/g, "'").trim().toLowerCase();
}
__name(norm, "norm");
async function catalogs() {
  if (catalogCache && Date.now() - catalogAt < 6 * 36e5) return catalogCache;
  const maps = {};
  const totals = {};
  for (const kind of ALL_KINDS) {
    const res = await fetch(`${CATALOG_BASE}${kind}.json`);
    if (!res.ok) {
      totals[kind] = 0;
      continue;
    }
    const items = await res.json();
    totals[kind] = items.length;
    if (kind === "mounts" || kind === "minions") {
      maps[kind] = new Map(items.map((it) => [norm(it.nameEn), it.id]));
    }
  }
  if (!maps.mounts || !maps.minions) throw new Error("catalogues montures/mascottes indisponibles");
  const relics = await fetch(`${CATALOG_BASE}relics.json`);
  totals.relics = relics.ok ? (await relics.json()).relics.length : 0;
  catalogCache = { maps, totals };
  catalogAt = Date.now();
  return catalogCache;
}
__name(catalogs, "catalogs");
async function lodestoneGet(path) {
  const res = await fetch(`${LODESTONE}${path}`, {
    headers: { "User-Agent": MOBILE_UA, "Accept-Language": "en" }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lodestone ${res.status}`);
  return res.text();
}
__name(lodestoneGet, "lodestoneGet");
function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}
__name(extract, "extract");
function extractAll(html, regex) {
  return [...html.matchAll(regex)].map((m) => m[1].trim());
}
__name(extractAll, "extractAll");
function decodeEntities(s) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
__name(decodeEntities, "decodeEntities");
async function scrapeCharacter(id) {
  const profile = await lodestoneGet(`/character/${id}/`);
  if (profile === null) return null;
  const name = decodeEntities(extract(profile, /class="frame__chara__name">([^<]+)</) ?? "");
  const world = extract(profile, /class="frame__chara__world">(?:<[^>]+><\/[^>]+>)?([^<]+)</) ?? "";
  const server = world.trim().match(/^\w+/)?.[0] ?? "";
  const dc = world.match(/\[(\w+)\]/)?.[1] ?? "";
  const avatar = extract(profile, /class="frame__chara__face"[^>]*>\s*<img src="([^"]+)"/) ?? "";
  const portrait = extract(profile, /class="character__detail__image"[^>]*>\s*<a[^>]*>\s*<img src="([^"]+)"/) ?? extract(profile, /class="js__image_popup[^"]*"[^>]*>\s*<img src="([^"]+)"/) ?? "";
  const [mountHtml, minionHtml] = await Promise.all([
    lodestoneGet(`/character/${id}/mount/`),
    lodestoneGet(`/character/${id}/minion/`)
  ]);
  const { maps } = await catalogs();
  const mapNames = /* @__PURE__ */ __name((html, cls, map) => {
    if (!html) return { ids: [], isPublic: true };
    const names = extractAll(html, new RegExp(`class="${cls}__name">([^<]+)<`, "g"));
    if (names.length === 0) return { ids: [], isPublic: false };
    const ids = [];
    for (const raw of names) {
      const found = map.get(norm(decodeEntities(raw)));
      if (found !== void 0) ids.push(found);
    }
    return { ids, isPublic: true };
  }, "mapNames");
  const mounts = mapNames(mountHtml, "mount", maps.mounts);
  const minions = mapNames(minionHtml, "minion", maps.minions);
  return { id, name, server, dc, avatar, portrait, mounts, minions };
}
__name(scrapeCharacter, "scrapeCharacter");
async function seedPlaceholders(env, id) {
  const now = Date.now();
  const stmt = env.DB.prepare(
    "INSERT OR IGNORE INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, '[]', ?3, 'empty')"
  );
  await env.DB.batch([...HIDDEN_KINDS, "relics"].map((k) => stmt.bind(id, k, now)));
}
__name(seedPlaceholders, "seedPlaceholders");
function validIds(v, max) {
  return Array.isArray(v) && v.length <= max && v.every((n) => Number.isInteger(n) && n > 0 && n < 1e9);
}
__name(validIds, "validIds");
async function applySeed(env, id, raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!doc || typeof doc !== "object") return false;
  const rows = [];
  const now = Date.now();
  for (const kind of [...HIDDEN_KINDS, "relics"]) {
    const ids = doc[kind];
    if (ids === void 0) continue;
    if (!validIds(ids, 6e3)) return false;
    rows.push([id, kind, JSON.stringify([...new Set(ids)]), now]);
  }
  if (rows.length === 0) return false;
  const stmt = env.DB.prepare(
    "INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5 WHERE collections.source = 'empty'"
  );
  await env.DB.batch(rows.map((r) => stmt.bind(...r, "seed")));
  return true;
}
__name(applySeed, "applySeed");
async function getCharacter(env, id, force) {
  const row = await env.DB.prepare("SELECT * FROM characters WHERE id = ?1").bind(id).first();
  const fresh = row && Date.now() - row.updated < CHAR_TTL;
  if (!fresh || force) {
    const scraped = await scrapeCharacter(id);
    if (!scraped && !row) return null;
    if (scraped) {
      await env.DB.prepare(
        "INSERT INTO characters (id, name, server, dc, avatar, portrait, public_mounts, public_minions, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO UPDATE SET name=?2, server=?3, dc=?4, avatar=?5, portrait=?6, public_mounts=?7, public_minions=?8, updated=?9"
      ).bind(
        id,
        scraped.name,
        scraped.server,
        scraped.dc,
        scraped.avatar,
        scraped.portrait,
        scraped.mounts.isPublic ? 1 : 0,
        scraped.minions.isPublic ? 1 : 0,
        Date.now()
      ).run();
      const now = Date.now();
      const up = env.DB.prepare(
        "INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5"
      );
      await env.DB.batch([
        up.bind(id, "mounts", JSON.stringify(scraped.mounts.ids), now, "lodestone"),
        up.bind(id, "minions", JSON.stringify(scraped.minions.ids), now, "lodestone")
      ]);
      await seedPlaceholders(env, id);
    }
  }
  const char = await env.DB.prepare("SELECT * FROM characters WHERE id = ?1").bind(id).first();
  if (!char) return null;
  const colRows = await env.DB.prepare(
    "SELECT kind, ids, source FROM collections WHERE char_id = ?1"
  ).bind(id).all();
  const byKind = Object.fromEntries(colRows.results.map((r) => [r.kind, JSON.parse(r.ids)]));
  const needsSeed = colRows.results.some((r) => r.source === "empty");
  const { totals } = await catalogs();
  const block = /* @__PURE__ */ __name((kind, isPublic = true) => ({
    count: (byKind[kind] ?? []).length,
    total: totals[kind] ?? 0,
    public: isPublic,
    ids: byKind[kind] ?? []
  }), "block");
  return {
    id: char.id,
    name: char.name,
    server: char.server,
    data_center: char.dc,
    avatar: char.avatar,
    portrait: char.portrait,
    last_parsed: new Date(char.updated).toISOString(),
    mounts: block("mounts", !!char.public_mounts),
    minions: block("minions", !!char.public_minions),
    ...Object.fromEntries(HIDDEN_KINDS.map((k) => [k, block(k)])),
    relicIds: byKind.relics ?? [],
    needsSeed
  };
}
__name(getCharacter, "getCharacter");
var DISCORD_AUTH = "https://discord.com/oauth2/authorize";
var DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
var DISCORD_ME = "https://discord.com/api/users/@me";
var TOKEN_TTL = 90 * 24 * 36e5;
function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function hmac(env, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.DISCORD_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
__name(hmac, "hmac");
async function signState(env, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(env, body)}`;
}
__name(signState, "signState");
async function verifyState(env, state) {
  const [body, sig] = String(state).split(".");
  if (!body || !sig || await hmac(env, body) !== sig) return null;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.x < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyState, "verifyState");
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return b64url(bytes);
}
__name(randomToken, "randomToken");
var CALLBACK = "https://ogs-room.olympia-guardian.workers.dev/auth/discord/callback";
async function authDiscordStart(env, url) {
  const ret = url.searchParams.get("return") ?? env.APP_URL;
  if (!ret.startsWith(env.APP_URL) && !ret.startsWith("http://localhost")) {
    return response('{"error":"invalid return"}', 400);
  }
  const state = await signState(env, { r: ret, x: Date.now() + 6e5 });
  const auth = new URL(DISCORD_AUTH);
  auth.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", CALLBACK);
  auth.searchParams.set("scope", "identify");
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 302);
}
__name(authDiscordStart, "authDiscordStart");
async function authDiscordCallback(env, url) {
  const payload = await verifyState(env, url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!payload || !code) return response('{"error":"invalid state"}', 400);
  const tokenRes = await fetch(DISCORD_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK
    })
  });
  if (!tokenRes.ok) return response('{"error":"token exchange failed"}', 502);
  const { access_token } = await tokenRes.json();
  const meRes = await fetch(DISCORD_ME, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return response('{"error":"profile fetch failed"}', 502);
  const me = await meRes.json();
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : "";
  const displayName = me.global_name || me.username || "Aventurier";
  const userId = `discord:${me.id}`;
  await env.DB.prepare(
    "INSERT INTO users (id, provider, provider_id, name, avatar, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = ?4, avatar = ?5"
  ).bind(userId, "discord", me.id, displayName, avatar, Date.now()).run();
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO tokens (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)"
  ).bind(token, userId, Date.now(), Date.now() + TOKEN_TTL).run();
  const dest = new URL(payload.r);
  dest.hash = `login=${token}`;
  return Response.redirect(dest.toString(), 302);
}
__name(authDiscordCallback, "authDiscordCallback");
async function authenticate(env, req) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.name, u.avatar FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?1 AND t.expires > ?2"
  ).bind(token, Date.now()).first();
  return row ?? null;
}
__name(authenticate, "authenticate");
async function getMe(env, user) {
  const rows = await env.DB.prepare(
    "SELECT char_id, verified, code FROM bindings WHERE user_id = ?1"
  ).bind(user.id).all();
  return {
    user: { id: user.id, name: user.name, avatar: user.avatar },
    bindings: rows.results.map((r) => ({
      charId: r.char_id,
      verified: !!r.verified,
      code: r.verified ? void 0 : r.code
    }))
  };
}
__name(getMe, "getMe");
async function bindCharacter(env, user, raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  const charId = doc?.charId;
  if (!Number.isInteger(charId) || charId <= 0 || charId >= 1e12) {
    return response('{"error":"invalid charId"}', 422);
  }
  const owner = await env.DB.prepare(
    "SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1"
  ).bind(charId).first();
  if (owner && owner.user_id !== user.id) {
    return response('{"error":"character already claimed"}', 409);
  }
  const code = "OGS-" + b64url(crypto.getRandomValues(new Uint8Array(6))).slice(0, 8);
  await env.DB.prepare(
    "INSERT INTO bindings (user_id, char_id, verified, code, created) VALUES (?1, ?2, 0, ?3, ?4) ON CONFLICT(user_id, char_id) DO UPDATE SET code = CASE WHEN bindings.verified = 1 THEN bindings.code ELSE ?3 END"
  ).bind(user.id, charId, code, Date.now()).run();
  const row = await env.DB.prepare(
    "SELECT verified, code FROM bindings WHERE user_id = ?1 AND char_id = ?2"
  ).bind(user.id, charId).first();
  return response(JSON.stringify({ charId, verified: !!row.verified, code: row.code }));
}
__name(bindCharacter, "bindCharacter");
async function verifyBinding(env, user, raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  const charId = doc?.charId;
  const row = await env.DB.prepare(
    "SELECT code, verified FROM bindings WHERE user_id = ?1 AND char_id = ?2"
  ).bind(user.id, charId).first();
  if (!row) return response('{"error":"no binding"}', 404);
  if (row.verified) return response('{"charId":' + charId + ',"verified":true}');
  const profile = await lodestoneGet(`/character/${charId}/`);
  if (profile === null) return response('{"error":"character not found"}', 404);
  if (!profile.includes(row.code)) {
    return response('{"error":"code not found in profile"}', 422);
  }
  const claimed = await env.DB.prepare(
    "SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1"
  ).bind(charId).first();
  if (claimed && claimed.user_id !== user.id) {
    return response('{"error":"character already claimed"}', 409);
  }
  await env.DB.prepare(
    "UPDATE bindings SET verified = 1 WHERE user_id = ?1 AND char_id = ?2"
  ).bind(user.id, charId).run();
  return response(JSON.stringify({ charId, verified: true }));
}
__name(verifyBinding, "verifyBinding");
async function unbindCharacter(env, user, charId) {
  await env.DB.prepare("DELETE FROM bindings WHERE user_id = ?1 AND char_id = ?2").bind(user.id, charId).run();
  return response(JSON.stringify({ charId, unbound: true }));
}
__name(unbindCharacter, "unbindCharacter");
async function putCollections(env, user, charId, raw) {
  const binding = await env.DB.prepare(
    "SELECT verified FROM bindings WHERE user_id = ?1 AND char_id = ?2 AND verified = 1"
  ).bind(user.id, charId).first();
  if (!binding) return response('{"error":"not the verified owner"}', 403);
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  const rows = [];
  const now = Date.now();
  for (const kind of [...HIDDEN_KINDS, "relics"]) {
    const ids = doc?.[kind];
    if (ids === void 0) continue;
    if (!validIds(ids, 6e3)) return response('{"error":"invalid ids"}', 422);
    rows.push([charId, kind, JSON.stringify([...new Set(ids)]), now]);
  }
  if (rows.length === 0) return response('{"error":"nothing to update"}', 422);
  const stmt = env.DB.prepare(
    "INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5"
  );
  await env.DB.batch(rows.map((r) => stmt.bind(...r, "user")));
  return response('{"ok":true}');
}
__name(putCollections, "putCollections");
var MAX_GROUPS_PER_USER = 50;
var MAX_NAME = 60;
function validGroupName(name) {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= MAX_NAME;
}
__name(validGroupName, "validGroupName");
function validCharId(id) {
  return Number.isInteger(id) && id > 0 && id < 1e12;
}
__name(validCharId, "validCharId");
async function groupRow(env, id) {
  return env.DB.prepare("SELECT id, name, owner_user_id, shared, updated FROM groups WHERE id = ?1").bind(id).first();
}
__name(groupRow, "groupRow");
async function groupMembers(env, id) {
  const rows = await env.DB.prepare(
    "SELECT char_id FROM group_members WHERE group_id = ?1 ORDER BY added"
  ).bind(id).all();
  return rows.results.map((r) => r.char_id);
}
__name(groupMembers, "groupMembers");
function groupJson(row, members, userId) {
  return {
    id: row.id,
    name: row.name,
    shared: !!row.shared,
    updated: row.updated,
    mine: userId ? row.owner_user_id === userId ? "owner" : "member" : "guest",
    members
  };
}
__name(groupJson, "groupJson");
async function listGroups(env, user) {
  const groups = await env.DB.prepare(
    "SELECT g.id, g.name, g.owner_user_id, g.shared, g.updated FROM group_links l JOIN groups g ON g.id = l.group_id WHERE l.user_id = ?1 ORDER BY l.added"
  ).bind(user.id).all();
  const members = await env.DB.prepare(
    "SELECT m.group_id, m.char_id FROM group_members m JOIN group_links l ON l.group_id = m.group_id WHERE l.user_id = ?1 ORDER BY m.added"
  ).bind(user.id).all();
  const byGroup = /* @__PURE__ */ new Map();
  for (const r of members.results) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r.char_id);
    byGroup.set(r.group_id, arr);
  }
  return response(
    JSON.stringify({
      groups: groups.results.map((g) => groupJson(g, byGroup.get(g.id) ?? [], user.id))
    })
  );
}
__name(listGroups, "listGroups");
async function createGroup(env, user, raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  if (!validGroupName(body?.name)) return response('{"error":"invalid name"}', 422);
  const members = Array.isArray(body?.members) ? [...new Set(body.members)] : [];
  if (members.length > MAX_MEMBERS || !members.every(validCharId))
    return response('{"error":"invalid members"}', 422);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM groups WHERE owner_user_id = ?1").bind(user.id).first();
  if (count.n >= MAX_GROUPS_PER_USER) return response('{"error":"too many groups"}', 429);
  const id = "grp-" + crypto.randomUUID();
  const now = Date.now();
  const shared = body?.shared ? 1 : 0;
  const stmts = [
    env.DB.prepare(
      "INSERT INTO groups (id, name, owner_user_id, shared, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?5)"
    ).bind(id, body.name.trim(), user.id, shared, now),
    env.DB.prepare("INSERT INTO group_links (user_id, group_id, added) VALUES (?1, ?2, ?3)").bind(
      user.id,
      id,
      now
    )
  ];
  const memberStmt = env.DB.prepare(
    "INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4)"
  );
  for (const charId of members) stmts.push(memberStmt.bind(id, charId, user.id, now));
  await env.DB.batch(stmts);
  return response(
    JSON.stringify(groupJson({ id, name: body.name.trim(), owner_user_id: user.id, shared, updated: now }, members, user.id))
  );
}
__name(createGroup, "createGroup");
async function getGroup(env, user, id) {
  const row = await groupRow(env, id);
  if (!row) return response('{"error":"no such group"}', 404);
  if (!row.shared && row.owner_user_id !== user?.id) return response('{"error":"no such group"}', 404);
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user?.id)));
}
__name(getGroup, "getGroup");
async function patchGroup(env, user, id, raw) {
  const row = await groupRow(env, id);
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  const name = body?.name !== void 0 ? body.name : null;
  if (name !== null && !validGroupName(name)) return response('{"error":"invalid name"}', 422);
  const shared = body?.shared === true ? 1 : row.shared;
  await env.DB.prepare("UPDATE groups SET name = ?2, shared = ?3, updated = ?4 WHERE id = ?1").bind(id, name !== null ? name.trim() : row.name, shared, Date.now()).run();
  const fresh = await groupRow(env, id);
  return response(JSON.stringify(groupJson(fresh, await groupMembers(env, id), user.id)));
}
__name(patchGroup, "patchGroup");
async function deleteGroup(env, user, id) {
  const row = await groupRow(env, id);
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM group_members WHERE group_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM group_links WHERE group_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM groups WHERE id = ?1").bind(id)
  ]);
  return response('{"ok":true}');
}
__name(deleteGroup, "deleteGroup");
async function joinGroup(env, user, id, raw) {
  const row = await groupRow(env, id);
  if (!row || !row.shared) return response('{"error":"no such group"}', 404);
  let charId = null;
  try {
    charId = JSON.parse(raw || "{}")?.charId ?? null;
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  const now = Date.now();
  const stmts = [
    env.DB.prepare(
      "INSERT INTO group_links (user_id, group_id, added) VALUES (?1, ?2, ?3) ON CONFLICT(user_id, group_id) DO NOTHING"
    ).bind(user.id, id, now)
  ];
  if (charId !== null) {
    if (!validCharId(charId)) return response('{"error":"invalid charId"}', 422);
    const binding = await env.DB.prepare(
      "SELECT verified FROM bindings WHERE user_id = ?1 AND char_id = ?2 AND verified = 1"
    ).bind(user.id, charId).first();
    if (!binding) return response('{"error":"not the verified owner"}', 403);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1").bind(id).first();
    if (count.n >= MAX_MEMBERS) return response('{"error":"group full"}', 409);
    stmts.push(
      env.DB.prepare(
        "INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(group_id, char_id) DO NOTHING"
      ).bind(id, charId, user.id, now)
    );
    stmts.push(env.DB.prepare("UPDATE groups SET updated = ?2 WHERE id = ?1").bind(id, now));
  }
  await env.DB.batch(stmts);
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)));
}
__name(joinGroup, "joinGroup");
async function quitGroup(env, user, id) {
  await env.DB.prepare("DELETE FROM group_links WHERE user_id = ?1 AND group_id = ?2").bind(user.id, id).run();
  return response('{"ok":true}');
}
__name(quitGroup, "quitGroup");
async function addGroupMember(env, user, id, raw) {
  const row = await groupRow(env, id);
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404);
  let charId;
  try {
    charId = JSON.parse(raw)?.charId;
  } catch {
    return response('{"error":"invalid body"}', 422);
  }
  if (!validCharId(charId)) return response('{"error":"invalid charId"}', 422);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1").bind(id).first();
  if (count.n >= MAX_MEMBERS) return response('{"error":"group full"}', 409);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(group_id, char_id) DO NOTHING"
    ).bind(id, charId, user.id, now),
    env.DB.prepare("UPDATE groups SET updated = ?2 WHERE id = ?1").bind(id, now)
  ]);
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)));
}
__name(addGroupMember, "addGroupMember");
async function removeGroupMember(env, user, id, charId) {
  const row = await groupRow(env, id);
  if (!row) return response('{"error":"no such group"}', 404);
  if (row.owner_user_id !== user.id) {
    const binding = await env.DB.prepare(
      "SELECT verified FROM bindings WHERE user_id = ?1 AND char_id = ?2 AND verified = 1"
    ).bind(user.id, charId).first();
    if (!binding) return response('{"error":"forbidden"}', 403);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM group_members WHERE group_id = ?1 AND char_id = ?2").bind(id, charId),
    env.DB.prepare("UPDATE groups SET updated = ?2 WHERE id = ?1").bind(id, now)
  ]);
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)));
}
__name(removeGroupMember, "removeGroupMember");
function response(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(response, "response");
function sanitizeRoom(raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!doc || doc.v !== 1 || typeof doc.roster !== "object" || doc.roster === null) return null;
  const ids = Array.isArray(doc.roster.ids) ? doc.roster.ids : null;
  const t = doc.roster.t;
  if (!ids || ids.length > MAX_MEMBERS || typeof t !== "number" || !Number.isFinite(t)) return null;
  if (!ids.every((n) => Number.isInteger(n) && n > 0 && n < 1e12)) return null;
  return JSON.stringify({ v: 1, roster: { ids, t } });
}
__name(sanitizeRoom, "sanitizeRoom");
var index_default = {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === "/auth/discord" && req.method === "GET") {
      return authDiscordStart(env, url);
    }
    if (url.pathname === "/auth/discord/callback" && req.method === "GET") {
      return authDiscordCallback(env, url);
    }
    if (url.pathname === "/me" && req.method === "GET") {
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      return response(JSON.stringify(await getMe(env, user)));
    }
    if (url.pathname === "/bind" && req.method === "POST") {
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      return bindCharacter(env, user, await req.text());
    }
    if (url.pathname === "/bind/verify" && req.method === "POST") {
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      return verifyBinding(env, user, await req.text());
    }
    if (url.pathname === "/bind" && req.method === "DELETE") {
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      let charId;
      try {
        charId = JSON.parse(await req.text())?.charId;
      } catch {
        return response('{"error":"invalid body"}', 422);
      }
      if (!Number.isInteger(charId) || charId <= 0) return response('{"error":"invalid charId"}', 422);
      return unbindCharacter(env, user, charId);
    }
    const charMatch = url.pathname.match(/^\/character\/(\d{1,12})(\/seed|\/collections)?$/);
    if (charMatch) {
      const id = Number(charMatch[1]);
      if (charMatch[2] === "/seed" && req.method === "POST") {
        const raw = await req.text();
        if (raw.length > 262144) return response('{"error":"too large"}', 413);
        const ok = await applySeed(env, id, raw);
        return ok ? response('{"ok":true}') : response('{"error":"invalid seed"}', 422);
      }
      if (charMatch[2] === "/collections" && req.method === "PUT") {
        const user = await authenticate(env, req);
        if (!user) return response('{"error":"unauthorized"}', 401);
        const raw = await req.text();
        if (raw.length > 262144) return response('{"error":"too large"}', 413);
        return putCollections(env, user, id, raw);
      }
      if (!charMatch[2] && req.method === "GET") {
        try {
          const char = await getCharacter(env, id, url.searchParams.has("force"));
          if (!char) return response('{"error":"character not found"}', 404);
          return response(JSON.stringify(char));
        } catch (e) {
          return response(JSON.stringify({ error: String(e?.message ?? e) }), 502);
        }
      }
      return response('{"error":"method not allowed"}', 405);
    }
    if (url.pathname === "/groups") {
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      if (req.method === "GET") return listGroups(env, user);
      if (req.method === "POST") return createGroup(env, user, await req.text());
      return response('{"error":"method not allowed"}', 405);
    }
    const groupMatch = url.pathname.match(
      /^\/group\/(grp-[\w-]{10,80})(?:\/(join|link|members)|\/member\/(\d{1,12}))?$/
    );
    if (groupMatch) {
      const [, id, action, memberId] = groupMatch;
      if (!action && !memberId && req.method === "GET") {
        return getGroup(env, await authenticate(env, req), id);
      }
      const user = await authenticate(env, req);
      if (!user) return response('{"error":"unauthorized"}', 401);
      if (!action && !memberId) {
        if (req.method === "PATCH") return patchGroup(env, user, id, await req.text());
        if (req.method === "DELETE") return deleteGroup(env, user, id);
      }
      if (action === "join" && req.method === "POST") return joinGroup(env, user, id, await req.text());
      if (action === "link" && req.method === "DELETE") return quitGroup(env, user, id);
      if (action === "members" && req.method === "POST")
        return addGroupMember(env, user, id, await req.text());
      if (memberId && req.method === "DELETE") return removeGroupMember(env, user, id, Number(memberId));
      return response('{"error":"method not allowed"}', 405);
    }
    const roomMatch = url.pathname.match(/^\/room\/(ogs-[\w-]{10,80})$/);
    if (roomMatch) {
      const id = roomMatch[1];
      if (req.method === "GET") {
        const row = await env.DB.prepare("SELECT doc FROM rooms WHERE id = ?1").bind(id).first();
        if (!row) return response('{"error":"no such room"}', 404);
        return response(row.doc);
      }
      if (req.method === "POST") {
        const raw = await req.text();
        if (raw.length > MAX_DOC_BYTES) return response('{"error":"too large"}', 413);
        const doc = sanitizeRoom(raw);
        if (!doc) return response('{"error":"invalid document"}', 422);
        await env.DB.prepare(
          "INSERT INTO rooms (id, doc, updated) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET doc = ?2, updated = ?3"
        ).bind(id, doc, Date.now()).run();
        return response(doc);
      }
      return response('{"error":"method not allowed"}', 405);
    }
    return response('{"error":"not found"}', 404);
  }
};

// ../../../Users/Derp's Tower/AppData/Local/npm-cache/_npx/3b7043b2fb80338c/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../Users/Derp's Tower/AppData/Local/npm-cache/_npx/3b7043b2fb80338c/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-b1yjFh/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../../Users/Derp's Tower/AppData/Local/npm-cache/_npx/3b7043b2fb80338c/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-b1yjFh/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
