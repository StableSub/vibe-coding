import { advance, CaseError, newCase, viewCase } from "./game.js";
import { claims, locations } from "./story.js";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const methods = { state: "GET", open: "POST", navigate: "POST", inspect: "POST", question: "POST", verdict: "POST" };

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function check(condition, message) {
  if (!condition) throw new CaseError(400, "INVALID_INPUT", message);
}

async function requestData(request, action) {
  if (action === "state") return { caseId: new URL(request.url).searchParams.get("caseId") };
  const body = await request.text();
  check(body.length <= 4096, "요청 내용이 너무 큽니다.");
  let data;
  try { data = JSON.parse(body); }
  catch { throw new CaseError(400, "INVALID_INPUT", "요청 형식을 읽을 수 없습니다."); }
  check(data && typeof data === "object" && !Array.isArray(data), "사건 정보를 확인해 주세요.");
  if (action === "open") {
    check(typeof data.visitId === "string" && uuid.test(data.visitId), "회차 식별자가 올바르지 않습니다.");
  } else {
    check(Number.isSafeInteger(data.round) && data.round > 0, "회차 번호를 확인해 주세요.");
    if (action === "navigate") {
      check(Number.isSafeInteger(data.targetRound) && data.targetRound > 0, "이동할 회차를 확인해 주세요.");
      check(Number.isSafeInteger(data.revision) && data.revision >= 1, "사건 기록의 버전을 확인해 주세요.");
    }
    if (action === "inspect") check(typeof data.point === "string" && Object.hasOwn(locations, data.point), "조사 지점을 확인해 주세요.");
    if (action === "question") check(typeof data.questionId === "string" && data.questionId.length > 0, "교신할 질문을 선택해 주세요.");
    if (action === "verdict") check(claims.some(c => c.id === data.choice), "판결할 주장을 선택해 주세요.");
  }
  return data;
}

export async function handleApi(request, db) {
  try {
    const action = new URL(request.url).pathname.slice("/api/".length);
    if (!Object.hasOwn(methods, action)) throw new CaseError(404, "NOT_FOUND", "요청한 기록이 없습니다.");
    if (request.method !== methods[action]) {
      return json({ error: { code: "METHOD", message: "지원하지 않는 요청 방식입니다." } }, 405, { Allow: methods[action] });
    }
    const data = await requestData(request, action);
    check(typeof data.caseId === "string" && uuid.test(data.caseId), "사건 식별자가 올바르지 않습니다.");
    const caseId = data.caseId.toLowerCase();
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await db.prepare("SELECT dossier FROM case_files WHERE id = ?").bind(caseId).first();
      if (!row && action !== "open") throw new CaseError(404, "CASE_NOT_FOUND", "해당 사건의 조사 기록을 찾을 수 없습니다.");
      const dossier = row ? JSON.parse(row.dossier) : newCase(caseId);
      if (action === "state" || !advance(dossier, action, data)) return json(viewCase(dossier));
      const previousRevision = dossier.revision++;
      const content = JSON.stringify(dossier);
      const query = row
        ? db.prepare("UPDATE case_files SET dossier = ?, revision = ? WHERE id = ? AND revision = ?").bind(content, dossier.revision, caseId, previousRevision)
        : db.prepare("INSERT OR IGNORE INTO case_files (id, revision, dossier) VALUES (?, ?, ?)").bind(caseId, dossier.revision, content);
      const result = await query.run();
      if (result.meta.changes === 1) return json(viewCase(dossier));
    }
    throw new CaseError(409, "BUSY", "기록이 갱신되고 있습니다. 잠시 후 다시 시도해 주세요.");
  } catch (error) {
    if (error instanceof CaseError) return json({ error: { code: error.code, message: error.message } }, error.status);
    console.error("Case storage error", error.message);
    return json({ error: { code: "STORAGE", message: "기록 보관소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." } }, 503);
  }
}
