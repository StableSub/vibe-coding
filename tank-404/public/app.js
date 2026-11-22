'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const iconPaths = {
  camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  folder:
    '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 9h18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 0 1 5 .2c0 1.7-2.6 2-2.6 3.8m0 3h.01"/>',
  refresh: '<path d="M20 10a8 8 0 1 0-1 7m1-13v6h-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  tape: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="11" r="2.2"/><circle cx="17" cy="11" r="2.2"/><path d="M7 13.2h10m-9 5.4 1.5-2.5h5l1.5 2.5"/>',
  wave: '<path d="M1 13h3l2-6 3 12 3-15 3 13 2-7 2 3h4"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  note: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h6"/>',
  split:
    '<rect x="2" y="5" width="8" height="14" rx="1"/><rect x="14" y="5" width="8" height="14" rx="1"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  gavel: '<path d="m13 3 6 6-2 2-6-6 2-2Zm-4 4 6 6-4 4-6-6 4-4Zm5 7 6 6M3 21h9"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8m-9 4h4"/>',
};
function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
}
$$('[data-icon]').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon);
});
const points = {
  trace: { index: '01', title: '금붕어 흔적', art: 'fish' },
  drain: { index: '02', title: '배수구', art: 'drain' },
  clock: { index: '03', title: '기록 시계', art: 'clock' },
};
const key = 'tank404.case.v1';
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
const pad = (n) => String(n).padStart(2, '0');
const safe = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const frameVersion = (round) => ((round - 1) % 4) + 1;
const artFor = (round) =>
  frameVersion(round) === 1 ? '/art/tank-original.webp' : '/art/tank-revised.webp';
const thumb = (id) => `/art/evidence-${points[id].art}.webp`;
let caseId;
let visitId = uuid();
let state;
let busy = false;
let activeTab = 'evidence';
let toastTimer;
let persisted = true;
let disposeComparator;
let dialogTrigger;
let retryOperation;
let waitingForFirstVisit = false;
let selectedTestimony = '';
try {
  const storedCase = localStorage.getItem(key);
  caseId = storedCase || uuid();
  waitingForFirstVisit = !storedCase || localStorage.getItem(key + '.unopened') === caseId;
  if (waitingForFirstVisit) localStorage.setItem(key + '.unopened', caseId);
  localStorage.setItem(key, caseId);
} catch {
  caseId = uuid();
  waitingForFirstVisit = true;
  persisted = false;
}
try {
  selectedTestimony = localStorage.getItem(key + '.testimony.' + caseId) || '';
} catch {}
function chooseTestimony(id) {
  selectedTestimony = id;
  try {
    localStorage.setItem(key + '.testimony.' + caseId, id);
  } catch {}
}

async function api(route, data) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      `/api/${route}`,
      data
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId, ...data }),
            cache: 'no-store',
            signal: controller.signal,
          }
        : { cache: 'no-store', signal: controller.signal },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.caseId) {
      const error = new Error(result?.error?.message || '기록실에서 응답을 받지 못했습니다.');
      error.status = response.status;
      error.code = result?.error?.code;
      throw error;
    }
    return result;
  } finally {
    clearTimeout(deadline);
  }
}
function toast(message) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}
function status(label, offline = false) {
  const el = $('#save-status');
  el.classList.toggle('off', offline);
  el.querySelector('span').textContent = label;
}
function openDialog(type, content) {
  const d = $('#dialog');
  cleanupComparator();

  if (!d.hasAttribute('open')) dialogTrigger = document.activeElement;
  d.dataset.view = type;
  rememberReading(type);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#monitor').classList.remove('immersive');
  $('#dialog-content').innerHTML = content;
  d.setAttribute('aria-labelledby', 'dialog-title');
  if (d.hasAttribute('open')) {
    $('#dismiss').focus({ preventScroll: true });
    return;
  }
  if (typeof d.showModal === 'function') {
    try {
      d.showModal();
      return;
    } catch {}
  }
  d.setAttribute('open', '');
  d.setAttribute('aria-modal', 'true');
  d.classList.add('legacy-dialog');
  $('.masthead').inert = $('#investigation').inert = true;
  $('#dismiss').focus();
}
function rememberReading(view) {
  try {
    if (view === 'guide' || view === 'briefing')
      sessionStorage.setItem(key + '.reading.' + caseId, view);
    else sessionStorage.removeItem(key + '.reading.' + caseId);
  } catch {}
}
function readingBeforeReload() {
  try {
    return sessionStorage.getItem(key + '.reading.' + caseId);
  } catch {
    return null;
  }
}
function cleanupComparator() {
  if (disposeComparator) disposeComparator();
  disposeComparator = undefined;
}
function restoreDialogFocus() {
  if (dialogTrigger?.isConnected) {
    dialogTrigger.focus({ preventScroll: true });
    return;
  }
  const data = dialogTrigger?.dataset || {};
  const replacement = data.record
    ? $$('[data-record]').find((b) => b.dataset.record === data.record)
    : data.question
      ? $$('[data-transcript]').find((b) => b.dataset.transcript === data.question)
      : null;
  (replacement || $('#tab-' + activeTab)).focus({ preventScroll: true });
}
function closeDialog() {
  const d = $('#dialog');
  if (d.dataset.view === 'intro' && !state) {
    beginFirst(false);
    return;
  }
  cleanupComparator();

  if (!d.hasAttribute('open')) return;
  rememberReading(null);
  if (d.classList.contains('legacy-dialog')) {
    d.removeAttribute('open');
    d.classList.remove('legacy-dialog');
    $('.masthead').inert = $('#investigation').inert = false;
    restoreDialogFocus();
  } else d.close();
}
function actions(content) {
  return `<div class="dialog-actions">${content}</div>`;
}
const closeButton = (text) => `<button class="primary" data-action="close">${text}</button>`;
const kicker = (symbol, text) => `<div class="dialog-kicker">${icon(symbol)} ${text}</div>`;
function note(title, copy) {
  return `<div class="notebook-note"><span class="note-title">${icon('note')} ${title}</span>${safe(copy)}</div>`;
}
function collected() {
  return new Set(state.journal.map((row) => row.point));
}
function currentObservations() {
  return state.points.filter((row) => row.inspected).length;
}
function latest(id) {
  return state.journal.filter((row) => row.point === id).sort((a, b) => b.round - a.round)[0];
}
function selectedRecord(id) {
  return state.journal.find((row) => row.point === id && row.round === state.round);
}
function maxRound() {
  return state.maxRound || state.round;
}
function ledgerEntry(id) {
  return (
    selectedRecord(id) || (!state.ending && state.round === maxRound() ? latest(id) : undefined)
  );
}
function updateImage() {
  const img = $('#frame');
  const art = artFor(state.round);
  if (img.getAttribute('src') !== art) img.src = art;
  img.alt =
    frameVersion(state.round) === 1
      ? '수신된 수조. 금빛 꼬리와 오른쪽 아래 배수망이 보인다.'
      : '다시 수신한 같은 수조. 금붕어가 있던 자리가 비어 있다.';
  $$('#image-area [data-point]').forEach((b) => {
    const p = state.points.find((row) => row.id === b.dataset.point);
    b.classList.toggle('done', !!p?.inspected);
    b.disabled = busy || (!!state.ending && !p?.inspected);
    b.setAttribute(
      'aria-label',
      `${points[b.dataset.point].index} ${points[b.dataset.point].title} ${state.ending ? '기록 열기' : p?.inspected ? '기록 다시 보기' : '조사'}`,
    );
  });
  $('#frame-clock').textContent = '02:14:14';
}
function render() {
  if (!state) return;
  updateImage();
  const end = !!state.ending;
  const count = collected().size;
  const ready = state.trial.ready;
  const newest = maxRound();
  const archived = state.round < newest;
  $('#round-mode').textContent = archived ? '보관 영상' : '최신 영상';
  $('#round-label').textContent = `${pad(state.round)} / ${pad(newest)}회차`;
  $('#round-prev').disabled = busy || state.round <= 1;
  $('#round-next').disabled = busy || !archived;
  $('#round-latest').hidden = !archived;
  $('#round-latest').disabled = busy;
  $('#archive-hint').hidden = !archived;
  $('#archive-hint').textContent = end
    ? '종결된 사건의 보관 영상입니다. 조사했던 지점을 눌러 기록을 다시 읽으세요.'
    : `이 영상에서 찾은 증거는 ${pad(state.round)}회차에 저장됩니다. 새 회차 수신과 브라우저 새로고침은 ${pad(newest + 1)}회차를 엽니다.`;
  $('#frame-caption').textContent = `TANK 404 / CAPTURE ${pad(state.round)}`;
  $('#case-badge').textContent = end ? '사건 종결' : '미해결';
  $('#case-badge').classList.toggle('closed', end);
  $('#refresh').disabled = busy || end;
  $('#refresh').classList.toggle(
    'next',
    !end && currentObservations() > 0 && !state.comparison.length,
  );
  $('#trial').disabled = busy || (!ready && !end);
  $('#trial').innerHTML =
    `${icon(end ? 'archive' : ready ? 'gavel' : 'lock')}<span>${end ? '판결문 열기' : '최종 심리'}</span>`;
  $('#trial-note').textContent = end
    ? '최종 진술과 채택한 증거가 보존되었습니다.'
    : ready
      ? '증거 한 건을 골라 금붕어가 사라진 이유를 설명하세요.'
      : `증거 ${count}/3종 · 회차 비교 ${state.comparison.length ? 1 : 0}/1건 필요`;
  status(persisted ? '기록 연결됨' : '이 창에서 조사 중', !persisted);
  renderLedger();
}
function renderLedger() {
  $('#ledger-body').setAttribute('aria-labelledby', 'tab-' + activeTab);
  $$('.tabs [role=tab]').forEach((el) => {
    const selected = el.id === 'tab-' + activeTab;
    el.setAttribute('aria-selected', String(selected));
    el.tabIndex = selected ? 0 : -1;
  });
  const body = $('#ledger-body');
  if (activeTab === 'radio') {
    renderRadio(body);
    return;
  }
  if (activeTab === 'evidence') {
    const found = collected();
    let hint =
      '영상 속 노란 표식을 눌러 조사하세요. 금붕어 흔적, 배수구, 왼쪽 위 시계에서 단서를 찾을 수 있습니다.';
    if (state.ending) hint = '판결문에서 최종 진술과 채택한 증거를 다시 읽을 수 있습니다.';
    else if (state.round < maxRound())
      hint =
        '보관 중인 영상입니다. 이 회차에서 놓친 지점을 새로 조사하거나, 이미 발견한 증거를 다시 열 수 있습니다.';
    else if (state.trial.ready)
      hint =
        '최종 심리가 열렸습니다. 회차 비교를 읽고 결론을 내리거나, 새 회차를 수신해 다른 단서를 찾아보세요.';
    else if (state.round > 1 && !currentObservations() && found.size)
      hint = '같은 시각의 영상이 다시 도착했습니다. 지난 회차에서 봤던 지점을 다시 조사해 보세요.';
    else if (found.size === 3 && !state.comparison.length)
      hint = '세 지점을 모두 확인했습니다. 새 회차 수신을 누른 뒤 같은 지점을 한 번 더 조사하세요.';
    else if (found.size > 0 && found.size < 3)
      hint = '야간 교신에서 사육사에게 이 증거를 물어볼 수 있습니다. 다른 표식도 조사해 보세요.';
    body.innerHTML = `<div class="count-line"><span>${pad(state.round)}회차에서 조사한 지점</span><b>${pad(currentObservations())} <span>/ 03</span></b></div>
      <ul class="record-list">${Object.entries(points)
        .map(([id, p]) => {
          const entry = ledgerEntry(id);
          const label = entry
            ? `${pad(entry.round)}회차 기록`
            : state.ending
              ? '기록 없음'
              : '이 회차 미조사';
          return `<li><button class="record ${entry ? 'found' : ''}" data-record="${id}" ${state.ending && !entry ? 'disabled' : ''}><img class="record-thumb" src="${repeatedShot(id, entry ? entry.round : state.round)}" alt=""><span class="record-info"><span class="record-meta">${p.index} <span>/</span> ${label}</span><strong>${p.title}</strong></span><span class="chev">${icon('chev')}</span></button></li>`;
        })
        .join('')}</ul>${note('조사 메모', hint)}`;
  } else {
    const comparisons = [...state.comparison].reverse();
    const current = currentObservations();
    body.innerHTML =
      `<div class="count-line"><span>대조 가능한 기록</span><b>${pad(comparisons.length)} <span>건</span></b></div>` +
      (comparisons.length
        ? `<ul class="compare-list">${comparisons.map((c, i) => `<li><button class="compare-card" data-comparison="${state.comparison.length - 1 - i}"><strong>${safe(c.title)}</strong><small>${pad(c.beforeRound)}회차 / ${pad(c.afterRound)}회차</small>${icon('chev')}</button></li>`).join('')}</ul>`
        : `<div class="empty-compare">${icon('split')}<h3>두 회차의 기록이 필요합니다</h3><p>${state.journal.length ? '같은 지점을 다른 회차에서 조사하면 이전 관찰과 달라진 단서를 나란히 볼 수 있습니다.' : '먼저 수조 위 표식 하나를 조사해 첫 관찰을 남기세요.'}</p>${state.journal.length && current ? '<button class="text-action" data-action="refresh">새 회차 수신</button>' : '<button class="text-action" data-action="return-evidence">증거 목록 보기</button>'}</div>`) +
      (comparisons.length
        ? note('필름 대조기', '기록 쌍을 열고 분할선을 움직여 두 회차의 장면을 비교하세요.')
        : '');
  }
}
function renderRadio(body) {
  const radio = state.radio;
  const questions = radio?.questions || [];
  const answers = radio?.testimonies || [];
  const available = state.ending ? [] : questions.filter((q) => !q.asked).reverse();
  const channel = `<div class="radio-channel"><span class="radio-emblem">${icon('wave')}</span><div><small>당직 무전 / CH 04</small><strong>${safe(radio?.witness || '서해진')} <span>${safe(radio?.role || '야간 사육사')}</span></strong></div></div>`;
  const unanswered = available
    .map(
      (q) =>
        `<li><button class="question-card" data-question="${safe(q.id)}"><small>${pad(q.round)}회차 · ${safe(q.evidence)}</small><strong>${safe(q.prompt)}</strong>${icon('chev')}</button></li>`,
    )
    .join('');
  const witness = [...answers]
    .reverse()
    .map(
      (t) =>
        `<li><button class="question-card answered" data-transcript="${safe(t.id)}"><small>${pad(t.round)}회차 · ${t.id === selectedTestimony ? '심리 증언 지정' : '수신 완료'}</small><strong>${safe(t.prompt)}</strong>${icon('chev')}</button></li>`,
    )
    .join('');
  let content = '';
  if (unanswered)
    content += `<h3 class="radio-heading">보낼 질문 <span>${available.length}</span></h3><ul class="radio-list">${unanswered}</ul>`;
  if (witness)
    content += `<h3 class="radio-heading">교신 기록 <span>${answers.length}</span></h3><ul class="radio-list">${witness}</ul>`;
  if (!content)
    content = note(
      '교신 대기',
      state.ending
        ? '이 사건에 보존된 교신이 없습니다.'
        : '수조의 표식 하나를 조사하세요. 확인한 증거에 따라 당직자에게 보낼 질문이 열립니다.',
    );
  body.innerHTML = channel + content;
}
function showTranscript(id) {
  const t = state.radio?.testimonies.find((a) => a.id === id);
  if (!t) return;
  const picked = selectedTestimony === id;
  const select = state.ending
    ? ''
    : `<button class="outline-button" data-adopt="${safe(id)}">${picked ? '지정 해제' : '심리 증언으로 지정'}</button>`;
  openDialog(
    'radio',
    `${kicker('wave', 'NIGHT RADIO / CH 04')}<h2 id="dialog-title">야간 교신 기록</h2><div class="radio-case">제 ${pad(t.round)}회차 · ${safe(t.evidence)}</div><div class="radio-line"><small>조사관</small><p>${safe(t.prompt)}</p></div><div class="radio-line witness-line"><small>${safe(t.witness)} · ${safe(state.radio.role)}</small><p>${safe(t.answer)}</p></div>${actions(select + closeButton('조사 계속'))}`,
  );
}
function askQuestion(id) {
  const q = state.radio?.questions.find((row) => row.id === id);
  if (!q || busy) return;
  if (q.asked) return showTranscript(id);
  if (state.ending) return;
  const data = { round: state.round, questionId: id };
  mutate(
    () => api('question', data),
    () => showTranscript(id),
  );
}
function setTab(tab) {
  activeTab = tab;
  if (state) renderLedger();
}
function showBriefing(first) {
  const actionsHtml = first
    ? '<button class="outline-button" data-action="start-browse">현장 둘러보기</button><button class="primary" data-action="start-trace">금붕어 흔적 조사</button>'
    : '<button class="outline-button" data-action="guide">조사 안내</button>' +
      closeButton('조사로 돌아가기');
  openDialog(
    first ? 'intro' : 'briefing',
    `<div class="briefing-image"><img src="/art/tank-original.webp" alt=""><span>404번 수조 · 오전 02:14</span></div>
    <div class="briefing-label">사건 브리핑</div><h2 id="dialog-title">금붕어는 어디로 갔을까?</h2>
    <p class="briefing-story">당신은 심야 수족관의 야간 조사원입니다. 새벽 2시 14분, 404번 수조가 비었다는 신고가 들어왔습니다. 그런데 그 시각의 영상에는 마지막 금붕어가 보입니다.</p>
    <div class="briefing-task"><h3>첫 단서</h3><p>영상 속 <b>01 금붕어 흔적</b>을 조사하세요. 찾은 증거는 사건 기록철에 저장됩니다.</p>
    <h3>서로 다른 영상</h3><p>같은 시각의 영상을 새로 받을 때마다 한 회차가 됩니다. 두 회차에서 같은 곳을 조사해 달라진 단서를 찾으세요.</p></div>
    <p class="briefing-goal">마지막에는 증거를 골라 금붕어에게 무슨 일이 있었는지 설명하세요.</p>${actions(actionsHtml)}`,
  );
  if (first) {
    dialogTrigger = $('#image-area [data-point=trace]');
    $('#dialog [data-action=start-trace]').focus({ preventScroll: true });
  }
}
async function beginFirst(inspectTrace) {
  if (busy || !waitingForFirstVisit || state) return;
  const launchButtons = $$('#dialog [data-action^=start-]');
  launchButtons.forEach((button) => (button.disabled = true));
  $('#dialog').setAttribute('aria-busy', 'true');
  await mutate(
    async () => {
      const first = await api('open', { visitId: caseId });
      if (
        inspectTrace &&
        !first.ending &&
        first.round === 1 &&
        !first.journal.some((r) => r.point === 'trace' && r.round === 1)
      ) {
        return api('inspect', { round: 1, point: 'trace' });
      }
      return first;
    },
    () => {
      waitingForFirstVisit = false;
      try {
        localStorage.removeItem(key + '.unopened');
      } catch {}
      const trace = selectedRecord('trace');
      if (inspectTrace && trace && state.round === 1 && !state.ending)
        showRecord('trace', trace, true);
      else closeDialog();
    },
  );
  $('#dialog').removeAttribute('aria-busy');
  launchButtons.forEach((button) => (button.disabled = false));
}
function showGuide() {
  openDialog(
    'guide',
    `${kicker('help', '조사 안내')}<h2 id="dialog-title">수조를 조사하는 방법</h2>
    <ol class="guide-steps">
      <li><strong>영상의 표식 세 개를 누르세요.</strong><p>금붕어 흔적, 배수구, 왼쪽 위 기록 시계를 살펴보세요. 찾은 단서는 사건 기록철에 저장됩니다.</p></li>
      <li><strong>같은 곳을 한 번 더 조사하세요.</strong><p>‘새 회차 수신’을 누르면 같은 시각의 다른 영상이 도착합니다. 이전에 본 지점을 다시 조사한 뒤 ‘회차 비교’에서 두 영상을 겹쳐 보세요.</p><p>모니터 아래의 이전·다음 버튼으로 이미 받은 영상을 오갈 수 있습니다. 조사 화면에서 브라우저를 새로고침하면 새 회차가 열립니다.</p></li>
      <li><strong>사육사에게 물어보세요.</strong><p>‘야간 교신’에 들어가 단서에 대해 질문할 수 있습니다. 두 회차의 답을 모두 들으면 추가 질문이 열립니다.</p></li>
      <li><strong>증거로 사건을 설명하세요.</strong><p>세 지점을 모두 조사하고 한 지점에서 두 회차의 차이를 찾으면 ‘최종 심리’가 열립니다. 증거와 주장을 고르세요. 사육사의 증언도 함께 제출할 수 있습니다.</p></li>
    </ol>${actions('<button class="outline-button" data-action="briefing">사건 브리핑 다시 보기</button>' + closeButton('조사로 돌아가기'))}`,
  );
}
function repeatedShot(id, round) {
  if (frameVersion(round) > 2)
    return '/art/evidence-' + points[id].art + '-' + frameVersion(round) + '.webp';
  if (id === 'drain' && frameVersion(round) === 2) return '/art/evidence-drain-revised.webp';
  if (id === 'trace' && frameVersion(round) > 1) return '/art/tank-revised.webp';
  return thumb(id);
}
function showRecord(id, row, firstClue = false) {
  const p = points[id];
  const rows = state.journal.filter((r) => r.point === id).sort((a, b) => b.round - a.round);
  const matches = state.comparison.filter(
    (c) => c.point === id && (c.afterRound === row.round || c.beforeRound === row.round),
  );
  const matched = matches[matches.length - 1];
  const revisit = !state.ending && row.round < state.round;
  const recordAction = revisit
    ? '<button class="outline-button" data-action="inspect-current" data-point-id="' +
      id +
      '">이번 회차 조사</button>'
    : matched
      ? '<button class="outline-button" data-comparison="' +
        state.comparison.indexOf(matched) +
        '">두 회차 대조</button>'
      : '';
  const history =
    rows.length > 1
      ? `<details class="history-list"><summary>이 지점의 전체 기록 ${rows.length}건</summary><ul>${rows.map((r) => `<li><b>${pad(r.round)}회차 · ${safe(r.evidence)}</b><br>${safe(r.observation)}</li>`).join('')}</ul></details>`
      : '';
  const q = state.radio?.questions.find((q) => q.round === row.round && q.point === id && !q.asked);
  const radioAction =
    q && !state.ending
      ? '<button class="text-action" data-question="' + safe(q.id) + '">이 증거로 교신</button>'
      : '';
  openDialog(
    'record',
    `${kicker('folder', `EVIDENCE ${p.index} / 제 ${pad(row.round)}회차`)}<h2 id="dialog-title">${p.title}</h2><div class="detail-plate"><img src="${repeatedShot(id, row.round)}" alt="${p.title} 확대"><span class="shot-label">CAM–04 / ${pad(row.round)}</span></div>
    <p class="body-copy">${safe(row.observation)}</p><div class="acquired"><span>확보한 증거</span><b>${safe(row.evidence)}</b></div>${history}
    ${firstClue ? '<p class="first-clue-hint">첫 증거가 기록철에 저장됐습니다. 조사 화면으로 돌아가 수조 오른쪽 아래의 배수구도 살펴보세요.</p>' : ''}
    ${actions(radioAction + recordAction + closeButton('조사 계속'))}`,
  );
}
async function inspectPoint(id, fromLedger = false) {
  if (!state || busy || !points[id]) return;
  const saved = fromLedger ? ledgerEntry(id) : selectedRecord(id);
  if (state.ending || (fromLedger && saved) || state.points.find((p) => p.id === id)?.inspected) {
    if (saved) showRecord(id, saved);
    return;
  }
  const data = { round: state.round, point: id };
  await mutate(
    () => api('inspect', data),
    () => {
      const row = selectedRecord(id);
      if (row) showRecord(id, row);
    },
  );
}
async function showCompare(index) {
  const c = state?.comparison[index];
  if (!c) return;
  const shot = (round) => {
    const item = state.journal.find((r) => r.round === round && r.point === c.point);
    return `<div><small class="compare-round">제 ${pad(round)}회차</small><h3>${safe(item?.evidence || '')}</h3><p>${safe(item?.observation || '')}</p></div>`;
  };
  openDialog(
    'compare',
    `${kicker('split', 'FILM COMPARATOR / 404')}<h2 id="dialog-title">${safe(c.title)} 대조</h2><div id="film-comparator"></div><div class="comparison-grid">${shot(c.beforeRound)}${shot(c.afterRound)}</div>${actions(closeButton('기록철로'))}`,
  );
  const container = $('#film-comparator');
  const sameTank =
    c.point !== 'drain' && [c.beforeRound, c.afterRound].every((r) => frameVersion(r) <= 2);
  const frame = (round) => ({
    src: sameTank ? artFor(round) : repeatedShot(c.point, round),
    label: '제 ' + pad(round) + '회차',
  });
  const before = frame(c.beforeRound);
  const after = frame(c.afterRound);
  try {
    const { mountComparator } = await import('./comparator.js');
    if (container.isConnected && $('#dialog').hasAttribute('open')) {
      disposeComparator = mountComparator(container, {
        before,
        after,
        caption: '두 필름의 기록 시각은 모두 02:14:14입니다.',
        ...(sameTank ? {} : { spots: [] }),
      });
    }
  } catch {
    if (container.isConnected)
      container.innerHTML = `<div class="comparison-grid"><div class="shot"><img src="${before.src}" alt="${before.label}"></div><div class="shot"><img src="${after.src}" alt="${after.label}"></div></div>`;
  }
}
function showTrial() {
  if (!state || busy) return;
  if (state.ending) {
    showEnding();
    return;
  }
  if (!state.trial.ready) return;
  const options = [...state.journal].sort((a, b) => b.round - a.round);
  const testimonies = state.radio?.testimonies || [];
  const witnessSelect = testimonies.length
    ? `<label for="testimony-choice">채택할 증언 <small>선택 사항</small></label><select id="testimony-choice"><option value="">증거만 제출</option>${testimonies.map((t) => `<option value="${safe(t.id)}" ${t.id === selectedTestimony ? 'selected' : ''}>${pad(t.round)}회차 · ${safe(t.prompt)}</option>`).join('')}</select><p id="witness-preview" aria-live="polite"></p>`
    : '';
  openDialog(
    'trial',
    `${kicker('gavel', 'FINAL HEARING / 404')}<h2 id="dialog-title">최종 심리</h2><p class="body-copy">이 수조에 무슨 일이 있었습니까? 판결문에 남길 증거 한 건과 최종 진술을 선택하세요.</p>
    <form class="trial-form" id="trial-form"><label for="evidence-choice">채택할 증거</label><select id="evidence-choice" required><option value="">기록철에서 증거 선택</option>${options.map((r) => `<option value="${r.round}/${safe(r.point)}">${pad(r.round)}회차 · ${safe(r.evidence)}</option>`).join('')}</select>${witnessSelect}<fieldset><legend>최종 진술</legend>${state.trial.choices.map((c) => `<label class="decision"><input type="radio" name="choice" value="${safe(c.id)}" required><span><strong>${safe(c.title)}</strong><small>${safe(c.description)}</small></span></label>`).join('')}</fieldset>${actions('<button class="primary" type="submit">진술 확정</button>')}</form>`,
  );
  updateWitnessPreview();
}
function updateWitnessPreview() {
  const preview = $('#witness-preview');
  if (!preview) return;
  const witness = state.radio.testimonies.find((t) => t.id === $('#testimony-choice').value);
  preview.textContent = witness
    ? witness.witness + ' — “' + witness.answer + '”'
    : '증언을 함께 제출하면 주장과 일치하는지 심리합니다.';
}
function showEnding() {
  const e = state.ending;
  if (!e) return;
  openDialog(
    'ending',
    `${kicker('archive', `CASE CLOSED / AQ–0404`)}<h2 id="dialog-title">${safe(e.title)}</h2><div class="end-seal">${icon('check')} 사건 종결</div><p class="body-copy">${safe(e.body)}</p>
    ${e.evidence ? `<div class="acquired"><span>채택한 증거</span><b>${pad(e.evidence.round)}회차 · ${safe(e.evidence.evidence)}</b></div>` : ''}
    ${e.testimony ? `<div class="radio-line witness-line"><small>채택한 증언 · ${safe(e.testimony.witness)}</small><p>${safe(e.testimony.answer)}</p></div>` : ''}
    ${actions(`<button class="outline-button" data-action="close">기록철 보기</button><button class="primary" data-action="restart">처음부터 재조사</button>`)}`,
  );
}
function showRequestError(error, retry) {
  retryOperation = retry;
  const d = $('#dialog');
  const message =
    error.message === 'Failed to fetch' || error.name === 'TypeError' || error.name === 'AbortError'
      ? '기록실과 연결이 끊겼습니다. 같은 요청을 다시 보낼 수 있습니다.'
      : error.message;
  const content = `<p>${safe(message)}</p><button class="outline-button" data-action="retry-operation">다시 시도</button>`;
  if (d.hasAttribute('open')) {
    $('#dialog-content .operation-error')?.remove();
    $('#dialog-content').insertAdjacentHTML(
      'beforeend',
      `<div class="operation-error" role="alert">${content}</div>`,
    );
  } else {
    openDialog(
      'error',
      `${kicker('wave', 'ARCHIVE / CONNECTION')}<h2 id="dialog-title">기록 확인 필요</h2><div class="operation-error" role="alert">${content}</div>`,
    );
  }
}
async function mutate(request, apply) {
  if (busy) return;
  busy = true;
  retryOperation = undefined;
  $('#ledger').setAttribute('aria-busy', 'true');
  status('기록 동기화 중');
  let storageError;
  let received;
  try {
    received = await request();
  } catch (error) {
    storageError = error;
  }
  try {
    if (storageError) {
      if (['STALE_ROUND', 'STALE_REVISION', 'CASE_CLOSED'].includes(storageError.code)) {
        try {
          state = await api(`state?caseId=${encodeURIComponent(caseId)}`);
          closeDialog();
          toast('다른 창에서 바뀐 최신 기록을 불러왔습니다. 지점을 다시 선택하세요.');
        } catch (error) {
          showRequestError(error, () => mutate(request, apply));
        }
      } else showRequestError(storageError, () => mutate(request, apply));
    } else {
      state = received;
      if ($('#dialog').dataset.view === 'error') closeDialog();
      try {
        await apply();
      } catch (error) {
        console.error('기록 표시 오류', error);
        closeDialog();
        toast('기록을 저장했습니다. 사건 기록철에서 다시 열어 주세요.');
      }
    }
  } finally {
    busy = false;
    $('#ledger').removeAttribute('aria-busy');
    if (state) render();
    if (storageError && retryOperation) status('재연결 필요', true);
  }
}
async function start() {
  if (busy) return;
  busy = true;
  status('기록 연결 중');
  try {
    if (waitingForFirstVisit) {
      status('조사 시작 대기');
      showBriefing(true);
      return;
    }
    const navigation = performance.getEntriesByType('navigation')[0];
    const reload = navigation ? navigation.type === 'reload' : performance.navigation?.type === 1;
    const reading = reload ? readingBeforeReload() : null;
    let saved;
    try {
      saved = await api('state?caseId=' + encodeURIComponent(caseId));
    } catch (error) {
      if (error.code !== 'CASE_NOT_FOUND') throw error;
      waitingForFirstVisit = true;
      try {
        localStorage.setItem(key + '.unopened', caseId);
      } catch {}
      status('조사 시작 대기');
      showBriefing(true);
      return;
    }
    state = reload && !reading && !saved.ending ? await api('open', { visitId }) : saved;
    activeTab = 'evidence';
    if (reading === 'briefing') showBriefing(false);
    else if (reading === 'guide') showGuide();
    else rememberReading(null);
  } catch {
    status('연결 확인 필요', true);
    $('#ledger-body').innerHTML =
      '<div class="empty-compare"><h3>기록실에 연결할 수 없습니다</h3><p>연결을 확인한 뒤 수조 영상을 다시 요청하세요.</p><button class="text-action" data-action="retry">다시 연결</button></div>';
  } finally {
    busy = false;
    if (state) render();
  }
}
let pendingCapture;
async function navigateRound(targetRound, trigger) {
  if (!state || busy || targetRound < 1 || targetRound > maxRound() || targetRound === state.round)
    return;
  const data = { round: state.round, targetRound, revision: state.revision };
  await mutate(
    () => api('navigate', data),
    () => {
      toast(`${pad(state.round)}회차 영상을 열었습니다.`);
    },
  );
  if (!$('#dialog').hasAttribute('open') && (trigger.hidden || trigger.disabled)) {
    const replacement = state.round === 1 ? $('#round-next') : $('#round-prev');
    if (!replacement.disabled) replacement.focus({ preventScroll: true });
  }
}
async function refresh() {
  if (!state || state.ending || busy) return;
  pendingCapture ||= uuid();
  await mutate(
    () => api('open', { visitId: pendingCapture }),
    () => {
      visitId = pendingCapture;
      pendingCapture = undefined;
      activeTab = 'evidence';
      $('#image-area').classList.remove('changed');
      void $('#image-area').offsetWidth;
      $('#image-area').classList.add('changed');
      toast(`${pad(state.round)}회차 수신 완료. 같은 지점을 다시 조사하세요.`);
    },
  );
}
async function restart() {
  if (busy) return;
  const nextId = uuid();
  const nextVisit = uuid();
  await mutate(
    () => api('open', { caseId: nextId, visitId: nextVisit }),
    () => {
      caseId = nextId;
      visitId = nextVisit;
      selectedTestimony = '';
      activeTab = 'evidence';
      pendingCapture = undefined;
      try {
        localStorage.setItem(key, caseId);
      } catch {
        persisted = false;
      }
      closeDialog();
      window.scrollTo({ top: 0, behavior: 'auto' });
      toast('첫 회차의 기록을 다시 열었습니다.');
    },
  );
}
$('#dialog-content').addEventListener('submit', (e) => {
  if (e.target.id !== 'trial-form') return;
  e.preventDefault();
  const [round, point] = $('#evidence-choice').value.split('/');
  const choice = new FormData(e.target).get('choice');
  if (!round || !point || !choice) return;
  e.target.querySelector('[type=submit]').disabled = true;
  const payload = {
    round: state.round,
    choice,
    evidence: { round: Number(round), point },
    testimonyId: $('#testimony-choice')?.value || null,
  };
  mutate(() => api('verdict', payload), showEnding).finally(() => {
    const btn = $('#trial-form [type=submit]');
    if (btn) btn.disabled = false;
  });
});
async function toggleExpand() {
  const monitor = $('#monitor');
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  if (monitor.classList.contains('immersive')) {
    monitor.classList.remove('immersive');
    $('#expand').setAttribute('aria-label', '모니터 확대');
    return;
  }
  if (monitor.requestFullscreen) {
    try {
      await monitor.requestFullscreen();
      return;
    } catch {}
  }
  monitor.classList.add('immersive');
  $('#expand').setAttribute('aria-label', '모니터 축소');
}
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? '모니터 축소' : '모니터 확대';
  $('#expand').setAttribute('aria-label', label);
  $('#expand').title = label;
});
$('#dismiss').addEventListener('click', closeDialog);
$('#dialog').addEventListener('click', (e) => {
  if (e.target === $('#dialog')) closeDialog();
});
$('#dialog').addEventListener('close', () => {
  if (!$('#dialog').hasAttribute('open')) {
    rememberReading(null);
    cleanupComparator();
    restoreDialogFocus();
  }
});
$('#dialog').addEventListener('cancel', (event) => {
  if ($('#dialog').dataset.view === 'intro' && !state) {
    event.preventDefault();
    beginFirst(false);
  }
});
$('#dialog-content').addEventListener('change', (e) => {
  if (e.target.id === 'testimony-choice') updateWitnessPreview();
});
$('#guide').addEventListener('click', showGuide);
$('#trial').addEventListener('click', showTrial);
$('#refresh').addEventListener('click', refresh);
$('#round-prev').addEventListener('click', (e) => navigateRound(state.round - 1, e.currentTarget));
$('#round-next').addEventListener('click', (e) => navigateRound(state.round + 1, e.currentTarget));
$('#round-latest').addEventListener('click', (e) => navigateRound(maxRound(), e.currentTarget));
$('#expand').addEventListener('click', toggleExpand);
const tabNames = ['evidence', 'compare', 'radio'];
tabNames.forEach((name) => $('#tab-' + name).addEventListener('click', () => setTab(name)));
$('.tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const index = tabNames.indexOf(activeTab);
  const target =
    e.key === 'Home'
      ? tabNames[0]
      : e.key === 'End'
        ? tabNames[tabNames.length - 1]
        : tabNames[(index + (e.key === 'ArrowLeft' ? -1 : 1) + tabNames.length) % tabNames.length];
  setTab(target);
  $(`#tab-${target}`).focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#monitor').classList.remove('immersive');
  if ($('#dialog').classList.contains('legacy-dialog')) {
    if (e.key === 'Escape') {
      closeDialog();
      e.preventDefault();
    }
    if (e.key === 'Tab') {
      const focusable = $$(
        '#dialog button:not(:disabled),#dialog select,#dialog input,#dialog summary,#dialog [tabindex="0"]',
      );
      const edge = e.shiftKey ? 0 : focusable.length - 1;
      if (document.activeElement === focusable[edge]) {
        e.preventDefault();
        focusable[e.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    }
  }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.point) inspectPoint(b.dataset.point);
  else if (b.dataset.question) askQuestion(b.dataset.question);
  else if (b.dataset.transcript) showTranscript(b.dataset.transcript);
  else if (b.dataset.adopt) {
    chooseTestimony(selectedTestimony === b.dataset.adopt ? '' : b.dataset.adopt);
    closeDialog();
    setTab('radio');
    toast(
      selectedTestimony ? '최종 심리에 제출할 증언을 지정했습니다.' : '증언 지정을 해제했습니다.',
    );
  } else if (b.dataset.record) inspectPoint(b.dataset.record, true);
  else if (b.dataset.comparison !== undefined) showCompare(Number(b.dataset.comparison));
  else if (b.dataset.action === 'inspect-current') inspectPoint(b.dataset.pointId);
  else if (b.dataset.action === 'refresh') refresh();
  else if (b.dataset.action === 'return-evidence') setTab('evidence');
  else if (b.dataset.action === 'start-trace') beginFirst(true);
  else if (b.dataset.action === 'start-browse') beginFirst(false);
  else if (b.dataset.action === 'briefing') showBriefing(false);
  else if (b.dataset.action === 'guide') showGuide();
  else if (b.dataset.action === 'retry') start();
  else if (b.dataset.action === 'retry-operation') retryOperation?.();
  else if (b.dataset.action === 'close') closeDialog();
  else if (b.dataset.action === 'restart') restart();
});
start();
