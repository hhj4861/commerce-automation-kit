"use client";
import Link from "next/link";
import {
  curriculum,
  studyLanguages,
  type Profile,
  type StudyLanguage,
} from "@/lib/v2";
import { V2Icon as Icon } from "./v2-icon";

type Props = {
  name: string;
  owner: boolean;
  language: StudyLanguage | null;
  profile?: Profile;
  busy: boolean;
  autoSave: boolean;
  autoSaveChat: boolean;
  onAutoSaveChat: (enabled: boolean) => void;
  onLanguage: (language: StudyLanguage) => void;
  onPlan: (level: number, minutes: number) => void;
  onAutoSave: (enabled: boolean) => void;
  onAssessment: () => void;
  onAI: () => void;
  onPhrases: () => void;
  onLogout: () => void;
};

export function V2Settings(p: Props) {
  return (
    <section className="hm-settings" aria-label="학습 설정">
      <section className="hm-account-summary" aria-label="현재 로그인 계정">
        <span className="hm-login-status">로그인됨</span>
        <strong>{p.name}</strong>
        <p>
          {p.owner ? "관리자 계정" : "학습 계정"} · 학습 기록이 이 계정에
          저장돼요.
        </p>
      </section>
      <fieldset className="hm-setting-group">
        <legend>학습 언어</legend>
        <div className="hm-settings-options hm-settings-languages">
          {Object.entries(studyLanguages).map(([id, language]) => (
            <button
              key={id}
              disabled={p.busy}
              aria-pressed={p.language === id}
              onClick={() => p.onLanguage(id as StudyLanguage)}
            >
              {language.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="hm-setting-group">
        <legend>하루에 가볍게</legend>
        <div className="hm-settings-options">
          {[5, 10, 15].map((minutes) => (
            <button
              key={minutes}
              disabled={p.busy || !p.profile}
              aria-pressed={p.profile?.minutes === minutes}
              onClick={() => p.profile && p.onPlan(p.profile.level, minutes)}
            >
              {minutes}분
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="hm-setting-group">
        <legend>지금의 말하기</legend>
        <div className="hm-settings-levels">
          {curriculum.levels.map((level) => (
            <button
              key={level.id}
              disabled={p.busy || !p.profile}
              aria-pressed={p.profile?.level === level.id}
              onClick={() => p.profile && p.onPlan(level.id, p.profile.minutes)}
            >
              <span>
                <b>
                  Lv.{level.id} · {level.title}
                </b>
                <small>{level.goal}</small>
              </span>
              {p.profile?.level === level.id && <Icon name="check" />}
            </button>
          ))}
        </div>
        <p className="hm-settings-note">
          레벨은 공인 등급이 아닌 연습 단계예요. 편하게 말할 수 있는 단계로
          바꿔도 괜찮아요.
        </p>
      </fieldset>
      {!p.profile && (
        <div className="hm-settings-guidance">
          <b>먼저 나에게 맞는 시작을 찾아요.</b>
          <p>
            언어를 고른 뒤 짧은 레벨 체크를 마치면 연습 시간과 단계를 조절할 수
            있어요. 번역은 먼저 사용할 수 있어요.
          </p>
          <button
            className="hm-primary"
            disabled={p.busy}
            onClick={p.onAssessment}
          >
            {p.language ? "레벨 체크 시작하기" : "학습 언어 선택하기"}
          </button>
        </div>
      )}
      <div className="hm-setting-row">
        <b>번역 자동 학습</b>
        <button
          className="hm-toggle"
          role="switch"
          aria-checked={p.autoSave}
          aria-label="번역 자동 학습"
          disabled={p.busy}
          onClick={() => p.onAutoSave(!p.autoSave)}
        >
          <span aria-hidden="true" className="hm-toggle-track">
            <i />
          </span>
          {p.autoSave ? "켜짐" : "꺼짐"}
        </button>
      </div>
      <p className="hm-settings-note">
        새로 번역한 짧은 일반 표현부터 적용돼요. 기존 표현은 내 표현에서
        확인·삭제할 수 있어요.
      </p>
      <div className="hm-setting-row">
        <b>내 말 자동 학습</b>
        <button
          className="hm-toggle"
          role="switch"
          aria-checked={p.autoSaveChat}
          aria-label="내 말 자동 학습"
          disabled={p.busy}
          onClick={() => p.onAutoSaveChat(!p.autoSaveChat)}
        >
          <span aria-hidden="true" className="hm-toggle-track">
            <i />
          </span>
          {p.autoSaveChat ? "켜짐" : "꺼짐"}
        </button>
      </div>
      <p className="hm-settings-note">
        AI 대화에서 한국어로 쓴 내 말을 학습 언어로 바꾼 뒤, 짧은 일반 표현을 내
        표현과 스터디 복습에 저장해요. 개인정보와 대화 원문은 저장하지 않아요.
        저장한 표현은 내 표현에서 삭제할 수 있어요.
      </p>
      <div className="hm-setting-row">
        <b>발음 도움</b>
        <span>한국어 표기와 원음</span>
      </div>
      <div className="hm-setting-row">
        <b>내 AI 연결</b>
        <button onClick={p.onAI}>
          연결·모델 선택 <Icon name="arrow" />
        </button>
      </div>
      <div className="hm-setting-row">
        <b>내 학습 표현</b>
        <button onClick={p.onPhrases}>
          확인·삭제 <Icon name="arrow" />
        </button>
      </div>
      <details className="hm-settings-data">
        <summary>학습 데이터 보관 안내</summary>
        <p>
          학습 언어·연습 단계·시간과 저장한 표현은 내 계정에 보관해요. 원음과
          전체 대화는 한마디 학습 기록에 저장하지 않아요. 처리에 필요한
          음성·문장은 선택한 AI 공급자로 전송돼요.
        </p>
        <p>
          AI 대화의 표현은 직접 선택해 추가해요. 번역 자동 학습을 꺼도 기존
          표현이 삭제되지는 않아요. 내 표현에서 개별 삭제할 수 있어요.
        </p>
      </details>
      <div className="hm-setting-row">
        <b>시작 단계</b>
        <button onClick={p.onAssessment}>
          레벨 체크 안내 <Icon name="arrow" />
        </button>
      </div>
      {p.owner && (
        <div className="hm-setting-row">
          <b>콘텐츠 관리</b>
          <Link href="/study/admin">
            관리자 열기 <Icon name="arrow" />
          </Link>
        </div>
      )}
      <div className="hm-setting-row">
        <b>기존 수업</b>
        <Link href="/learn">
          한국어·튜터 수업 <Icon name="arrow" />
        </Link>
      </div>
      <div className="hm-setting-row">
        <b>개인정보</b>
        <Link href="/privacy">처리방침·문의 <Icon name="arrow" /></Link>
      </div>
      <button className="hm-logout" disabled={p.busy} onClick={p.onLogout}>
        로그아웃
      </button>
    </section>
  );
}
