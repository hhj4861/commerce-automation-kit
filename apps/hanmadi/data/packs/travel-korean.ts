/**
 * 여행 한국어 (Travel Korean) — 장면(scene) 기반 롤플레이 팩.
 * 각 섹션이 하나의 상황 대본. 튜터가 점원/기사/직원 역할(A)을 맡아
 * 화면공유 대본을 따라 실전처럼 연습한다. 여행 예정 학생의 단기 목표형
 * 수강을 흡수하는 용도 — 세션당 1~2개 장면만 골라 써도 된다.
 * 블록 필드 설명은 data/types.ts 주석 참조.
 */
import type { Pack } from "@/data/types";

export const pack: Pack = {
  id: "travel-korean",
  title: {
    en: "Travel Korean",
    ko: "여행 한국어",
  },
  level: "beginner",
  category: "essential-phrases",
  minutes: 40,
  summary:
    "식당, 카페, 쇼핑, 교통, 숙소, 긴급 상황까지 여섯 가지 여행 장면을 화면공유 롤플레이 대본으로 연습해요.",
  learns: [
    "식당과 카페에서 자신 있게 주문하고 계산하고 요청하기",
    "쇼핑, 교통, 숙소 체크인 상황에서 자연스럽고 공손한 한국어 쓰기",
    "길을 묻고 긴급 상황에서 빠르게 도움 요청하기",
  ],
  tutorGuide:
    "단기 여행 목표 학생(1~2회 수업 후 이탈 위험이 큰 유형)에게 추천. 학생이 곧 갈 상황 1~2개만 골라 화면공유로 함께 읽고, 튜터가 점원/기사/직원 역할(A)을 맡아 실전처럼 진행한다. 나머지 장면은 자습용 링크로 전달해 재방문 동기로 활용한다. Directions & Emergencies는 안전과 직결되니 출발이 임박한 학생에게는 항상 포함을 권장. phrase-cards의 note에 '들을 말'이라고 표시된 카드는 학생이 말할 문장이 아니라 상대방이 하는 말이니 듣기 연습으로 안내할 것.",
  blocks: [
    // ── 팩 인트로 ──
    {
      type: "heading",
      level: 1,
      en: "Six Real-Life Scenes for Your Trip",
      ko: "여행에서 만나는 여섯 장면",
    },
    {
      type: "text",
      markdown:
        "Each section below is one situation you'll actually walk into — a restaurant, a cab, a hotel counter. Your tutor plays the other role (server, driver, staff) and reads the script live on screen while you answer as yourself.\n\nYou don't need to memorize everything. Pick the one or two scenes closest to your actual trip and practice those until they feel automatic.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "학생의 여행 일정을 먼저 물어보고(예: '카페는 매일 가지만 택시는 안 탈 수도 있어요') 우선순위 장면을 정한다. 대화문(dialogue)은 튜터가 A, 학생이 B로 읽고, 한 번 끝나면 역할을 바꿔 한 번 더 — 듣기와 말하기를 모두 연습시킨다.",
    },

    // ── Scene 1: At the Restaurant ──
    {
      type: "heading",
      level: 1,
      en: "At the Restaurant: Ordering & Paying",
      ko: "식당에서: 주문과 계산",
    },
    {
      type: "text",
      markdown:
        "Korean servers rarely come to your table on their own — you call them over. This scene covers the full arc: getting attention, ordering, and paying at the end.",
    },
    {
      type: "phrase-cards",
      title: "Ordering",
      cards: [
        {
          ko: "여기요!",
          rr: "yeogiyo!",
          en: "Excuse me!",
          note: "How you call a server over — completely normal, not rude.",
        },
        {
          ko: "메뉴판 좀 주세요",
          rr: "menyupan jom juseyo",
          en: "Could I have the menu, please?",
        },
        {
          ko: "이거 주세요",
          rr: "igeo juseyo",
          en: "This one, please",
          note: "Point at the menu — works even if you can't read it yet.",
        },
        {
          ko: "물 좀 주세요",
          rr: "mul jom juseyo",
          en: "Water, please",
        },
        {
          ko: "맵지 않게 해 주세요",
          rr: "maepji anke hae juseyo",
          en: "Please make it not spicy",
        },
      ],
    },
    {
      type: "phrase-cards",
      title: "Paying",
      cards: [
        {
          ko: "계산해 주세요",
          rr: "gyesanhae juseyo",
          en: "Check, please",
        },
        {
          ko: "카드 되나요?",
          rr: "kadeu doenayo?",
          en: "Do you take card?",
        },
        {
          ko: "따로 계산할게요",
          rr: "ttaro gyesanhalgeyo",
          en: "We'll pay separately",
        },
        {
          ko: "잘 먹었습니다",
          rr: "jal meogeosseumnida",
          en: "Thank you — that was delicious",
          note: "Said on your way out. Always lands well.",
        },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Server", b: "You" },
      lines: [
        { speaker: "A", ko: "어서 오세요! 몇 분이세요?", rr: "eoseo oseyo! myeot buniseyo?", en: "Welcome! How many people?" },
        { speaker: "B", ko: "두 명이요.", rr: "du myeongiyo.", en: "Two, please." },
        { speaker: "A", ko: "여기 메뉴판이요. 주문하시겠어요?", rr: "yeogi menyupaniyo. jumunhasigesseoyo?", en: "Here's the menu. Ready to order?" },
        { speaker: "B", ko: "이거 하나 주세요. 그리고 물 좀 주세요.", rr: "igeo hana juseyo. geurigo mul jom juseyo.", en: "One of this, please. And water, please." },
        { speaker: "A", ko: "네, 알겠습니다.", rr: "ne, algesseumnida.", en: "Sure thing." },
        { speaker: "B", ko: "계산해 주세요.", rr: "gyesanhae juseyo.", en: "Check, please." },
        { speaker: "A", ko: "카드로 하시겠어요, 현금으로 하시겠어요?", rr: "kadeuro hasigesseoyo, hyeongeumeuro hasigesseoyo?", en: "Card or cash?" },
        { speaker: "B", ko: "카드로 할게요. 잘 먹었습니다.", rr: "kadeuro halgeyo. jal meogeosseumnida.", en: "Card, please. That was delicious." },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "'여기요!'는 학생들이 어색해하는 경우가 많다 — 실제로 한국에서는 이렇게 불러야 서버가 온다고 짚어준다. 화면에 대사를 띄우고 튜터가 서버, 학생이 손님 역할로 한 번, 역할을 바꿔 한 번 더 읽게 한다.",
    },

    // ── Scene 2: Cafe & Convenience Store ──
    {
      type: "heading",
      level: 1,
      en: "Cafe & Convenience Store Korean",
      ko: "카페와 편의점 한국어",
    },
    {
      type: "text",
      markdown:
        "Cafés and convenience stores (편의점) are where you'll use Korean the most on a trip — often several times a day. These short exchanges repeat almost word-for-word everywhere.",
    },
    {
      type: "phrase-cards",
      title: "At the Cafe",
      cards: [
        { ko: "아메리카노 주세요", rr: "amerikano juseyo", en: "An Americano, please" },
        { ko: "따뜻한 거로 주세요", rr: "ttatteutan georo juseyo", en: "Hot, please" },
        { ko: "아이스로 주세요", rr: "aiseuro juseyo", en: "Iced, please" },
        {
          ko: "사이즈는 뭘로 하시겠어요?",
          rr: "saijeuneun mwollo hasigesseoyo?",
          en: "What size would you like?",
          note: "You'll hear this — it's the barista asking, not you.",
        },
      ],
    },
    {
      type: "phrase-cards",
      title: "At the Convenience Store",
      cards: [
        { ko: "이거 데워 주세요", rr: "igeo dewo juseyo", en: "Please heat this up" },
        {
          ko: "봉투 필요하세요?",
          rr: "bongtu piryohaseyo?",
          en: "Do you need a bag?",
          note: "You'll hear this at checkout — answer with one of the two cards below.",
        },
        { ko: "네, 하나 주세요", rr: "ne, hana juseyo", en: "Yes, one please" },
        { ko: "아니요, 괜찮아요", rr: "aniyo, gwaenchanayo", en: "No, I'm fine, thanks" },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Barista", b: "You" },
      lines: [
        { speaker: "A", ko: "어서 오세요! 뭐 드릴까요?", rr: "eoseo oseyo! mwo deurilkkayo?", en: "Welcome! What can I get you?" },
        { speaker: "B", ko: "아메리카노 한 잔 주세요.", rr: "amerikano han jan juseyo.", en: "One Americano, please." },
        { speaker: "A", ko: "따뜻한 거로 드릴까요, 아이스로 드릴까요?", rr: "ttatteutan georo deurilkkayo, aiseuro deurilkkayo?", en: "Hot or iced?" },
        { speaker: "B", ko: "아이스로 주세요.", rr: "aiseuro juseyo.", en: "Iced, please." },
        { speaker: "A", ko: "여기서 드시고 가세요, 포장이세요?", rr: "yeogiseo deusigo gaseyo, pojangiseyo?", en: "For here or to go?" },
        { speaker: "B", ko: "포장이에요.", rr: "pojangieyo.", en: "To go, please." },
        { speaker: "A", ko: "네, 오천 원입니다.", rr: "ne, ocheon wonimnida.", en: "That'll be 5,000 won." },
      ],
    },

    // ── Scene 3: Shopping ──
    {
      type: "heading",
      level: 1,
      en: "Shopping: Prices, Sizes & 'Just Looking'",
      ko: "쇼핑: 가격, 사이즈, 그리고 '그냥 구경'",
    },
    {
      type: "text",
      markdown:
        "Clerks in Korean shops often greet you and ask if you need help the moment you walk in — it's not pressure to buy. Knowing how to say \"just looking\" politely takes the pressure off both sides.",
    },
    {
      type: "phrase-cards",
      title: "Browsing & Trying On",
      cards: [
        {
          ko: "그냥 구경하는 거예요",
          rr: "geunyang gugyeonghaneun geoyeyo",
          en: "I'm just looking, thanks",
          note: "The single most useful phrase in this whole section.",
        },
        { ko: "이거 입어봐도 돼요?", rr: "igeo ibeobwado dwaeyo?", en: "Can I try this on?" },
        { ko: "더 큰 사이즈 있어요?", rr: "deo keun saijeu isseoyo?", en: "Do you have a bigger size?" },
        { ko: "더 작은 사이즈 있어요?", rr: "deo jageun saijeu isseoyo?", en: "Do you have a smaller size?" },
        { ko: "다른 색 있어요?", rr: "dareun saek isseoyo?", en: "Do you have another color?" },
      ],
    },
    {
      type: "phrase-cards",
      title: "Price & Buying",
      cards: [
        { ko: "이거 얼마예요?", rr: "igeo eolmayeyo?", en: "How much is this?" },
        { ko: "할인 되나요?", rr: "harin doenayo?", en: "Is there a discount?" },
        { ko: "이거 살게요", rr: "igeo salgeyo", en: "I'll take this" },
      ],
    },
    {
      type: "drill",
      instruction:
        "Read each price out loud. These are the Sino-Korean numbers you'll hear at every register in Korea.",
      items: [
        { ko: "천 원", rr: "cheon won", en: "1,000 won" },
        { ko: "오천 원", rr: "ocheon won", en: "5,000 won" },
        { ko: "만 원", rr: "man won", en: "10,000 won" },
        { ko: "만 오천 원", rr: "man ocheon won", en: "15,000 won" },
        { ko: "이만 원", rr: "iman won", en: "20,000 won" },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Clerk", b: "You" },
      lines: [
        { speaker: "A", ko: "어서 오세요! 찾으시는 거 있으세요?", rr: "eoseo oseyo! chajeusineun geo isseuseyo?", en: "Welcome! Looking for something in particular?" },
        { speaker: "B", ko: "아니요, 그냥 구경하는 거예요.", rr: "aniyo, geunyang gugyeonghaneun geoyeyo.", en: "No, just looking, thanks." },
        { speaker: "A", ko: "네, 편하게 보세요.", rr: "ne, pyeonhage boseyo.", en: "Sure, take your time." },
        { speaker: "B", ko: "저기요, 이거 입어봐도 돼요?", rr: "jeogiyo, igeo ibeobwado dwaeyo?", en: "Excuse me — can I try this on?" },
        { speaker: "A", ko: "네, 저쪽이에요.", rr: "ne, jeojjogieyo.", en: "Sure, it's over there." },
        { speaker: "B", ko: "이거 얼마예요?", rr: "igeo eolmayeyo?", en: "How much is this?" },
        { speaker: "A", ko: "이만 원이에요.", rr: "iman wonieyo.", en: "It's 20,000 won." },
        { speaker: "B", ko: "할인 되나요?", rr: "harin doenayo?", en: "Is there a discount?" },
        { speaker: "A", ko: "죄송해요, 이건 정가예요.", rr: "joesonghaeyo, igeon jeonggayeyo.", en: "Sorry, this one's full price." },
        { speaker: "B", ko: "알겠어요. 이거 살게요.", rr: "algesseoyo. igeo salgeyo.", en: "I understand. I'll take this." },
      ],
    },

    // ── Scene 4: Getting Around ──
    {
      type: "heading",
      level: 1,
      en: "Getting Around: Subway, Bus & Taxi",
      ko: "교통: 지하철, 버스, 택시",
    },
    {
      type: "text",
      markdown:
        "Subway and bus signage in Seoul is well translated, so the subway itself is easy. Taxis are where you actually need to speak — the driver needs a destination and, sometimes, a stop.",
    },
    {
      type: "phrase-cards",
      title: "Subway & Bus",
      cards: [
        { ko: "이거 홍대 가요?", rr: "igeo hongdae gayo?", en: "Does this (bus/train) go to Hongdae?" },
        { ko: "환승해야 해요?", rr: "hwanseunghaeya haeyo?", en: "Do I need to transfer?" },
        { ko: "다음 역은 어디예요?", rr: "daeum yeogeun eodiyeyo?", en: "What's the next station?" },
      ],
    },
    {
      type: "phrase-cards",
      title: "Taxi",
      cards: [
        { ko: "명동으로 가 주세요", rr: "myeongdongeuro ga juseyo", en: "To Myeongdong, please" },
        { ko: "여기 세워 주세요", rr: "yeogi sewo juseyo", en: "Please stop here" },
        { ko: "얼마나 걸려요?", rr: "eolmana geollyeoyo?", en: "How long will it take?" },
        { ko: "카드로 계산할게요", rr: "kadeuro gyesanhalgeyo", en: "I'll pay by card" },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Driver", b: "You" },
      lines: [
        { speaker: "A", ko: "어디로 모실까요?", rr: "eodiro mosilkkayo?", en: "Where to?" },
        { speaker: "B", ko: "명동으로 가 주세요.", rr: "myeongdongeuro ga juseyo.", en: "To Myeongdong, please." },
        { speaker: "A", ko: "네, 알겠습니다.", rr: "ne, algesseumnida.", en: "Sure thing." },
        { speaker: "B", ko: "여기 세워 주세요.", rr: "yeogi sewo juseyo.", en: "(as you arrive) Please stop here." },
        { speaker: "A", ko: "카드로 계산하시겠어요?", rr: "kadeuro gyesanhasigesseoyo?", en: "Will that be by card?" },
        { speaker: "B", ko: "네, 카드로 할게요.", rr: "ne, kadeuro halgeyo.", en: "Yes, card, please." },
      ],
    },

    // ── Scene 5: Hotel ──
    {
      type: "heading",
      level: 1,
      en: "Hotel Check-in & Requests",
      ko: "숙소에서: 체크인과 요청",
    },
    {
      type: "text",
      markdown:
        "Check-in staff usually handle a little English, but leading with Korean gets you friendlier, faster service — and you'll need Korean for small requests during the stay regardless.",
    },
    {
      type: "phrase-cards",
      title: "Check-in",
      cards: [
        { ko: "체크인 하려고요", rr: "chekeuin haryeogoyo", en: "I'm here to check in" },
        { ko: "예약했어요", rr: "yeyakhaesseoyo", en: "I have a reservation" },
        {
          ko: "제 이름은 사라예요",
          rr: "je ireumeun sarayeyo",
          en: "My name is Sarah",
          note: "Swap in your own name.",
        },
        { ko: "체크아웃이 몇 시예요?", rr: "chekeuausi myeot siyeyo?", en: "What time is checkout?" },
      ],
    },
    {
      type: "phrase-cards",
      title: "Requests",
      cards: [
        { ko: "수건 좀 더 주세요", rr: "sugeon jom deo juseyo", en: "Could I get more towels, please?" },
        { ko: "와이파이 비밀번호가 뭐예요?", rr: "waipai bimilbeonhoga mwoyeyo?", en: "What's the wifi password?" },
        { ko: "짐을 맡길 수 있어요?", rr: "jimeul matgil su isseoyo?", en: "Can I leave my luggage here?" },
        { ko: "방 좀 바꿔 주세요", rr: "bang jom bakkwo juseyo", en: "Could you change my room, please?" },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Staff", b: "You" },
      lines: [
        { speaker: "A", ko: "어서 오세요. 체크인 도와드릴까요?", rr: "eoseo oseyo. chekeuin dowadeurilkkayo?", en: "Welcome. Checking in?" },
        { speaker: "B", ko: "네, 예약했어요. 제 이름은 사라예요.", rr: "ne, yeyakhaesseoyo. je ireumeun sarayeyo.", en: "Yes, I have a reservation. My name is Sarah." },
        { speaker: "A", ko: "여권 좀 보여 주시겠어요?", rr: "yeogwon jom boyeo jusigesseoyo?", en: "Could I see your passport, please?" },
        { speaker: "B", ko: "네, 여기 있어요.", rr: "ne, yeogi isseoyo.", en: "Yes, here it is." },
        { speaker: "A", ko: "이박 하시네요. 체크아웃은 열두 시예요.", rr: "ibak hasineyo. chekeuauseun yeoldu siyeyo.", en: "Two nights — checkout is at 12." },
        { speaker: "B", ko: "감사합니다. 와이파이 비밀번호가 뭐예요?", rr: "gamsahamnida. waipai bimilbeonhoga mwoyeyo?", en: "Thanks. What's the wifi password?" },
        { speaker: "A", ko: "방 카드에 적혀 있어요.", rr: "bang kadeue jeokyeo isseoyo.", en: "It's written on your room card." },
      ],
    },

    // ── Scene 6: Directions & Emergencies ──
    {
      type: "heading",
      level: 1,
      en: "Directions & Emergencies",
      ko: "길 묻기와 긴급 상황",
    },
    {
      type: "text",
      markdown:
        "Most direction requests are low-stakes — a restroom, a pharmacy. The emergency phrases matter far more rarely, but when they're needed, they're needed instantly. Practice them anyway.",
    },
    {
      type: "phrase-cards",
      title: "Asking Directions",
      cards: [
        { ko: "화장실이 어디예요?", rr: "hwajangsiri eodiyeyo?", en: "Where's the restroom?" },
        { ko: "이 근처에 약국 있어요?", rr: "i geuncheoe yakguk isseoyo?", en: "Is there a pharmacy near here?" },
        { ko: "여기서 가까워요?", rr: "yeogiseo gakkawoyo?", en: "Is it close from here?" },
        {
          ko: "똑바로 가세요",
          rr: "ttokbaro gaseyo",
          en: "Go straight",
          note: "What you'll hear back — good to recognize even if you don't say it.",
        },
        { ko: "오른쪽으로 가세요", rr: "oreunjjogeuro gaseyo", en: "Turn right" },
        { ko: "왼쪽으로 가세요", rr: "oenjjogeuro gaseyo", en: "Turn left" },
      ],
    },
    {
      type: "phrase-cards",
      title: "Emergencies",
      cards: [
        { ko: "도와주세요!", rr: "dowajuseyo!", en: "Help me! / Please help!" },
        { ko: "길을 잃었어요", rr: "gireul ireosseoyo", en: "I'm lost" },
        { ko: "병원에 가야 해요", rr: "byeongwone gaya haeyo", en: "I need to go to the hospital" },
        { ko: "경찰을 불러 주세요", rr: "gyeongchareul bulleo juseyo", en: "Please call the police" },
        { ko: "여권을 잃어버렸어요", rr: "yeogwoneul ireobeoryeosseoyo", en: "I lost my passport" },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Local", b: "You" },
      lines: [
        { speaker: "A", ko: "네, 무슨 일이세요?", rr: "ne, museun iriseyo?", en: "Yes, how can I help?" },
        { speaker: "B", ko: "저기요, 실례합니다. 화장실이 어디예요?", rr: "jeogiyo, sillyehamnida. hwajangsiri eodiyeyo?", en: "Excuse me, sorry to bother you. Where's the restroom?" },
        { speaker: "A", ko: "저쪽으로 쭉 가세요. 편의점 옆에 있어요.", rr: "jeojjogeuro jjuk gaseyo. pyeonuijeom yeope isseoyo.", en: "Go straight that way. It's next to the convenience store." },
        { speaker: "B", ko: "감사합니다!", rr: "gamsahamnida!", en: "Thank you!" },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Save the five \"Emergencies\" phrases as a photo on your phone before you travel. You won't have time to look them up in the moment you actually need them.",
    },

    // ── 마무리 ──
    {
      type: "heading",
      level: 2,
      en: "Check Yourself",
      ko: "확인해 보기",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "You're done eating and want the bill. What do you say?",
          choices: ["계산해 주세요", "맛있게 드세요", "여기요"],
          answerIndex: 0,
          explanation: "계산해 주세요 (gyesanhae juseyo) = \"Check, please.\" 여기요 just calls the server over — you'd still need to follow up.",
        },
        {
          prompt: "A barista asks \"포장이세요?\" What is she asking?",
          choices: ["Is it spicy?", "For here or to go?", "What size?"],
          answerIndex: 1,
          explanation: "포장 (pojang) = \"to go / packaged.\" She's asking whether you're taking it with you.",
        },
        {
          prompt: "You want to try on a jacket at a clothing store. What do you say?",
          choices: ["이거 얼마예요?", "이거 입어봐도 돼요?", "할인 되나요?"],
          answerIndex: 1,
          explanation: "입어봐도 돼요? (ibeobwado dwaeyo?) = \"Can I try this on?\"",
        },
        {
          prompt: "In a taxi, how do you ask the driver to stop right here?",
          choices: ["여기 세워 주세요", "명동으로 가 주세요", "얼마나 걸려요?"],
          answerIndex: 0,
          explanation: "여기 세워 주세요 (yeogi sewo juseyo) = \"Please stop here.\" The other two ask for a destination or travel time.",
        },
        {
          prompt: "You're genuinely lost and need to say so. What's the phrase?",
          choices: ["길을 잃었어요", "그냥 구경하는 거예요", "체크인 하려고요"],
          answerIndex: 0,
          explanation: "길을 잃었어요 (gireul ireosseoyo) = \"I'm lost.\"",
        },
      ],
    },
    {
      type: "checklist",
      title: "Before your trip",
      items: [
        { en: "Read each scene's dialogue out loud, playing both roles once", ko: "각 장면 대화문을 두 역할 모두 소리 내어 읽기" },
        { en: "Practice the Emergencies phrases until they're automatic", ko: "긴급 상황 표현 자동으로 나올 때까지 연습" },
        { en: "Pick your two most likely scenes and rehearse them once more", ko: "가장 자주 쓸 장면 2개 골라 한 번 더 연습" },
      ],
    },
  ],
};
