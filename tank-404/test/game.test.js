import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDatabase } from "../server/sqlite.js";
import { handleApi } from "../server/api.js";

function client(db, caseId = crypto.randomUUID()) {
  async function call(path, data = {}) {
    const request = path === "state"
      ? new Request("http://aquarium/api/state?caseId=" + caseId)
      : new Request("http://aquarium/api/" + path, { method: "POST", body: JSON.stringify({ caseId, ...data }) });
    const response = await handleApi(request, db);
    return { status: response.status, body: await response.json() };
  }
  return {
    caseId, call,
    open: (visitId = crypto.randomUUID()) => call("open", { visitId }),
    navigate: (state, targetRound) => call("navigate", { round: state.round, revision: state.revision, targetRound }),
    inspect: (round, point) => call("inspect", { round, point }),
    question: (round, questionId) => call("question", { round, questionId }),
    verdict: (round, choice, evidence, testimonyId) => call("verdict", { round, choice, evidence, testimonyId })
  };
}

function setup(t) {
  const db = localDatabase(":memory:");
  t.after(() => db.close());
  return client(db);
}

async function investigate(game) {
  await game.open();
  await Promise.all(["clock", "drain", "trace"].map(point => game.inspect(1, point)));
  await game.open();
  return (await game.inspect(2, "trace")).body;
}

test("two tabs can open the same visit or collect all three clues concurrently", async t => {
  const game = setup(t);
  const visitId = crypto.randomUUID();
  const opened = await Promise.all(Array.from({ length: 4 }, () => game.open(visitId)));
  assert.ok(opened.every(r => r.body.round === 1 && r.body.revision === 1));
  const results = await Promise.all(["trace", "trace", "drain", "clock"].map(point => game.inspect(1, point)));
  assert.ok(results.every(r => r.status === 200));
  const { body } = await game.call("state");
  assert.equal(body.journal.length, 3);
  assert.equal(body.revision, 4);
  assert.equal(body.trial.ready, false);
  assert.equal((await game.verdict(1, "error", { round: 1, point: "clock" })).body.error.code, "TRIAL_LOCKED");
  const next = await Promise.all([game.open(), game.open()]);
  assert.deepEqual(next.map(r => r.body.round).sort(), [2, 3]);
  assert.equal((await game.open(visitId)).body.round, 3);
  assert.equal((await game.inspect(2, "clock")).body.error.code, "STALE_ROUND");
});

test("reconstruction hides the new evidence until inspected and compares collected records", async t => {
  const game = setup(t);
  await game.open();
  await game.inspect(1, "trace");
  const next = (await game.open()).body;
  assert.equal(next.journal.length, 1);
  assert.ok(next.points.every(p => p.inspected === false && p.evidence === null));
  const compared = (await game.inspect(2, "trace")).body;
  const diff = compared.comparison[0];
  assert.equal(diff.before, compared.journal[0].evidence);
  assert.equal(diff.after, compared.journal[1].evidence);
  assert.notEqual(diff.before, diff.after);
  assert.equal(compared.trial.ready, false);
  await game.inspect(2, "drain");
  assert.equal((await game.inspect(2, "clock")).body.trial.ready, true);
});

for (const [choice, round, point, ending] of [
  ["escape", 1, "drain", "escape"],
  ["erasure", 2, "trace", "erasure"],
  ["error", 1, "clock", "error"],
  ["escape", 1, "clock", "unresolved"]
]) {
  test(`submitting ${point} from round ${round} for ${choice} returns ${ending}`, async t => {
    const game = setup(t);
    assert.equal((await investigate(game)).trial.ready, true);
    assert.equal((await game.verdict(2, choice, { round: 2, point: "drain" })).body.error.code, "MISSING_EVIDENCE");
    const proof = { round, point };
    const result = (await game.verdict(2, choice, proof)).body;
    assert.equal(result.phase, "ended");
    assert.equal(result.ending.id, ending);
    assert.equal(result.ending.evidence.point, point);
    assert.ok(result.ending.body.includes(result.ending.evidence.evidence));
    assert.deepEqual((await game.verdict(2, choice, proof)).body, result);
    assert.deepEqual((await game.open()).body, result);
    assert.equal((await game.inspect(2, "drain")).body.error.code, "CASE_CLOSED");
  });
}

test("rounds, exclusions and submitted findings survive process restart and stay isolated", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tank404-test-"));
  const path = join(directory, "cases.sqlite");
  let db = localDatabase(path);
  try {
    const first = client(db);
    await investigate(first);
    const second = client(db);
    assert.equal((await second.call("state")).status, 404);
    assert.equal((await second.open()).body.journal.length, 0);
    assert.equal((await second.inspect(1, "bad location")).status, 400);
    const accepted = (await first.verdict(2, "escape", { round: 1, point: "drain" })).body;
    db.close();
    db = localDatabase(path);
    assert.deepEqual((await client(db, first.caseId).call("state")).body, accepted);
    assert.equal((await client(db, second.caseId).call("state")).body.round, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});

test("radio coverage follows collected evidence and unlocks cross-examination only after both answers", async t => {
  const game = setup(t);
  const first = (await game.open()).body;
  assert.deepEqual(first.radio.questions, []);
  assert.equal((await game.question(1, "1/clock")).body.error.code, "QUESTION_LOCKED");
  const sighting = (await game.inspect(1, "trace")).body.radio.questions[0];
  const replies = await Promise.all([game.question(1, sighting.id), game.question(1, sighting.id)]);
  for (const { body } of replies) {
    assert.equal(body.radio.testimonies.length, 1);
    assert.equal(body.radio.questions[0].asked, true);
  }
  await game.open();
  const second = (await game.inspect(2, "trace")).body.radio;
  assert.equal(second.questions.length, 2);
  assert.notEqual(second.questions[0].prompt, second.questions[1].prompt);
  assert.equal((await game.question(2, "1-2/trace")).body.error.code, "QUESTION_LOCKED");
  const compared = (await game.question(2, second.questions[1].id)).body.radio;
  assert.equal(compared.questions.length, 3);
  assert.notEqual(compared.testimonies[0].answer, compared.testimonies[1].answer);
  const cross = (await game.question(2, compared.questions[2].id)).body.radio;
  assert.equal(cross.testimonies.length, 3);
  assert.equal(cross.testimonies[2].prompt, compared.questions[2].prompt);
  assert.deepEqual((await game.call("state")).body.radio, cross);
});

test("the same physical proof gives different rulings with corroborating and conflicting witnesses", async t => {
  for (const { quote, expected } of [{ quote: "1/clock", expected: "error" }, { quote: "2/trace", expected: "unresolved" }]) {
    const game = setup(t);
    await investigate(game);
    const evidence = { round: 1, point: "clock" };
    assert.equal((await game.verdict(2, "error", evidence, quote)).body.error.code, "MISSING_TESTIMONY");
    const statement = (await game.question(2, quote)).body.radio.testimonies[0];
    const verdict = await game.verdict(2, "error", evidence, quote);
    assert.equal(verdict.body.ending.id, expected);
    assert.deepEqual(verdict.body.ending.testimony, statement);
    assert.ok(verdict.body.ending.body.includes(statement.answer));
    assert.deepEqual((await game.verdict(2, "error", evidence, quote)).body, verdict.body);
    assert.equal((await game.verdict(2, "error", evidence)).body.error.code, "CASE_CLOSED");
  }
});

test("legacy investigations gain radio questions, and sealed verdicts reopen verbatim", async t => {
  const db = localDatabase(":memory:");
  t.after(() => db.close());
  const game = client(db);
  const evidence = { round: 1, point: "clock" };
  const old = { caseId: game.caseId, entries: [evidence], visits: [crypto.randomUUID()], revision: 2, ending: null };
  db.prepare("INSERT INTO case_files (id, revision, dossier) VALUES (?, ?, ?)").bind(game.caseId, 2, JSON.stringify(old)).run();
  const current = (await game.call("state")).body;
  assert.equal(current.round, current.maxRound);
  assert.equal(current.radio.questions.length, 1);
  assert.deepEqual(current.radio.testimonies, []);
  assert.equal((await game.question(1, current.radio.questions[0].id)).body.radio.testimonies.length, 1);
  old.ending = { id: "error", title: "잃어버린 1초", body: "보존된 판결문", choice: "error", evidence };
  db.prepare("UPDATE case_files SET revision = ?, dossier = ? WHERE id = ?").bind(2, JSON.stringify(old), game.caseId).run();
  assert.deepEqual((await game.open()).body.ending, old.ending);
  assert.deepEqual((await game.verdict(1, "error", evidence)).body.ending, old.ending);
  assert.equal((await game.question(1, "1/clock")).body.error.code, "CASE_CLOSED");
});

test("visited rounds can be re-investigated; a new capture always extends the furthest round", async t => {
  const game = setup(t);
  const firstVisit = crypto.randomUUID();
  await game.open(firstVisit);
  await game.inspect(1, "clock");
  const second = (await game.open()).body;
  assert.equal((await game.navigate(second, 3)).body.error.code, "ROUND_UNAVAILABLE");
  const older = (await game.navigate(second, 1)).body;
  assert.equal(older.maxRound, 2);
  assert.equal(older.round, 1);
  assert.deepEqual((await game.navigate(second, 1)).body, older);
  assert.deepEqual((await game.call("state")).body, older);
  assert.ok(older.points.find(row => row.id === "clock").inspected);
  const revised = (await game.inspect(1, "trace")).body;
  assert.equal(revised.journal.at(-1).round, 1);
  const newer = (await game.navigate(revised, 2)).body;
  assert.equal(newer.round, 2);
  assert.ok(newer.points.every(row => !row.inspected));
  assert.deepEqual((await game.open(firstVisit)).body, newer);
  await game.navigate(newer, 1);
  const opened = (await game.open()).body;
  assert.equal(opened.round, 3);
  assert.equal(opened.maxRound, 3);
  assert.equal(opened.journal.length, 2);
});

test("old witness statements and comparisons survive filling an intervening capture", async t => {
  const game = setup(t);
  await game.open();
  await game.inspect(1, "trace");
  await game.question(1, "1/trace");
  await game.open();
  await game.open();
  await game.inspect(3, "trace");
  await game.question(3, "3/trace");
  const original = (await game.question(3, "1-3/trace")).body;
  await game.navigate(original, 2);
  const revised = (await game.inspect(2, "trace")).body;
  assert.deepEqual(revised.comparison.map(c => [c.beforeRound, c.afterRound]), [[1,3], [1,2], [2,3]]);
  assert.deepEqual(revised.radio.testimonies, original.radio.testimonies);
  assert.ok(revised.radio.questions.some(q => q.id === "1-3/trace" && q.asked));
});

test("concurrent navigation chooses one destination and refuses a stale change after a round trip", async t => {
  const game = setup(t);
  await game.open();
  await game.open();
  const third = (await game.open()).body;
  const moves = await Promise.all([game.navigate(third, 1), game.navigate(third, 2)]);
  assert.deepEqual(moves.map(m => m.status).sort(), [200,409]);
  const selected = moves.find(m => m.status === 200).body;
  assert.equal((await game.inspect(3,"trace")).body.error.code, "STALE_ROUND");
  const returned = (await game.navigate(selected, 3)).body;
  assert.equal((await game.navigate(third, 1)).body.error.code, "STALE_REVISION");
  assert.equal(returned.maxRound, 3);
});

test("older captures can be read in a sealed case without changing its findings", async t => {
  const game = setup(t);
  await investigate(game);
  const sealed = (await game.verdict(2, "error", { round: 1, point: "clock" })).body;
  const old = (await game.navigate(sealed, 1)).body;
  assert.equal(old.round, 1);
  assert.ok(old.points.every(p => p.inspected));
  assert.deepEqual(old.ending, sealed.ending);
  assert.equal((await game.inspect(1, "trace")).body.error.code, "CASE_CLOSED");
  assert.deepEqual((await game.open()).body, old);
});
