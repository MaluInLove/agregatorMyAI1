import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../src/lib/auth";

export default async function WorkspacePage() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer) redirect("/login");
  if (viewer.role === "ADMIN") redirect("/");
  const guest = viewer.role === "GUEST";
  return <main><section className="card" style={{ maxWidth: 680, margin: "8vh auto" }}><p className="eyebrow">Вход выполнен</p><h1>Здравствуйте{viewer.displayName ? `, ${viewer.displayName}` : ""}!</h1><p>{guest ? "Вы вошли в гостевой аккаунт. Он доступен 48 часов с момента активации." : "Вы успешно вошли в ученический аккаунт. Аварийная ссылка использована; срок доступа, кредиты и пароль не менялись."}</p><p>Рабочее пространство с текстами, изображениями, видео и историей будет подключено в следующей задаче. Этот экран подтверждает, что аккаунт работает и не имеет доступа к админскому стенду.</p></section></main>;
}
