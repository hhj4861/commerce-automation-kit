import assert from "node:assert/strict";
import { openAdminTool } from "./admin-navigation.mjs";
export async function prepareSource(page, { title, video, language, source, purpose = "music", beforeSave, rights = "Original fixture with permission for AI processing and learning reuse." }) {
  await openAdminTool(page, "원문·작업");
  await page.getByText("새 원본 등록", { exact: true }).click();
  await page.getByLabel("원본 제목", { exact: true }).fill(title);
  await page.getByLabel("YouTube 링크 또는 ID", { exact: true }).fill(video);
  await page.getByLabel("원문 언어", { exact: true }).selectOption(language);
  await page.getByLabel("학습 용도", { exact: true }).selectOption(purpose);
  await page.getByRole("button", { name: "원본 등록", exact: true }).click();
  await page.getByRole("region", { name: "선택한 원문", exact: true }).waitFor();
  await saveSource(page, source, rights, beforeSave);
}
export async function saveSource(page, source, rights = "Original fixture with permission for AI processing and learning reuse.", beforeSave) {
  const raw = page.getByLabel("보관할 원문", { exact: true });
  if (!(await raw.isVisible())) await page.getByText("새 원문 버전 추가", { exact: true }).click();
  await raw.fill(source);
  if (beforeSave) await beforeSave();
  await page.getByLabel("원문 보관·학습 이용 근거", { exact: true }).fill(rights);
  await page.getByLabel("이 원문을 보관하고 학습 자료 제작에 이용할 권한을 확인했어요.").check();
  await page.getByRole("button", { name: "새 원문 버전 저장", exact: true }).click();
  await page.getByRole("button", { name: "정리·재개", exact: true }).click();
  await page.getByRole("heading", { name: /원문 정리 완료/ }).waitFor();
}
export async function musicReview(page, artist = "Hanmadi fixture") {
  await page.getByRole("button", { name: "음악 자료 만들기로", exact: true }).click();
  await page.getByRole("heading", { name: "음악 자료 생성·검수", exact: true }).waitFor();
  assert(await page.getByLabel("학습에 사용할 원문").getAttribute("readonly") !== null);
  await page.getByLabel("아티스트", { exact: true }).fill(artist);
  await page.getByRole("checkbox", { name: /원문을 AI에 제공/ }).check();
  await page.getByRole("button", { name: /^(음악 초안 준비|음악 초안 갱신)$/, exact: true }).click();
}
