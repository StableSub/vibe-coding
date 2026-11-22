import { claims, locations, makeEnding, reading } from "./story.js";
import { radioState, getTestimony } from "./radio.js";

export class CaseError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function newCase(caseId) {
  return { caseId, visits: [], selectedRound: 0, entries: [], testimonies: [], ending: null, revision: 0 };
}

function recordFor(round, point) {
  const [evidence, observation] = reading(round, point);
  return { round, point, title: locations[point].title, evidence, observation };
}

function assessment(dossier) {
  const byPoint = new Map();
  const comparison = [];
  const journal = dossier.entries.map(({ round, point }) => recordFor(round, point));
  for (const current of journal) {
    // Backfilling between two known rounds adds both neighboring pairs.
    // Keep earlier comparisons so their questions and testimony remain accessible.
    const known = byPoint.get(current.point) ?? [];
    let index = known.length;
    while (index > 0 && known[index - 1].round > current.round) index--;
    for (const other of [known[index - 1], known[index]]) {
      if (!other || other.evidence === current.evidence) continue;
      const [before, after] = other.round < current.round ? [other, current] : [current, other];
      comparison.push({
        point: current.point, title: current.title,
        beforeRound: before.round, before: before.evidence,
        afterRound: after.round, after: after.evidence
      });
    }
    known.splice(index, 0, current);
    byPoint.set(current.point, known);
  }
  const ready = byPoint.size === Object.keys(locations).length && comparison.length > 0;
  return { journal, comparison, ready };
}

export function viewCase(dossier) {
  const { journal, comparison, ready } = assessment(dossier);
  const maxRound = dossier.visits.length;
  const round = dossier.selectedRound ?? maxRound;
  const current = new Map(journal.filter(entry => entry.round === round).map(entry => [entry.point, entry]));
  const points = Object.entries(locations).map(([id, { title }]) => {
    const entry = current.get(id);
    return { id, title, inspected: Boolean(entry), observation: entry?.observation ?? null, evidence: entry?.evidence ?? null };
  });
  return {
    caseId: dossier.caseId, round, maxRound, phase: dossier.ending ? "ended" : "investigation",
    points, journal, comparison, radio: radioState(dossier, journal, comparison), revision: dossier.revision,
    trial: { ready, requirement: "세 지점을 모두 조사하고, 다른 회차에서 같은 지점의 달라진 단서를 한 쌍 확보하세요.", choices: claims },
    ending: dossier.ending
  };
}

export function advance(dossier, action, input) {
  if (action === "open") {
    if (dossier.ending || dossier.visits.includes(input.visitId)) return false;
    dossier.visits.push(input.visitId);
    dossier.selectedRound = dossier.visits.length;
    return true;
  }
  const selected = dossier.selectedRound ?? dossier.visits.length;
  if (action === "navigate" && input.targetRound === selected) return false;
  if (input.round !== selected) {
    throw new CaseError(409, "STALE_ROUND", "다른 화면에서 회차를 이동했습니다. 최신 기록을 확인해 주세요.");
  }
  if (action === "navigate") {
    if (input.revision !== dossier.revision) throw new CaseError(409, "STALE_REVISION", "다른 화면에서 갱신한 기록을 먼저 확인해 주세요.");
    if (input.targetRound > dossier.visits.length) throw new CaseError(422, "ROUND_UNAVAILABLE", "이미 수신한 회차로만 이동할 수 있습니다.");
    dossier.selectedRound = input.targetRound;
    return true;
  }
  if (dossier.ending) {
    const submitted = input.evidence;
    const accepted = dossier.ending.evidence;
    if (action === "verdict" && input.choice === dossier.ending.choice &&
      (dossier.ending.testimony?.id ?? null) === (input.testimonyId ?? null) &&
      accepted.point === submitted?.point && accepted.round === submitted?.round) return false;
    throw new CaseError(409, "CASE_CLOSED", "판결을 마친 사건입니다.");
  }
  if (action === "inspect") {
    const seen = dossier.entries.some(entry => entry.point === input.point && entry.round === input.round);
    if (seen) return false;
    dossier.entries.push({ round: input.round, point: input.point });
    return true;
  }
  const { journal, ready, comparison } = assessment(dossier);
  if (action === "question") {
    const radio = radioState(dossier, journal, comparison);
    const question = radio.questions.find(q => q.id === input.questionId);
    if (!question) throw new CaseError(422, "QUESTION_LOCKED", "질문과 연결된 증거나 앞선 교신을 먼저 확보해 주세요.");
    if (question.asked) return false;
    dossier.testimonies ??= [];
    dossier.testimonies.push(getTestimony(question));
    return true;
  }
  if (!ready) throw new CaseError(409, "TRIAL_LOCKED", "달라진 단서와 세 지점의 기록을 먼저 확보해 주세요.");
  const entry = journal.find(item => item.round === input.evidence?.round && item.point === input.evidence?.point);
  if (!entry) throw new CaseError(422, "MISSING_EVIDENCE", "기록철에서 직접 조사한 증거를 한 가지 골라 주세요.");
  const testimony = (dossier.testimonies ?? []).find(line => line.id === input.testimonyId);
  if (input.testimonyId != null && !testimony) {
    throw new CaseError(422, "MISSING_TESTIMONY", "교신 기록에 있는 증언을 골라 주세요.");
  }
  dossier.ending = makeEnding(input.choice, entry, testimony);
  return true;
}
