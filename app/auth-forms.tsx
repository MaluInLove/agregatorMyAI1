"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [message, setMessage] = useState<string>(); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); const data = await response.json() as { error?: string; user?: { role: "ADMIN" | "USER" | "GUEST" } }; if (!response.ok) return setMessage(data.error ?? "Не удалось войти."); router.push(data.user?.role === "ADMIN" ? "/" : "/workspace"); }
  return <AuthCard title="Вход в агрегатор"><form onSubmit={submit}><label>Email<input name="email" type="email" required /></label><label>Пароль<input name="password" type="password" required /></label><button>Войти</button></form><a href="/forgot-password">Забыли пароль?</a>{message && <p role="alert">{message}</p>}</AuthCard>;
}

export function ActivateForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>(); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: form.get("password") }) }); const data = await response.json() as { error?: string }; if (!response.ok) return setMessage(data.error ?? "Не удалось активировать приглашение."); router.push("/workspace"); }
  return <AuthCard title="Активация доступа"><p>Задайте пароль не короче 12 символов. После активации начнутся 30 дней доступа.</p><form onSubmit={submit}><label>Пароль<input name="password" type="password" minLength={12} required /></label><button>Активировать доступ</button></form>{message && <p role="alert">{message}</p>}</AuthCard>;
}

export function EmergencyLoginForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>(); const router = useRouter();
  async function submit() {
    const response = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, emergencyLogin: true }) });
    const data = await response.json() as { error?: string; user?: { role: "ADMIN" | "USER" | "GUEST" } };
    if (!response.ok) return setMessage(data.error ?? "Не удалось выполнить вход.");
    router.push(data.user?.role === "ADMIN" ? "/" : "/workspace");
  }
  return <AuthCard title="Безопасный вход"><p>Это одноразовая аварийная ссылка для уже созданного аккаунта. Нажмите кнопку, чтобы войти. Срок доступа, кредиты и пароль не изменятся.</p><button onClick={() => void submit()}>Войти в аккаунт</button>{message && <p role="alert">{message}</p>}</AuthCard>;
}

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) }); const data = await response.json(); setMessage(data.message ?? "Проверьте почту."); }
  return <AuthCard title="Восстановление пароля"><form onSubmit={submit}><label>Email<input name="email" type="email" required /></label><button>Отправить ссылку</button></form>{message && <p role="status">{message}</p>}</AuthCard>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>(); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: form.get("password") }) }); const data = await response.json(); if (!response.ok) return setMessage(data.error); router.push("/login"); }
  return <AuthCard title="Новый пароль"><form onSubmit={submit}><label>Новый пароль<input name="password" type="password" minLength={12} required /></label><button>Сохранить пароль</button></form>{message && <p role="alert">{message}</p>}</AuthCard>;
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) { return <main><section className="card" style={{ maxWidth: 480, margin: "8vh auto" }}><p className="eyebrow">Учебный AI-агрегатор</p><h1>{title}</h1>{children}</section></main>; }
