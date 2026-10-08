"use client";
import { useState } from "react";
import { musicLessons, musicUnits, pretender } from "@/lib/v2-music";
import type { Profile, Unit } from "@/lib/v2";

export function MusicStudy({ profile, onStart }: {
  profile: Profile | undefined;
  onStart: (unit: Unit) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const level = profile?.level ?? 1;
  return (
    <section className="hm-music" aria-label="음악으로 일본어 배우기">
      <div className="hm-music-cover">
        <span className="hm-music-record" aria-hidden="true">♪</span>
        <div><h1>{pretender.title}</h1><p>{pretender.artist}</p></div>
      </div>
      <p>{pretender.description}</p>
      <section className="hm-music-listen" aria-label="공식 영상 듣기">
        <h2>먼저, 음악에 귀 기울여요</h2>
        <p>{musicLessons[level - 1].listen}</p>
        <a className="hm-music-official" href={pretender.officialUrl} target="_blank" rel="noopener noreferrer">YouTube에서 공식 영상 듣기 ↗</a>
        {playing ? (
          <>
            <iframe
              title="Pretender 공식 뮤직비디오"
              src={`https://www.youtube-nocookie.com/embed/${pretender.videoId}?playsinline=1`}
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <button onClick={() => setPlaying(false)}>영상 닫기</button>
          </>
        ) : (
          <button onClick={() => setPlaying(true)}>앱에서 영상 열기</button>
        )}
        {playing && <small>재생이 제한되면 위의 YouTube 링크로 들어 주세요.</small>}
      </section>
      <h2>들은 감정을, 내 말로</h2>
      <p className="hm-muted">가사와 별도로 만든 회화 연습이에요. 일본어를 몰라도 발음을 듣고 따라 말할 수 있어요.</p>
      <div className="hm-music-lessons">
        {musicUnits("ja").map((unit) => {
          const completed = Boolean(profile?.completedLessons?.[unit.id]);
          return (
            <button key={unit.id} className="hm-music-unit" onClick={() => {
              setPlaying(false);
              onStart(unit);
            }}>
              <span className="hm-music-unit-top"><span>Lv.{unit.level} · 10문장</span>{unit.level === level && <span className="hm-music-recommended">내 단계</span>}</span>
              <strong>{unit.title}</strong>
              <small>{musicLessons[unit.level - 1].goal}</small>
              <span className="hm-music-action">{completed ? "학습 완료 · 다시 연습" : "말하기 연습 시작"} ›</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
