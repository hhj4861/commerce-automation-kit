// Browser tests follow the same visible groups as an administrator.
export async function openAdminTool(page, name) {
  const group = ["영상 찾기", "원문·작업"].includes(name) ? "콘텐츠 준비"
    : name === "자료 만들기" || name.startsWith("번역 후보") || name === "앱 반영 확인" ? "검수·반영" : "학습 운영";
  const button = page.getByRole("button", { name, exact: true });
  if (name !== "AI 진단" && !(await button.isVisible()))
    await page.getByRole("navigation", { name: "업무 영역", exact: true }).getByRole("button", { name: group, exact: true }).click();
  await button.click();
  await page.getByRole("heading", { name: name.replace(/ \(\d+\)$/, ""), exact: true, level: 1 }).waitFor();
}
