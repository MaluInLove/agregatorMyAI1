import { ResetPasswordForm } from "../auth-forms";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token } = await searchParams; return token ? <ResetPasswordForm token={token} /> : <main><p>Ссылка сброса недействительна.</p></main>; }
