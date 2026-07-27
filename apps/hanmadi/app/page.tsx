import Link from "next/link";
import { getStudentsForTutor, getTutorSession } from "@/lib/students";
import { CopyButton } from "@/components/copy-button";
import { LogoutButton } from "@/components/logout-button";

/** 학생 목록을 저장소에서 읽으므로 매 요청 렌더 (등록 즉시 반영) */
export const dynamic = "force-dynamic";

/**
 * 튜터 허브 — 수업 직전 30초 안에 필요한 화면으로 진입하는 런처.
 * 미들웨어 뒤의 튜터 전용 페이지이므로 전면 한국어.
 * 로그인 쿠키에서 튜터 이름을 읽어 개인화 인사를 보여준다.
 *
 * 학생 목록은 담당 튜터 것만 보인다. 세션이 없으면(미들웨어가 막지만
 * 만일을 대비해) 빈 목록으로 안전하게 렌더한다.
 */
export default async function Home() {
  const session = await getTutorSession();
  const tutorName = session?.n ?? null;
  const isOwner = session?.r === "owner";
  const students = session ? await getStudentsForTutor(session) : [];

  return (
    <div className="mx-auto max-w-5xl px-5">
      {/* 브랜드 헤더 */}
      <section className="pt-16 pb-12 sm:pt-24">
        <p className="font-mono text-[12px] tracking-[0.2em] text-ink-soft">
          HANMADI — 한국어 튜터 스튜디오
        </p>
        <h1 className="mt-4 max-w-[18ch] font-display text-5xl leading-[1.15] sm:text-6xl">
          한마디씩, <span className="text-accent">확실하게</span>
        </h1>
        <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
          {tutorName ? `${tutorName} 튜터님, 안녕하세요! ` : ""}
          수업 중에는 라이브 노트, 수업 후에는 학생 포털 — 오늘 배운 모든 것이
          학생에게 남습니다.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {isOwner && (
            <Link
              href="/admin/tutors"
              className="rounded-full border border-ink-faint px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            >
              튜터 관리
            </Link>
          )}
          <LogoutButton />
        </div>
      </section>

      {/* 3대 퀵런치 — 대형 버튼, 키보드 접근 가능 */}
      <section aria-label="빠른 실행" className="grid gap-4 sm:grid-cols-3">
        <LaunchCard
          href="/trial"
          step="01"
          title="체험수업 덱"
          en="TRIAL DECK"
          desc="25분 체험수업을 슬라이드로 진행해요. 방향키로 넘길 수 있어요."
        />
        <LaunchCard
          href="/live"
          step="02"
          title="라이브 노트"
          en="LIVE NOTES"
          desc="수업 중 실시간 교정과 새 표현을 기록하고, 수업 후 마크다운으로 복사해요."
        />
        <LaunchCard
          href="/library"
          step="03"
          title="학습 팩"
          en="LIBRARY"
          desc="레벨별 자습 팩 — 학생에게 링크로 공유해요."
        />
      </section>

      {/* 오늘의 수업 플로우 — 한 줄 안내 */}
      <p className="mt-6 rounded-2xl border border-ink-faint bg-card px-5 py-4 text-[15px] leading-relaxed text-ink-soft">
        <span className="mr-2 font-mono text-[11px] tracking-[0.15em] text-accent">
          오늘의 플로우
        </span>
        체험수업이면 <b className="text-ink">체험수업 덱</b>으로 시작, 정규수업이면{" "}
        <b className="text-ink">학습 팩</b>을 골라{" "}
        <b className="text-ink">라이브 노트</b>와 나란히 화면공유.
      </p>

      {/* 학생 바로가기 — 이름을 누르면 튜터용 상세, 링크 복사는 학생 포털 주소 */}
      <section aria-label="학생" className="mt-14">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="font-display text-2xl">학생</h2>
            <span className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
              {tutorName ? `${tutorName} 튜터 담당 ${students.length}명` : "담당 학생"}
            </span>
          </div>
          <Link
            href="/admin/students"
            className="text-sm text-ink-soft transition-colors hover:text-accent"
          >
            학생 관리 →
          </Link>
        </div>
        <p className="mb-5 text-[15px] text-ink-soft">
          내가 담당하는 학생만 보여요. 이름을 누르면 수업 진행과 다음 수업 자료를
          볼 수 있어요. 수업이 끝나면 &lsquo;링크 복사&rsquo;로 학생 포털 주소를
          복사해 채팅으로 보내 주세요.
        </p>
        {students.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-faint p-8 text-center leading-relaxed text-ink-soft">
            아직 담당 학생이 없어요.
            <br />
            <Link
              href="/admin/students"
              className="font-medium text-accent hover:underline"
            >
              학생 관리
            </Link>
            에서 첫 학생을 등록하세요.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {students.map((s) => (
              <li
                key={s.slug}
                className="soft-card group relative flex items-center justify-between gap-3 p-5 transition-colors hover:border-accent/50"
              >
                {/* 카드 전체가 튜터용 상세 링크 — 복사 버튼만 z-10으로 위에 올린다 */}
                <Link
                  href={`/admin/students/${s.slug}`}
                  aria-label={`${s.name} 학생 상세 보기`}
                  className="absolute inset-0 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <div className="min-w-0">
                  <span className="text-lg font-medium transition-colors group-hover:text-accent">
                    {s.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-1.5 text-ink-soft transition-colors group-hover:text-accent"
                  >
                    →
                  </span>
                  <p className="mt-0.5 font-mono text-[12px] break-all text-ink-soft">
                    /s/{s.slug} · 수업 {s.lessons.length}회 · 표현{" "}
                    {s.lessons.reduce((n, l) => n + l.phrases.length, 0)}개
                  </p>
                </div>
                <CopyButton
                  className="relative z-10 rounded-full border border-ink-faint bg-card px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                  path={`/s/${s.slug}`}
                  label="링크 복사"
                  copiedLabel="복사됨!"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        {/* 수업 전 체크리스트 */}
        <section aria-label="수업 전 체크리스트" className="soft-card p-6">
          <h2 className="font-display text-xl">수업 전 체크 ✔</h2>
          <ul className="mt-4 space-y-2.5 text-[16px]">
            {[
              "카메라 · 마이크 · 화면공유 테스트",
              "라이브 노트 열고 학생 이름 입력",
              "이전 수업 교정 포인트 훑어보기 (학생 포털)",
              "오늘 쓸 팩 탭에 미리 열어두기",
              "물 한 잔 — 목 관리도 실력",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4.5 shrink-0 accent-[var(--accent)]"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 운영 문서 */}
        <section aria-label="운영 문서" className="soft-card p-6">
          <h2 className="font-display text-xl">운영 문서</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Notion 이식 가능한 마크다운 — 프로젝트의 ops/ 폴더에 보관.
          </p>
          <ul className="mt-4 space-y-3 text-[16px]">
            {[
              { name: "체험수업 대본", desc: "인사부터 재예약 유도까지 30분 진행표" },
              { name: "피드백 루틴", desc: "수업 후 5분: 노트 정리 → 포털 반영 → 링크 전달" },
              { name: "리텐션 플레이북", desc: "재수강을 만드는 노트 공유 · 진도 가시화 루틴" },
            ].map((doc) => (
              <li key={doc.name} className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-medium">{doc.name}</p>
                  <p className="text-sm text-ink-soft">{doc.desc}</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-accent">
                  완료
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LaunchCard({
  href,
  step,
  title,
  en,
  desc,
}: {
  href: string;
  step: string;
  title: string;
  en: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="soft-card group flex flex-col p-6 transition-colors hover:border-accent/60"
    >
      <p className="font-mono text-[11px] tracking-[0.2em] text-accent">{step}</p>
      <p className="mt-2 font-display text-2xl group-hover:text-accent">
        {title}
      </p>
      <p className="font-mono text-[12px] text-ink-soft">{en}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{desc}</p>
      <p className="mt-auto pt-4 text-sm font-medium text-accent">열기 →</p>
    </Link>
  );
}
