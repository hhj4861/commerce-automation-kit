import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_VOICE_ID,
  SHORT_TEXT_MODEL_ID,
  buildRequestBody,
  hasHangul,
  resolvePolicy,
  supportsLanguageCode,
} from '../src/core/policy.js';

describe('resolvePolicy — hanmadi와 동일한 정책', () => {
  it('짧은 문구(≤3자)는 turbo v2.5 + language_code:ko 강제', () => {
    const p = resolvePolicy('누', {});
    expect(p.modelId).toBe(SHORT_TEXT_MODEL_ID);
    expect(p.languageCode).toBe('ko');
  });

  it('긴 문장은 multilingual v2, language_code 없음(미지원 파라미터)', () => {
    const p = resolvePolicy('오늘은 제가 직접 써본 후기를 알려드릴게요', {});
    expect(p.modelId).toBe(DEFAULT_MODEL_ID);
    expect(p.languageCode).toBeUndefined();
  });

  it('경계: 정확히 3자는 짧은 문구, 4자부터 긴 문장', () => {
    expect(resolvePolicy('감사해', {}).modelId).toBe(SHORT_TEXT_MODEL_ID);
    expect(resolvePolicy('감사해요', {}).modelId).toBe(DEFAULT_MODEL_ID);
  });

  it('공백은 길이에 세지 않는다 (trim 후 판정)', () => {
    expect(resolvePolicy('  누  ', {}).modelId).toBe(SHORT_TEXT_MODEL_ID);
  });

  it('기본 음성은 검증된 Claire', () => {
    expect(resolvePolicy('안녕하세요', {}).voiceId).toBe(DEFAULT_VOICE_ID);
  });

  it('env 재정의가 기본값보다 우선한다', () => {
    const p = resolvePolicy('누', {
      ELEVENLABS_VOICE_ID: 'v-custom',
      ELEVENLABS_TTS_MODEL: 'eleven_multilingual_v2',
    });
    expect(p.voiceId).toBe('v-custom');
    expect(p.modelId).toBe('eleven_multilingual_v2');
    // 재정의된 모델이 v2.5 계열이 아니므로 language_code 미전송
    expect(p.languageCode).toBeUndefined();
  });

  it('env 로 v2.5 계열을 지정하면 language_code 는 유지된다', () => {
    const p = resolvePolicy('긴 문장이지만 모델을 강제로 낮춘 경우입니다', {
      ELEVENLABS_TTS_MODEL: 'eleven_flash_v2_5',
    });
    expect(p.languageCode).toBe('ko');
  });
});

describe('buildRequestBody', () => {
  it('language_code 는 정책에 있을 때만 본문에 실린다', () => {
    expect(buildRequestBody('누', { voiceId: 'v', modelId: 'eleven_turbo_v2_5', languageCode: 'ko' }))
      .toEqual({ text: '누', model_id: 'eleven_turbo_v2_5', language_code: 'ko' });
    expect(buildRequestBody('안녕하세요 여러분', { voiceId: 'v', modelId: 'eleven_multilingual_v2' }))
      .toEqual({ text: '안녕하세요 여러분', model_id: 'eleven_multilingual_v2' });
  });
});

describe('보조 판정', () => {
  it('supportsLanguageCode 는 v2.5 계열만 참', () => {
    expect(supportsLanguageCode('eleven_turbo_v2_5')).toBe(true);
    expect(supportsLanguageCode('eleven_flash_v2_5')).toBe(true);
    expect(supportsLanguageCode('eleven_multilingual_v2')).toBe(false);
  });

  it('hasHangul', () => {
    expect(hasHangul('안녕 hello')).toBe(true);
    expect(hasHangul('hello')).toBe(false);
  });
});
