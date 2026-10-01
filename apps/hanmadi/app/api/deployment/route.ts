import { isAdminDeployment } from "@/lib/deployment";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      application: isAdminDeployment() ? "hanmadi-admin" : "hanmadi",
      revision: process.env.HANMADI_RELEASE_SHA || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
