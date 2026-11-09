import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { getDatabasePool } from "../../../src/lib/database.ts";
import { ModelManager, type AdminModel } from "./model-manager";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  "Основная генерация": "Nano Banana 2.1", "Премиум": "Nano Banana Pro", "Быстрый": "DeepSeek V4 Flash", "Качественный": "GPT‑5.4 Mini",
  "GPT Image": "GPT Image 2.5", "Умный": "Gemini Flash",
};
const money = (value: unknown) => Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function params(value: Record<string, unknown> | null) {
  const parameters = value ?? {};
  const items: string[] = [];
  if (parameters.aspect_ratio) items.push(String(parameters.aspect_ratio));
  if (parameters.image_resolution) items.push(String(parameters.image_resolution));
  if (parameters.resolution) items.push(String(parameters.resolution));
  if (parameters.duration) items.push(`${parameters.duration} сек.`);
  if (parameters.output_format) items.push(String(parameters.output_format).toUpperCase());
  if (parameters.generate_audio === false) items.push("без звука");
  if (parameters.maxOutputTokens) items.push(`до ${parameters.maxOutputTokens} токенов`);
  return items.join(" · ") || "Стандартные параметры";
}

function hasPremiumPresets(id: string, name: string) {
  return ["image-nano-banana-2-1", "image-nano-banana-pro", "image-gpt-image-sunburst", "video-seedance-2", "video-gemini-omni-flash"].includes(id) || name === "Gemini Omni 1.1 Flash";
}

function isPremiumTariff(id: string, parameters: Record<string, unknown> | null) {
  const value = parameters ?? {};
  if (id === "video-gemini-omni-flash") return true;
  if (["image-nano-banana-2-1", "image-nano-banana-pro", "image-gpt-image-sunburst"].includes(id)) return value.image_resolution === "4K" || value.resolution === "4K";
  return id === "video-seedance-2" && String(value.resolution) === "720p" && String(value.duration) === "8";
}

export default async function Page() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const database = getDatabasePool();
  const [models, tariffs, costs] = await Promise.all([
    database.query<Omit<AdminModel, "hasPremiumPresets">>(`SELECT id, display_name AS name, generation_kind::text AS kind, is_active AS active FROM model_configs ORDER BY generation_kind, display_name`),
    database.query<{ id: string; name: string; parameters: Record<string, unknown> | null; credits: string; ceiling: string }>(`SELECT c.id, c.display_name AS name, t.parameter_key AS parameters, t.credit_price::text AS credits, t.max_external_cost::text AS ceiling FROM tariff_versions t JOIN model_configs c ON c.id=t.model_config_id WHERE t.status='ACTIVE' ORDER BY c.display_name, t.credit_price`),
    database.query<{ month: string }>(`SELECT COALESCE(SUM(actual_cost) FILTER (WHERE actual_cost_currency='RUB' AND created_at>=date_trunc('month',CURRENT_TIMESTAMP)),0)::text AS month FROM generation_jobs`),
  ]);
  const premiumPlans = [
    ["Nano Banana 2.1 · 4K", "Финальное изображение в 4K", "Нужен тариф и проверка лимита"],
    ["Nano Banana Pro · 4K", "Финальное изображение в 4K", "Нужен тариф и проверка лимита"],
    ["GPT Image 2.5 · 4K", "Финальное изображение в 4K", "Нужен тариф и проверка лимита"],
    ["Gemini Omni 1.1 Flash", "Творческое видео 16:9 или 9:16", "Нужны проверка Polza и тариф"],
    ["Seedance 2 · 720p · 8 сек.", "3:4 · 265 кредитов", "Пресет подготовлен; раздел ещё закрыт"],
  ] as const;
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Настройки генераций</p><h1>Модели, тарифы и расходы</h1><p>Текущие цены и доступные настройки.</p></div><nav><Link href="/admin">Сводка</Link></nav></header><section className="admin-metrics"><article className="admin-metric"><span>Моделей</span><strong>{models.rows.length}</strong></article><article className="admin-metric"><span>Расходы за месяц</span><strong>{money(costs.rows[0]?.month)} ₽</strong></article></section><ModelManager initialModels={models.rows.map((model) => ({ ...model, name: labels[model.name] ?? model.name, hasPremiumPresets: hasPremiumPresets(model.id, model.name) }))} /><section className="admin-section admin-tariffs"><h2>Действующие тарифы</h2><div className="table-wrap"><table><thead><tr><th>Модель</th><th>Параметры</th><th>Кредиты</th><th>Потолок расхода</th></tr></thead><tbody>{tariffs.rows.map((tariff, index) => <tr key={`${tariff.id}-${index}`}><td>{labels[tariff.name] ?? tariff.name} {isPremiumTariff(tariff.id, tariff.parameters) && <span className="premium-badge" title="Премиальный пресет">★ Премиум</span>}</td><td>{params(tariff.parameters)}</td><td>{money(tariff.credits)}</td><td>{money(tariff.ceiling)} ₽</td></tr>)}</tbody></table></div></section><section className="admin-section admin-premium-plans"><div className="admin-section-heading"><div><h2>Планируемые премиум-пресеты</h2><p className="admin-section-note">Перед включением подтвердите Polza, задайте провайдера и точный тариф — это защищает от произвольного дорогого запуска.</p></div></div><div className="table-wrap"><table><thead><tr><th>Вариант</th><th>Сценарий</th><th>Готовность</th><th></th></tr></thead><tbody>{premiumPlans.map(([title, details, status]) => <tr key={title}><td><span className="premium-badge">★ Премиум</span> {title}</td><td>{details}</td><td>{status}</td><td><a className="admin-plan-button" href="#models">К настройкам</a></td></tr>)}</tbody></table></div></section></section></main>;
}
