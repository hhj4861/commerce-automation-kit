import type { Metadata } from "next";
import { Gowun_Dodum, IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
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
    default: "Hanmadi — Korean, one phrase at a time",
    template: "%s | Hanmadi",
  },
  description:
    "한마디씩, 확실하게. Lesson notes, vocabulary, and homework — everything from our Korean lessons in one link.",
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

  return (
    <html
      lang="en"
      className={`${gowun.variable} ${plexKr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header isTutor={session !== null} />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
