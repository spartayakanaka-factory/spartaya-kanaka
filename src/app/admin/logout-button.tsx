"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="admin-logout"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/admin/login");
        router.refresh();
      }}
      type="button"
    >
      تسجيل الخروج
    </button>
  );
}
