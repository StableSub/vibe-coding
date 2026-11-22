import { act, newRoom, RoomError, tickRoom, viewRoom } from "./game.js";

const operations = new Set(["create", "join", "state", "search", "item", "start", "bid", "close", "next", "vote"]);
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const encoder = new TextEncoder();

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function respond(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

async function openRoom(db, id, name, now) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const seed = await digest("auction-code/" + id + "/" + attempt);
    const code = Array.from(seed.slice(0, 6), n => codeAlphabet[n % codeAlphabet.length]).join("");
    const room = newRoom(code, id, name);
    const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, revision, record) VALUES (?, ?, ?)").bind(code, room.revision, JSON.stringify(room)).run();
    if (result.meta.changes === 1) return viewRoom(room, id, now);
    const row = await db.prepare("SELECT record FROM rooms WHERE code = ?").bind(code).first();
    if (row) {
      const existing = JSON.parse(row.record);
      if (existing.hostId === id) return viewRoom(existing, id, now);
    }
  }
  throw new RoomError(503, "CAPACITY", "방 코드를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.");
}

async function updateRoom(db, action, id, data, clock) {
  const code = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new RoomError(422, "INVALID_CODE", "여섯 자리 방 코드를 확인해 주세요.");
  for (let attempt = 0; attempt < 15; attempt++) {
    const row = await db.prepare("SELECT record FROM rooms WHERE code = ?").bind(code).first();
    if (!row) throw new RoomError(404, "ROOM_NOT_FOUND", "해당 코드의 경매장을 찾을 수 없습니다.");
    const now = clock();
    const room = JSON.parse(row.record);
    const before = room.revision;
    // Commit deadline-driven events even if the arriving bid is already too late.
    const elapsed = tickRoom(room, now);
    if (!elapsed && !act(room, action, id, data, now)) return viewRoom(room, id, now);
    room.revision++;
    const result = await db.prepare("UPDATE rooms SET record = ?, revision = ? WHERE code = ? AND revision = ?")
      .bind(JSON.stringify(room), room.revision, code, before).run();
    if (result.meta.changes && !elapsed) return viewRoom(room, id, now);
  }
  throw new RoomError(409, "ROOM_BUSY", "입찰이 몰렸습니다. 최신 금액을 확인하고 다시 시도해 주세요.");
}

async function searchReceipts(db, id, data, clock) {
  const state = await updateRoom(db, "state", id, data, clock);
  if (state.phase !== "results") throw new RoomError(409, "NOT_FINISHED", "세 경매가 모두 끝난 뒤에 검색할 수 있습니다.");
  const query = (data.q ?? "").trim();
  if ([...query].length > 64) throw new RoomError(422, "LONG_QUERY", "검색어를 64자 이내로 적어 주세요.");
  const rows = await db.prepare(`
    SELECT sale.key AS lotIndex
    FROM rooms AS r, json_each(r.record, '$.sales') AS sale, json_each(r.record, '$.lots') AS lot
    WHERE r.code = ? AND json_extract(r.record, '$.phase') = 'results'
      AND EXISTS (SELECT 1 FROM json_each(r.record, '$.players') AS p WHERE json_extract(p.value, '$.id') = ?)
      AND lot.key = json_extract(sale.value, '$.lotIndex')
      AND instr(lower(json_extract(lot.value, '$.title')), lower(?)) > 0
    ORDER BY sale.key`).bind(state.code, id, query).all();
  return { code: state.code, query, results: rows.results.map(row => state.receipts[row.lotIndex]) };
}

export async function auctionApi(request, db, clock = Date.now) {
  try {
    const url = new URL(request.url);
    const action = url.pathname.slice(5);
    if (!operations.has(action)) throw new RoomError(404, "NOT_FOUND", "요청한 기능이 없습니다.");
    if (request.method !== (["state", "search"].includes(action) ? "GET" : "POST")) throw new RoomError(405, "METHOD", "지원하지 않는 요청 방식입니다.");
    let data = { code: url.searchParams.get("code"), q: url.searchParams.get("q") };
    if (request.method === "POST") {
      const body = await request.text();
      if (body.length > 70000) throw new RoomError(413, "TOO_LARGE", "사진을 조금 더 압축해 주세요.");
      try { data = JSON.parse(body); } catch { throw new RoomError(400, "BAD_JSON", "요청 형식을 읽을 수 없습니다."); }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new RoomError(400, "BAD_JSON", "요청 형식을 확인해 주세요.");
    }
    const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? data.token;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new RoomError(401, "NO_TOKEN", "참가 정보를 확인해 주세요.");
    const hash = await digest("auction-member/" + token);
    const id = Array.from(hash.slice(0, 16), n => n.toString(16).padStart(2, "0")).join("");
    if (action === "search") return respond(await searchReceipts(db, id, data, clock));
    const state = action === "create" ? await openRoom(db, id, data.name, clock()) : await updateRoom(db, action, id, data, clock);
    return respond(state);
  } catch (error) {
    if (error instanceof RoomError) return respond({ error: { code: error.code, message: error.message } }, error.status);
    console.error("Auction storage error", error.message);
    return respond({ error: { code: "SERVICE", message: "경매장을 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." } }, 503);
  }
}
