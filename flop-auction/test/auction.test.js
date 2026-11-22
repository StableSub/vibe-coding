import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auctionApi } from "../server/api.js";
import { sqliteStore } from "../server/sqlite.js";

function clients(fetchRequest) {
  let code;
  async function call(action, token, data = {}) {
    const read = ["state", "search"].includes(action);
    const url = new URL("/api/" + action, "http://auction");
    if (read) for (const [key, value] of Object.entries({ code, ...data })) url.searchParams.set(key, value);
    const options = read ? { headers: { Authorization: "Bearer " + token } } : {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, token, ...data })
    };
    const response = await fetchRequest(new Request(url, options));
    const state = await response.json();
    if (action === "create" && !code) code = state.code;
    return { status: response.status, state };
  }
  return { call, host: crypto.randomUUID(), guest: crypto.randomUUID(), outsider: crypto.randomUUID() };
}

function fixture(t) {
  const db = sqliteStore(":memory:");
  t.after(() => db.close());
  let now = 100_000;
  return { ...clients(req => auctionApi(req, db, () => now)), advance: ms => { now += ms; } };
}

async function twoPlayerGame({ call, host, guest, outsider }) {
  const created = await call("create", host, { name: "침착한 방장" });
  assert.equal(created.state.me.balance, 100);
  assert.equal((await call("create", host, { name: "침착한 방장" })).state.code, created.state.code);
  const joined = await call("join", guest, { name: "첫 손님" });
  assert.equal(joined.state.players.length, 2);
  assert.equal((await call("join", guest, { name: "첫 손님" })).state.me.id, joined.state.me.id);
  assert.equal((await call("start", guest)).status, 403);
  const title = "야간 100% 손전등";
  const flaw = "어두워지면 배터리가 잠듭니다.";
  await call("item", host, { title, description: "밤에 들고 나가기 좋은 손전등", flaw });
  assert.ok(!JSON.stringify((await call("state", guest)).state).includes(flaw));
  const start = (await call("start", host)).state;
  assert.equal(start.phase, "auction");
  assert.equal(start.lot.title, title);
  assert.equal(start.endsAt - start.serverNow, 45_000);
  assert.ok(!Object.hasOwn(start.lot, "flaw"));
  assert.equal((await call("search", guest, { q: title })).status, 409);
  assert.equal((await call("state", outsider)).status, 403);
  assert.equal((await call("bid", guest, { lotIndex: 0, amount: 101 })).status, 422);
  assert.equal((await call("bid", guest, { lotIndex: 0, amount: 28 })).state.lot.highestBid, 28);
  assert.equal((await call("bid", host, { lotIndex: 0, amount: 28 })).status, 409);
  assert.equal((await call("close", guest, { lotIndex: 0 })).status, 403);
  const settled = (await call("close", host, { lotIndex: 0 })).state;
  assert.equal(settled.lot.flaw, flaw);
  assert.equal(settled.receipts[0].winnerId, joined.state.me.id);
  assert.equal((await call("close", host, { lotIndex: 0 })).state.receipts.length, 1);
  assert.equal((await call("state", guest)).state.me.balance, 72);
  for (const lotIndex of [1, 2]) {
    assert.equal((await call("next", host, { lotIndex: lotIndex - 1 })).state.lotIndex, lotIndex);
    await call("close", host, { lotIndex });
  }
  assert.equal((await call("next", host, { lotIndex: 2 })).state.phase, "results");
  assert.equal((await call("search", outsider, { q: title })).status, 403);
  assert.equal((await call("search", guest, { q: "100%" })).state.results[0].flaw, flaw);
  assert.equal((await call("search", guest, { q: "%" })).state.results.length, 1);
  assert.equal((await call("search", guest, { q: "없는 이름" })).state.results.length, 0);
  assert.equal((await call("search", guest, { q: "" })).state.results.length, 3);
  const vote = (await call("vote", guest, { lotIndex: 2 })).state;
  assert.equal(vote.votes[2].count, 1);
  const moved = (await call("vote", guest, { lotIndex: 0 })).state;
  assert.equal(moved.votes[2].count, 0);
  assert.equal(moved.votes[0].count, 1);
  assert.equal((await call("state", guest)).state.myVote, 0);
}

test("two participants can submit, bid, settle once, recover, search their room and vote", async t => {
  await twoPlayerGame(fixture(t));
});

test("simultaneous bids cannot both take the lead at the same price", async t => {
  const { call, host, guest } = fixture(t);
  await call("create", host, { name: "하나" });
  await call("join", guest, { name: "둘" });
  await call("start", host);
  const race = await Promise.all([host, guest].map(token => call("bid", token, { lotIndex: 0, amount: 20 })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const winner = race[0].status === 200 ? host : guest;
  const retry = await call("bid", winner, { lotIndex: 0, amount: 20 });
  assert.equal(retry.state.lot.bids.length, 1);
  await Promise.all([call("close", host, { lotIndex: 0 }), call("close", host, { lotIndex: 0 })]);
  assert.equal((await call("state", winner)).state.me.balance, 80);
});

test("solo opponents bid during the round; exact deadline rejects a late bid and settles without a client timer", async t => {
  const { call, host, advance } = fixture(t);
  await call("create", host, { name: "연습생" });
  const start = (await call("start", host)).state;
  assert.equal(start.players.filter(p => p.isBot).length, 2);
  advance(5_000);
  assert.equal((await call("state", host)).state.lot.bids.length, 1);
  advance(40_000);
  assert.equal((await call("bid", host, { lotIndex: 0, amount: 90 })).status, 409);
  const settled = (await call("state", host)).state;
  assert.equal(settled.phase, "reveal");
  assert.equal(settled.receipts.length, 1);
  const winner = settled.players.find(p => p.id === settled.receipts[0].winnerId);
  assert.ok(winner.isBot);
  assert.equal(winner.balance, 100 - settled.receipts[0].amount);
  assert.equal(settled.me.balance, 100);
});

test("lobby limits entries, validates an image and keeps other participants' flaws private", async t => {
  const { call, host, guest, outsider } = fixture(t);
  await call("create", host, { name: "A" });
  assert.equal((await call("join", guest, { name: "A" })).status, 409);
  await call("join", guest, { name: "B" });
  await call("join", outsider, { name: "C" });
  assert.equal((await call("join", crypto.randomUUID(), { name: "D" })).status, 409);
  const data = { title: "옥수수", description: "오늘 땄어요", flaw: "플라스틱입니다" };
  assert.equal((await call("item", guest, { ...data, photo: "data:image/svg+xml,hello" })).status, 422);
  const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=";
  const item = (await call("item", guest, { ...data, photo })).state.myItem;
  assert.equal(item.photo, photo);
  assert.ok(!JSON.stringify((await call("start", host)).state).includes(data.flaw));
  assert.equal((await call("state", host)).state.lot.photo, photo);
});

test("room balances and receipts remain available after reopening SQLite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "flop-auction-"));
  const path = join(dir, "rooms.sqlite");
  let db = sqliteStore(path);
  try {
    const game = clients(req => auctionApi(req, db));
    await twoPlayerGame(game);
    db.close();
    db = sqliteStore(path);
    const recovered = (await game.call("state", game.guest)).state;
    assert.equal(recovered.phase, "results");
    assert.equal(recovered.me.balance, 72);
    assert.equal(recovered.receipts.length, 3);
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});

if (process.env.AUCTION_TEST_ORIGIN) {
  test("two independent clients through the Flask HTTP entrypoint", async () => {
    const game = clients(request => {
      const url = new URL(request.url);
      return fetch(new Request(new URL(url.pathname + url.search, process.env.AUCTION_TEST_ORIGIN), request));
    });
    await twoPlayerGame(game);
  });
}
