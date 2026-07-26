/**
 * @cak/contracts — 모든 원자 모듈이 공유하는 인터페이스 계약.
 *
 * "모듈 독립 구축 후 조합" 전략의 중심. 각 원자는 서로를 직접 import 하지 않고
 * 오직 이 패키지의 타입으로만 대화한다. 계약은 append-only 로 진화한다.
 */
export * from './keyword-signal.js';
export * from './ad-video-job.js';     // ad-video-gen ↔ 소비자 (원자 #5)
export * from './showcase-entry.js';   // showcase-site ↔ 소비자 (원자 #6)
export * from './shorts-job.js';       // shorts-publish ↔ 소비자 (원자 #7)
export * from './music-job.js';        // ai-music ↔ 소비자 (원자 #8)
export * from './longform-mix.js';     // longform-mix ↔ 소비자 (원자 #9)
export * from './blog-export.js';      // keyword-intel → wp-auto-blog 브릿지 (§8 단방향 JSON)
export * from './product-page.js';     // product-page-gen ↔ 소비자 (원자 #10)
export * from './youtube-upload.js';   // youtube-upload ↔ 소비자 (원자 #11)
// 다음 원자 착수 시 계약 추가:
//   export * from './render-job.js';       // slide-renderer ↔ 소비자
//   export * from './coupang-listing.js';  // coupang-connector ↔ 소비자
//   export * from './reply-event.js';      // manychat-reply ↔ 소비자
