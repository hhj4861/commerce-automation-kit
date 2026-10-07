// 2화 「물린 아이」 대본 생성기 → ep02.json, series.json(소품·시즌 회차 요약) 갱신
const fs = require("fs");
const D = process.argv[2];

const s = JSON.parse(fs.readFileSync(D + "/series.json", "utf8"));
const aisle = s.locations.find((l) => l.id === "aisle");
for (const p of ["쇠파이프", "구급상자"]) if (!aisle.props.includes(p)) aisle.props.push(p);
if (!aisle.anchorText.includes("side door"))
  aisle.anchorText = aisle.anchorText.replace("a wide roll-up loading shutter at the far end,", "a wide roll-up loading shutter at the far end with a small grey steel side door next to it,");
const control = s.locations.find((l) => l.id === "control");
if (!control.props.includes("책상 서랍")) control.props.push("책상 서랍");
const ep = (no, title, summary) => ({ no, title, summary });
s.episodes = [
  ep(1, "10년 전으로", "좀비 사태로 모든 것을 잃은 서윤이 사태 3시간 전 물류센터로 돌아온다. 경고는 무시당하고, 첫 감염자를 도끼로 쓰러뜨리며 머리를 베야 죽는다는 것을 보여 준다. 서윤은 10년 전 셔터를 연 배신자가 다정한 박반장임을 기억한다."),
  ep(2, "물린 아이", "쪽문 틈의 손에 민재가 물린다. 공포에 질린 오창식이 쇠파이프로 민재를 죽이려 하지만 서윤이 맨손으로 막아선다. 서윤은 한 시간의 유예를 얻어 내고, 박반장은 몰래 무전기로 물려도 변하지 않는 아이가 있다고 알린다."),
  ep(3, "예언", "한 시간이 다가오자 오창식 무리가 민재를 내보내자고 몰아간다. 서윤은 30초 뒤 전기가 나간다고 예언하고, 정전이 적중하자 사람들이 서윤 편에 선다. 서윤은 관제실에서 켜진 채 놓인 무전기를 발견한다."),
  ep(4, "식량 창고", "한밤중 오창식과 태수가 식량과 민재를 노리고 창고를 습격하지만 서윤이 한 동작으로 제압한다. 서윤은 식량을 공평하게 나누고, 미숙은 딸에게서 지하철역에 갇혔다는 문자를 받는다. 벽시계는 4시를 가리킨다."),
  ep(5, "덫", "모두 잠든 새벽 4시, 박반장이 관제실에서 셔터 개방 버튼을 누르지만 아무 반응이 없다. 서윤이 미리 전원을 내려 둔 것이다. 등 뒤에서 서윤이 십 년 전 이야기를 꺼내자 박반장의 미소가 사라진다."),
  ep(6, "무전기", "무전 속 남자가 문이 열렸는지, 아이는 데려오는지 묻는다. 약탈단이 민재를 노린다는 사실이 드러나고, 서윤은 문을 열지 않겠다고 답한다. 남자는 그럼 직접 열겠다고 웃고, 셔터가 안쪽으로 휜다."),
  ep(7, "포위", "약탈단이 셔터를 들이받고, 서윤이 방어를 지휘한다. 오창식은 자기 창고는 자기가 지킨다며 서윤 편에 선다. 그 사이 묶어 둔 박반장이 사라진다."),
  ep(8, "인질", "풀려난 박반장이 미숙을 붙잡고 민재를 넘기라고 요구한다. 민재가 스스로 나서려는 순간, 서윤은 벽시계를 보며 새벽 5시에 지나가는 것을 떠올린다."),
  ep(9, "문을 여는 자", "서윤은 지난 생의 기억대로 새벽 5시 좀비 떼가 지나가는 순간 직접 셔터를 열어, 약탈단 쪽으로 흘려보낸다. 셔터 밖에는 박반장만 홀로 남는다."),
  ep(10, "동이 트면", "새벽, 약탈단이 무너지고 박반장은 닫힌 셔터 밖에 남는다. 생존자들은 서윤을 리더로 받아들이고 미숙의 딸을 찾아 나서기로 한다. 그때 무전기에서 낯선 목소리가 서윤의 이름을 부르며, 당신도 돌아왔느냐고 묻는다."),
];
fs.writeFileSync(D + "/series.json", JSON.stringify(s, null, 2) + "\n");

const L = (speaker, text) => ({ speaker, text, kind: "dialogue", verification: { status: "unverified" } });
const P = (id, look = "base") => ({ characterId: id, lookId: look });
const SY = P("seoyun", "present");
const state = {
  aisle: { "셔터": "끝까지 내려짐", "창고 열쇠 꾸러미": "서윤이 쥠", "쪽문": "닫힘", "쇠파이프": "랙에 기대 있음" },
  control: {},
};
const cuts = [];
function cut(loc, dur, cast, action, visualEn, lines = [], opts = {}) {
  Object.assign(state[loc], opts.props || {});
  const c = { id: `c${cuts.length + 1}`, locationId: loc, durationSec: dur, cast, action, visualEn, lines };
  if (opts.sfx) c.sfx = opts.sfx;
  if (opts.caption) c.caption = opts.caption;
  if (opts.transitionIn) c.transitionIn = opts.transitionIn;
  c.propState = { ...state[loc] };
  cuts.push(c);
}

cut("aisle", 10, [SY, P("minjae"), P("misuk")],
  "[편집: 콜드 오픈 2초 — 7컷에서 오창식이 치켜든 쇠파이프를 서윤이 맨손으로 붙잡는 순간을 먼저 보여 주고 자막 \"10분 전\"] 셔터가 내려진 통로에 사람들이 모여 웅성거린다. 열쇠 꾸러미를 쥔 서윤이 민재를 불러 쪽문도 잠겼는지 확인해 달라고 한다.",
  "In {location}, the loading shutter is fully closed and survivors murmur in small groups. {seoyun}, gripping the key ring, turns to {minjae} and points at the small side door next to the shutter. {misuk} watches nervously in the background.",
  [L("seoyun", "민재 씨, 쪽문도 잠겼는지 봐 줘요."), L("minjae", "네, 누나.")],
  { caption: "새벽 2시 20분" });
cut("aisle", 30, [SY, P("minjae"), P("misuk")],
  "민재가 셔터 옆 쪽문으로 가 손잡이를 확인한다. 문 너머에서 무언가 긁는 소리가 나고, 민재가 문에 귀를 가져다 댄다. 순간 쪽문이 덜컥 열리며 문틈의 감염자가 민재의 팔뚝을 붙잡아 문다(피 없음). 민재가 비명을 지른다. 서윤이 달려와 쪽문을 발로 차 닫고 잠근 뒤 민재를 끌어낸다. 팔뚝에 멍 같은 흐린 이빨 자국이 보이고, 이를 본 미숙이 소리친다.",
  "One continuous shot in {location}. {minjae} walks to the small grey side door beside the shutter and tests the handle; a faint scratching comes from the other side and he slowly presses his ear to the door. Suddenly the door jolts open a few inches: a pale grey infected worker in the gap grabs his forearm and bites down on the sleeve; he screams in pain and terror. Bite shown briefly, no blood. {seoyun} sprints in, kicks the door shut, locks it and drags him away. On his forearm is a faint bruise-like ring of tooth marks, no blood. {misuk} sees it and points, horrified.",
  [L("minjae", "…무슨 소리지?"), L("minjae", "아악! 누나!"), L("misuk", "물렸어… 저 팔 좀 봐요!")],
  { sfx: "faint scratching on metal, door slam, scream", props: { "쪽문": "잠김" } });
cut("aisle", 12, [P("changsik"), P("taesu"), P("minjae"), SY],
  "사람들이 비명을 지르며 물러선다. 오창식이 랙에 기대 있던 쇠파이프를 뽑아 들고, 태수가 통로 출구를 막아선다.",
  "In {location}, survivors scream and scatter back. {changsik} yanks a steel pipe from the pallet rack and shouts at {minjae}, who is on the floor clutching his arm next to {seoyun}. {taesu} plants himself across the aisle, blocking the way out.",
  [L("changsik", "다들 떨어져! 저놈 곧 변해!")],
  { props: { "쇠파이프": "오창식이 쥠" } });
cut("aisle", 12, [SY, P("changsik"), P("minjae")],
  "서윤이 민재와 오창식 사이를 막아선다. 서윤 등 뒤에서 민재가 떨고 있다.",
  "In {location}, {seoyun} steps squarely between {minjae} and {changsik}, arms slightly spread, calm. Behind her {minjae} trembles, holding his bitten arm. {changsik} grips the pipe, sneering.",
  [L("seoyun", "이 사람은 안 변해요."), L("changsik", "알바 주제에 네가 그걸 어떻게 알아?")]);
cut("aisle", 10, [SY, P("changsik")],
  "오창식이 쇠파이프를 위협하듯 치켜드는 순간, 서윤이 그 파이프를 맨손으로 붙잡아 멈춘다. 아무도 다치지 않는다.",
  "In {location}, {changsik} raises the steel pipe threateningly; before he can move, {seoyun} grabs it with one bare hand and holds it still, eyes locked on his. Standoff, no strike, nobody is hurt.",
  [L("seoyun", "십 년 동안 봤으니까요.")],
  { sfx: "tense silence, grip on metal" });
cut("aisle", 12, [SY, P("changsik"), P("misuk"), P("taesu")],
  "정적. 서윤이 파이프를 비틀어 빼앗아 바닥에 던진다. 쨍그랑 소리가 울린다. 서윤이 모두를 둘러보며 말한다.",
  "In {location}, silence. {seoyun} twists the pipe out of the grip of {changsik} and tosses it onto the floor with a loud clang. She looks around at {misuk}, {taesu} and the others, steady and commanding.",
  [L("seoyun", "한 시간만 지켜봐요. 변하면 그때 내보내요.")],
  { sfx: "metal pipe clattering on concrete", props: { "쇠파이프": "바닥에 떨어짐" } });
cut("aisle", 12, [SY, P("minjae"), P("misuk")],
  "망설이던 미숙이 구급상자를 가져와 민재의 팔에 붕대를 감아 준다. 민재의 눈에 눈물이 고인다.",
  "In {location}, {misuk} hesitates, then kneels with a first-aid kit and wraps a bandage around the forearm of {minjae}. His eyes fill with tears as he looks up at {seoyun}, who crouches beside him.",
  [L("minjae", "누나… 저 진짜 괜찮은 거예요?"), L("seoyun", "괜찮아요. 제가 알아요.")],
  { props: { "구급상자": "미숙이 엶" } });
cut("aisle", 10, [P("parkys"), P("minjae"), SY],
  "멀찍이서 사람들을 다독이던 박반장이 웃는 얼굴로 민재의 붕대를 오래 바라보다가, 천천히 어두운 복도로 사라진다. 서윤이 멀리서 그 뒷모습을 지켜보며, 10년 전 그가 셔터를 열던 밤을 떠올린다. 서윤은 그를 막지 않고 일부러 보내 준다.",
  "In {location}, at a distance, {parkys} pats a worker's shoulder with a kind smile, but his eyes stay fixed on the bandaged arm of {minjae}. He quietly backs away into a dark corridor. Across the aisle, {seoyun} watches him go without moving, cold and patient, and murmurs to herself.",
  [L("seoyun", "이번엔 놓치지 않아.")]);
cut("control", 12, [P("parkys")],
  "관제실. 박반장이 책상 서랍에서 무전기를 꺼내 문 쪽을 살핀 뒤 낮게 속삭인다.",
  "In {location}, {parkys} slips in, opens the desk drawer and takes out a handheld two-way radio. He glances at the door, then raises the radio and whispers into it, his warm smile completely gone.",
  [L("parkys", "물려도 안 변하는 놈이 있어."), L("parkys", "그놈 값은 따로 받아야겠어.")],
  { caption: "3화에서 계속", sfx: "faint radio static", props: { "무전기": "박반장이 쥠", "책상 서랍": "열림" } });

const e = { seriesId: s.id, no: 2, title: "물린 아이", cuts };
fs.writeFileSync(D + "/ep02.json", JSON.stringify(e, null, 2) + "\n");
console.log(`cuts ${cuts.length}, ${cuts.reduce((a, c) => a + c.durationSec, 0)}s, lines ${cuts.reduce((a, c) => a + c.lines.length, 0)}`);
