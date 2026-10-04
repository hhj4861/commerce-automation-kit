import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "개인정보 처리방침 | Hanmadi" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 text-sm leading-7 text-ink">
      <Link href="/study" className="text-accent underline underline-offset-4">한마디로 돌아가기</Link>
      <h1 className="mt-6 font-display text-3xl">개인정보 처리방침</h1>
      <p className="mt-3 text-ink-soft">Hanmadi · 적용일 2026년 10월 5일</p>
      <p className="mt-6">한마디는 계정을 확인하고 기기가 바뀌어도 학습을 이어가기 위해 아래 정보를 처리합니다. Google 로그인은 선택 사항이며 기존 아이디 로그인도 사용할 수 있습니다.</p>

      <section className="mt-9" aria-labelledby="account-data">
        <h2 id="account-data" className="font-display text-xl">계정과 로그인</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Google 로그인: Google 계정 식별자, 이름, 이메일, 이메일 인증 여부를 받아 본인 여부를 확인합니다. 계정 식별자는 해시로 바꿔 사용하고 내부 계정 ID·이름·이메일·가입 시각을 저장합니다.</li>
          <li>Google ID 토큰은 로그인 요청을 검증하는 데 사용합니다. Google 비밀번호나 Google 서비스의 access/refresh token은 수집·저장하지 않습니다. Google 프로필 사진도 계정에 저장하지 않습니다.</li>
          <li>아이디 로그인: 아이디와 복원이 불가능하도록 해시 처리한 비밀번호를 저장합니다.</li>
          <li>로그인 유지에 필요한 HttpOnly 쿠키를 사용합니다. 학습자 세션은 최대 30일이며 로그아웃하면 해당 브라우저의 로그인 쿠키를 지웁니다. Google 로그인 확인용 임시 쿠키는 최대 5분 동안 사용합니다.</li>
          <li>과도한 로그인 시도를 막기 위해 IP 주소의 해시와 요청 횟수를 처리합니다.</li>
        </ul>
      </section>

      <section className="mt-9" aria-labelledby="study-data">
        <h2 id="study-data" className="font-display text-xl">학습 기록과 AI 기능</h2>
        <p className="mt-3">학습 언어·난이도·상황·연습 이력과 설정, 저장한 내 표현·단어장·복습 기록은 계정별로 보관합니다. 번역 자동 반영 등 저장 옵션을 끄더라도 이미 저장된 자료는 자동 삭제되지 않습니다.</p>
        <p className="mt-3">AI 대화·번역·음성 기능을 사용하면 입력 문장·대화 맥락·음성 등 처리에 필요한 내용이 선택한 AI 공급자 또는 앱의 AI 처리 서버로 전송됩니다. 원음과 전체 대화는 한마디 2.0 학습 기록에 저장하지 않습니다. 공급자의 처리·보관 정책은 별도로 적용됩니다. 개인정보나 민감한 내용은 입력하지 마세요.</p>
        <p className="mt-3">기존 튜터 수업에서 대화 저장 기능을 사용하면 별도 동의 화면에서 안내한 대로 회화 서버에 대화가 보관되고 튜터·운영자가 확인할 수 있습니다. 개인 AI 계정 연결은 별도 동의 후 연결 자격을 서버에 암호화해 보관합니다.</p>
        <p className="mt-3">공용 학습 자료 제공은 번역 화면에서 별도로 선택합니다. 동의한 짧은 일반 표현만 관리자 검수를 거쳐 공용 교재와 AI 답변의 참고 자료로 사용합니다. Google 계정 정보는 공용 교재나 모델 학습 자료로 사용하지 않습니다.</p>
      </section>

      <section className="mt-9" aria-labelledby="storage-sharing">
        <h2 id="storage-sharing" className="font-display text-xl">저장·이용과 외부 서비스</h2>
        <p className="mt-3">한마디 웹 서비스는 Vercel에서 실행되고, 계정과 학습 기록은 Upstash Redis에 저장합니다. Google은 Google 로그인 인증을 처리합니다. AI 기능에 입력한 내용은 해당 기능의 공급자에게 전달되며, Google에서 받은 계정 정보를 광고 타기팅이나 판매 목적으로 사용하지 않습니다.</p>
        <p className="mt-3">계정과 학습 기록에는 현재 자동 삭제 기한이 설정돼 있지 않아 삭제할 때까지 보관합니다. 세션 만료, 로그아웃, Google 연결 승인 철회만으로 한마디 계정이나 학습 기록이 삭제되지는 않습니다.</p>
      </section>

      <section className="mt-9" aria-labelledby="choices">
        <h2 id="choices" className="font-display text-xl">확인·삭제·동의 철회</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>저장한 표현과 단어장은 앱에서 확인하고 삭제할 수 있습니다. 단어장에서 빼는 것과 내 표현 자체를 삭제하는 것은 구분됩니다.</li>
          <li>제공한 공용 자료는 번역 화면의 회수 기능으로 철회할 수 있습니다. 연결된 공용 교재는 회수되며 이미 전달된 AI 답변이나 외부 공급자 로그까지 소급 삭제되는 것은 아닙니다.</li>
          <li>개인 AI 연결은 앱에서 해제할 수 있습니다. 외부 공급자의 앱 승인 취소는 해당 공급자 계정 설정에서 별도로 진행합니다.</li>
          <li>계정 전체의 열람·정정·삭제 또는 관련 문의는 아래 운영자 이메일로 요청해 주세요. 현재 앱에는 계정 전체를 직접 탈퇴하는 기능이 없습니다. 요청 처리를 위해 계정 소유 확인이 필요할 수 있습니다.</li>
        </ul>
        <p className="mt-3">운영·개인정보 문의: Hanmadi 운영자 홍현종 · <a className="text-accent underline underline-offset-4" href="mailto:guswhd1085@gmail.com">guswhd1085@gmail.com</a></p>
        <p className="mt-3">처리 항목이나 이용 목적이 바뀌면 이 페이지에 알리고, 추가 동의가 필요한 기능은 별도로 안내합니다.</p>
      </section>
    </article>
  );
}
