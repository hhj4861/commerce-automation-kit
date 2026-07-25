/**
 * works.js 생성 — works.json(단일 진실 소스)에서 브라우저용 데이터 파일을 만든다.
 *
 * showcase.html 은 <script src="works.js"> 로 이 파일을 로드해 window.FF_WORKS 를 읽는다
 * (file://·localhost·https 전부에서 fetch/CORS 없이 동작하는 이유).
 * 따라서 출력은 브라우저에서 그대로 실행 가능한 평범한 스크립트여야 한다.
 */
import type { ShowcaseWorksFile } from '@cak/contracts';

const HEADER = `/* ============================================================================
   AUTO-GENERATED — works.json 을 수정하고 gen 을 다시 실행하세요. 직접 편집 금지.
   (@cak/showcase-site 가 생성. 단일 진실 소스는 works.json)
   ============================================================================ */`;

/** ShowcaseWorksFile → works.js 전체 텍스트 */
export function generateWorksJs(file: ShowcaseWorksFile): string {
  return `${HEADER}\nwindow.FF_WORKS = ${JSON.stringify(file.entries, null, 2)};\n`;
}
