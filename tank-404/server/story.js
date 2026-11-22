export const locations = {
  trace: {
    title: "금붕어 흔적",
    readings: [
      ["겹쳐진 꼬리", "02:14의 마지막 프레임에 금빛 꼬리가 두 겹으로 찍혀 있다. 두 윤곽 사이에서 기포 하나는 조금도 움직이지 않았다.", "error"],
      ["격리 수조의 반사", "꼬리의 두 번째 윤곽에 흰 숫자 405가 비친다. 수조 404의 유리에는 없는 번호다.", "erasure"],
      ["핀셋에 걸린 비늘", "화면을 되감자 꼬리 위를 지나가는 은빛 선이 보인다. 끝이 두 갈래인 이송용 핀셋에 비늘 한 장이 걸려 있다.", "erasure"],
      ["물길에 남은 금빛 선", "금빛 선이 바닥을 따라 배수망까지 이어진다. 선의 끝에서 비늘 하나가 물살에 들린다.", "escape"]
    ]
  },
  drain: {
    title: "배수구",
    readings: [
      ["젖은 배수망", "배수망에 풀린 나사 한 개와 젖은 실오라기가 걸려 있다. 실은 물이 빠져나가는 방향으로 누워 있다.", "escape"],
      ["안쪽으로 눌린 그물", "촘촘한 안전망 한 귀퉁이가 안쪽으로 접혀 있다. 그 틈으로 작은 비늘 두 장이 흘러간다.", "escape"],
      ["온전한 종이 봉인", "안전망을 가로질러 젖지 않은 종이 봉인이 붙어 있다. 봉인에 찍힌 시각은 바로 오늘 02:13이다.", "erasure"],
      ["거꾸로 흐르는 기포", "배수망에서 나온 기포가 바닥 아래로 가라앉는다. 녹화기의 역재생 표시는 꺼져 있다.", "error"]
    ]
  },
  clock: {
    title: "기록 시계",
    readings: [
      ["멈춘 14초", "화면 시계가 02:14:14에서 멈췄다. 녹음에는 초침이 한 바퀴 더 도는 소리가 남았다.", "error"],
      ["중복된 프레임 번호", "02:14:14가 찍힌 서로 다른 두 장면에 같은 일련번호가 붙어 있다. 두 번째 장면에는 금붕어의 그림자가 없다.", "error"],
      ["수기로 바뀐 수량", "타임코드 바로 아래 정정 기록이 한 줄 떠오른다. ‘404 · 한 마리 → 영 마리.’ 승인자는 야간 당직자다.", "erasure"],
      ["이송 시각 02:13", "누락되었던 한 줄이 시계 옆에 돌아왔다. ‘02:13, 404에서 405로 이송.’ 끝에는 젖은 지문이 찍혀 있다.", "erasure"]
    ]
  }
};

export const claims = [
  { id: "escape", title: "배수로로 탈출했다", description: "금붕어가 배수망의 틈으로 빠져나갔다고 본다." },
  { id: "erasure", title: "관리자가 기록에서 지웠다", description: "당직자가 금붕어를 옮기고 수조의 수량 기록을 고쳤다고 본다." },
  { id: "error", title: "기록 장치가 고장 났다", description: "겹친 프레임이 금붕어가 사라지는 순간을 만들어 냈다고 본다." }
];

const endings = {
  escape: ["물길의 끝", "다음 날 아침, 직원이 배수로 끝 집수조에 뜰채를 담근다. 물이 세 번 튀고, 금빛 꼬리 하나가 그물 안에서 몸을 뒤집는다. 수조 404의 명패에는 ‘구조’라는 두 글자가 덧붙었다."],
  erasure: ["405호의 목격자", "공판이 끝나자 야간 당직자가 405호의 가림막을 걷는다. 아픈 금붕어 한 마리가 얕은 물속에서 숨을 고른다. 당직자는 이송 대장에 빠뜨렸던 자기 이름을 적는다."],
  error: ["잃어버린 1초", "기록 기사가 중복 프레임을 걷어 낸다. 이어 붙인 영상 속 금붕어는 돌 뒤에서 천천히 돌아 나온다. 02:14:15. 멈췄던 시계가 비로소 다음 초를 받는다."],
  unresolved: ["보류된 판결", "당직자는 영상을 한 번 더 돌려 달라고 한다. 화면 속 금붕어는 같은 자리에서 꼬리를 흔든다. 재판장은 수조의 불을 켜 둔 채 사건 기록을 봉인한다."]
};

export function reading(round, point) {
  return locations[point].readings[(round - 1) % locations[point].readings.length];
}

export function makeEnding(choice, entry, testimony) {
  const supported = reading(entry.round, entry.point)[2] === choice;
  const disputed = testimony && reading(testimony.round, testimony.point)[2] !== choice;
  const id = supported && !disputed ? choice : "unresolved";
  const [title, epilogue] = endings[id];
  const basis = `${entry.round}회차의 ‘${entry.evidence}’`;
  const claim = claims.find(candidate => candidate.id === choice).title;
  const ruling = supported
    ? disputed ? `${basis} 기록은 제출한 주장을 뒷받침했지만 사육사의 증언과 어긋났다.` : `${basis} 기록이 결정적 증거로 채택됐다.`
    : `${basis}만으로는 ‘${claim}’는 주장을 입증할 수 없었다.`;
  const citation = testimony ? ` ${testimony.witness}의 교신이 재생됐다. “${testimony.answer}”` : "";
  return { id, title, body: ruling + citation + " " + epilogue, choice, evidence: entry, testimony: testimony ?? null };
}
