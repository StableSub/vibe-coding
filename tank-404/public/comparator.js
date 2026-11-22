const fullTankSpots = [
  { label: '금붕어가 있던 자리', x: 0.58, y: 0.38, zoom: 2 },
  { label: '배수구', x: 0.85, y: 0.78, zoom: 3 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const magnifications = [1, 1.5, 2, 3, 4];

export function mountComparator(container, {
  before = { src: '/art/tank-original.webp', label: '첫 번째 필름' },
  after = { src: '/art/tank-revised.webp', label: '두 번째 필름' },
  spots = fullTankSpots,
  caption = '같은 시각에 찍힌 두 프레임에서 금붕어가 있던 자리를 살펴보세요.',
} = {}) {
  const root = document.createElement('section');
  root.className = 'film-comparator';
  root.setAttribute('aria-label', '필름 대조기');
  root.innerHTML = `
    <div class="fc-labels"><span></span><span></span></div>
    <div class="fc-stage" tabindex="0" role="group" aria-label="확대 관찰 화면">
      <div class="fc-layer"><img alt="" draggable="false"></div>
      <div class="fc-layer fc-before"><img alt="" draggable="false"></div>
      <button type="button" class="fc-split" role="slider" aria-label="두 필름의 대조 경계선"
        aria-valuemin="0" aria-valuemax="100" aria-orientation="horizontal">
        <span aria-hidden="true"><i></i><i></i></span>
      </button>
      <span class="fc-loading" role="status" hidden></span>
    </div>
    <div class="fc-toolbar">
      <div class="fc-jumps" role="group" aria-label="관찰 위치">
        <button type="button" data-reset>전체</button>
      </div>
      <div class="fc-optics" role="group" aria-label="확대 배율">
        <button type="button" data-less aria-label="축소">−</button>
        <output aria-label="현재 배율" aria-live="off"></output>
        <button type="button" data-more aria-label="확대">+</button>
      </div>
    </div>
    <p class="fc-hint"></p>
    <p class="fc-caption"></p>`;
  container.replaceChildren(root);
  const pick = selector => root.querySelector(selector);
  const stage = pick('.fc-stage');
  const splitControl = pick('.fc-split');
  const beforeImage = pick('.fc-before img');
  const afterImage = pick('.fc-layer img');
  const buttons = [pick('[data-reset]')];
  const signalOwner = new AbortController();
  const on = (element, event, run) => element.addEventListener(event, run, { signal: signalOwner.signal });
  const labels = root.querySelectorAll('.fc-labels span');
  labels[0].textContent = before.label;
  labels[1].textContent = after.label;
  pick('.fc-caption').textContent = caption;
  pick('.fc-caption').hidden = !caption;

  let zoom = 1;
  let split = 0.55;
  let cx = 0.5;
  let cy = 0.5;
  let activeSpot = 0;
  let drag = null;
  let loaded = 0;
  const errors = [];
  const status = pick('.fc-loading');
  status.textContent = '필름을 불러오는 중…';
  status.hidden = false;
  for (const [image, film] of [[beforeImage, before], [afterImage, after]]) {
    on(image, 'load', () => {
      loaded++;
      if (loaded === 2 && !errors.length) status.hidden = true;
    });
    on(image, 'error', () => {
      errors.push(film.label);
      status.textContent = errors.join(', ') + ' 필름을 불러올 수 없습니다.';
      status.hidden = false;
    });
    image.src = film.src;
  }

  function render() {
    const halfVisible = 0.5 / zoom;
    cx = clamp(cx, halfVisible, 1 - halfVisible);
    cy = clamp(cy, halfVisible, 1 - halfVisible);
    root.style.setProperty('--fc-x', (0.5 - zoom * cx) * 100 + '%');
    root.style.setProperty('--fc-y', (0.5 - zoom * cy) * 100 + '%');
    root.style.setProperty('--fc-zoom', zoom);
    root.style.setProperty('--fc-split', split * 100 + '%');
    root.dataset.zoomed = String(zoom > 1);
    const percent = Math.round(split * 100);
    splitControl.setAttribute('aria-valuenow', String(percent));
    splitControl.setAttribute('aria-valuetext', before.label + ' ' + percent + '%, ' + after.label + ' ' + (100 - percent) + '%');
    pick('output').textContent = zoom.toFixed(1) + '×';
    pick('[data-less]').disabled = zoom === magnifications[0];
    pick('[data-more]').disabled = zoom === magnifications[magnifications.length - 1];
    buttons.forEach((button, n) => button.setAttribute('aria-pressed', String(n === activeSpot)));
    pick('.fc-hint').textContent = zoom > 1
      ? '화면을 끌거나 방향키로 이동하세요. 경계선의 손잡이로 필름을 대조하세요.'
      : '경계선을 밀어 겹쳐 보세요. 손잡이를 선택하면 좌우 방향키로도 움직일 수 있습니다.';
  }

  function chooseSpot(index, x, y, targetZoom) {
    activeSpot = index;
    cx = x;
    cy = y;
    zoom = targetZoom;
    render();
  }
  on(buttons[0], 'click', () => chooseSpot(0, 0.5, 0.5, 1));
  spots.forEach((spot, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = spot.label;
    pick('.fc-jumps').append(button);
    buttons.push(button);
    on(button, 'click', () => chooseSpot(index + 1, spot.x, spot.y, spot.zoom));
  });
  function changeZoom(direction) {
    zoom = magnifications[clamp(magnifications.indexOf(zoom) + direction, 0, magnifications.length - 1)];
    activeSpot = zoom === 1 ? 0 : -1;
    render();
  }
  on(pick('[data-less]'), 'click', () => changeZoom(-1));
  on(pick('[data-more]'), 'click', () => changeZoom(1));

  on(stage, 'pointerdown', event => {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    const isSplit = event.target.closest('.fc-split') || zoom === 1;
    const bounds = stage.getBoundingClientRect();
    drag = { id: event.pointerId, isSplit, x: event.clientX, y: event.clientY, cx, cy, bounds };
    (isSplit ? splitControl : stage).focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    if (isSplit) {
      split = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      render();
    }
    stage.classList.add('fc-dragging');
    if (event.pointerType === 'mouse') event.preventDefault();
  });
  on(stage, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const { bounds } = drag;
    if (drag.isSplit) split = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    else {
      cx = drag.cx - (event.clientX - drag.x) / (bounds.width * zoom);
      cy = drag.cy - (event.clientY - drag.y) / (bounds.height * zoom);
      activeSpot = -1;
    }
    render();
  });
  const finishDrag = event => {
    if (event.pointerId !== drag?.id) return;
    drag = null;
    stage.classList.remove('fc-dragging');
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) on(stage, name, finishDrag);

  on(stage, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    const step = event.shiftKey ? 0.1 : 0.02;
    if (key === '+' || key === '=') changeZoom(1);
    else if (key === '-') changeZoom(-1);
    else if (event.target === splitControl || zoom === 1) {
      if (key === 'Home') split = 0;
      else if (key === 'End') split = 1;
      else if (key === 'ArrowLeft') split = clamp(split - step, 0, 1);
      else if (key === 'ArrowRight') split = clamp(split + step, 0, 1);
      else return;
      render();
    } else {
      if (key === 'ArrowLeft') cx -= step / zoom;
      else if (key === 'ArrowRight') cx += step / zoom;
      else if (key === 'ArrowUp') cy -= step / zoom;
      else if (key === 'ArrowDown') cy += step / zoom;
      else return;
      activeSpot = -1;
      render();
    }
    event.preventDefault();
    event.stopPropagation();
  });
  render();
  return () => {
    signalOwner.abort();
    root.remove();
  };
}
