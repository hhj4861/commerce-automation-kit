/**
 * 초대 메일 발송.
 *
 * RESEND_API_KEY가 설정돼 있으면 Resend로 실제 메일을 보낸다.
 * 없으면 발송을 건너뛰고 sent:false를 반환한다 — 이때는 관리 화면에서
 * 초대 링크를 복사해 직접 전달하면 된다 (링크 자체가 메일 인증 역할).
 *
 * 설정
 * - RESEND_API_KEY : Resend API 키
 * - MAIL_FROM      : 보내는 주소 (예: Hanmadi <noreply@yourdomain.com>)
 *                    미설정 시 Resend 테스트 주소(onboarding@resend.dev) 사용
 */

export type SendResult = { sent: boolean; error?: string };

export async function sendInviteEmail(params: {
  to: string;
  inviterName: string;
  url: string;
  expiresAt: number;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY 미설정" };

  const expires = new Date(params.expiresAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "Hanmadi <onboarding@resend.dev>",
        to: [params.to],
        subject: "[Hanmadi] 한국어 튜터 스튜디오 초대",
        html: inviteHtml({ ...params, expires }),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status} ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "발송 실패" };
  }
}

function inviteHtml(p: {
  inviterName: string;
  url: string;
  expires: string;
}): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#FFF9F2;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#2B2622">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0;font-size:13px;letter-spacing:.15em;color:#B8846A">HANMADI</p>
    <h1 style="margin:12px 0 0;font-size:24px">한국어 튜터로 초대되었어요</h1>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#6B6259">
      ${escapeHtml(p.inviterName)} 튜터님이 Hanmadi 스튜디오에 초대했어요.<br>
      아래 버튼을 눌러 이름과 PIN을 등록하면 바로 사용할 수 있어요.
    </p>
    <p style="margin:28px 0 0">
      <a href="${p.url}" style="display:inline-block;background:#D9734E;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px">PIN 등록하기</a>
    </p>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#9A9089">
      이 링크는 ${p.expires}까지 유효하고, 한 번만 사용할 수 있어요.<br>
      버튼이 눌리지 않으면 아래 주소를 복사해 브라우저에 붙여넣어 주세요.
    </p>
    <p style="margin:8px 0 0;font-size:12px;word-break:break-all;color:#B8846A">${p.url}</p>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #EFE7DE;font-size:12px;color:#9A9089">
      본인이 요청하지 않은 메일이라면 무시하셔도 됩니다.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
