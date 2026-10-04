import { googleAccountRequest } from "@/lib/google-learner-auth";
export const runtime = "nodejs";
export const GET = (req: Request) => googleAccountRequest(req);
export const POST = (req: Request) => googleAccountRequest(req);
