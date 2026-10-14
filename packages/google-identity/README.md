# @cak/google-identity

Google Identity Services ID 토큰의 서버 검증 공통 모듈. Google 공개 JWKS에 대한 RS256 서명, issuer/audience/azp, 만료·발급 시각, nonce, verified email을 검사한다. 식별자는 이메일이 아닌 subject(sub)다.

앱이 nonce 발급·1회 사용, Origin/CSRF, 속도 제한, 계정 생성·연결·세션·권한을 담당한다. 이 패키지는 로그인 서버나 앱 간 SSO가 아니다. 원문 토큰·개인정보를 로깅하지 않는다.

Hanmadi는 독립 빌드에 맞춰 vendor tarball로 사용한다. Shopshorts의 기존 google-id-token 구현을 검토해 공통 검증 경계를 추출했으며, Shopshorts의 운영 인증은 이번 변경으로 전환하지 않는다.

```sh
npm install --workspaces=false --package-lock=false
npm test
npm pack --pack-destination ../../apps/hanmadi/vendor --workspaces=false
```

출처: [Google ID token 검증](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference).
