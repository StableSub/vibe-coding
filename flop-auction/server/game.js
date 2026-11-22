export const catalog = [
  { kind: "umbrella", title: "절대 잃어버리지 않는 우산", description: "비가 오면 누구보다 먼저 당신 곁에 있는 든든한 우산입니다.", flaw: "손목 끈이 풀리지 않습니다. 맑은 날에도 침대까지 같이 가야 합니다." },
  { kind: "hearing", title: "박수 치면 꺼지는 보청기", description: "세상의 작은 소리까지 놓치지 않도록 만든 공연장 전용 보청기입니다.", flaw: "다시 켜려면 주변이 20분간 조용해야 합니다. 기침 한 번이면 처음부터 다시 셉니다." },
  { kind: "clock", title: "지각 전용 알람시계", description: "늦잠 잔 아침에도 당신이 놓친 약속을 꼼꼼히 챙겨 줍니다.", flaw: "약속에 늦은 뒤에만 울립니다. 정각엔 자고, 십 분 뒤에 사과 멘트를 들려줍니다." }
];
const duration = 45_000;
const botNames = ["콩수집가", "수상한 감정사"];
const botTimes = [5, 13, 22, 33, 40];

export class RoomError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

function requireRule(ok, status, code, message) {
  if (!ok) throw new RoomError(status, code, message);
}

function field(value, max, label) {
  const clean = typeof value === "string" ? value.trim() : "";
  requireRule(clean.length && [...clean].length <= max, 422, "INVALID_FIELD", label + " 입력을 확인해 주세요. 최대 " + max + "자입니다.");
  return clean;
}

function photoData(value) {
  if (!value) return null;
  const valid = typeof value === "string" && value.length <= 65000 &&
    /^data:image\/(webp|png|jpeg);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value);
  requireRule(valid, 422, "INVALID_PHOTO", "사진을 47KB 이하의 JPG, PNG 또는 WebP로 압축해 주세요.");
  return value;
}

function player(id, name, isBot = false) {
  return { id, name, isBot, balance: 100, item: null };
}

export function newRoom(code, id, name) {
  return {
    code, hostId: id, phase: "lobby", players: [player(id, field(name, 12, "별명"))],
    lots: [], lotIndex: 0, startsAt: null, endsAt: null, bids: [], botStep: 0,
    sales: [], ballots: {}, revision: 1
  };
}

function activeMember(room, id) {
  const member = room.players.find(p => p.id === id && !p.isBot);
  requireRule(member, 403, "NOT_MEMBER", "이 방에 참가한 뒤 다시 열어 주세요.");
  return member;
}

function beginLot(room, now) {
  room.phase = "auction";
  room.startsAt = now;
  room.endsAt = now + duration;
  room.bids = [];
  room.botStep = 0;
}

function settle(room) {
  const top = room.bids.at(-1);
  const winner = top && room.players.find(p => p.id === top.id);
  if (winner) winner.balance -= top.amount;
  room.sales.push({ lotIndex: room.lotIndex, amount: top?.amount ?? 0, winnerId: winner?.id ?? null, winnerName: winner?.name ?? null });
  room.phase = "reveal";
  room.endsAt = null;
}

export function tickRoom(room, now) {
  if (room.phase !== "auction") return false;
  let changed = false;
  const bots = room.players.filter(p => p.isBot);
  while (bots.length && room.botStep < botTimes.length) {
    const step = room.botStep;
    const at = room.startsAt + botTimes[step] * 1000;
    if (at > now) break;
    room.botStep++;
    changed = true;
    const bot = bots[(step + room.lotIndex) % bots.length];
    const top = room.bids.at(-1);
    const amount = (top?.amount ?? 0) + 2 + (step + room.lotIndex) % 4;
    if (top?.id !== bot.id && amount <= Math.min(bot.balance, 23 + room.lotIndex * 11)) {
      room.bids.push({ id: bot.id, name: bot.name, amount, at });
    }
  }
  if (now >= room.endsAt) { settle(room); return true; }
  return changed;
}

export function act(room, action, id, data, now) {
  if (action === "join") {
    if (room.players.some(p => p.id === id)) return false;
    requireRule(room.phase === "lobby", 409, "STARTED", "이미 경매가 시작된 방입니다.");
    requireRule(room.players.length < 3, 409, "ROOM_FULL", "세 자리가 모두 찼습니다.");
    const name = field(data.name, 12, "별명");
    requireRule(!room.players.some(p => p.name === name), 409, "NAME_TAKEN", "이미 사용 중인 별명입니다.");
    room.players.push(player(id, name));
    return true;
  }
  const me = activeMember(room, id);
  if (action === "state" || action === "create") return false;
  if (["start", "close", "next"].includes(action)) {
    requireRule(id === room.hostId, 403, "HOST_ONLY", "방장만 진행할 수 있습니다.");
  }
  if (action === "item") {
    requireRule(room.phase === "lobby", 409, "STARTED", "경매 시작 후에는 출품작을 바꿀 수 없습니다.");
    const item = { kind: "custom", title: field(data.title, 32, "작품명"), description: field(data.description, 140, "소개"),
      flaw: field(data.flaw, 140, "비밀 하자"), photo: photoData(data.photo), sellerName: me.name };
    if (JSON.stringify(me.item) === JSON.stringify(item)) return false;
    me.item = item;
    return true;
  }
  if (action === "start") {
    if (room.phase !== "lobby") return false;
    room.lots = room.players.map(p => p.item).filter(Boolean);
    for (const item of catalog.slice(0, 3 - room.lots.length)) {
      room.lots.push({ ...item, photo: null, sellerName: "망작 경매소" });
    }
    if (room.players.length === 1) {
      botNames.forEach((name, i) => room.players.push(player("bot-" + i, name, true)));
    }
    beginLot(room, now);
    return true;
  }
  requireRule(Number.isInteger(data.lotIndex) && data.lotIndex >= 0 && data.lotIndex < 3, 422, "INVALID_LOT", "작품 번호를 확인해 주세요.");
  if (action === "vote") {
    requireRule(room.phase === "results", 409, "VOTE_CLOSED", "마지막 경매가 끝난 뒤 투표가 열립니다.");
    if (room.ballots[id] === data.lotIndex) return false;
    room.ballots[id] = data.lotIndex;
    return true;
  }
  requireRule(data.lotIndex === room.lotIndex, 409, "STALE_LOT", "다음 작품으로 넘어갔습니다. 새 경매를 확인해 주세요.");
  if (action === "next") {
    requireRule(room.phase === "reveal", 409, "WRONG_PHASE", "낙찰 결과를 확인한 후 진행해 주세요.");
    if (room.lotIndex === 2) room.phase = "results";
    else { room.lotIndex++; beginLot(room, now); }
    return true;
  }
  if (action === "close" && room.phase === "reveal") return false;
  requireRule(room.phase === "auction", 409, "BIDDING_CLOSED", "입찰이 마감됐습니다.");
  if (action === "close") { settle(room); return true; }
  requireRule(Number.isSafeInteger(data.amount) && data.amount > 0, 422, "INVALID_BID", "입찰가는 1콩 이상의 정수여야 합니다.");
  const top = room.bids.at(-1);
  if (room.bids.some(b => b.id === id && b.amount === data.amount)) return false;
  requireRule(top?.id !== id, 409, "ALREADY_LEADING", "이미 최고 입찰자입니다.");
  requireRule(data.amount > (top?.amount ?? 0), 409, "LOW_BID", "현재 최고가보다 높은 금액을 입력해 주세요.");
  requireRule(data.amount <= me.balance, 422, "INSUFFICIENT_BEANS", "보유한 콩이 부족합니다.");
  room.bids.push({ id, name: me.name, amount: data.amount, at: now });
  return true;
}

export function viewRoom(room, id, now) {
  const member = activeMember(room, id);
  const players = room.players.map(p => ({ id: p.id, name: p.name, balance: p.balance, isBot: p.isBot, hasItem: !!p.item }));
  const spec = room.lots[room.lotIndex];
  const top = room.bids.at(-1);
  let lot = null;
  if (spec) {
    const { flaw, ...front } = spec;
    lot = { ...front, highestBid: top?.amount ?? 0, bidderId: top?.id ?? null,
      bidderName: top?.name ?? null, bids: room.bids.slice().reverse() };
    if (room.phase !== "auction") lot.flaw = flaw;
  }
  const receipts = room.sales.map(sale => ({ ...room.lots[sale.lotIndex], ...sale }));
  const ballots = Object.values(room.ballots);
  return { code: room.code, phase: room.phase, serverNow: now, hostId: room.hostId, revision: room.revision,
    me: { id, name: member.name, balance: member.balance, isHost: id === room.hostId },
    players, lotIndex: room.lotIndex, totalLots: 3, endsAt: room.endsAt, lot, receipts,
    myItem: member.item, myVote: room.ballots[id] ?? null,
    votes: [0,1,2].map(lotIndex => ({ lotIndex, count: ballots.filter(v => v === lotIndex).length })) };
}
