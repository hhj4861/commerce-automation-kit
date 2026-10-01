import test from "node:test";
import assert from "node:assert/strict";
import { adminPath, isAdminDeployment, learningAppHref } from "./deployment";
test("admin deployment is opt-in and does not change the learner app", () => {
  assert.equal(isAdminDeployment({}), false);
  assert.equal(learningAppHref({}), "/study");
  assert.equal(
    learningAppHref({
      HANMADI_DEPLOYMENT: "admin",
      HANMADI_APP_URL: "https://hanmadi-lake.vercel.app",
    }),
    "https://hanmadi-lake.vercel.app/study",
  );
  assert.throws(() =>
    learningAppHref({
      HANMADI_DEPLOYMENT: "admin",
      HANMADI_APP_URL: "javascript:alert(1)",
    }),
  );
});
test("admin deployment exposes only login, release identity and owner endpoints", () => {
  for (const path of ["/admin-login", "/api/auth", "/api/deployment", "/api/study/diagnostics/cron"])
    assert.equal(adminPath(path), "public");
  for (const path of [
    "/study/admin",
    "/api/study/admin",
    "/api/study/admin/learning",
    "/api/study/admin/videos",
    "/api/study/admin/diagnostics",
  ])
    assert.equal(adminPath(path), "owner");
  for (const path of [
    "/study",
    "/api/study",
    "/api/study/account",
    "/api/model-connections",
    "/api/register",
    "/api/auth/extra",
    "/study/admin-other",
    "/admin/tutors",
    "/trial",
  ])
    assert.equal(adminPath(path), "closed");
});
