import { getConversationTutor } from "@/lib/conversation-access";
import { V2Admin } from "@/components/v2-admin";
import Link from "next/link";
import "../study.css";
export default async function ContentAdmin() {
  if ((await getConversationTutor())?.r !== "owner")
    return (
      <main className="hm">
        <section className="hm-panel">
          <h1>콘텐츠 관리자 로그인</h1>
          <p>이 화면은 소유자 계정만 사용할 수 있어요.</p>
          <Link href="/login?from=%2Fstudy%2Fadmin">관리자 로그인</Link>
          <br />
          <Link href="/study">학습으로 돌아가기</Link>
        </section>
      </main>
    );
  return <V2Admin />;
}
