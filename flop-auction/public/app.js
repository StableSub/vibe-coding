'use strict';

const $ = (s, within = document) => within.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const app = $('#app');
const dialog = $('#dialog');

const icons = {
  gavel: '<path d="m14 3 7 7-3 3-7-7zm-5 5 7 7-3 3-7-7zm5 7 7 6M3 21h9"/>',
  ticket:
    '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M15 7v2m0 2v2m0 2v2"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  bean: '<path d="M8 20c-4 0-6-4-4-8 1-2 4-3 6-5 2-1 2-4 5-4 4 0 7 4 6 8-1 5-7 9-13 9Z"/><path d="M8 16c3-1 6-3 8-7"/>',
  stack: '<path d="m3 8 9-5 9 5-9 5zm1 5 8 4 8-4m-16 4 8 4 8-4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  photo:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  pencil: '<path d="m5 15 11-11 4 4L9 19l-5 1zM13 7l4 4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zm3 5h8m-8 4h8m-8 4h5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/>',
};
const icon = (name) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const pad = (n) => String(n).padStart(2, '0');
const catalog = [
  {
    kind: 'umbrella',
    title: '절대 잃어버리지 않는 우산',
    tag: '우천 용품',
    copy: '평생 곁에 두실 단 하나의 우산입니다. 비 오는 날의 동반자를 찾습니다.',
    src: '/art/umbrella.webp',
  },
  {
    kind: 'hearing',
    title: '박수 치면 꺼지는 보청기',
    tag: '음향 기기',
    copy: '박수 한 번에 반응하는 기특한 보청기. 박수 칠 일이 많은 분께 권합니다.',
    src: '/art/hearing-aid.webp',
  },
  {
    kind: 'clock',
    title: '지각 전용 알람시계',
    tag: '생활 시계',
    copy: '아침마다 단 한 번, 누구보다 당당한 소리로 기상을 선언합니다.',
    src: '/art/alarm-clock.webp',
  },
];
const artFor = (lot) => {
  if (
    typeof lot?.photo === 'string' &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(lot.photo)
  )
    return lot.photo;
  return catalog.find((c) => c.kind === lot?.kind)?.src || '/art/unphotographed.webp';
};
const money = (n) => `${Number(n) || 0}콩`;
const key = 'flop-auction.room.v1';
const nameKey = 'flop-auction.name';
const serverPath = location.pathname;
let room = null,
  session = null,
  lastView = '',
  slide = 0,
  timeOffset = 0,
  requestBusy = false,
  poller,
  clockTimer,
  lastPoll = false,
  pollToken = 0,
  noticeTimer;
let bidDirty = false,
  pendingEntry = null,
  chosenPhoto = null,
  photoPending = false,
  photoTask = 0,
  dialogType = '',
  entryMode = '';
function saved(store, k) {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
}
function put(store, k, v) {
  try {
    v === null ? store.removeItem(k) : store.setItem(k, v);
  } catch {}
}
function sessionInfo() {
  try {
    const s = JSON.parse(saved(sessionStorage, key) || saved(localStorage, key) || 'null');
    return s && /^[A-Z0-9]{6}$/.test(s.code) && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}
function remember(s) {
  session = s;
  put(sessionStorage, key, s && JSON.stringify(s));
  put(localStorage, key, s && JSON.stringify(s));
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
function note(message) {
  const el = $('#notice');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('visible'), 3600);
}
function showDialog(type, html) {
  dialogType = type;
  $('#dialog-content').innerHTML = html;
  dialog.dataset.view = type;
  if (!dialog.open) dialog.showModal();
  else $('#dismiss').focus({ preventScroll: true });
}
function closeDialog() {
  if (dialog.open) dialog.close();
}
function showError(message) {
  const holder = dialog.open ? $('#dialog-content .error-message') : $('#screen-error');
  if (holder) {
    holder.textContent = message;
    holder.hidden = false;
  } else note(message);
}
const errBox = '<p class="error-message" role="alert" hidden></p>';
function pageHeading(kicker, title, description = '') {
  return `<div class="page-heading"><div class="mini-label">${esc(kicker)}</div><h1>${esc(title)}</h1>${description ? `<p>${esc(description)}</p>` : ''}</div>`;
}
function setNav(inRoom) {
  $('#nav').innerHTML = inRoom
    ? `<button data-act="rules">${icon('help')} 이용 방법</button><button class="nav-ticket" data-act="leave">경매장 홈</button>`
    : `<button class="catalog-nav" data-act="catalog">경매 도록</button><button class="history-nav" data-act="history">지난 경매</button><button data-act="rules">이용 방법</button><button class="nav-ticket" data-act="join">${icon('ticket')} 방 코드로 참가</button>`;
}
function renderLanding() {
  lastView = 'landing';
  setNav(false);
  document.title = '망한 발명품 경매장';
  app.innerHTML = `<div class="wrap landing">
 <section class="hero" aria-labelledby="hero-title">
 <div class="hero-copy"><div class="sale-kicker"><span class="printed-line"></span>별난 물건 공개 경매</div>
 <h1 id="hero-title">망한 발명품<br> 경매장<span class="red-stamp">하자 있음</span></h1>
 <p class="hook">설명은 그럴싸합니다.<br> 하자는 낙찰 후에 공개합니다.</p>
 <p class="hero-lede">100콩을 들고 세 번의 경매에 뛰어드세요. 누가 가장 기막힌 망작을 건져 올릴까요?</p>
 <div class="hero-buttons"><button class="primary" data-act="solo">${icon('gavel')} 혼자 체험하기</button><button class="secondary" data-act="create">${icon('people')} 방 만들기</button></div>
 <div class="hero-meta"><span>${icon('bean')} 시작 자금 <b>100콩</b></span><span>${icon('clock')} 입찰 <b>45초</b></span><span>${icon('stack')} 총 <b>3라운드</b></span></div>
 </div>
 <figure class="hero-figure"><div class="art-frame"><img id="featured-art" src="${catalog[slide].src}" alt="${esc(catalog[slide].title)}" fetchpriority="high"></div>
 <figcaption><div><small id="lot-code">LOT ${pad(slide + 1)} <i>/</i> ${catalog[slide].tag}</small><h2 id="lot-name">${catalog[slide].title}</h2></div><div class="plate-turn"><button data-act="prev-art" aria-label="이전 출품작">${icon('chevron')}</button><button data-act="next-art" aria-label="다음 출품작">${icon('chevron')}</button></div></figcaption></figure></section>
 <section class="catalog" id="catalog"><div class="catalog-head"><div><span class="mini-label">Auction catalogue</span><h2>이번 경매의 출품작</h2></div><span class="total">기본 출품작 3점</span></div><div class="catalog-grid">
 ${catalog.map((c, i) => `<button class="catalog-item" data-detail="${i}"><div class="catalog-art"><img loading="lazy" src="${c.src}" alt=""></div><span class="catalog-card-body"><span class="lot-no">LOT ${pad(i + 1)}</span><strong>${c.title}</strong><span class="tag">${c.tag}</span></span></button>`).join('')}
 </div></section></div>`;
}
function changeArt(step) {
  slide = (slide + step + catalog.length) % catalog.length;
  const current = catalog[slide];
  $('#featured-art').src = current.src;
  $('#featured-art').alt = current.title;
  $('#lot-code').innerHTML = `LOT ${pad(slide + 1)} <i>/</i> ${current.tag}`;
  $('#lot-name').textContent = current.title;
}
function rules() {
  showDialog(
    'rules',
    `<div class="mini-label">이용 방법</div><h2 id="dialog-title">하자 있는 경매의 규칙</h2>
 <ol class="rules-list"><li><b>100콩을 받고 입장하세요.</b><p>혼자서는 자동 입찰자와, 친구와는 최대 세 명이 한 방에서 겨룹니다.</p></li><li><b>발명품을 한 점 출품할 수 있어요.</b><p>공개 설명과 낙찰 뒤 공개할 하자를 따로 적으세요. 빈자리는 경매장 소장품으로 채웁니다.</p></li><li><b>45초 안에 가격을 부르세요.</b><p>현재가보다 1콩 이상 높게 입찰하세요. 가장 높은 값을 부른 사람만 콩을 냅니다. 판매자에게 콩이 지급되지는 않습니다.</p></li><li><b>최고의 망작에 투표하세요.</b><p>세 라운드가 끝나면 영수증을 살펴보고, 낙찰 여부와 상관없이 한 점을 고릅니다.</p></li></ol>
 <button class="primary wide" data-act="dismiss">알겠습니다</button>`,
  );
}
function showDetail(index) {
  const c = catalog[index];
  if (!c) return;
  showDialog(
    'catalog-detail',
    `<div class="mini-label">경매 도록 / LOT ${pad(index + 1)}</div><h2 id="dialog-title">${esc(c.title)}</h2><img class="dialog-art" src="${c.src}" alt="${esc(c.title)}"><p class="dialog-copy">${esc(c.copy)}</p><div class="sealed-line">${icon('lock')} 하자는 낙찰 후 공개합니다.</div><button class="primary wide" data-act="dismiss">도록으로 돌아가기</button>`,
  );
}
function entryForm(mode, code = '') {
  entryMode = mode;
  pendingEntry = null;
  const join = mode === 'join';
  const title = join ? '방 코드로 참가' : '친구 경매방 만들기';
  showDialog(
    'entry',
    `<div class="mini-label">경매장 입장</div><h2 id="dialog-title">${title}</h2><p class="dialog-copy">${join ? '방장에게 받은 여섯 자리 코드를 입력하세요.' : '방을 만들면 친구에게 보낼 초대 코드가 생깁니다.'}</p>
 <form id="entry-form">${join ? `<label for="room-code">방 코드</label><input id="room-code" name="code" required minlength="6" maxlength="6" value="${esc(code)}" placeholder="예: A2B3C4" autocomplete="off" autocapitalize="characters" spellcheck="false">` : ''}
 <label for="name">입찰자 이름</label><input id="name" name="name" required maxlength="12" value="${esc(saved(localStorage, nameKey) || '')}" placeholder="예: 중고장인" autocomplete="nickname">
 ${errBox}<button class="primary wide" type="submit">${join ? '경매방 입장' : '방 만들기'}</button></form>`,
  );
}
function roomBanner() {
  return `<div class="room-ribbon"><span>${icon('ticket')} 방 코드 <button data-act="copy-code" title="방 코드 복사">${esc(room.code)} ${icon('copy')}</button></span><span class="your-wallet">${icon('bean')} ${esc(room.me.name)} <b>${money(room.me.balance)}</b></span><span id="connected" role="status"></span></div>`;
}
function lobby() {
  app.innerHTML = `<div class="wrap interior">${roomBanner()}${pageHeading('출품 접수', '경매 대기실', '참가자마다 한 점씩 출품할 수 있습니다. 준비되면 방장이 경매를 시작합니다.')}
 <div class="waiting-grid"><section class="exhibit-panel" id="my-exhibit"></section><aside class="room-aside"><div class="paper-box"><div class="section-cap"><h2>오늘의 입찰자</h2><span id="population"></span></div><ul id="players" class="player-list"></ul><button class="secondary wide" data-act="invite">${icon('copy')} 친구 초대 링크 복사</button></div>
 <div class="start-box"><b>경매 준비</b><p>출품이 세 점보다 적으면 경매장 소장품을 함께 올립니다.</p>${room.me.isHost ? `<button class="primary wide" data-act="start">${icon('gavel')} 경매 시작</button>` : `<div class="waiting-label">방장이 경매를 시작할 때까지 기다려 주세요.</div>`}</div></aside></div><p id="screen-error" class="error-message" role="alert" hidden></p></div>`;
  updateLobby();
}
function updateLobby() {
  if (!$('#my-exhibit')) return;
  const item = room.myItem;
  $('#my-exhibit').innerHTML = item
    ? `<div class="section-cap"><h2>내 출품작</h2><span class="seal-sm">접수 완료</span></div><img class="item-photo" src="${artFor(item)}" alt="${esc(item.title)}"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><div class="sealed-line">${icon('lock')} 내 비공개 하자 <b>${esc(item.flaw)}</b></div><button class="secondary" data-act="item">${icon('pencil')} 출품 정보 수정</button>`
    : `<div class="section-cap"><h2>내 출품작</h2><span>1인 1점</span></div><div class="empty-lot"><img src="/art/unphotographed.webp" alt="천으로 가려진 출품 물건"><div><h3>어떤 망작을 내놓을까요?</h3><p>팔고 싶은 발명품의 설명과 숨겨 둔 하자를 적어 주세요.</p></div></div><button class="secondary" data-act="item">${icon('pencil')} 발명품 출품하기</button>`;
  $('#population').textContent = `${room.players.length} / 3명`;
  $('#players').innerHTML = room.players
    .map(
      (person) =>
        `<li><span class="avatar">${esc(Array.from(person.name)[0])}</span><span><b>${esc(person.name)}</b><small>${person.id === room.hostId ? '방장' : person.isBot ? '자동 입찰자' : '참가자'}${person.id === room.me.id ? ' · 나' : ''}</small></span><em>${person.hasItem ? '출품 완료' : '출품 대기'}</em></li>`,
    )
    .join('');
}
function itemForm() {
  const item = room.myItem || {};
  chosenPhoto = item.photo || null;
  showDialog(
    'item',
    `<div class="mini-label">출품 접수 전표</div><h2 id="dialog-title">${room.myItem ? '출품 정보 수정' : '발명품 출품하기'}</h2><form id="item-form">
 <label for="item-title">발명품 이름</label><input id="item-title" name="title" value="${esc(item.title || '')}" required maxlength="32" placeholder="예: 저절로 풀리는 운동화 끈">
 <label for="item-desc">판매 설명 <small>모두에게 공개</small></label><textarea id="item-desc" name="description" required maxlength="140" rows="2" placeholder="판매자가 자랑하고 싶은 기능">${esc(item.description || '')}</textarea>
 <label for="item-flaw">숨은 하자 <small>낙찰 후 공개</small></label><textarea id="item-flaw" name="flaw" required maxlength="140" rows="2" placeholder="구매자가 뒤늦게 알게 될 비밀">${esc(item.flaw || '')}</textarea>
 <label for="photo">발명품 사진 <small>선택</small></label><div class="photo-row"><img id="photo-preview" src="${chosenPhoto ? artFor(item) : '/art/unphotographed.webp'}" alt="출품 사진 미리보기"><div><input type="file" id="photo" accept="image/jpeg,image/png,image/webp"><button class="text-button" type="button" data-act="remove-photo" ${chosenPhoto ? '' : 'hidden'}>사진 빼기</button><small id="photo-status">JPG, PNG 또는 WebP</small></div></div>
 ${errBox}<button class="primary wide" type="submit">출품작 등록</button></form>`,
  );
}
async function convertPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('JPG, PNG, WebP 사진을 선택해 주세요.');
  if (file.size > 24 * 1024 * 1024) throw Error('24MB 이하 사진을 선택해 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw Error('사진을 읽을 수 없습니다.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (const limit of [800, 620, 480, 340, 220, 150]) {
      const r = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * r));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * r));
      ctx.fillStyle = '#f4efe1';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.62, 0.45]) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= 65000) return result;
      }
    }
    throw Error('압축 후에도 사진이 큽니다. 작은 사진을 선택해 주세요.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function previewPhoto(file) {
  const current = ++photoTask;
  photoPending = true;
  $('#photo-status').textContent = '사진 준비 중…';
  $('#item-form button[type=submit]').disabled = true;
  try {
    const image = await convertPhoto(file);
    if (current !== photoTask || dialogType !== 'item') return;
    chosenPhoto = image;
    $('#photo-preview').src = image;
    $('#photo-status').textContent = '사진 준비 완료';
    $('[data-act=remove-photo]').hidden = false;
    $('#item-form .error-message').hidden = true;
  } catch (error) {
    if (current === photoTask && dialogType === 'item') {
      showError(error.message);
      $('#photo').value = '';
      $('#photo-status').textContent = '다른 사진을 고를 수 있습니다.';
    }
  } finally {
    if (current === photoTask) {
      photoPending = false;
      const submit = $('#item-form button[type=submit]');
      if (submit) submit.disabled = false;
    }
  }
}
function auction() {
  const lot = room.lot;
  app.innerHTML = `<div class="wrap interior">${roomBanner()}<div class="lot-heading"><div><span class="mini-label">실시간 경매</span><h1>${esc(lot.title)}</h1></div><span class="round-index">${pad(room.lotIndex + 1)} <i>/</i> ${pad(room.totalLots)}</span></div>
 <div class="sale-grid"><section class="sale-exhibit"><img src="${artFor(lot)}" alt="${esc(lot.title)}"><div class="sale-caption"><span class="lot-no">LOT ${pad(room.lotIndex + 1)}</span><span>출품 ${esc(lot.sellerName || '경매장')}</span></div><h2>판매자의 설명</h2><p class="desc">${esc(lot.description)}</p><div class="sealed-line">${icon('lock')} 하자 기록은 낙찰 전까지 봉인됩니다.</div></section>
 <section class="bid-ticket" id="bid-ticket"><div class="ticket-top"><h2 id="bid-title" tabindex="-1">입찰 전표</h2><span class="timer" id="timer" role="timer">${icon('clock')} <b>00:45</b></span></div><div class="current"><small>현재 입찰가</small><strong id="price"></strong><span id="leader"></span></div>
 <form id="bid-form"><label for="bid-input">내 입찰 금액</label><div class="bid-input"><input id="bid-input" name="amount" type="number" min="1" step="1" inputmode="numeric" required><b>콩</b></div><div class="increments"><button type="button" data-add="1">현재가 +1콩</button><button type="button" data-add="5">+5콩</button><button type="button" data-add="10">+10콩</button></div><button class="primary red wide" id="bid-btn" type="submit">${icon('gavel')} 입찰하기</button><p id="bid-hint" class="hint"></p></form>
 <div class="bids"><h3>입찰 기록</h3><ul id="bid-history"></ul></div>${room.me.isHost ? '<button class="text-button host-end" data-act="early-close">방장 권한으로 조기 마감</button>' : ''}<p id="screen-error" class="error-message" role="alert" hidden></p></section></div></div>`;
  app
    .querySelector('.interior')
    .insertAdjacentHTML(
      'beforeend',
      '<aside class="mobile-bid-dock" id="bid-dock" aria-label="현재 경매 요약"><div><small>현재가</small><b id="dock-price"></b></div><div><small>남은 시간</small><b id="dock-time"></b></div><button class="primary" data-act="jump-bid">입찰 전표 보기</button></aside>',
    );
  bidDirty = false;
  updateAuction();
}
function updateAuction() {
  if (!$('#bid-input') || !room?.lot) return;
  const lot = room.lot,
    min = (lot.highestBid || 0) + 1,
    balance = room.me.balance;
  $('#price').innerHTML = `${lot.highestBid || 0}<em>콩</em>`;
  $('#leader').textContent = lot.bidderId
    ? `최고 입찰자 ${lot.bidderName}${lot.bidderId === room.me.id ? ' (나)' : ''}`
    : '아직 첫 입찰을 기다리는 중입니다.';
  const input = $('#bid-input');
  input.min = min;
  input.max = balance;
  if (!bidDirty) input.value = Math.min(balance, min);
  $('#bid-history').innerHTML = lot.bids.length
    ? lot.bids
        .slice(0, 12)
        .map((b) => `<li><span>${esc(b.name)}</span><b>${money(b.amount)}</b></li>`)
        .join('')
    : '<li class="muted">아직 입찰 기록이 없습니다.</li>';
  updateTimer();
}
function updateTimer() {
  if (!room || room.phase !== 'auction' || !$('#timer')) return;
  const seconds = Math.max(0, Math.ceil((room.endsAt - Date.now() - timeOffset) / 1000));
  $('#timer b').textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  $('#dock-time').textContent = $('#timer b').textContent;
  $('#dock-price').textContent = money(room.lot.highestBid);
  const bidRect = $('#bid-btn').getBoundingClientRect();
  $('#bid-dock').hidden = bidRect.top >= 0 && bidRect.bottom <= window.innerHeight;
  $('#timer').classList.toggle('urgent', seconds <= 10);
  const own = room.lot.bidderId === room.me.id,
    poor = room.me.balance <= (room.lot.highestBid || 0);
  $('#bid-btn').disabled = requestBusy || !seconds || own || poor;
  $('#bid-hint').textContent =
    seconds === 0
      ? '입찰이 끝났습니다. 낙찰 결과를 확인하고 있습니다.'
      : own
        ? '현재 내가 최고 입찰자입니다.'
        : poor
          ? '보유한 콩으로 현재가를 넘길 수 없습니다.'
          : `사용 가능 ${money(room.me.balance)} · 최소 ${money((room.lot.highestBid || 0) + 1)}`;
}
function reveal() {
  const lot = room.lot,
    receipt = room.receipts.find((r) => r.lotIndex === room.lotIndex) || {};
  app.innerHTML = `<div class="wrap interior">${roomBanner()}<div class="lot-heading"><div><div class="mini-label">낙찰 후 하자 공개</div><h1>${receipt.winnerId ? '낙찰됐습니다.' : '유찰됐습니다.'}</h1></div><span class="round-index">${pad(room.lotIndex + 1)} <i>/</i> ${pad(room.totalLots)}</span></div>
 <div class="sale-grid"><section class="sale-exhibit"><img src="${artFor(lot)}" alt="${esc(lot.title)}"><div class="sale-caption"><span class="lot-no">LOT ${pad(room.lotIndex + 1)}</span><span>출품 ${esc(lot.sellerName || '경매장')}</span></div><h2>${esc(lot.title)}</h2><p>${esc(lot.description)}</p></section>
 <section class="reveal-ticket"><div class="section-cap"><h2>낙찰 명세</h2><span class="seal-sm">${receipt.winnerId ? '낙찰' : '유찰'}</span></div><dl class="receipt-lines"><div><dt>낙찰자</dt><dd>${esc(receipt.winnerName || '없음')}</dd></div><div><dt>낙찰가</dt><dd>${money(receipt.amount)}</dd></div></dl>
 <div class="defect"><small>${icon('lock')} 봉인 해제</small><h3>판매자가 숨긴 하자</h3><p>${esc(lot.flaw || receipt.flaw)}</p></div>
 ${room.me.isHost ? `<button class="primary wide" data-act="next">${room.lotIndex + 1 >= room.totalLots ? '최종 영수증 열기' : '다음 경매 열기'}</button>` : '<p class="waiting-label">방장이 다음 화면을 열 때까지 기다려 주세요.</p>'}
 <p id="screen-error" class="error-message" role="alert" hidden></p></section></div></div>`;
}
function results() {
  app.innerHTML = `<div class="wrap interior">${roomBanner()}${pageHeading('거래 종료', '낙찰 영수증', '세 라운드의 거래 내역입니다. 가장 기막힌 발명품에 한 표를 주세요.')}
 <div class="result-grid">${room.receipts.map((r) => `<article class="receipt-card"><div class="receipt-head"><span class="lot-no">LOT ${pad(r.lotIndex + 1)}</span><span class="seal-sm">${r.winnerId ? '낙찰' : '유찰'}</span></div><img src="${artFor(r)}" alt="${esc(r.title)}"><h2>${esc(r.title)}</h2><dl class="receipt-lines"><div><dt>낙찰자</dt><dd>${esc(r.winnerName || '없음')}</dd></div><div><dt>낙찰가</dt><dd>${money(r.amount)}</dd></div></dl><p class="receipt-flaw"><small>밝혀진 하자</small>${esc(r.flaw)}</p><button class="vote-btn" id="vote-${r.lotIndex}" data-vote="${r.lotIndex}"></button></article>`).join('')}</div>
 <div class="result-end"><div><b>최고의 망작 투표</b><p id="vote-note"></p></div><div class="actions"><button class="secondary" data-act="history">지난 경매 검색</button><button class="secondary" data-act="leave">경매장 홈으로</button></div></div><p id="screen-error" class="error-message" role="alert" hidden></p></div>`;
  updateResults();
}
function updateResults() {
  room.receipts.forEach((r) => {
    const btn = $('#vote-' + r.lotIndex);
    if (!btn) return;
    const mine = room.myVote === r.lotIndex,
      count = room.votes.find((v) => v.lotIndex === r.lotIndex)?.count || 0;
    btn.innerHTML = `${icon(mine ? 'check' : 'ticket')} ${mine ? '내가 고른 망작' : '최고의 망작으로 투표'} <b>${count}표</b>`;
    btn.setAttribute('aria-pressed', String(mine));
  });
  $('#vote-note').textContent =
    room.myVote == null
      ? '낙찰받지 않은 물건에도 투표할 수 있습니다.'
      : '다른 작품을 선택하면 내 표가 이동합니다.';
}
const archiveKey = 'flop-auction.memberships.v1';
let memberships = [];
try {
  const parsed = JSON.parse(saved(localStorage, archiveKey) || '[]');
  if (Array.isArray(parsed))
    memberships = parsed.filter(
      (s) => s && /^[A-Z0-9]{6}$/.test(s.code) && typeof s.token === 'string',
    );
} catch {}
function trackRoom(finished) {
  if (!session) return;
  const record = memberships.find((s) => s.code === session.code && s.token === session.token);
  if (record) {
    if (!finished || record.finished) return;
    record.finished = true;
  } else memberships.unshift({ ...session, finished });
  put(localStorage, archiveKey, JSON.stringify(memberships));
}
let searchWork = 0;
function historyDialog() {
  showDialog(
    'history',
    `<div class="mini-label">낙찰 보관함</div><h2 id="dialog-title">지난 경매</h2><p class="dialog-copy">이 브라우저로 참여해 마친 경매에서 물건 이름을 찾아보세요.</p><form id="history-form" class="search-form"><label class="sr" for="history-query">낙찰품 이름</label><input type="search" id="history-query" name="query" maxlength="32" placeholder="물건 이름 검색"><button type="submit" class="secondary">검색</button></form><div id="history-results" aria-live="polite"></div>`,
  );
  searchHistory('');
}
async function searchHistory(query) {
  const id = ++searchWork,
    el = $('#history-results');
  if (!memberships.length) {
    el.innerHTML =
      '<p class="empty-history">아직 마친 경매가 없습니다. 세 라운드를 마치면 이곳에 영수증이 모입니다.</p>';
    return;
  }
  el.innerHTML = '<p>영수증을 찾는 중입니다.</p>';
  const found = [];
  let failed = 0;
  for (let i = 0; i < memberships.length; i += 4) {
    const chunk = memberships.slice(i, i + 4);
    const responses = await Promise.allSettled(
      chunk.map(async (s) => {
        if (!s.finished) {
          const existing = await api('state', { code: s.code }, s.token, 'GET');
          if (existing.phase !== 'results') return [];
          s.finished = true;
          put(localStorage, archiveKey, JSON.stringify(memberships));
        }
        return (await api('search', { code: s.code, q: query }, s.token, 'GET')).results;
      }),
    );
    responses.forEach((r, j) => {
      if (r.status === 'fulfilled')
        r.value.forEach((receipt) => found.push({ receipt, code: chunk[j].code }));
      else failed++;
    });
    if (id !== searchWork || dialogType !== 'history') return;
  }
  el.innerHTML =
    (found.length
      ? `<ul class="history-list">${found.map(({ receipt: r, code }) => `<li><img src="${artFor(r)}" alt=""><div><small>방 ${esc(code)} / LOT ${pad(r.lotIndex + 1)}</small><b>${esc(r.title)}</b><span>${esc(r.winnerName || '유찰')} · ${money(r.amount)}</span></div></li>`).join('')}</ul>`
      : `<p class="empty-history">${query ? '이 이름과 일치하는 물건이 없습니다.' : '보관된 물건이 없습니다.'}</p>`) +
    (failed
      ? '<p class="error-message">일부 경매방을 불러오지 못했습니다. 다시 검색해 주세요.</p>'
      : '');
}
async function api(action, data = {}, token = session?.token, method = 'POST') {
  const isGet = method === 'GET';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const params = isGet ? new URLSearchParams(data) : null;
  try {
    const response = await fetch('/api/' + action + (params ? '?' + params : ''), {
      method,
      cache: 'no-store',
      headers: {
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(isGet ? {} : { body: JSON.stringify({ ...data, ...(token ? { token } : {}) }) }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      const error = new Error(
        result?.error?.message || '경매장과 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
      error.status = response.status;
      error.code = result?.error?.code;
      throw error;
    }
    return result;
  } catch (error) {
    if (error.status) throw error;
    throw Error('경매장과 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
  } finally {
    clearTimeout(timeout);
  }
}
function connection(ok) {
  const state = $('#connected');
  if (!state) return;
  state.classList.toggle('offline', !ok);
  state.textContent = ok ? '연결됨' : '다시 연결하는 중';
}
function applyState(next, force = false) {
  if (!next || !next.me || !next.code) throw Error('경매방 정보를 읽을 수 없습니다.');
  if (room?.code === next.code && next.revision < room.revision) return;
  const old = room;
  const view = `${next.code}:${next.phase}:${next.lotIndex}`;
  const changed = force || lastView !== view;
  room = next;
  timeOffset = Number.isFinite(next.serverNow) ? next.serverNow - Date.now() : 0;
  if (changed) {
    if (dialog.open && !['rules', 'history'].includes(dialogType)) closeDialog();
    lastView = view;
    setNav(true);
    document.title = `${{ lobby: '경매 대기실', auction: '입찰 중', reveal: '하자 공개', results: '낙찰 영수증' }[room.phase]} · 망한 발명품 경매장`;
    if (room.phase === 'lobby') lobby();
    else if (room.phase === 'auction') auction();
    else if (room.phase === 'reveal') reveal();
    else if (room.phase === 'results') {
      trackRoom(true);
      results();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  } else if (old?.revision !== next.revision) {
    if (next.phase === 'lobby') updateLobby();
    else if (next.phase === 'auction') updateAuction();
    else if (next.phase === 'results') updateResults();
  }
  connection(true);
}
function stopPolling() {
  pollToken++;
  clearTimeout(poller);
  clearInterval(clockTimer);
  poller = undefined;
  clockTimer = undefined;
  lastPoll = false;
}
function schedulePoll(delay) {
  clearTimeout(poller);
  if (room && session) poller = setTimeout(poll, delay);
}
async function poll() {
  if (!room || !session) return;
  if (lastPoll || document.hidden) {
    schedulePoll(1500);
    return;
  }
  lastPoll = true;
  const token = pollToken,
    active = session;
  try {
    const next = await api('state', { code: active.code }, active.token, 'GET');
    if (token === pollToken && session === active) applyState(next);
  } catch {
    if (token === pollToken) connection(false);
  } finally {
    if (token === pollToken) {
      lastPoll = false;
      schedulePoll(room?.phase === 'auction' ? 850 : 1700);
    }
  }
}
function attach(data, token) {
  stopPolling();
  remember({ code: data.code, token });
  trackRoom(data.phase === 'results');
  room = null;
  history.replaceState(null, '', serverPath + '?room=' + encodeURIComponent(data.code));
  applyState(data, true);
  clockTimer = setInterval(updateTimer, 200);
  schedulePoll(700);
}
async function perform(action, payload = {}) {
  if (!room || requestBusy) return null;
  requestBusy = true;
  const active = session;
  const buttons = dialog.open ? Array.from(dialog.querySelectorAll('button[type=submit]')) : [];
  buttons.forEach((b) => (b.disabled = true));
  const err = dialog.open ? $('.error-message', dialog) : $('#screen-error');
  if (err) err.hidden = true;
  try {
    const next = await api(action, { code: active.code, ...payload }, active.token);
    if (session === active) {
      applyState(next);
      return next;
    }
    return null;
  } catch (error) {
    if (active === session) {
      showError(error.message);
      schedulePoll(20);
    }
    return null;
  } finally {
    requestBusy = false;
    buttons.forEach((b) => (b.disabled = false));
    updateTimer();
  }
}
async function enter(mode, name, code = '') {
  if (requestBusy) return;
  const cleanName = name.trim(),
    cleanCode = code.trim().toUpperCase();
  if (!cleanName || cleanName.length > 12) {
    showError('입찰자 이름을 1~12자로 입력해 주세요.');
    return;
  }
  if (mode === 'join' && !/^[A-Z0-9]{6}$/.test(cleanCode)) {
    showError('영문·숫자 여섯 자리 방 코드를 입력해 주세요.');
    return;
  }
  const fingerprint = mode + '|' + cleanName + '|' + cleanCode;
  if (!pendingEntry || pendingEntry.fingerprint !== fingerprint)
    pendingEntry = { fingerprint, token: uuid() };
  const token = pendingEntry.token;
  requestBusy = true;
  const button = dialog.open ? $('#dialog-content [type=submit]') : $('[data-act=solo]');
  if (button) button.disabled = true;
  try {
    let created;
    const previous =
      sessionInfo()?.code === cleanCode
        ? sessionInfo()
        : memberships.find((s) => s.code === cleanCode);
    if (mode === 'join' && previous) {
      created = await api('state', { code: cleanCode }, previous.token, 'GET');
      attach(created, previous.token);
    } else {
      created = await api(
        mode === 'join' ? 'join' : 'create',
        { name: cleanName, ...(mode === 'join' ? { code: cleanCode } : {}) },
        token,
      );
      attach(created, token);
    }
    put(localStorage, nameKey, cleanName);
    pendingEntry = null;
    closeDialog();
    if (mode === 'solo' && created.phase === 'lobby') {
      const started = await api('start', { code: created.code }, token);
      applyState(started);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    requestBusy = false;
    if (button?.isConnected) button.disabled = false;
    updateTimer();
  }
}
async function restore(s) {
  if (requestBusy) return;
  requestBusy = true;
  try {
    const data = await api('state', { code: s.code }, s.token, 'GET');
    attach(data, s.token);
  } catch (error) {
    if ([401, 403, 404].includes(error.status)) {
      if (sessionInfo()?.code === s.code) remember(null);
      memberships = memberships.filter(
        (member) => member.code !== s.code || member.token !== s.token,
      );
      put(localStorage, archiveKey, JSON.stringify(memberships));
      history.replaceState(null, '', serverPath + '?home=1');
    }
    renderLanding();
    note(error.message);
    if (![401, 403, 404].includes(error.status)) addResume(s);
  } finally {
    requestBusy = false;
  }
}
function addResume(s) {
  const hero = $('.hero-buttons');
  if (!hero || !s || $('#resume-room')) return;
  hero.insertAdjacentHTML(
    'afterend',
    `<button class="text-button resume-room" id="resume-room" data-act="resume" data-code="${esc(s.code)}">참여한 방 ${esc(s.code)} 다시 열기</button>`,
  );
}
function goHome() {
  if (requestBusy) return;
  const s = session || sessionInfo();
  stopPolling();
  closeDialog();
  room = null;
  session = null;
  history.replaceState(null, '', serverPath + '?home=1');
  renderLanding();
  if (s) addResume(s);
  window.scrollTo({ top: 0, behavior: 'auto' });
}
async function copyText(value, ok) {
  try {
    await navigator.clipboard.writeText(value);
    note(ok);
  } catch {
    showDialog(
      'copy',
      `<div class="mini-label">친구 초대</div><h2 id="dialog-title">초대 정보 복사</h2><p>아래 내용을 선택해 복사하세요.</p><input id="copy-value" readonly value="${esc(value)}"><button class="secondary wide" data-act="dismiss">닫기</button>`,
    );
    $('#copy-value').select();
  }
}
function initialize() {
  const s = sessionInfo(),
    query = new URLSearchParams(location.search),
    invite = (query.get('room') || '').toUpperCase();
  if (invite && invite !== s?.code) {
    const previous = memberships.find((member) => member.code === invite);
    if (previous) {
      restore(previous);
      return;
    }
    renderLanding();
    entryForm('join', invite);
    return;
  }
  if (s && !query.has('home')) {
    app.innerHTML = '<div class="wrap load">내 경매방에 다시 연결하는 중입니다.</div>';
    restore(s);
    return;
  }
  renderLanding();
  if (s) addResume(s);
}
document.addEventListener('click', async (event) => {
  const b = event.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.detail !== undefined) {
    showDetail(Number(b.dataset.detail));
    return;
  }
  if (b.dataset.add) {
    const input = $('#bid-input');
    if (input && room) {
      input.value = (room.lot.highestBid || 0) + Number(b.dataset.add);
      bidDirty = true;
      input.focus();
    }
    return;
  }
  if (b.dataset.vote !== undefined) {
    const val = Number(b.dataset.vote);
    if (room?.myVote !== val) {
      const result = await perform('vote', { lotIndex: val });
      if (result) note('내 표를 반영했습니다.');
    }
    return;
  }
  const a = b.dataset.act;
  if (a === 'catalog')
    $('#catalog')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  else if (a === 'rules') rules();
  else if (a === 'history') historyDialog();
  else if (a === 'prev-art') changeArt(-1);
  else if (a === 'next-art') changeArt(1);
  else if (a === 'create' || a === 'join') entryForm(a);
  else if (a === 'solo') enter('solo', saved(localStorage, nameKey) || '첫손님');
  else if (a === 'resume') {
    const last = sessionInfo();
    const s =
      last?.code === b.dataset.code
        ? last
        : memberships.find((member) => member.code === b.dataset.code);
    if (s) restore(s);
  } else if (a === 'leave') goHome();
  else if (a === 'dismiss') closeDialog();
  else if (a === 'copy-code') copyText(room.code, '방 코드를 복사했습니다.');
  else if (a === 'invite')
    copyText(location.origin + serverPath + '?room=' + room.code, '초대 링크를 복사했습니다.');
  else if (a === 'item') itemForm();
  else if (a === 'start') perform('start');
  else if (a === 'next') perform('next', { lotIndex: room.lotIndex });
  else if (a === 'jump-bid') {
    $('#bid-ticket').scrollIntoView({ block: 'start', behavior: 'auto' });
    $('#bid-title').focus({ preventScroll: true });
    updateTimer();
  } else if (a === 'early-close')
    showDialog(
      'close-lot',
      `<div class="mini-label">입찰 마감</div><h2 id="dialog-title">지금 입찰을 마감할까요?</h2><p class="dialog-copy">현재 최고가로 이 물건의 경매를 끝내고 숨은 하자를 공개합니다.</p>${errBox}<div class="actions"><button class="secondary" data-act="dismiss">계속 입찰</button><button class="primary" data-act="confirm-close">지금 마감</button></div>`,
    );
  else if (a === 'confirm-close') {
    const done = await perform('close', { lotIndex: room.lotIndex });
    if (done) closeDialog();
  } else if (a === 'remove-photo') {
    chosenPhoto = null;
    $('#photo-preview').src = '/art/unphotographed.webp';
    $('#photo').value = '';
    $('#photo-status').textContent = '사진을 뺐습니다.';
    b.hidden = true;
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  e.preventDefault();
  const values = new FormData(f);
  if (f.id === 'entry-form') {
    await enter(entryMode, String(values.get('name') || ''), String(values.get('code') || ''));
    return;
  }
  if (f.id === 'history-form') {
    await searchHistory(String(values.get('query') || '').trim());
    return;
  }
  if (f.id === 'item-form') {
    if (photoPending || requestBusy) return;
    const data = {
      title: String(values.get('title')).trim(),
      description: String(values.get('description')).trim(),
      flaw: String(values.get('flaw')).trim(),
      photo: chosenPhoto,
    };
    if (!data.title || !data.description || !data.flaw) {
      showError('이름, 판매 설명, 숨은 하자를 모두 입력해 주세요.');
      return;
    }
    const res = await perform('item', data);
    if (res) {
      closeDialog();
      note('발명품을 출품했습니다.');
    }
  }
  if (f.id === 'bid-form') {
    const amount = Number(values.get('amount'));
    if (
      !Number.isSafeInteger(amount) ||
      amount <= (room.lot.highestBid || 0) ||
      amount > room.me.balance
    ) {
      showError('현재가보다 높고 보유한 콩 이하인 금액을 입력해 주세요.');
      return;
    }
    const lot = room.lotIndex;
    const result = await perform('bid', { amount, lotIndex: lot });
    if (result) {
      bidDirty = false;
      updateAuction();
      note(`${money(amount)} 입찰을 등록했습니다.`);
    }
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'photo' && e.target.files[0]) previewPhoto(e.target.files[0]);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'bid-input') bidDirty = true;
  if (e.target.id === 'room-code') e.target.value = e.target.value.toUpperCase();
});
$('#dismiss').addEventListener('click', closeDialog);
dialog.addEventListener('click', (e) => {
  if (e.target === dialog && !requestBusy) closeDialog();
});
dialog.addEventListener('close', () => {
  if (!dialog.open) {
    dialogType = '';
    photoTask++;
    photoPending = false;
    searchWork++;
  }
});
$('#brand').addEventListener('click', (e) => {
  e.preventDefault();
  goHome();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && room) schedulePoll(0);
});
window.addEventListener('online', () => {
  if (room) schedulePoll(0);
});
initialize();
