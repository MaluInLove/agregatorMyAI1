"use client";

import { useEffect, useMemo, useState } from "react";

type ModelConfig = {
  id: string;
  displayName: string;
  technicalModelId: string;
  generationKind: "TEXT" | "IMAGE" | "VIDEO";
  isActive: boolean;
};

export function Stage0Launcher() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [parameters, setParameters] = useState("{}");
  const [message, setMessage] = useState("Загрузка подтверждённых моделей…");
  const [sending, setSending] = useState(false);
  const activeModels = useMemo(() => models.filter((model) => model.isActive), [models]);

  useEffect(() => {
    void fetch("/api/stage0/model-configs", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось получить конфигурацию моделей.");
        return response.json() as Promise<ModelConfig[]>;
      })
      .then((loaded) => {
        setModels(loaded);
        setModelId(loaded.find((model) => model.isActive)?.id ?? "");
        setMessage(loaded.some((model) => model.isActive) ? "Выберите модель и создайте тестовую задачу." : "Все модели выключены: запуск защищён от случайных расходов.");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Не удалось получить конфигурацию моделей."));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsedParameters: Record<string, unknown>;
    try {
      const parsed = JSON.parse(parameters) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      parsedParameters = parsed as Record<string, unknown>;
    } catch {
      setMessage("Параметры должны быть JSON-объектом, например {}.");
      return;
    }
    setSending(true);
    setMessage("Ставим задачу в очередь…");
    try {
      const response = await fetch("/api/stage0/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelConfigId: modelId, prompt, parameters: parsedParameters }),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать задачу.");
      setMessage(`Задача ${payload.id} создана. Worker продолжит работу независимо от вкладки.`);
      setPrompt("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать задачу.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="launcher" aria-labelledby="launch-title">
      <div>
        <p className="eyebrow">Запуск теста</p>
        <h2 id="launch-title">Очередь Polza</h2>
        <p className="hint">Доступны только включённые и подтверждённые модели. Ключ API остаётся на сервере.</p>
      </div>
      <form onSubmit={submit}>
        <label>Модель
          <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!activeModels.length || sending}>
            {!activeModels.length ? <option value="">Нет включённых моделей</option> : activeModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.generationKind}</option>)}
          </select>
        </label>
        <label>Промпт
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={12000} placeholder="Опишите тестовую генерацию" disabled={!activeModels.length || sending} required />
        </label>
        <label>Параметры JSON
          <input value={parameters} onChange={(event) => setParameters(event.target.value)} spellCheck={false} disabled={!activeModels.length || sending} />
        </label>
        <button type="submit" disabled={!modelId || !prompt.trim() || sending}>{sending ? "Отправляем…" : "Создать задачу"}</button>
      </form>
      <p className="launch-message" role="status">{message}</p>
    </section>
  );
}
