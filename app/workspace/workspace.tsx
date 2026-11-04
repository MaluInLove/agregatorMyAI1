"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { WorkspaceData, WorkspaceTheme } from "../../src/lib/workspace";

type Mode = "text" | "image" | "video" | "premium";
const modes: { id: Mode; title: string; hint: string }[] = [
  { id: "text", title: "Тексты", hint: "Собирайте идеи, задания и будущие запросы в личных диалогах." },
  { id: "image", title: "Изображения", hint: "Сохраните визуальную задачу и прикрепите референсы — запуск появится на следующем этапе." },
  { id: "video", title: "Видео", hint: "Подготовьте концепцию ролика, кадр и материалы для будущей генерации." },
  { id: "premium", title: "Премиум-генерации", hint: "Здесь будут доступны подтверждённые дорогие пресеты с точной стоимостью." },
];
const modeIcons: Record<Mode, string> = { text: "/navigation-icons/text-chats.svg", image: "/navigation-icons/image.svg", video: "/navigation-icons/video.svg", premium: "/navigation-icons/premium.svg" };
function chatVisual(title: string): { icon: string; label: string } { const match = title.match(/^(Тексты|Изображения|Видео|Премиум(?:-генерации)?):\s*/i); const source = title.toLowerCase(); const mode: Mode = source.includes("премиум") ? "premium" : source.includes("девушк") || source.includes("видео") ? "video" : source.includes("картинк") || source.includes("изображ") ? "image" : "text"; return { icon: modeIcons[mode], label: match ? title.slice(match[0].length) : title }; }

function ChatThread({ chat }: { chat: WorkspaceData["chats"][number] }) {
  return <section className="chat-thread" aria-label={`Чат: ${chatVisual(chat.title).label}`}>
    <div className="chat-thread-messages">{chat.messages.map((message) => <div key={message.id} className={message.role === "USER" ? "chat-message user" : "chat-message"}><p className="chat-bubble">{message.content}</p><time className="chat-message-date" dateTime={message.createdAt}>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}</time></div>)}</div>
  </section>;
}

type WorkspaceChat = WorkspaceData["chats"][number];

function ChatRow({ chat, menuOpen, projects, onMenu, onAction }: { chat: WorkspaceChat; menuOpen: boolean; projects: WorkspaceData["projects"]; onMenu: (id: string | null) => void; onAction: (id: string, action: string, projectId?: string | null) => void }) {
  const visual = chatVisual(chat.title);
  return <div className="chat-row"><button className="chat-item" onClick={() => undefined}><strong><Image className="chat-kind-icon" src={visual.icon} alt="" width={15} height={15} />{visual.label}</strong></button><button className="chat-more" onClick={() => onMenu(menuOpen ? null : chat.id)}>⋯</button>{menuOpen && <div className="chat-menu"><span>Сообщения {chat.messageCount} / 800</span><button onClick={() => onAction(chat.id,"pin")}><Image className="chat-menu-icon" src="/navigation-icons/clip.svg" alt="" width={20} height={20} />{chat.isPinned ? "Открепить" : "Закрепить"}</button><button onClick={() => onAction(chat.id,"rename")}><Image className="chat-menu-icon" src="/navigation-icons/pencil.svg" alt="" width={20} height={20} />Переименовать</button><details><summary><Image className="chat-menu-icon" src="/navigation-icons/folder.svg" alt="" width={20} height={20} />В проект</summary><button onClick={() => onAction(chat.id,"move",null)}>Без проекта</button>{projects.map((project) => <button key={project.id} onClick={() => onAction(chat.id,"move",project.id)}><i style={{background:project.color}} />{project.name}</button>)}</details><button className="danger" onClick={() => onAction(chat.id,"delete")}><Image className="chat-menu-icon" src="/navigation-icons/delete.svg" alt="" width={20} height={20} />Удалить</button></div>}</div>;
}

function ChatHistory({ chats, projects, menuChatId, onMenu, onAction }: { chats: WorkspaceChat[]; projects: WorkspaceData["projects"]; menuChatId: string | null; onMenu: (id: string | null) => void; onAction: (id: string, action: string, projectId?: string | null) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pinned = chats.filter((chat) => chat.isPinned);
  const today = new Date();
  const isToday = (date: string) => { const value = new Date(date); return value.getFullYear() === today.getFullYear() && value.getMonth() === today.getMonth() && value.getDate() === today.getDate(); };
  const todayChats = chats.filter((chat) => !chat.isPinned && isToday(chat.updatedAt));
  const recent = chats.filter((chat) => !chat.isPinned && !isToday(chat.updatedAt));
  const group = (title: string, items: WorkspaceChat[], accent = false) => { const isCollapsed = Boolean(collapsed[title]); const canCollapse = items.length > 0; return <section className="chat-group" key={title}><button className={accent ? "chat-group-heading" : "history-label"} disabled={!canCollapse} onClick={() => canCollapse && setCollapsed((current) => ({ ...current, [title]: !isCollapsed }))}><span>{title}</span>{canCollapse && <Image className="chat-group-toggle" src={isCollapsed ? "/navigation-icons/group-out.svg" : "/navigation-icons/group-in.svg"} alt="" width={16} height={16} />}</button>{!isCollapsed && <div className="chat-list">{items.map((chat) => <ChatRow key={chat.id} chat={chat} menuOpen={menuChatId === chat.id} projects={projects} onMenu={onMenu} onAction={onAction} />)}</div>}</section>; };
  return <>{pinned.length > 0 && group("Избранное", pinned, true)}{group("Сегодня", todayChats)}{group("Ранее", recent)}</>;
}

export function Workspace({ viewer, initialData }: { viewer: { displayName: string | null; isGuest: boolean; isAdmin: boolean }; initialData: WorkspaceData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData); const [mode, setMode] = useState<Mode>("text"); const [historyOpen, setHistoryOpen] = useState(true);
  const [composer, setComposer] = useState(""); const [projectId, setProjectId] = useState<string | null>(null); const [selectedChatId, setSelectedChatId] = useState<string | null>(null); const [sidebarTab, setSidebarTab] = useState<"chats" | "projects">("chats"); const [menuChatId, setMenuChatId] = useState<string | null>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const fileInput = useRef<HTMLInputElement>(null);
  const active = modes.find((item) => item.id === mode)!;
  const selectedChat = selectedChatId ? data.chats.find((chat) => chat.id === selectedChatId) ?? null : null;

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && !target.closest(".chat-menu, .chat-more")) setMenuChatId(null);
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  useEffect(() => {
    function selectHistoryChat(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".new-chat")) { setSelectedChatId(null); return; }
      const chatButton = target.closest(".chat-item");
      if (!chatButton) return;
      const index = Array.from(document.querySelectorAll(".chat-item")).indexOf(chatButton);
      const chat = data.chats[index];
      if (!chat) return;
      setSelectedChatId(chat.id);
      setProjectId(chat.projectId);
      setComposer("");
      setNotice("");
      window.setTimeout(() => setNotice(""), 0);
    }
    document.addEventListener("pointerdown", selectHistoryChat);
    return () => document.removeEventListener("pointerdown", selectHistoryChat);
  }, [data.chats]);

  useEffect(() => {
    if (!menuChatId) return;
    function placeMenu() {
      const index = data.chats.findIndex((chat) => chat.id === menuChatId);
      const button = document.querySelectorAll<HTMLElement>(".chat-more")[index];
      const menu = document.querySelector<HTMLElement>(".chat-menu");
      if (!button || !menu) return;
      const buttonBox = button.getBoundingClientRect();
      const margin = 14;
      const safeGap = 12;
      const left = Math.min(buttonBox.right + margin, window.innerWidth - menu.offsetWidth - safeGap);
      const top = Math.min(Math.max(safeGap, buttonBox.top), window.innerHeight - menu.offsetHeight - safeGap);
      menu.style.left = `${Math.max(safeGap, left)}px`;
      menu.style.top = `${Math.max(safeGap, top)}px`;
    }
    const frame = window.requestAnimationFrame(placeMenu);
    window.addEventListener("resize", placeMenu);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", placeMenu); };
  }, [data.chats, menuChatId]);

  async function reload() { const response = await fetch("/api/workspace", { cache: "no-store" }); if (response.ok) setData(await response.json() as WorkspaceData); }
  async function chooseTheme(theme: WorkspaceTheme) { setData((current) => ({ ...current, theme })); const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }); if (!response.ok) { setNotice("Не удалось сохранить тему."); await reload(); } }
  async function addProject() { const name = window.prompt("Название проекта"); if (!name) return; setBusy(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "project", name }) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); await reload(); }
  async function saveIdea() { if (!composer.trim()) return setNotice("Сначала напишите идею или промпт."); setBusy(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedChatId ? { action: "message", chatId: selectedChatId, content: composer } : { action: "chat", title: composer.trim().slice(0, 56), projectId, content: composer, workspaceKind: mode.toUpperCase() }) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); setComposer(""); setNotice(selectedChatId ? "Сообщение добавлено в открытый чат." : "Идея сохранена в личной истории. Генерация станет доступна на следующем этапе."); await reload(); }
  async function upload(file: File) { setBusy(true); const form = new FormData(); form.set("file", file); const response = await fetch("/api/workspace/references", { method: "POST", body: form }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); setNotice("Референс добавлен в личное пространство."); await reload(); }
  async function chatAction(id: string, action: string, projectId?: string | null) { const title = action === "rename" ? window.prompt("Новое название чата") ?? undefined : undefined; if (action === "rename" && !title) return; if (action === "delete" && !window.confirm("Удалить чат из истории?")) return; const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({scope:"chat",id,action,title,projectId}) }); if (!response.ok) setNotice((await response.json() as {error:string}).error); else { if (action === "delete" && selectedChatId === id) setSelectedChatId(null); setMenuChatId(null); await reload(); } }

  return <main className="workspace-shell" data-theme={data.theme}>
    <header className="workspace-topbar"><Link className="workspace-mark" href="/workspace">AI · поток</Link><nav aria-label="Разделы">{modes.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>{item.title}</button>)}</nav><div className="workspace-user"><span>{viewer.displayName || (viewer.isAdmin ? "Преподаватель" : "Ученик")}{viewer.isAdmin ? " · администратор" : ""}</span>{viewer.isAdmin && <Link className="logout" href="/">Стенд</Link>}<button className="logout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>Выйти</button></div></header>
    <div className="workspace-grid">
      <aside className="workspace-sidebar"><div className="sidebar-tabs"><button className={sidebarTab === "chats" ? "active" : ""} onClick={() => setSidebarTab("chats")}>Чаты</button><button className={sidebarTab === "projects" ? "active" : ""} onClick={() => setSidebarTab("projects")}>Проекты</button></div>{sidebarTab === "chats" ? <div className="sidebar-content"><button className="new-chat" disabled={busy} onClick={() => { setSelectedChatId(null); setMode("text"); setComposer(""); setNotice(""); }}>＋ Новый чат</button>{data.chats.length ? <ChatHistory chats={data.chats} projects={data.projects} menuChatId={menuChatId} onMenu={setMenuChatId} onAction={(id, action, targetProjectId) => void chatAction(id, action, targetProjectId)} /> : <p className="sidebar-empty">Создайте первый чат.</p>}</div> : <div className="sidebar-content"><div className="projects-heading"><span>Проекты</span><button onClick={addProject} disabled={busy}>＋</button></div><div className="project-list">{data.projects.length ? data.projects.map((project) => <button key={project.id} className={projectId === project.id ? "project active-project" : "project"} onClick={() => setProjectId(project.id)}><i style={{background:project.color}} />{project.name}<small>{project.chatCount}</small></button>) : <p className="sidebar-empty">Проектов пока нет.</p>}</div></div>}</aside>
      <section className="workspace-stage"><div className="stage-title"><div><p className="eyebrow">Личное пространство</p><h1>{active.title}</h1><p>{active.hint}</p></div>{viewer.isGuest && <span className="guest-badge">Гостевой доступ · 48 часов</span>}</div>{selectedChat ? <ChatThread chat={selectedChat} /> : <div className="empty-stage"><div className="empty-icon">✦</div><h2>{data.chats.length ? "Продолжайте собирать материалы" : "Начните с первой идеи"}</h2><p>Это подготовительный этап: ничего не отправляется внешнему провайдеру и кредиты не списываются.</p><div className="pill-row"><span>Только ваши данные</span><span>Без запуска генерации</span></div></div>}<div className="composer"><textarea value={composer} onChange={(event) => setComposer(event.target.value)} maxLength={8000} placeholder={mode === "text" ? "Опишите задачу или черновик промпта…" : "Опишите желаемый результат, стиль и детали…"} /><div className="composer-bottom"><span>{selectedChat ? `Чат: ${chatVisual(selectedChat.title).label}` : projectId ? `Проект: ${data.projects.find((project) => project.id === projectId)?.name}` : "Личная история"}</span><button className="primary" disabled={busy} onClick={saveIdea}>{selectedChat ? "Добавить сообщение" : "Сохранить идею"} <span>↑</span></button></div></div>{notice && <p className="workspace-notice" role="status">{notice}</p>}</section>
      <aside className="workspace-settings"><div className="settings-section"><h2>Параметры</h2><label>Режим<select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>{modes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p className="muted">Настройки запуска, модели и стоимость будут подключены после проверки очереди.</p></div><div className="settings-section"><div className="settings-row"><h2>Референсы</h2><button className="text-button" disabled={busy} onClick={() => fileInput.current?.click()}>Добавить</button></div><input className="sr-only" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />{data.references.length ? <ul className="reference-list">{data.references.map((asset) => <li key={asset.id}><a href={`/api/workspace/assets/${asset.id}`}>{asset.originalFilename || "Референс"}</a><small>{Math.ceil(Number(asset.byteSize) / 1024)} КБ</small></li>)}</ul> : <button className="reference-drop" onClick={() => fileInput.current?.click()}>＋<br /><span>Изображение или видео<br />до 50 МБ</span></button>}</div><div className="settings-section"><h2>Тема</h2><div className="theme-switcher">{(["light", "forest", "aubergine"] as WorkspaceTheme[]).map((theme) => <button key={theme} className={data.theme === theme ? `theme-dot ${theme} chosen` : `theme-dot ${theme}`} onClick={() => void chooseTheme(theme)} aria-label={`Тема: ${theme}`} />)}</div><p className="muted">Светлая, лесная и баклажановая.</p></div></aside>
    </div>
  </main>;
}
