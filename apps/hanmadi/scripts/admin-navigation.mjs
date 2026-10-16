// Browser tests follow the same visible groups as an administrator.
export async function openAdminTool(page, name) {
  name = ({ "자료 만들기": "회화 검수", "학습 관리": "검색·모델 적용" })[name] ?? name;
  if (name === "기존 음악 수집함") {
    await openAdminTool(page, "원문·작업");
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
    return;
  }
  const group = ["영상 찾기", "원문·작업"].includes(name) || name.startsWith("번역 후보") ? "콘텐츠 준비"
    : name === "회화 검수" || name === "음악 검수" || name === "검색·모델 적용" ? "검수·반영" : "학습 운영";
  const button = page.getByRole("button", { name, exact: true });
  if (name !== "AI 진단" && !(await button.isVisible()))
    await page.getByRole("navigation", { name: "업무 영역", exact: true }).getByRole("button", { name: group, exact: true }).click();
  await button.click();
  await page.getByRole("heading", { name: name.replace(/ \(\d+\)$/, ""), exact: true, level: 1 }).waitFor();
}
