import { reading } from "./story.js";

const witness = "서해진";
const exchanges = {
  trace: [
    ["왜 꼬리만 두 겹으로 찍혔죠?", "제가 유리 앞에서 손을 흔들었거든요. 화면엔 손이 두 개였는데 바닥의 그림자는 하나였어요."],
    ["404호 유리에 405라는 숫자가 비쳤어요.", "그건 옆 수조 문패가 아니에요. 제가 격리용 운반통에 흰 테이프로 써 둔 번호예요. 손잡이는 지금도 축축할 거예요."],
    ["비늘이 걸린 은빛 도구를 쓰셨나요?", "제 핀셋이에요. 뜰채에 걸린 비늘을 떼어 냈어요. 그날 밤엔 격리실 쪽 수건에 닦았고요."],
    ["금빛 선이 배수망까지 이어지는 걸 봤나요?", "바닥등을 끄려는데 금빛이 한 번 더 번쩍였어요. 뜰채를 넣기도 전에 배수망 밑으로 사라졌어요."]
  ],
  drain: [
    ["배수망 나사가 언제부터 풀려 있었죠?", "순찰 때 밟으니 망이 딸깍했어요. 건져 낸 실 끝이 집수조 쪽으로 팽팽하게 당겨져 있었고요."],
    ["그물이 안쪽으로 접힐 만큼 물살이 셌나요?", "펌프가 한 번 크게 울었어요. 손전등을 비추니 배수관 첫 굽이에 비늘 두 장이 들러붙어 있었어요."],
    ["02:13의 종이 봉인은 누가 붙였나요?", "제 도장이에요. 수조를 비울 때 붙이는 표식이에요. 붙이고 격리실로 갔는데 교대 일지에는 그 칸을 비워 뒀어요."],
    ["기포가 바닥으로 가라앉을 수 있나요?", "저는 그 기포가 수면에서 터지는 걸 들었어요. 재생 화면에서는 터진 자리부터 다시 방울이 생기더군요."]
  ],
  clock: [
    ["화면이 멎은 뒤에도 초침 소리를 들었나요?", "네. 벽시계가 열다섯 초를 칠 때 모니터는 아직 열네 초였어요. 그때 제가 부른 시각이 당직실 녹음에도 있어요."],
    ["서로 다른 장면에 같은 번호가 찍힐 수 있죠?", "프린터에서 번호 끝자리가 같은 사진 두 장이 나왔어요. 두 번째 걸 뽑을 땐 카메라 전원등이 이미 꺼져 있었어요."],
    ["수량을 한 마리에서 영으로 고친 사람이 누구죠?", "제 열쇠로 정정 칸을 열었어요. 이송받은 쪽의 서명을 나중에 받으려고 제 이름도 비워 뒀어요."],
    ["02:13 이송 기록에 있는 지문을 알아보나요?", "네, 제 엄지예요. 왼손에 통을 들고 오른손으로 눌렀어요. 405호 앞에 통을 내려놓은 뒤에야 장갑을 꼈고요."]
  ]
};

const followups = {
  escape: "두 장면이 다르다는 건 알겠어요. 그래도 제 손전등이 마지막으로 따라간 곳은 집수조였어요. 녹화가 아니라 제 눈으로 본 겁니다.",
  error: "그날 적은 제 수첩을 찾았어요. 기계를 다시 켜자 방금 본 장면이 한 번 더 나왔다고 적혀 있어요. 두 번째 건 생중계가 아니었어요.",
  erasure: "첫 교신 때 빠뜨린 게 있어요. 제가 통을 든 장면이 교대 기록에 들어갈까 봐, 빈 수조가 찍힌 사진으로 바꿨어요."
};

export function radioState(dossier, journal, comparison) {
  const testimonies = dossier.testimonies ?? [];
  const asked = new Set(testimonies.map(line => line.id));
  const questions = journal.map(({ round, point, evidence }) => ({
    id: round + "/" + point, round, point, evidence,
    prompt: exchanges[point][(round - 1) % exchanges[point].length][0]
  }));
  for (const pair of comparison) {
    const { point, beforeRound, before, afterRound: round, after: evidence } = pair;
    if (asked.has(beforeRound + "/" + point) && asked.has(round + "/" + point)) {
      questions.push({
        id: beforeRound + "-" + round + "/" + point, round, point, evidence,
        prompt: "‘" + before + "’와 ‘" + evidence + "’ 중 직접 본 건 어느 쪽인가요?"
      });
    }
  }
  return { witness, role: "야간 사육사", questions: questions.map(q => ({ ...q, asked: asked.has(q.id) })), testimonies };
}

export function getTestimony({ id, round, point, evidence, prompt }) {
  const answer = id.includes("-") ? followups[reading(round, point)[2]]
    : exchanges[point][(round - 1) % exchanges[point].length][1];
  return { id, round, point, evidence, prompt, answer, witness };
}
