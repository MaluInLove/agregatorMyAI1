import { ActivateForm, EmergencyLoginForm } from "../auth-forms";
import { invitationLanding } from "../../src/lib/auth";

export const dynamic = "force-dynamic";
export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <main><p>Ссылка недействительна.</p></main>;
  const landing = await invitationLanding(token);
  if (!landing) return <main><p>Эта ссылка больше не действует или срок её действия истёк.</p></main>;
  if (landing === "USED") return <main><section className="card" style={{ maxWidth: 480, margin: "8vh auto" }}><p className="eyebrow">Учебный AI-агрегатор</p><h1>Ссылка уже использована</h1><p>Вы уже вошли по этой ссылке. Она одноразовая и больше не действует.</p><a href="/login">Перейти ко входу</a></section></main>;
  return landing === "EMERGENCY_LOGIN" ? <EmergencyLoginForm token={token} /> : <ActivateForm token={token} />;
}
