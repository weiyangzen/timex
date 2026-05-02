import { Suspense } from "react";
import { LoginForm } from "../../login/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loginPage" />}>
      <LoginForm />
    </Suspense>
  );
}
