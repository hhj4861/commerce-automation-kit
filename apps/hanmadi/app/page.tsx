import { redirect } from "next/navigation";
import { isAdminDeployment } from "@/lib/deployment";
export default function Home() {
  redirect(isAdminDeployment() ? "/study/admin" : "/study");
}
