import { cookies } from "next/headers";
import {
  LEARNING_LANGUAGE_COOKIE,
  resolveLearningLanguage,
} from "@/lib/learning-language";
import type { Metadata } from "next";
import { Gowun_Dodum, IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getTutorSession } from "@/lib/students";

const gowun = Gowun_Dodum({
  variable: "--font-gowun",
  weight: "400",
  subsets: ["latin"],
});

const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "한마디 — 영어 · 일본어 · 태국어 · 스페인어",
    template: "%s | Hanmadi",
  },
  description:
    "한마디씩, 확실하게. 영어·일본어·태국어·스페인어 말하기와 여행 번역, AI 회화, 수업 노트와 복습을 한곳에서.",
  // 개인 수업 도구 + 학생 포털 — 검색엔진 노출 차단
  robots: { index: false, follow: false },
};

/**
 * 세션 쿠키를 읽으므로 모든 라우트가 동적 렌더가 된다.
 * 의도한 비용이다 — 학생에게도 열린 /library에서 튜터 전용 내비를 숨기려면
 * 상단 크롬이 "지금 보는 사람이 튜터인가"를 서버에서 알아야 한다.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getTutorSession();
  const language = resolveLearningLanguage(
    undefined,
    (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value,
  );

  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      className={`${gowun.variable} ${plexKr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteChrome
          chrome={
            <>
              <Header isTutor={session !== null} savedLanguage={language} />
              <main className="flex-1">{children}</main>
              <Footer />
            </>
          }
        >
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
