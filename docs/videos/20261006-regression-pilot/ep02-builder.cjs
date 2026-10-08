// 2화 「문밖」 대본 생성기 → ep02.json, series.json(소품·장소·시즌 회차 요약) 갱신
const fs = require("fs");
const D = process.argv[2];

const s = JSON.parse(fs.readFileSync(D + "/series.json", "utf8"));
const aisle = s.locations.find((l) => l.id === "aisle");
for (const p of ["쇠파이프", "구급상자", "잠금쇠", "안쪽 방화문"]) if (!aisle.props.includes(p)) aisle.props.push(p);
if (!aisle.anchorText.includes("sliding bolt"))
  aisle.anchorText = aisle.anchorText.replace("a small grey steel side door next to it,", "a small grey steel side door next to it with a heavy sliding bolt latch on the inside, a pair of heavy grey steel fire doors with small wired-glass windows on the side wall leading to the inner area,");
if (!s.locations.some((l) => l.id === "yard"))
  s.locations.push({
    id: "yard",
    name: "물류센터 쪽문 바깥 하역장",
    anchorText: "Same continuous location in every cut: outside the warehouse at night, right in front of the small grey steel side door in a tall corrugated metal wall, a single dim caged lamp above the door, wet cracked asphalt, a few stacked wooden pallets, a dark loading yard fading into pitch darkness beyond the lamp light, cold blue night with faint fog. Keep the same layout and lighting.",
    props: ["쪽문", "철제 벽", "방범등", "팔레트"],
    refAssetId: "327ca5b8-65fa-447f-a330-2b4c8f07f342",
  });
if (!aisle.anchorText.includes("side door"))
  aisle.anchorText = aisle.anchorText.replace("a wide roll-up loading shutter at the far end,", "a wide roll-up loading shutter at the far end with a small grey steel side door next to it,");
const control = s.locations.find((l) => l.id === "control");
if (!control.props.includes("책상 서랍")) control.props.push("책상 서랍");
const ep = (no, title, summary) => ({ no, title, summary });
s.episodes = [
  ep(1, "10년 전으로", "좀비 사태로 모든 것을 잃은 서윤이 사태 3시간 전 물류센터로 돌아온다. 경고는 무시당하고, 첫 감염자를 도끼로 쓰러뜨리며 머리를 베야 죽는다는 것을 보여 준다. 서윤은 10년 전 셔터를 연 배신자가 다정한 박반장임을 기억한다."),
  ep(2, "문밖", "쪽문을 확인하던 민재가 문틈의 손에 끌려 나간다. 박반장은 잠금쇠를 걸어 버리고, 문밖에서 민재의 목소리가 들리지만 오창식은 이미 변했다고 단정한다. 자기가 민재를 보냈다는 죄책감에 서윤은 도끼를 들고 문밖으로 나가고, 그 등 뒤에서 박반장이 다시 잠금쇠를 건다. 어둠 속에서 민재가 서윤을 부른다."),
  ep(3, "물린 아이", "문밖 어둠에서 서윤은 팔을 물린 민재를 찾아내고 좀비를 베어 길을 연다. 잠긴 쪽문 대신 다른 길로 돌아온 두 사람 앞에서 오창식이 쇠파이프를 치켜들고, 서윤은 맨손으로 막아 한 시간의 유예를 얻는다. 박반장은 몰래 무전기로 물려도 변하지 않는 아이가 있다고 알린다."),
  ep(4, "식량 창고", "한밤중 오창식과 태수가 식량과 민재를 노리고 창고를 습격하지만 서윤이 한 동작으로 제압한다. 서윤은 식량을 공평하게 나누고, 미숙은 딸에게서 지하철역에 갇혔다는 문자를 받는다. 벽시계는 4시를 가리킨다."),
  ep(5, "덫", "모두 잠든 새벽 4시, 박반장이 관제실에서 셔터 개방 버튼을 누르지만 아무 반응이 없다. 서윤이 미리 전원을 내려 둔 것이다. 등 뒤에서 서윤이 십 년 전 이야기를 꺼내자 박반장의 미소가 사라진다."),
  ep(6, "무전기", "무전 속 남자가 문이 열렸는지, 아이는 데려오는지 묻는다. 약탈단이 민재를 노린다는 사실이 드러나고, 서윤은 문을 열지 않겠다고 답한다. 남자는 그럼 직접 열겠다고 웃고, 셔터가 안쪽으로 휜다."),
  ep(7, "포위", "약탈단이 셔터를 들이받고, 서윤이 방어를 지휘한다. 오창식은 자기 창고는 자기가 지킨다며 서윤 편에 선다. 그 사이 묶어 둔 박반장이 사라진다."),
  ep(8, "인질", "풀려난 박반장이 미숙을 붙잡고 민재를 넘기라고 요구한다. 민재가 스스로 나서려는 순간, 서윤은 벽시계를 보며 새벽 5시에 지나가는 것을 떠올린다."),
  ep(9, "문을 여는 자", "서윤은 지난 생의 기억대로 새벽 5시 좀비 떼가 지나가는 순간 직접 셔터를 열어, 약탈단 쪽으로 흘려보낸다. 셔터 밖에는 박반장만 홀로 남는다."),
  ep(10, "동이 트면", "새벽, 약탈단이 무너지고 박반장은 닫힌 셔터 밖에 남는다. 생존자들은 서윤을 리더로 받아들이고 미숙의 딸을 찾아 나서기로 한다. 그때 무전기에서 낯선 목소리가 서윤의 이름을 부르며, 당신도 돌아왔느냐고 묻는다."),
];
fs.writeFileSync(D + "/series.json", JSON.stringify(s, null, 2) + "\n");

const L = (speaker, text, kind = "dialogue") => ({ speaker, text, kind, verification: { status: "unverified" } });
const P = (id, look = "base") => ({ characterId: id, lookId: look });
const SY = P("seoyun", "present");
const state = {
  aisle: { "셔터": "끝까지 내려짐", "창고 열쇠 꾸러미": "서윤이 쥠", "쪽문": "살짝 열림", "잠금쇠": "풀림", "안쪽 방화문": "열림", "소방도끼": "소화함 안" },
  yard: { "쪽문": "닫힘", "방범등": "켜짐" },
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

// c1·c2 = 기존 클립 재사용(clips/c1.mp4, clips-v1/c2.mp4) — 대본은 클립 내용 그대로 기록
cut("aisle", 10, [SY, P("minjae"), P("misuk")],
  "[편집: 첫 3초 요약 자막 — \"10년 후에서 돌아온 서윤. 셔터는 막았다. 그런데 쪽문은…\" / 이어서 콜드 오픈 2초 — 3컷 문틈에서 비명을 지르는 민재의 얼굴, 자막 \"10분 전\"] 셔터가 내려진 통로에 사람들이 모여 웅성거린다. 열쇠 꾸러미를 쥔 서윤이 민재에게 쪽문도 잠겼는지 확인해 달라고 한다. 민재는 평범한 심부름처럼 대답하고 돌아서고, 서윤은 다른 사람들을 챙기느라 끝까지 보지 못한다.",
  "In {location}, the loading shutter is fully closed and survivors murmur in small groups. {seoyun}, gripping the key ring, turns to {minjae} and points at the small side door next to the shutter. {minjae} nods casually and walks off; {seoyun} turns back to the other survivors. {misuk} watches nervously in the background.",
  [L("seoyun", "민재 씨, 쪽문도 잠겼는지 봐 줘요."), L("minjae", "네, 누나.")],
  { caption: "새벽 2시 20분" });
cut("aisle", 12, [P("minjae")],
  "쪽문 앞. 민재가 손잡이를 잡다 멈춘다. 문 너머 금속을 긁는 소리가 난다. 민재가 문에 귀를 바짝 댄다. [편집: 끝부분 긁는 소리를 뚝 끊는다]",
  "In {location}, {minjae} reaches the small grey steel side door next to the shutter and puts his hand on the handle, then freezes at a faint scratching sound from the other side. He slowly presses his ear flat against the cold door and listens, wide-eyed. End the shot in a tight close-up of his face pressed against the door.",
  [L("minjae", "…무슨 소리지?")],
  { sfx: "faint scratching on metal behind the door, his shallow breathing, music drops away" });
cut("aisle", 10, [P("minjae")],
  "문에 귀를 대고 있던 민재 바로 옆에서 손잡이가 덜컥 돌아간다. 쪽문이 벌컥 열리고 문틈에서 회색 손이 뻗어 나와 민재를 낚아챈다. 민재가 문틀을 붙잡지만 손이 미끄러진다. 문틈에 비명을 지르는 얼굴이 잠깐 보이다 어둠 속으로 사라지고 문이 쾅 닫힌다. 카메라는 닫힌 빈 문에 남는다. [편집: 짧은 정적 뒤 밖에서 한 번 쾅]",
  "In {location}, continuing from the close-up of {minjae} with his ear pressed against the small grey steel side door: the door handle beside his face suddenly jerks and turns. The door bursts open, and a pale grey arm shoots out of the dark gap, seizes him by the safety vest and yanks him toward the opening. He grabs the door frame with both hands, his fingers slip, and he is dragged out into the darkness. For a moment his terrified screaming face is wedged in the narrow gap, then it vanishes and the door slams shut. Hold on the closed, empty grey door. Non-graphic, no blood, no bite shown. End the shot on the still, closed side door.",
  [L("minjae", "아악! 누나!")],
  { sfx: "door handle rattle, door bursting open, scream, door slam, silence", props: { "쪽문": "닫힘" } });
cut("aisle", 17, [SY, P("parkys"), P("changsik"), P("taesu")],
  "닫힌 쪽문. 서윤이 달려와 손잡이를 잡는다. 바로 옆에서 박반장의 손이 잠금쇠를 밀어 넣는다. 서윤이 그 손을 쳐다본다. 오창식과 태수가 서윤과 문 사이를 막자, 서윤이 한 동작으로 오창식의 팔을 꺾어 문에서 떼어 내고 태수는 겁먹고 물러선다. 힘으로는 이길 수 있지만 박반장의 말에 서윤이 멈춘다. 박반장이 태연하게 \"알아.\"라고 답하자, 서윤은 잠금쇠 위의 그 손을 다시 내려다보며 속으로 말한다 — 십 년 전 셔터를 연 것도 이 손이었다. 뒤쪽 벽에 안쪽 방화문이 보인다.",
  "In {location}, starting on the closed small grey side door: {seoyun} sprints in and grabs the door handle. Right beside her, the hand of {parkys} calmly slides the heavy bolt latch shut with a metallic clack. She stares at his hand, then at him. {changsik} and {taesu} step in between her and the door to block her; in one swift, effortless move she twists the arm of {changsik} behind his back and pushes him off the door, and {taesu} backs away in fear. She stops when {parkys} speaks. After his calm last reply she looks down again at his hand resting on the latch, her eyes going cold with recognition and quiet hatred, and whispers to herself. In the background the heavy grey fire doors to the inner area stand open. Tense, no punches, nobody is hurt.",
  [L("seoyun", "뭐 하시는 거예요?"), L("parkys", "밖에 몇 마린지도 몰라."), L("seoyun", "민재가 나가 있잖아요."), L("parkys", "알아."), L("seoyun", "십 년 전에도… 이 손이었어.")],
  { sfx: "running footsteps, bolt latch clack", props: { "잠금쇠": "박반장이 걸어 잠금" } });
cut("aisle", 18, [SY, P("misuk"), P("changsik")],
  "문을 두드리는 소리. 모두 말을 멈춘다. 문밖에서 민재의 목소리가 들리자 미숙이 문 쪽으로 손을 뻗지만 오창식의 말에 멈춘다. 서윤은 문에 손바닥을 댄다. 민재는 화면에 나오지 않는다.",
  "In {location}, everyone near the locked side door goes silent as slow knocking sounds on it from outside, and a weak muffled young man's voice calls through the door; the speaker outside is never shown. {misuk} reaches toward the door handle, but {changsik} snaps at her and she pulls her hand back. {seoyun} presses her palm flat against the cold door.",
  [L("minjae", "누나… 저 여기 있어요. 문 좀…"), L("changsik", "물렸으면 끝이야. 말할 줄 안다고 사람인 줄 알아?"), L("seoyun", "아직 아무도 못 봤잖아요.")],
  { sfx: "slow knocking on metal door, muffled voice through the door" });
cut("aisle", 15, [SY, P("parkys"), P("misuk"), P("taesu"), P("changsik")],
  "서윤이 소화함에서 소방도끼를 꺼낸다. 오창식이 움찔하지만 서윤은 사람에게 겨누지 않고 안쪽 방화문을 가리킨다. 미숙이 먼저 방화문 쪽으로 움직이고 태수와 오창식이 뒤따른다. 박반장이 서윤의 팔을 붙잡는다. 서윤은 잠깐 멈췄다가 문 너머를 보며 답한다. 방화문이 닫힌다.",
  "In {location}, {seoyun} pulls the red fire axe from the wall fire cabinet. {changsik} flinches, but she keeps the axe pointed at the floor and points at the heavy grey fire doors to the inner area. {misuk} hurries toward the fire doors first, {taesu} and {changsik} follow, and the doors swing shut behind them. {parkys} grabs her arm. She pauses, looks at the locked side door, and answers quietly. Nobody is threatened with the axe.",
  [L("seoyun", "안쪽 방화문 닫아요. 제가 데려올게요."), L("parkys", "너까지 죽으면?"), L("seoyun", "제가 확인하러 가라고 했어요.")],
  { sfx: "fire cabinet glass door, footsteps, heavy fire door closing", props: { "소방도끼": "서윤이 쥠", "안쪽 방화문": "닫힘" } });
cut("aisle", 7, [SY, P("parkys")],
  "서윤이 쪽문의 잠금쇠를 풀고 도끼를 낮게 쥔 채 어둠 속으로 나간다. 문이 닫힌다. 혼자 남은 박반장이 다가가 잠금쇠를 다시 밀어 넣고, 손을 뗀다.",
  "In {location}, {seoyun} slides the bolt latch open, holds the axe low and slips out through the small side door into the darkness; the door closes behind her. {parkys}, now alone in the aisle, walks up to the door, slowly slides the bolt latch shut again and takes his hand off it, his face blank. End the shot on his hand leaving the latch.",
  [],
  { sfx: "latch sliding open, door closing, latch sliding shut", props: { "잠금쇠": "박반장이 다시 걸어 잠금", "쪽문": "닫힘" } });
cut("yard", 10, [SY],
  "문밖. 등 뒤에서 '철컥'. 서윤이 돌아서 손잡이를 당기지만 열리지 않는다. 누가 잠갔는지 안다는 듯 낮게 말한다. 그 순간 어둠에서 감염자 둘이 덮친다. 서윤이 도끼를 한 번 휘둘러 둘의 머리를 차례로 벤다(타격 순간은 화면 밖, 피 없음). 감염자들이 쓰러져 다시 일어나지 않는다. 정적. 더 깊은 어둠에서 약한 목소리가 들린다. 서윤이 목소리 쪽으로 천천히 돌아본다. 암전.",
  "In {location}, {seoyun} stands just outside the closed side door, axe held low, under the dim caged lamp. A metallic clack of the latch sounds from inside; she spins around and yanks the handle, but it will not open. She stares at the door and murmurs coldly, knowing exactly who locked it. Suddenly two pale grey infected lunge at her out of the darkness; with one fluid, effortless swing of the axe she takes both of them down at the head, the moment of impact cut away off-screen with dull thuds, and they collapse on the wet asphalt and stay still. Non-graphic, no blood, no visible wound. Silence. From deeper in the pitch darkness of the yard a weak young man's voice calls her; the speaker is never shown. She slowly turns toward the darkness, gripping the axe. Fade to black.",
  [L("seoyun", "…역시, 당신이었어."), L("minjae", "…누나?")],
  { caption: "3화에서 계속", sfx: "latch clack, rattling handle, rushing footsteps, axe whoosh, two dull off-screen thuds, bodies falling, silence, distant wind", props: { "쪽문": "안에서 잠김" } });

const e = { seriesId: s.id, no: 2, title: "문밖", cuts };
fs.writeFileSync(D + "/ep02.json", JSON.stringify(e, null, 2) + "\n");
console.log(`cuts ${cuts.length}, ${cuts.reduce((a, c) => a + c.durationSec, 0)}s, lines ${cuts.reduce((a, c) => a + c.lines.length, 0)}`);
