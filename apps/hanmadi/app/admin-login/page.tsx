import { notFound } from "next/navigation";
import { isAdminDeployment } from "@/lib/deployment";
import { AdminLogin } from "@/components/admin-login";
export default function AdminLoginPage() {
  if (!isAdminDeployment()) notFound();
  return <AdminLogin />;
}
