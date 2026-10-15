import { V2Icon as Icon } from "./v2-icon";

type Tab = "study" | "chat" | "translate" | "phrases" | "words";
const destinations = [
  ["study", "book", "스터디", "회화 · 단어 · 음악"],
  ["chat", "chat", "AI 대화", "배운 말을 직접 써 봐요"],
  ["translate", "translate", "번역", "지금 필요한 한마디"],
  ["phrases", "heart", "보관함", "내 표현 · 단어장"],
] as const;

export function V2Navigation({ current, disabled, onNavigate }: {
  current: Tab; disabled: boolean; onNavigate: (tab: Tab) => void;
}) {
  const inLibrary = current === "phrases" || current === "words";
  return <nav className="hm-bottom" aria-label="주요 메뉴">
    <div className="hm-nav-brand" aria-hidden="true"><span className="hm-brand-mark">ㅎ</span><strong>한마디</strong><small>하루 한마디, 내 말이 되도록.</small></div>
    <div className="hm-nav-items">
      {destinations.map(([id, icon, label, description]) => <button key={id}
        disabled={disabled} aria-label={label}
        aria-current={(id === "phrases" ? inLibrary : current === id) ? "page" : undefined}
        onClick={() => onNavigate(id === "phrases" && inLibrary ? current : id)}>
        <Icon name={icon} /><span>{label}<small aria-hidden="true">{description}</small></span>
      </button>)}
    </div>
    <p className="hm-nav-note">필요했던 말부터,<br />나의 속도로 익혀요.</p>
  </nav>;
}

export function LibraryNavigation({ current, onNavigate }: {
  current: "phrases" | "words"; onNavigate: (tab: Tab) => void;
}) {
  return <nav className="hm-library-tabs" aria-label="보관함 보기">
    <button aria-pressed={current === "phrases"} onClick={() => onNavigate("phrases")}><Icon name="heart" />내 표현</button>
    <button aria-pressed={current === "words"} onClick={() => onNavigate("words")}><Icon name="dictionary" />단어장</button>
  </nav>;
}
