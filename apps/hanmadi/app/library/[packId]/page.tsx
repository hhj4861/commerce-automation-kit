import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { packs, getPack, packNeighbors } from "@/data/packs";
import { tocFromBlocks } from "@/components/toc";
import { PackView } from "@/components/pack-view";
import { CopyButton } from "@/components/copy-button";
import { LevelBadge, MinutesChip } from "@/components/pack-badges";

/**
 * 팩 상세 — 블록 렌더러. 같은 페이지가 튜터의 화면공유 수업용과 학생의
 * 자습용을 모두 감당한다 (Teaching Mode 토글, components/pack-view.tsx).
 */

export function generateStaticParams() {
  return packs.map((p) => ({ packId: p.id }));
}

export async function generateMetadata(
  props: PageProps<"/library/[packId]">,
): Promise<Metadata> {
  const { packId } = await props.params;
  const pack = getPack(packId);
  if (!pack) return {};
  return {
    title: pack.title.en,
    description: pack.summary,
  };
}

export default async function PackPage(props: PageProps<"/library/[packId]">) {
  const { packId } = await props.params;
  const pack = getPack(packId);
  if (!pack) notFound();

  const toc = tocFromBlocks(pack.blocks);
  const { prev, next } = packNeighbors(pack.id);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-12 pb-24 sm:pt-16">
      <Link href="/library" className="text-sm text-ink-soft hover:text-accent">
        ← 전체 학습 팩
      </Link>

      {/* 팩 헤더 */}
      <header className="mt-4 border-b border-ink-faint pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={pack.level} />
          <MinutesChip minutes={pack.minutes} />
        </div>
        <h1 lang="ko" className="mt-4 font-display text-4xl sm:text-5xl">
          {pack.title.ko}
        </h1>
        <p className="mt-1 font-mono text-lg text-ink-soft">{pack.title.en}</p>
        <p className="mt-5 font-mono text-[11px] tracking-[0.15em] text-ink-soft uppercase">
          이 팩에서 배우는 것
        </p>
        <ul className="mt-2 max-w-[56ch] space-y-1.5 text-[16px] text-ink-soft">
          {pack.learns.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-accent">✓</span>
              {l}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <CopyButton
            path={`/library/${pack.id}`}
            label="링크 복사"
            copiedLabel="복사됨!"
          />
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[200px_1fr]">
        {/* 목차 — heading 블록에서 자동 생성, 긴 팩에서 수업 중 즉시 점프 */}
        {toc.length > 0 && (
          <nav aria-label="목차" className="lg:sticky lg:top-24 lg:h-fit">
            <p className="font-mono text-[11px] tracking-[0.15em] text-ink-soft uppercase">
              목차
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {toc.map((item) => (
                <li key={item.id} className={item.level === 2 ? "pl-3" : ""}>
                  <a href={`#${item.id}`} className="text-ink-soft hover:text-accent">
                    {item.en}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <PackView pack={pack} />
      </div>

      {/* 이전/다음 팩 — 추천 학습 순서(order) 기준 */}
      {(prev || next) && (
        <nav className="mt-16 grid gap-4 border-t border-ink-faint pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/library/${prev.id}`}
              className="soft-card p-5 transition-colors hover:border-accent/60"
            >
              <p className="font-mono text-[11px] text-ink-soft">← 이전 팩</p>
              <p lang="ko" className="mt-1 font-medium">
                {prev.title.ko}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/library/${next.id}`}
              className="soft-card p-5 text-right transition-colors hover:border-accent/60"
            >
              <p className="font-mono text-[11px] text-ink-soft">다음 팩 →</p>
              <p lang="ko" className="mt-1 font-medium">
                {next.title.ko}
              </p>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
