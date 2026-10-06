interface QuestionBase {
  id: string;
  task: string;
  candidate: Record<string, unknown>;
}
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  pass: string;
  fail: string;
}
/** 1단계부터 순서대로 쓴 수준 설명(JEV score 형식, 2~10단계) */
export interface ScoreQuestion extends QuestionBase {
  type: 'score';
  levels: string[];
}
export type JudgeQuestion = ChoiceQuestion | ScoreQuestion;

export interface ChoiceVerdict {
  type: 'choice';
  id: string;
  choice: 'pass' | 'fail';
  confidence: number;
  /** 선택한 쪽의 확률 */
  probability: number;
  decided: boolean;
}
export interface ScoreVerdict {
  type: 'score';
  id: string;
  /** 1부터 시작하는 수준 */
  level: number;
  levels: number;
  confidence: number;
  decided: boolean;
}
export type JudgeVerdict = ChoiceVerdict | ScoreVerdict;

export interface ExpectedQuestion {
  id: string;
  type: 'choice' | 'score';
}

export interface JudgeThresholds {
  confidence: number;
  probability: number;
}

/** 시험분·Hanmadi와 같은 기준. 완화하지 않는다. */
export const DEFAULT_THRESHOLDS: JudgeThresholds = { confidence: 0.85, probability: 0.9 };

export class JudgeError extends Error {}

export type JudgeKind = 'topic' | 'dialogue' | 'scenario' | 'props';
export type EpisodeJudgeKind = Exclude<JudgeKind, 'topic'>;

export const JUDGE_GATE_ID: Record<EpisodeJudgeKind, string> = { dialogue: 'dialogue-judge', scenario: 'scenario', props: 'props' };

export interface JudgeRequestMeta {
  kind: JudgeKind;
  /** 요청을 만들 때의 지문(회차: 대본 지문, 주제: 주제 묶음 지문). 적용 시 다르면 거부한다 */
  fingerprint: string;
  questions: ExpectedQuestion[];
  createdAt: string;
}
