import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email} />
      {children}
    </div>
  );
}
