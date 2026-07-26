/**
 * 표현 컴플라이언스 lint — 결정적 규칙 엔진.
 *
 * 법역:
 * - jp-yakkiho: 일본 약기법(薬機法) 화장품 광고 표현 규제. 큐텐재팬 일본어 카피의 하드 게이트.
 *   질병 치료·의약품적 효능 단정은 block, 의약부외품(医薬部外品) 전용 효능은 conditional.
 * - kr-cosmetics: 한국 화장품법 §13(의약품 오인 광고 금지) + 기능성 고시. 내부 검토용 한국어 카피.
 * - logistics: Qxpress 발송 불가(인화성) 품목 키워드. 카피 언급은 conditional(애프터케어 문구 오탐 방지),
 *   상품명 기준 하드 판정은 core/logistics.checkLogistics 가 담당한다.
 *
 * 매칭 전처리:
 * - NFKC 정규화(전각 숫자·％ → 반각) 후 매칭 — 일본어 카피의 전각 표기 관행 대응.
 * - 면책 문구 프리패스: "治療を目的とするものではありません" 류 표준 면책문은 규칙 매칭 전에 제거
 *   (컴플라이언스를 지키는 문서가 게이트에 막히는 역설 방지).
 * - 로케일은 기본 규칙 세트를 정하고, 텍스트에 가나(ぁ-ヶ)가 있으면 JP 규칙을, 한글이 있으면 KR 규칙을
 *   추가 적용한다 — 혼합 스크립트 문서의 무검사 구멍 방지. (한자 전용 표기는 스크립트 감지 한계로
 *   기본 로케일 규칙에만 의존한다.)
 *
 * 규칙 출전: platform-selection-2026-07-26.md 검증 + 약기법 광고 가이드 일반 원칙 + 2026-07-26 적대적 리뷰 반영.
 * ⚠️ 이 목록은 "자주 걸리는 표현"의 안전망이지 법률 자문 대체가 아니다 — 신규 카테고리
 * 진입 시 TODO(D1): 약기법 전문 검토 1회.
 */
import type {
  ComplianceFinding,
  ComplianceLaw,
  ComplianceReport,
  ComplianceSeverity,
  PageLocale,
  ProductPageDoc,
} from '@cak/contracts';

interface LintRule {
  id: string;
  law: ComplianceLaw;
  severity: ComplianceSeverity;
  pattern: RegExp;
  suggestion: string;
}

/** 규칙 매칭 전에 제거하는 표준 면책 문형 — 여기 걸리는 문장은 위반이 아니라 준수다. */
const DISCLAIMER_PATTERNS: RegExp[] = [
  /治療を目的と(する|した)もの?ではありません/gu,
  /医薬品ではありません/gu,
  /(질병의?\s?)?(예방|치료)\s?(및\s?(예방|치료)\s?)?목적(이|의)?\s?(아닙니다|아니며)/gu,
  /의약품이\s?아닙니다/gu,
];

/** 일본 약기법 규칙 (일본어 카피 대상). */
const JP_RULES: LintRule[] = [
  { id: 'jp-cure', law: 'jp-yakkiho', severity: 'block', pattern: /治(?:る|す|し|り|っ)|治療|治癒/u, suggestion: '질병 치료 표현 금지 — 사용감 서술로 대체 (예: 肌を整える)' },
  { id: 'jp-shimi-vanish', law: 'jp-yakkiho', severity: 'block', pattern: /(シミ|しみ)[がを]?(消え|消[すし]|なくな|薄くな)/u, suggestion: '기미 소멸·감소 단정 금지 — 「メイクアップ効果で目立たなく」 등 한정 표현만' },
  { id: 'jp-acne-cure', law: 'jp-yakkiho', severity: 'block', pattern: /ニキビ[がを]?(治|防ぐ|予防)/u, suggestion: 'ニキビ 치료·예방은 의약부외품 효능 — 화장품은 「キメを整える」 수준까지' },
  { id: 'jp-disease', law: 'jp-yakkiho', severity: 'block', pattern: /アトピー|湿疹|皮膚炎|ヘルペス/u, suggestion: '질환명 언급 금지' },
  { id: 'jp-regen', law: 'jp-yakkiho', severity: 'block', pattern: /(肌|お肌|素肌|細胞|皮膚)の?再生/u, suggestion: '피부·세포 재생 표현 금지 — 「うるおいを与える」「キメを整える」로 대체' },
  { id: 'jp-rejuvenate', law: 'jp-yakkiho', severity: 'block', pattern: /若返り|若返る/u, suggestion: '회춘 표현 금지 — 「エイジングケア(年齢に応じたお手入れ)」만 가능' },
  { id: 'jp-antiaging', law: 'jp-yakkiho', severity: 'block', pattern: /アンチエイジング|老化防止|老化を防/u, suggestion: '노화 방지 금지 — 「エイジングケア(年齢に応じたケア)」로 대체' },
  { id: 'jp-whitening', law: 'jp-yakkiho', severity: 'conditional', pattern: /美白|ホワイトニング/u, suggestion: '美白는 승인받은 의약부외품만 — 일반 화장품은 「(メイクアップ効果により)明るい印象に」 수준' },
  { id: 'jp-wrinkle-vanish', law: 'jp-yakkiho', severity: 'block', pattern: /(シワ|しわ|ジワ)[がを]?消え/u, suggestion: '주름 소멸 단정 금지' },
  { id: 'jp-wrinkle-improve', law: 'jp-yakkiho', severity: 'conditional', pattern: /(シワ|しわ|ジワ)[がを]?改善/u, suggestion: 'シワ改善은 승인 의약부외품 전용 효능 — 일반 화장품은 「乾燥による小ジワを目立たなくする」(효능평가시험 전제)까지' },
  { id: 'jp-detox', law: 'jp-yakkiho', severity: 'block', pattern: /デトックス|毒素排出/u, suggestion: '디톡스 표현 금지' },
  { id: 'jp-fat', law: 'jp-yakkiho', severity: 'block', pattern: /脂肪(燃焼|分解)|痩せる/u, suggestion: '지방 연소/감량 표현 금지 (화장품 범위 외)' },
  { id: 'jp-permanent', law: 'jp-yakkiho', severity: 'block', pattern: /永久|永遠に(持続|続く)/u, suggestion: '영구 지속 단정 금지' },
  { id: 'jp-superlative', law: 'jp-yakkiho', severity: 'conditional', pattern: /最高|No\.?\s?1(?!\d)|日本一|世界一|第?1位|ナンバーワン/iu, suggestion: '최상급·순위 표현은 객관적 실증 자료 보유 시에만' },
  { id: 'jp-safety-claim', law: 'jp-yakkiho', severity: 'block', pattern: /副作用(が|は)?(ない|なし|ありません)|絶対に?安全|100%安全/u, suggestion: '안전성 단정 금지' },
  { id: 'jp-cell', law: 'jp-yakkiho', severity: 'block', pattern: /細胞(を)?活性/u, suggestion: '세포 활성화 표현 금지' },
  { id: 'jp-hormone', law: 'jp-yakkiho', severity: 'block', pattern: /ホルモン(バランス)?(を)?(整え|調整)/u, suggestion: '호르몬 관련 표현 금지' },
  { id: 'jp-antibacterial', law: 'jp-yakkiho', severity: 'block', pattern: /殺菌|抗菌/u, suggestion: '살균·항균은 화장품 효능 범위 외' },
  { id: 'jp-hairgrowth', law: 'jp-yakkiho', severity: 'block', pattern: /発毛|育毛/u, suggestion: '발모·육모는 의약부외품/의약품 영역' },
  { id: 'jp-quasi-drug-claim', law: 'jp-yakkiho', severity: 'conditional', pattern: /医薬部外品/u, suggestion: '실제 의약부외품 승인 제품인지 확인 — 아니면 표기 위법' },
  { id: 'jp-penetrate', law: 'jp-yakkiho', severity: 'conditional', pattern: /(?<!角質層まで[^。、]{0,8})浸透/u, suggestion: '침투 표현은 「角質層まで浸透」로 한정 표기해야 함' },
  { id: 'jp-days-effect', law: 'jp-yakkiho', severity: 'conditional', pattern: /\d+(日間?|週間)で.{0,6}(効果|実感|変化)/u, suggestion: '효과 시점 단정은 실증 자료 없이는 금지' },
];

/** 한국 화장품법 규칙 (한국어 카피 대상 — 내부 검토·국내 판로 대비). */
const KR_RULES: LintRule[] = [
  { id: 'kr-cure', law: 'kr-cosmetics', severity: 'block', pattern: /치료|치유/u, suggestion: '질병 치료 표현 금지 (화장품법 §13 의약품 오인)' },
  { id: 'kr-acne', law: 'kr-cosmetics', severity: 'block', pattern: /여드름\s?(치료|개선|예방)/u, suggestion: '여드름 효능 금지 — "피부결 정돈"으로 대체' },
  { id: 'kr-sebum', law: 'kr-cosmetics', severity: 'block', pattern: /피지\s?(분비\s?)?억제/u, suggestion: '생리활성 단정 금지 — "번들거림 케어"로 대체' },
  { id: 'kr-regen', law: 'kr-cosmetics', severity: 'block', pattern: /(피부|세포)\s?재생/u, suggestion: '재생 표현 금지' },
  { id: 'kr-vanish', law: 'kr-cosmetics', severity: 'block', pattern: /(주름|기미|잡티|흉터)\s?(이|가)?\s?(사라|없어|제거|지워)/u, suggestion: '소멸·제거 단정 금지 — "눈에 띄지 않게" 수준의 한정 표현만' },
  { id: 'kr-antiaging', law: 'kr-cosmetics', severity: 'block', pattern: /안티\s?에이징|노화\s?방지/u, suggestion: '노화 방지 금지 — "에이징 케어(나이에 맞는 관리)"로 대체' },
  { id: 'kr-antiinflam', law: 'kr-cosmetics', severity: 'block', pattern: /항염|소염|염증\s?(완화|개선)/u, suggestion: '염증 관련 표현 금지' },
  { id: 'kr-atopy', law: 'kr-cosmetics', severity: 'block', pattern: /아토피/u, suggestion: '질환명 금지' },
  { id: 'kr-whitening', law: 'kr-cosmetics', severity: 'conditional', pattern: /미백|화이트닝/u, suggestion: '기능성화장품 심사·보고 제품만 — 미보고 시 "맑은 톤 케어"' },
  { id: 'kr-wrinkle', law: 'kr-cosmetics', severity: 'conditional', pattern: /주름\s?개선/u, suggestion: '기능성화장품 보고 제품만' },
  { id: 'kr-detox', law: 'kr-cosmetics', severity: 'block', pattern: /디톡스|독소\s?배출/u, suggestion: '디톡스 표현 금지' },
  { id: 'kr-safety', law: 'kr-cosmetics', severity: 'block', pattern: /부작용이?\s?없|100%\s?안전/u, suggestion: '안전성 단정 금지' },
  { id: 'kr-superlative', law: 'kr-cosmetics', severity: 'conditional', pattern: /(?<!\d)1\s?위|No\.?\s?1(?!\d)|최고/iu, suggestion: '최상급은 실증 자료 보유 시에만' },
];

/**
 * 물류(발송 불가 품목) 키워드 — 카피 언급은 conditional (염색 "애프터케어" 카피 오탐 방지).
 * 상품명 기준 하드 block 은 checkLogistics(원자 물류 게이트)가 담당.
 */
const LOGISTICS_RULES: LintRule[] = [
  { id: 'lg-flammable-ja', law: 'logistics', severity: 'conditional', pattern: /スプレー|ミスト|香水|フレグランス|(ヘアカラー|染毛)剤/u, suggestion: '상품 자체가 인화성 품목(Qxpress 발송 불가)인지 확인 — 카피 언급만이면 무시 가능, 상품명은 logistics 게이트가 판정' },
  { id: 'lg-flammable-ko', law: 'logistics', severity: 'conditional', pattern: /스프레이|미스트|향수|퍼퓸|염색약|염모제/u, suggestion: '상품 자체가 인화성 품목(Qxpress 발송 불가)인지 확인 — 카피 언급만이면 무시 가능, 상품명은 logistics 게이트가 판정' },
];

const KANA_RE = /[ぁ-んァ-ヶー]/u;
const HANGUL_RE = /[가-힣]/u;

function rulesFor(locale: PageLocale | undefined, text: string): LintRule[] {
  const sets = new Set<LintRule[]>();
  if (locale === 'ja') sets.add(JP_RULES);
  else if (locale === 'ko') sets.add(KR_RULES);
  else {
    sets.add(JP_RULES);
    sets.add(KR_RULES);
  }
  // 혼합 스크립트 방어: 로케일과 무관하게 실제 스크립트가 보이면 해당 규칙 추가.
  if (KANA_RE.test(text)) sets.add(JP_RULES);
  if (HANGUL_RE.test(text)) sets.add(KR_RULES);
  sets.add(LOGISTICS_RULES);
  return [...sets].flat();
}

function preprocess(text: string): string {
  let t = text.normalize('NFKC');
  for (const p of DISCLAIMER_PATTERNS) t = t.replace(p, ' ');
  return t;
}

/** 단일 텍스트 lint. matched 는 NFKC 정규화본 기준 표기다. */
export function lintText(text: string, locale: PageLocale | undefined, where: string): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const t = preprocess(text);
  for (const rule of rulesFor(locale, t)) {
    const m = t.match(rule.pattern);
    if (m && m[0].length > 0) {
      findings.push({
        ruleId: rule.id,
        law: rule.law,
        severity: rule.severity,
        matched: m[0],
        where,
        suggestion: rule.suggestion,
      });
    }
  }
  return findings;
}

/** 문서 전체 lint — 섹션의 모든 텍스트 필드(게이지 라벨 포함)를 훑는다. */
export function lintDoc(doc: ProductPageDoc): ComplianceReport {
  const findings: ComplianceFinding[] = [];
  doc.sections.forEach((s, i) => {
    const base = `${s.type}[${i}]`;
    if (s.eyebrow) findings.push(...lintText(s.eyebrow, doc.locale, `${base}.eyebrow`));
    findings.push(...lintText(s.heading, doc.locale, `${base}.heading`));
    if (s.body) findings.push(...lintText(s.body, doc.locale, `${base}.body`));
    s.items?.forEach((it, j) => {
      if (it.title) findings.push(...lintText(it.title, doc.locale, `${base}.items[${j}].title`));
      findings.push(...lintText(it.text, doc.locale, `${base}.items[${j}].text`));
      if (it.note) findings.push(...lintText(it.note, doc.locale, `${base}.items[${j}].note`));
    });
    s.gauges?.forEach((g, j) => {
      findings.push(...lintText(g.label, doc.locale, `${base}.gauges[${j}].label`));
    });
  });
  return buildReport(findings);
}

export function buildReport(findings: ComplianceFinding[]): ComplianceReport {
  const blockCount = findings.filter((f) => f.severity === 'block').length;
  const conditionalCount = findings.filter((f) => f.severity === 'conditional').length;
  return { findings, blockCount, conditionalCount, gatePassed: blockCount === 0 };
}
