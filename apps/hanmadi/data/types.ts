/**
 * Hanmadi 콘텐츠 타입 정의
 *
 * 이 파일의 주석만 보고 새 팩/학생 파일을 만들 수 있도록 작성했다.
 * - 팩 추가:   data/packs/{id}.ts 생성 → data/packs/index.ts에 등록
 * - 학생 추가: data/students/index.ts의 students 배열에 추가
 *
 * 언어 규칙
 * - 학생에게 보이는 텍스트: 영어 우선 + 한국어 병기
 * - 튜터 전용(tip audience:"tutor", tutorGuide 등): 한국어
 * - 로마자(rr)는 국립국어원 Revised Romanization 기준
 */

/* ─────────────────────────── 팩 블록 (discriminated union) ─────────────────────────── */

/**
 * heading — 섹션 제목. TOC(목차) 자동 생성과 앵커 점프의 기준이 된다.
 * level 1은 팩 안의 큰 장(章), level 2는 소단원.
 * en 필수(학생 화면 기본), ko는 병기용 선택.
 */
export type HeadingBlock = {
  type: "heading";
  level: 1 | 2;
  en: string;
  ko?: string;
};

/**
 * text — 설명 문단. 간단한 마크다운 지원: **굵게**, *기울임*, `코드`,
 * [링크](url), "- "로 시작하는 줄은 목록. 빈 줄로 문단 구분.
 * 문법 포인트·문화 설명 등 산문은 전부 이 블록으로.
 */
export type TextBlock = {
  type: "text";
  markdown: string;
};

/**
 * tip — 팁 카드.
 * audience "tutor": 한국어 수업 진행 팁. 앰버 카드 + "튜터 노트" 라벨.
 *   Teaching Mode OFF(학생 모드)에서는 화면에 아예 표시되지 않는다.
 * audience "student": 학습 요령(영어). 항상 표시.
 */
export type TipBlock = {
  type: "tip";
  audience: "tutor" | "student";
  markdown: string;
};

/**
 * phrase-cards — 핵심 교습 단위. 한국어 초대형 / 로마자 / 영어 뜻 3단 위계 카드 그리드.
 * 한글 자모 차트도 이 블록으로 표현한다 (ko=자모, rr=음가, en=발음 힌트).
 * note는 카드 하단 보조 설명(선택).
 */
export type PhraseCard = {
  ko: string;
  rr: string;
  en: string;
  note?: string;
};
export type PhraseCardsBlock = {
  type: "phrase-cards";
  title?: string;
  cards: PhraseCard[];
};

/**
 * dialogue — A/B 대화. 좌우 교차 말풍선으로 렌더링된다.
 * 역할 바꿔 읽기(role-swap) 연습용: 튜터가 A, 학생이 B로 시작해 교대.
 * speakers는 화자 표시 이름 (예: { a: "Tutor", b: "You" }).
 */
export type DialogueLine = {
  speaker: "A" | "B";
  ko: string;
  rr: string;
  en: string;
};
export type DialogueBlock = {
  type: "dialogue";
  speakers: { a: string; b: string };
  lines: DialogueLine[];
};

/**
 * drill — 따라읽기 집중 연습. 한 번에 한 문장만 초대형(48px+)으로 표시하고
 * 이전/다음 버튼으로 진행한다. phrase-cards(일람)와 달리 발음 반복 전용.
 * instruction은 연습 방법 안내(영어, 선택).
 */
export type DrillItem = {
  ko: string;
  rr: string;
  en?: string;
};
export type DrillBlock = {
  type: "drill";
  instruction?: string;
  items: DrillItem[];
};

/**
 * quiz — 간단 선택 퀴즈. 선택지를 탭하면 정답/해설이 공개된다.
 * 상태는 클라이언트에서만 유지 (서버 불필요 — 정적 SSG 유지).
 * answerIndex는 choices 배열의 0-기준 인덱스.
 */
export type QuizQuestion = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
};
export type QuizBlock = {
  type: "quiz";
  questions: QuizQuestion[];
};

/**
 * checklist — 체크리스트. 숙제·수업 준비·학습 목표 점검용.
 * 체크 상태는 브라우저 localStorage에 저장돼 재방문 시 복원된다.
 * en 필수, ko 병기 선택 (ko가 있으면 rr 발음도 함께 적는 것을 권장).
 */
export type ChecklistBlock = {
  type: "checklist";
  title?: string;
  items: { en: string; ko?: string; rr?: string }[];
};

/** 팩 본문을 구성하는 블록. blocks 배열 순서 그대로 렌더링된다. */
export type PackBlock =
  | HeadingBlock
  | TextBlock
  | TipBlock
  | PhraseCardsBlock
  | DialogueBlock
  | DrillBlock
  | QuizBlock
  | ChecklistBlock;

/* ─────────────────────────────────── 팩 ─────────────────────────────────── */

/** 레벨: 완전 초보 / 초보 / 초중급 */
export type PackLevel = "absolute-beginner" | "beginner" | "upper-beginner";

/** 카테고리: 한글 / 필수 표현 / 발음 / K-컬처 */
export type PackCategory =
  | "hangul"
  | "essential-phrases"
  | "pronunciation"
  | "k-culture";

export type Pack = {
  /** URL 경로가 된다: /library/{id} — 소문자-하이픈 */
  id: string;
  /** 영어 제목이 1순위, 한국어 부제 병기 */
  title: { en: string; ko: string };
  level: PackLevel;
  category: PackCategory;
  /** 예상 소요 시간(분) — 카드와 팩 헤더에 표시 */
  minutes: number;
  /** 한 줄 설명 (영어) — 라이브러리 카드에 표시 */
  summary: string;
  /** "이 팩에서 배우는 것" 3줄 — 팩 헤더에 표시 */
  learns: string[];
  /**
   * 추천 학습 순서 (Absolute Beginner 트랙 1→2→3…).
   * 순서가 있는 팩만 번호가 붙고, 이전/다음 팩 내비게이션의 기준이 된다.
   */
  order?: number;
  /**
   * 튜터 전용 수업 활용법 (한국어).
   * /library의 튜터 배너(토글)에 표시된다 — 학생 화면에는 안 보임.
   */
  tutorGuide?: string;
  /** 본문 블록 — 순서대로 렌더링 */
  blocks: PackBlock[];
};

/* ────────────────────────────── 레벨 진단 ────────────────────────────── */

/**
 * 레벨 진단 결과 — 학생이 셀프로 푼 배치 테스트의 산출물.
 * 세 축(한글 읽기 / 어휘 / 문법·회화)의 점수로 레벨을 제안한다.
 */
export type PlacementResult = {
  /** 제안 레벨 */
  suggestedLevel: PackLevel;
  /** 0~100 종합 점수 */
  score: number;
  /** 축별 정답 수 */
  axes: {
    /** 한글 읽기 */
    hangul: { correct: number; total: number };
    /** 어휘 */
    vocab: { correct: number; total: number };
    /** 문법·회화 */
    grammar: { correct: number; total: number };
  };
  /** 제출 시각 (ms) — 관리 화면 표시용. 서버에서 찍는다 */
  takenAt: number;
  /** 튜터가 이 결과로 level을 확정했는지 */
  applied?: boolean;
};

/* ────────────────────────────── 학생 / 수업 기록 ────────────────────────────── */

/** 단어장 항목 — /live의 "새 표현 로거"와 필드가 1:1 대응 */
export type VocabEntry = {
  ko: string;
  /** 국립국어원 RR 로마자 */
  rr: string;
  en: string;
  /** 예문 (선택) */
  example?: string;
};

/**
 * 받아쓰기 교정 1건 — /live의 교정 로그와 대응.
 * rr은 수업 중에는 입력하지 않고, 수업 후 포털 데이터로 옮길 때 붙인다.
 */
export type Correction = {
  /** 학생이 말한 문장 (그대로 기록) */
  said: string;
  /** 자연스러운 표현으로 교정한 문장 */
  fixed: string;
  /** fixed의 RR 로마자 — 포털에서 교정 문장 아래 항상 표시된다 */
  rr: string;
  /** 발음 팁 / 문법 메모 (선택) */
  note?: string;
};

/**
 * 복습 퍼즐 — 어절 칩을 탭해 배운 문장을 조립하는 게임.
 *
 * 대부분의 퍼즐은 lib/puzzles.ts가 그 수업의 새 표현·교정 문장에서
 * 자동 생성한다. 이 타입을 직접 쓰는 경우는 튜터가 특정 문장을
 * 대표 퍼즐로 지정하고 싶을 때뿐이다 (LessonLog.puzzle).
 */
export type LessonPuzzle = {
  /** 조립할 문장의 영어 뜻 — 퍼즐 상단에 문제로 표시 */
  en: string;
  /** 정답 어절 순서 (2~8조각 권장) — 화면에는 섞여서 표시된다 */
  words: string[];
  /** 정답 문장 전체의 RR 로마자 — 정답 공개 시 표시 */
  rr: string;
  /** 정답 공개 후 한 줄 해설 (선택) */
  note?: string;
  /** 퍼즐 출처 — 자동 생성 시 표시용 */
  source?: "phrase" | "correction" | "featured";
  /** 진행 상태 저장 키에 쓰는 안정적 식별자 */
  id?: string;
};

/**
 * 숙제 1건 — "무엇을, 어떻게, 얼마나"가 다 보이도록 구성한다.
 * en(제목)만 필수이고 나머지는 선택이지만, how/target을 채우면
 * 학생이 무엇을 해야 하는지 헷갈리지 않는다.
 */
export type HomeworkItem = {
  /** 할 일 한 줄 (영어) — 체크리스트에 표시되는 제목 */
  en: string;
  /** 한국어 병기 (선택) */
  ko?: string;
  /** ko의 RR 로마자 (선택) */
  rr?: string;
  /** 구체적인 방법 (영어) — 예: "Read each phrase out loud, then record yourself" */
  how?: string;
  /** 분량·빈도 목표 — 예: "3 times a day · 5 min" */
  target?: string;
  /** 연습할 문장들 (선택) — 그 수업 표현에서 고른다 */
  phrases?: { ko: string; rr: string; en: string }[];
  /** 연결할 학습 팩 id (선택) — 포털에서 바로 열 수 있는 링크가 된다 */
  packId?: string;
};

/**
 * 수업 1회 기록. /live에서 "학생 포털에 저장"하면 이 구조로 저장소에 들어가고
 * 학생 포털(/s/[slug])의 Lesson Log 카드로 렌더링된다.
 */
export type LessonLog = {
  /** 학생 내에서 유일한 id — 숙제 체크 localStorage 키에 쓰인다 (예: "l1") */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 수업 주제 (영어) */
  topic: string;
  /** 받아쓰기 교정 — 재수강률의 핵심. 빈 배열 가능 */
  corrections: Correction[];
  /** 이 수업에서 배운 새 표현 — 포털 단어장에 자동 누적된다 */
  phrases: VocabEntry[];
  /**
   * 대표 복습 퍼즐 (선택) — 지정하지 않아도 된다.
   * 퍼즐은 lib/puzzles.ts가 phrases·corrections에서 자동 생성하며,
   * 이 값을 넣으면 맨 앞에 대표 퍼즐로 함께 표시된다.
   */
  puzzle?: LessonPuzzle;
  /** 숙제 — 체크 상태는 학생 브라우저 localStorage에 저장 */
  homework: HomeworkItem[];
  /** 수업 한 줄 소감/격려 (영어, 선택) */
  tutorNote?: string;
};

export type Student = {
  /** URL 경로가 된다: /s/{slug} — 추측 어려운 값 권장 (로그인 없는 비공개 링크) */
  slug: string;
  /**
   * 담당 튜터의 **불변 식별자** — 테넌시(격리)의 유일한 기준.
   * 세션의 tid와 이 값이 같은 튜터에게만 학생이 보인다. 표시이름은 바뀌거나
   * 재사용될 수 있으므로 접근 판정에 쓰지 않는다 (owner는 "owner:<이름>" 형태).
   */
  tutorId?: string;
  /**
   * 담당 튜터의 표시이름 (화면 표기·레거시 폴백용).
   * ⚠️ 접근 판정은 tutorId로 한다 — tutorId가 아직 없는 레거시 레코드에 한해서만
   * 이 이름으로 폴백한다. 값이 (tutorId와 함께) 없는 레코드는 초기 데이터로
   * 간주해 소유자(owner)에게만 보인다.
   */
  tutorName?: string;
  /** 포털 인사에 쓰는 이름 */
  name: string;
  /**
   * 현재 레벨 — 커리큘럼 트랙의 기준. 등록 시 튜터가 정하거나,
   * 레벨 진단(placement) 결과를 튜터가 확정해 갱신한다.
   */
  level: PackLevel;
  /**
   * 레벨 진단 결과 (선택) — 학생이 공개 링크(/level-test?s={slug})로 스스로 푼 제안.
   * 저장은 되지만 level을 자동으로 바꾸지는 않는다. 튜터가 관리 화면에서 확정(적용)한다.
   */
  placement?: PlacementResult;
  /** 온보딩 때 정한 학습 목표 (영어) — 포털 헤더에 표시 */
  goal?: string;
  /** Tutor's Feedback — 격려 톤, 영어로 작성 */
  feedback: {
    doingWell: string[];
    focusOn: string[];
  };
  /** Recommended for You — 레벨에 맞는 팩 id 2~3개 */
  recommendedPackIds: string[];
  /** 다음 수업 안내 + Preply 재예약 CTA */
  nextLesson?: {
    /** 표시용 문자열 (학생 시간대 기준으로 적는다) */
    when: string;
    topic: string;
    /** Preply 예약 링크 */
    bookingUrl?: string;
  };
  /** 수업 기록 — 오래된 → 최신 순으로 추가 (UI에서 최신순 정렬) */
  lessons: LessonLog[];
};
