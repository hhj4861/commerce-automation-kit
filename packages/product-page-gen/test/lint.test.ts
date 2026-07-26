import { describe, expect, it } from 'vitest';
import { lintDoc, lintText } from '../src/core/lint.js';
import type { ProductPageDoc } from '@cak/contracts';

describe('lintText — 일본 약기법', () => {
  it('치료 표현을 block 한다 (활용형 포함 — 리뷰 반영)', () => {
    for (const t of ['ニキビが治るセラム', '肌荒れが治りました', '手荒れが治った', 'ニキビを治す']) {
      const f = lintText(t, 'ja', 't');
      expect(f.some((x) => x.severity === 'block'), t).toBe(true);
    }
  });

  it('シミ 소멸·감소 단정을 block 한다 (消し·薄くなる 포함)', () => {
    for (const t of ['シミが消える美容液', 'シミ消しクリーム', 'シミが薄くなる']) {
      expect(lintText(t, 'ja', 't').map((x) => x.ruleId), t).toContain('jp-shimi-vanish');
    }
  });

  it('アンチエイジング을 block 한다', () => {
    expect(lintText('アンチエイジング効果', 'ja', 't').map((x) => x.ruleId)).toContain('jp-antiaging');
  });

  it('美白는 conditional', () => {
    expect(lintText('美白ケア', 'ja', 't').find((x) => x.ruleId === 'jp-whitening')?.severity).toBe('conditional');
  });

  it('シワ 표기 변형(しわ·小ジワ·が조사)을 전부 잡는다 (리뷰 반영)', () => {
    for (const t of ['シワが消える', 'しわが消える', '小ジワが消える']) {
      expect(lintText(t, 'ja', 't').find((x) => x.ruleId === 'jp-wrinkle-vanish')?.severity, t).toBe('block');
    }
    for (const t of ['シワを改善', 'シワが改善', 'しわ改善']) {
      expect(lintText(t, 'ja', 't').find((x) => x.ruleId === 'jp-wrinkle-improve')?.severity, t).toBe('conditional');
    }
  });

  it('재생은 피부·세포 문맥만 block — 재생 플라스틱 용기는 통과 (리뷰 반영)', () => {
    expect(lintText('肌再生効果', 'ja', 't').find((x) => x.ruleId === 'jp-regen')?.severity).toBe('block');
    expect(lintText('再生プラスチック容器を使用', 'ja', 't').find((x) => x.ruleId === 'jp-regen')).toBeUndefined();
  });

  it('안전성 단정 변형(副作用なし·전각 100％)을 잡는다 (NFKC — 리뷰 반영)', () => {
    for (const t of ['副作用なし', '副作用はありません', '１００％安全']) {
      expect(lintText(t, 'ja', 't').find((x) => x.ruleId === 'jp-safety-claim')?.severity, t).toBe('block');
    }
  });

  it('효과 시점 단정 변형(日間·전각 숫자·목적어 삽입)을 잡는다', () => {
    for (const t of ['7日で効果を実感', '7日間で実感', '７日で実感', '7日で違いを実感']) {
      expect(lintText(t, 'ja', 't').map((x) => x.ruleId), t).toContain('jp-days-effect');
    }
  });

  it('면책 문구는 block 하지 않는다 (역차단 방지 — 리뷰 반영)', () => {
    expect(lintText('本品は治療を目的とするものではありません', 'ja', 't')).toHaveLength(0);
    expect(lintText('이 제품은 질병의 예방 및 치료 목적이 아닙니다', 'ko', 't')).toHaveLength(0);
  });

  it('「角質層まで浸透」는 부사 삽입형도 통과, 무한정 「浸透」는 conditional', () => {
    expect(lintText('角質層まで浸透', 'ja', 't').find((x) => x.ruleId === 'jp-penetrate')).toBeUndefined();
    expect(lintText('角質層までぐんぐん浸透', 'ja', 't').find((x) => x.ruleId === 'jp-penetrate')).toBeUndefined();
    expect(lintText('肌の奥まで浸透', 'ja', 't').find((x) => x.ruleId === 'jp-penetrate')?.severity).toBe('conditional');
  });

  it('순위 표현: 1位·ナンバーワン을 잡고(리뷰 반영) No.10 은 오탐하지 않는다', () => {
    expect(lintText('楽天ランキング1位', 'ja', 't').map((x) => x.ruleId)).toContain('jp-superlative');
    expect(lintText('ナンバーワン人気', 'ja', 't').map((x) => x.ruleId)).toContain('jp-superlative');
    expect(lintText('엄선 No.10 성분', 'ko', 't').find((x) => x.ruleId === 'kr-superlative')).toBeUndefined();
    expect(lintText('랭킹 11위', 'ko', 't').find((x) => x.ruleId === 'kr-superlative')).toBeUndefined();
  });

  it('안전한 사용감 서술은 통과한다', () => {
    expect(lintText('うるおいを与え、キメを整えます。', 'ja', 't')).toHaveLength(0);
  });
});

describe('lintText — 한국 화장품법', () => {
  it('여드름 치료·피지 억제를 block 한다', () => {
    const ids = lintText('여드름 치료와 피지 분비 억제에 효과', 'ko', 't').map((x) => x.ruleId);
    expect(ids).toContain('kr-acne');
    expect(ids).toContain('kr-sebum');
  });

  it('소멸 단정·안티에이징·화이트닝을 잡는다 (리뷰 반영 — KR 공백 보강)', () => {
    expect(lintText('주름이 사라지는 크림', 'ko', 't').find((x) => x.ruleId === 'kr-vanish')?.severity).toBe('block');
    expect(lintText('기미 제거에 탁월', 'ko', 't').find((x) => x.ruleId === 'kr-vanish')?.severity).toBe('block');
    expect(lintText('안티에이징 세럼', 'ko', 't').find((x) => x.ruleId === 'kr-antiaging')?.severity).toBe('block');
    expect(lintText('노화 방지 효과', 'ko', 't').find((x) => x.ruleId === 'kr-antiaging')?.severity).toBe('block');
    expect(lintText('화이트닝 앰플', 'ko', 't').find((x) => x.ruleId === 'kr-whitening')?.severity).toBe('conditional');
  });

  it('미백은 conditional', () => {
    expect(lintText('미백 크림', 'ko', 't').find((x) => x.ruleId === 'kr-whitening')?.severity).toBe('conditional');
  });
});

describe('lintText — 혼합 스크립트 방어 (리뷰 반영)', () => {
  it('ko 문서 속 가나 표기 일본어는 JP 규칙으로 잡는다', () => {
    const f = lintText('헤드카피 초안: シワが消える!', 'ko', 't');
    expect(f.find((x) => x.ruleId === 'jp-wrinkle-vanish')?.severity).toBe('block');
  });

  it('ja 문서 속 한글 카피는 KR 규칙으로 잡는다', () => {
    const f = lintText('商品名: 미백 크림 (韓国語表記)', 'ja', 't');
    expect(f.find((x) => x.ruleId === 'kr-whitening')?.severity).toBe('conditional');
  });

  it('한자 전용(가나 없음) 표기는 기본 로케일 규칙만 적용된다 — 알려진 한계', () => {
    expect(lintText('美白', 'ko', 't').find((x) => x.law === 'jp-yakkiho')).toBeUndefined();
  });
});

describe('lintText — 물류 키워드 (카피는 conditional, 상품명 판정은 logistics 게이트)', () => {
  it('미스트/스프레이 카피 언급은 conditional', () => {
    expect(lintText('ミスト化粧水', 'ja', 't').find((x) => x.law === 'logistics')?.severity).toBe('conditional');
    expect(lintText('수분 미스트', 'ko', 't').find((x) => x.law === 'logistics')?.severity).toBe('conditional');
  });

  it('염색 애프터케어 카피는 걸리지 않는다 (리뷰 반영 — 접미어 필수)', () => {
    expect(lintText('ヘアカラー後のダメージケア', 'ja', 't').find((x) => x.law === 'logistics')).toBeUndefined();
    expect(lintText('염색 후 손상모 케어 샴푸', 'ko', 't').find((x) => x.law === 'logistics')).toBeUndefined();
    expect(lintText('染毛剤', 'ja', 't').find((x) => x.law === 'logistics')?.severity).toBe('conditional');
  });
});

describe('lintDoc', () => {
  const doc = (over: Partial<ProductPageDoc['sections'][number]>): ProductPageDoc => ({
    briefId: 'b1',
    locale: 'ja',
    sections: [{ type: 'hero', heading: 'うるおいセラム', ...over } as ProductPageDoc['sections'][number]],
  });

  it('block 0건이면 gatePassed=true', () => {
    const r = lintDoc(doc({}));
    expect(r.gatePassed).toBe(true);
  });

  it('block 이 있으면 gatePassed=false + 위치를 기록한다', () => {
    const r = lintDoc(doc({ heading: 'アトピーにも安心' }));
    expect(r.gatePassed).toBe(false);
    expect(r.findings[0]?.where).toBe('hero[0].heading');
  });

  it('gauges 라벨도 lint 한다 (critical 우회 경로 — 리뷰 반영)', () => {
    const r = lintDoc(doc({ type: 'ingredient', gauges: [{ label: '肌再生効果', pct: 90 }] }));
    expect(r.gatePassed).toBe(false);
    expect(r.findings.some((f) => f.where.includes('gauges[0].label'))).toBe(true);
  });
});
