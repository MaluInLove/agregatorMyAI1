"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { WorkspaceData, WorkspaceTheme } from "../../src/lib/workspace";

type Mode = "text" | "image" | "video" | "premium";
type WorkspaceModel = { id: string; title: string; icon?: string };
const modes: { id: Mode; title: string; hint: string }[] = [
  { id: "text", title: "Тексты", hint: "Собирайте идеи, задания и будущие запросы в личных диалогах." },
  { id: "image", title: "Изображения", hint: "Сохраните визуальную задачу и прикрепите референсы — запуск появится на следующем этапе." },
  { id: "video", title: "Видео", hint: "Подготовьте концепцию ролика, кадр и материалы для будущей генерации." },
  { id: "premium", title: "Премиум-генерации", hint: "Здесь будут доступны подтверждённые дорогие пресеты с точной стоимостью." },
];
const modelsByMode: Record<Mode, WorkspaceModel[]> = {
  text: [{ id: "deepseek-v4-flash", title: "DeepSeek", icon: "/navigation-icons/deepseek.svg" }, { id: "gemini-flash", title: "Gemini", icon: "/navigation-icons/gemini-google.svg" }, { id: "gpt-5-4-mini", title: "ChatGPT", icon: "/navigation-icons/chatgpt.svg" }],
  image: [{ id: "nano-banana-2-1", title: "Nano Banana 2.1", icon: "/navigation-icons/nano-banana-google.svg" }, { id: "nano-banana-pro", title: "Nano Banana Pro", icon: "/navigation-icons/nano-banana-google.svg" }, { id: "gpt-image-2-5-sunburst", title: "GPT-Image 2.5", icon: "/navigation-icons/chatgpt.svg" }],
  video: [{ id: "seedance-2-mini", title: "Seedance 2 Mini", icon: "/navigation-icons/seedance.svg" }, { id: "seedance-2", title: "Seedance 2", icon: "/navigation-icons/seedance.svg" }, { id: "wan-3", title: "Wan 3.0", icon: "/navigation-icons/wan-traced.svg" }],
  premium: [{ id: "nano-banana-pro-premium", title: "Nano Banana Pro · расширенные референсы", icon: "/navigation-icons/nano-banana-google.svg" }, { id: "seedance-2-wb-12", title: "Seedance 2 · Видео для WB, 12 сек", icon: "/navigation-icons/seedance.svg" }],
};
const modeIcons: Record<Mode, string> = { text: "/navigation-icons/text-chats.svg", image: "/navigation-icons/image.svg", video: "/navigation-icons/video.svg", premium: "/navigation-icons/premium.svg" };
const workspaceKindByMode = { text: "TEXT", image: "IMAGE", video: "VIDEO", premium: "PREMIUM" } as const;
const modeByWorkspaceKind: Record<"TEXT" | "IMAGE" | "VIDEO" | "PREMIUM", Mode> = { TEXT: "text", IMAGE: "image", VIDEO: "video", PREMIUM: "premium" };
const projectColors = ["#D1550D", "#EB77C6", "#69D9EF", "#A67584", "#B63BE6", "#FE454B", "#A4EFA1", "#F4C94D", "#586F3F", "#5B4DE8"];
const imageAspectRatios = ["3:4", "1:1"];
const imageQualities = ["1K", "2K"];
const videoAspectRatios = ["3:4"];
const videoQualities = ["720p"];
const videoDurations = ["5 сек.", "8 сек."];
function hsvToHex(hue: number, saturation: number, value: number) { const c = value * saturation; const x = c * (1 - Math.abs((hue / 60) % 2 - 1)); const m = value - c; const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]; return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase(); }
function hexToHsv(hex: string) { const value = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min; const hue = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta + 6) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4); return { hue, saturation: max === 0 ? 0 : delta / max, value: max }; }
function chatVisual(title: string, workspaceKind?: "TEXT" | "IMAGE" | "VIDEO" | "PREMIUM"): { icon: string; label: string } { const match = title.match(/^(Тексты|Изображения|Видео|Премиум(?:-генерации)?):\s*/i); const source = title.toLowerCase(); const guessedMode: Mode = source.includes("премиум") ? "premium" : source.includes("девушк") || source.includes("видео") ? "video" : source.includes("картинк") || source.includes("изображ") ? "image" : "text"; const mode = workspaceKind ? modeByWorkspaceKind[workspaceKind] : guessedMode; return { icon: modeIcons[mode], label: match ? title.slice(match[0].length) : title }; }
function profileInitial(name: string | null, isAdmin: boolean) { return (name || (isAdmin ? "П" : "У")).trim().slice(0, 1).toUpperCase(); }

function ChatThread({ chat }: { chat: WorkspaceData["chats"][number] }) {
  return <section className="chat-thread" aria-label={`Чат: ${chatVisual(chat.title, chat.workspaceKind).label}`}>
    <div className="chat-thread-messages">{chat.messages.map((message) => <div key={message.id} className={message.role === "USER" ? "chat-message user" : "chat-message"}><p className="chat-bubble">{message.content}</p><time className="chat-message-date" dateTime={message.createdAt}>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}</time></div>)}</div>
  </section>;
}

type WorkspaceChat = WorkspaceData["chats"][number];

function ChatRow({ chat, menuOpen, projects, onMenu, onAction, onOpen }: { chat: WorkspaceChat; menuOpen: boolean; projects: WorkspaceData["projects"]; onMenu: (id: string | null) => void; onAction: (id: string, action: string, projectId?: string | null) => void; onOpen: (chat: WorkspaceChat) => void }) {
  const visual = chatVisual(chat.title, chat.workspaceKind);
  const project = projects.find((item) => item.id === chat.projectId);
  return <div className="chat-row"><button className="chat-item" onClick={() => onOpen(chat)}><strong>{project && <i className="chat-project-dot" aria-label={`Проект: ${project.name}`} style={{ background: project.color }} />}<span className="chat-kind-icon" aria-hidden style={{ maskImage: `url(${visual.icon})`, WebkitMaskImage: `url(${visual.icon})` }} />{visual.label}</strong></button><button className="chat-more" data-chat-id={chat.id} onClick={() => onMenu(menuOpen ? null : chat.id)}>⋯</button>{menuOpen && <div className="chat-menu"><span>Сообщения {chat.messageCount} / 800</span><button onClick={() => onAction(chat.id,"pin")}><Image className="chat-menu-icon" src="/navigation-icons/clip.svg" alt="" width={20} height={20} />{chat.isPinned ? "Открепить" : "Закрепить"}</button><button onClick={() => onAction(chat.id,"rename")}><Image className="chat-menu-icon" src="/navigation-icons/pencil.svg" alt="" width={20} height={20} />Переименовать</button><details><summary><Image className="chat-menu-icon" src="/navigation-icons/folder.svg" alt="" width={20} height={20} />В проект</summary><button className="project-choice" onClick={() => onAction(chat.id,"move",null)}><b aria-hidden>{chat.projectId === null ? "✓" : ""}</b>Без проекта</button>{projects.map((item) => <button className="project-choice" key={item.id} onClick={() => onAction(chat.id,"move",item.id)}><b aria-hidden>{chat.projectId === item.id ? "✓" : ""}</b><i style={{ background:item.color }} />{item.name}</button>)}</details><button className="danger" onClick={() => onAction(chat.id,"delete")}><Image className="chat-menu-icon" src="/navigation-icons/delete.svg" alt="" width={20} height={20} />Удалить</button></div>}</div>;
}

function ChatHistory({ chats, projects, menuChatId, onMenu, onAction, onOpen }: { chats: WorkspaceChat[]; projects: WorkspaceData["projects"]; menuChatId: string | null; onMenu: (id: string | null) => void; onAction: (id: string, action: string, projectId?: string | null) => void; onOpen: (chat: WorkspaceChat) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pinned = chats.filter((chat) => chat.isPinned);
  const today = new Date();
  const isToday = (date: string) => { const value = new Date(date); return value.getFullYear() === today.getFullYear() && value.getMonth() === today.getMonth() && value.getDate() === today.getDate(); };
  const todayChats = chats.filter((chat) => !chat.isPinned && isToday(chat.updatedAt));
  const recent = chats.filter((chat) => !chat.isPinned && !isToday(chat.updatedAt));
  const group = (title: string, items: WorkspaceChat[], accent = false) => { const isCollapsed = Boolean(collapsed[title]); const canCollapse = items.length > 0; const icon = isCollapsed ? "/navigation-icons/group-out.svg" : "/navigation-icons/group-in.svg"; return <section className="chat-group" key={title}><button className={accent ? "chat-group-heading" : "history-label"} disabled={!canCollapse} onClick={() => canCollapse && setCollapsed((current) => ({ ...current, [title]: !isCollapsed }))}><span>{title}</span>{canCollapse && <span className="chat-group-toggle" aria-hidden style={{ maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})` }} />}</button>{!isCollapsed && <div className="chat-list">{items.map((chat) => <ChatRow key={chat.id} chat={chat} menuOpen={menuChatId === chat.id} projects={projects} onMenu={onMenu} onAction={onAction} onOpen={onOpen} />)}</div>}</section>; };
  return <>{pinned.length > 0 && group("Избранное", pinned, true)}{group("Сегодня", todayChats)}{group("Ранее", recent)}</>;
}

function ImageSettingPicker({ title, value, options, open, onToggle, onChoose }: { title: string; value: string; options: readonly string[]; open: boolean; onToggle: () => void; onChoose: (value: string) => void }) {
  const optionLabel = (option: string) => title === "Соотношение сторон" && option === "3:4" ? "3:4  WB, Ozon" : option;
  return <div className="settings-section image-setting"><h2>{title}</h2><div className="model-picker"><button className="model-trigger" aria-expanded={open} onClick={onToggle}><span className="model-label">{optionLabel(value)}</span><i className="model-trigger-arrow" aria-hidden /></button>{open && <div className="model-menu" role="listbox" aria-label={title}>{options.map((option) => <button key={option} role="option" aria-selected={value === option} onClick={() => onChoose(option)}><span>{optionLabel(option)}</span>{value === option && <b aria-hidden>✓</b>}</button>)}</div>}</div>{title === "Длительность" && <p className="video-duration-note">Качество 1080p и длительность 12 сек. доступны в разделе <span className="no-wrap">«Премиум-генерации».</span></p>}</div>;
}

function ImageReferenceInfo({ modelId }: { modelId: string }) {
  const details = {
    "nano-banana-2-1": { limit: "до 10", formats: "PNG, JPEG, WEBP" },
    "nano-banana-pro": { limit: "до 8", formats: "PNG, JPEG, WEBP" },
    "gpt-image-2-5-sunburst": { limit: "до 16", formats: "PNG, JPEG, WEBP" },
  }[modelId] ?? { limit: "—", formats: "—" };
  return <section className="image-reference-info"><h2>Референсы</h2><p>В этой модели можно добавить <strong>{details.limit}</strong> изображений.</p><p>Форматы: {details.formats}</p></section>;
}

export function Workspace({ viewer, initialData }: { viewer: { displayName: string | null; isGuest: boolean; isAdmin: boolean }; initialData: WorkspaceData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData); const [mode, setMode] = useState<Mode>("text"); const [selectedModelId, setSelectedModelId] = useState(modelsByMode.text[0].id); const [historyOpen, setHistoryOpen] = useState(true);
  const [composer, setComposer] = useState(""); const [projectId, setProjectId] = useState<string | null>(null); const [selectedChatId, setSelectedChatId] = useState<string | null>(null); const [sidebarTab, setSidebarTab] = useState<"chats" | "projects">("chats"); const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null); const [menuChatId, setMenuChatId] = useState<string | null>(null); const [renameChatId, setRenameChatId] = useState<string | null>(null); const [deleteChatId, setDeleteChatId] = useState<string | null>(null); const [projectDialogOpen, setProjectDialogOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [themePickerOpen, setThemePickerOpen] = useState(false); const [modelMenuOpen, setModelMenuOpen] = useState(false); const [aspectMenuOpen, setAspectMenuOpen] = useState(false); const [qualityMenuOpen, setQualityMenuOpen] = useState(false); const [videoAspectMenuOpen, setVideoAspectMenuOpen] = useState(false); const [videoQualityMenuOpen, setVideoQualityMenuOpen] = useState(false); const [imageAspectRatio, setImageAspectRatio] = useState(imageAspectRatios[0]); const [imageQuality, setImageQuality] = useState(imageQualities[1]); const [videoAspectRatio, setVideoAspectRatio] = useState(videoAspectRatios[0]); const [videoQuality, setVideoQuality] = useState(videoQualities[0]); const [projectName, setProjectName] = useState(""); const [projectNameError, setProjectNameError] = useState(""); const [projectColor, setProjectColor] = useState(projectColors[0]); const [customPickerOpen, setCustomPickerOpen] = useState(false); const [pickerDraftColor, setPickerDraftColor] = useState(projectColors[0]); const [pickerHue, setPickerHue] = useState(20); const [pickerSaturation, setPickerSaturation] = useState(0.94); const [pickerValue, setPickerValue] = useState(0.82); const [renameTitle, setRenameTitle] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const fileInput = useRef<HTMLInputElement>(null); const composerFileInput = useRef<HTMLInputElement>(null);
  const [composerLocked, setComposerLocked] = useState(false); const [composerExpanded, setComposerExpanded] = useState(false); const previousModelId = useRef(selectedModelId);
  const [videoDurationMenuOpen, setVideoDurationMenuOpen] = useState(false); const [videoDuration, setVideoDuration] = useState(videoDurations[0]);
  const active = modes.find((item) => item.id === mode)!;
  const activeModels = modelsByMode[mode];
  const selectedModel = activeModels.find((model) => model.id === selectedModelId) ?? activeModels[0];
  const composerAspect = mode === "image" ? imageAspectRatio : mode === "video" ? videoAspectRatio : null;
  const composerQuality = mode === "image" ? imageQuality : mode === "video" ? videoQuality : null;
  const composerCost = mode === "text" ? ({ "deepseek-v4-flash": "0", "gemini-flash": "2", "gpt-5-4-mini": "1" }[selectedModelId] ?? "—") : mode === "image" ? ({ "nano-banana-2-1": imageQuality === "1K" ? "4" : "6", "nano-banana-pro": "16", "gpt-image-2-5-sunburst": imageQuality === "1K" ? "5" : "9" }[selectedModelId] ?? "—") : mode === "video" ? ({ "seedance-2-mini": videoDuration === "5 сек." ? "35" : "55", "seedance-2": videoDuration === "5 сек." ? "165" : "265", "wan-3": "190" }[selectedModelId] ?? "—") : "—";
  const selectedChat = selectedChatId ? data.chats.find((chat) => chat.id === selectedChatId) ?? null : null;
  const emptyStageTitle = mode === "text" ? "Создайте новый чат для генерации текстов" : mode === "image" ? "Создайте новый чат для генерации изображений" : mode === "video" ? "Создайте новый чат для генерации видео" : "Премиум-генерации находятся в разработке";
  function openChat(chat: WorkspaceChat) { const chatMode = modeByWorkspaceKind[chat.workspaceKind]; setProjectDialogOpen(false); setMode(chatMode); setSelectedModelId(modelsByMode[chatMode][0].id); setSelectedChatId(chat.id); setProjectId(chat.projectId); setComposer(""); setComposerLocked(false); setNotice(""); }

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".rename-dialog, .delete-dialog, .project-dialog")) { setRenameChatId(null); setDeleteChatId(null); setProjectDialogOpen(false); }
      if (!target.closest(".profile-menu, .profile-trigger")) setProfileOpen(false);
      if (!target.closest(".theme-menu, .theme-trigger")) setThemePickerOpen(false);
      if (!target.closest(".model-menu, .model-trigger")) setModelMenuOpen(false);
      if (!target.closest(".image-setting")) { setAspectMenuOpen(false); setQualityMenuOpen(false); setVideoAspectMenuOpen(false); setVideoQualityMenuOpen(false); setVideoDurationMenuOpen(false); }
      if (!target.closest(".chat-menu, .chat-more, .rename-dialog, .delete-dialog")) setMenuChatId(null);
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.workspaceMode = mode;
    document.documentElement.dataset.workspaceModel = selectedModelId;
    return () => { delete document.documentElement.dataset.workspaceMode; delete document.documentElement.dataset.workspaceModel; };
  }, [mode, selectedModelId]);

  useEffect(() => {
    if (previousModelId.current !== selectedModelId && !composerLocked) setComposer("");
    previousModelId.current = selectedModelId;
  }, [composerLocked, selectedModelId]);

  useEffect(() => {
    if (!menuChatId) return;
    function placeMenu() {
      const button = document.querySelector<HTMLElement>(`.chat-more[data-chat-id="${CSS.escape(menuChatId!)}"]`);
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

  useEffect(() => {
    if (!renameChatId && !deleteChatId) return;
    function placeActionDialog() {
      const dialog = document.querySelector<HTMLElement>(".rename-dialog, .delete-dialog");
      const menu = document.querySelector<HTMLElement>(".chat-menu");
      if (!dialog || !menu) return;
      const menuBox = menu.getBoundingClientRect();
      const gap = 12;
      let left = menuBox.left;
      let top = menuBox.bottom + gap;
      if (top + dialog.offsetHeight > window.innerHeight - gap && menuBox.right + gap + dialog.offsetWidth <= window.innerWidth - gap) { left = menuBox.right + gap; top = menuBox.top; }
      dialog.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - dialog.offsetWidth - gap))}px`;
      dialog.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - dialog.offsetHeight - gap))}px`;
    }
    const frame = window.requestAnimationFrame(placeActionDialog);
    window.addEventListener("resize", placeActionDialog);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", placeActionDialog); };
  }, [renameChatId, deleteChatId]);

  useEffect(() => {
    if (!projectDialogOpen) return;
    function placeProjectDialog() {
      const dialog = document.querySelector<HTMLElement>(".project-dialog");
      const sidebar = document.querySelector<HTMLElement>(".workspace-sidebar");
      const trigger = document.querySelector<HTMLElement>(".project-new");
      if (!dialog || !sidebar) return;
      const sidebarBox = sidebar.getBoundingClientRect();
      const triggerBox = trigger?.getBoundingClientRect();
      const gap = 14;
      const left = Math.max(gap, Math.min(sidebarBox.right + gap, window.innerWidth - dialog.offsetWidth - gap));
      const top = Math.max(gap, Math.min(triggerBox?.top ?? sidebarBox.top, window.innerHeight - dialog.offsetHeight - gap));
      dialog.style.left = `${left}px`;
      dialog.style.top = `${top}px`;
    }
    const frame = window.requestAnimationFrame(placeProjectDialog);
    window.addEventListener("resize", placeProjectDialog);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", placeProjectDialog); };
  }, [projectDialogOpen]);

  async function reload() { const response = await fetch("/api/workspace", { cache: "no-store" }); if (response.ok) setData(await response.json() as WorkspaceData); }
  async function chooseTheme(theme: WorkspaceTheme) { setData((current) => ({ ...current, theme })); setThemePickerOpen(false); const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }); if (!response.ok) { setNotice("Не удалось сохранить тему."); await reload(); } }
  function selectMode(nextMode: Mode) { const openChat = selectedChatId ? data.chats.find((chat) => chat.id === selectedChatId) : null; if (openChat && openChat.workspaceKind !== workspaceKindByMode[nextMode]) setSelectedChatId(null); setMode(nextMode); setSelectedModelId(modelsByMode[nextMode][0].id); setComposer(""); setComposerLocked(false); setModelMenuOpen(false); setAspectMenuOpen(false); setQualityMenuOpen(false); setVideoAspectMenuOpen(false); setVideoQualityMenuOpen(false); }
  async function startNewChat() { setProjectDialogOpen(false); setBusy(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", title: "Новый чат", projectId, workspaceKind: workspaceKindByMode[mode] }) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); const result = await response.json() as { id?: string }; setSelectedChatId(result.id ?? null); setComposer(""); setComposerLocked(false); setNotice(""); await reload(); }
  function addProject() { setProjectName(""); setProjectNameError(""); setProjectColor(projectColors[0]); setCustomPickerOpen(false); setProjectDialogOpen(true); }
  function updatePickerColor(hue: number, saturation: number, value: number) { setPickerHue(hue); setPickerSaturation(saturation); setPickerValue(value); setPickerDraftColor(hsvToHex(hue, saturation, value)); }
  function openCustomPicker() { const hsv = hexToHsv(projectColor); setPickerHue(hsv.hue); setPickerSaturation(hsv.saturation); setPickerValue(hsv.value); setPickerDraftColor(projectColor); setCustomPickerOpen(true); }
  function acceptCustomColor() { setProjectColor(pickerDraftColor); setCustomPickerOpen(false); }
  function pickColorPosition(target: HTMLDivElement, clientX: number, clientY: number) { const box = target.getBoundingClientRect(); const saturation = Math.min(1, Math.max(0, (clientX - box.left) / box.width)); const value = Math.min(1, Math.max(0, 1 - (clientY - box.top) / box.height)); updatePickerColor(pickerHue, saturation, value); }
  async function submitProject() { if (!projectName.trim()) { setProjectNameError("Введите название проекта."); return; } setBusy(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "project", name: projectName, color: projectColor }) }); setBusy(false); if (!response.ok) { setProjectNameError((await response.json() as { error: string }).error); return; } setProjectDialogOpen(false); await reload(); }
  async function saveIdea() { if (!composer.trim()) return setNotice("Сначала напишите идею или промпт."); const wasOpenChat = Boolean(selectedChatId); setBusy(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedChatId ? { action: "message", chatId: selectedChatId, content: composer } : { action: "chat", title: composer.trim().slice(0, 56), projectId, content: composer, workspaceKind: mode.toUpperCase() }) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); const result = await response.json() as { id?: string }; if (!wasOpenChat && result.id) setSelectedChatId(result.id); if (!composerLocked) setComposer(""); setNotice(wasOpenChat ? "Сообщение добавлено в открытый чат." : "Чат создан. Следующие варианты сохранятся в нём же."); await reload(); }
  async function upload(file: File) { setBusy(true); const form = new FormData(); form.set("file", file); const response = await fetch("/api/workspace/references", { method: "POST", body: form }); setBusy(false); if (!response.ok) return setNotice((await response.json() as { error: string }).error); setNotice("Референс добавлен в личное пространство."); await reload(); }
  async function chatAction(id: string, action: string, projectId?: string | null) { setProjectDialogOpen(false); if (action === "rename") { const chat = data.chats.find((item) => item.id === id); setDeleteChatId(null); setRenameTitle(chat ? chatVisual(chat.title).label : ""); setRenameChatId(id); return; } if (action === "delete") { setRenameChatId(null); setDeleteChatId(id); return; } setRenameChatId(null); setDeleteChatId(null); const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({scope:"chat",id,action,projectId}) }); if (!response.ok) setNotice((await response.json() as {error:string}).error); else { setMenuChatId(null); await reload(); } }
  async function submitRename() { if (!renameChatId || !renameTitle.trim()) return; setBusy(true); const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({scope:"chat",id:renameChatId,action:"rename",title:renameTitle}) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as {error:string}).error); setRenameChatId(null); setMenuChatId(null); await reload(); }
  async function confirmDelete() { if (!deleteChatId) return; setBusy(true); const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({scope:"chat",id:deleteChatId,action:"delete"}) }); setBusy(false); if (!response.ok) return setNotice((await response.json() as {error:string}).error); if (selectedChatId === deleteChatId) setSelectedChatId(null); setDeleteChatId(null); setMenuChatId(null); await reload(); }

  const accessDescription = viewer.isAdmin ? "Постоянный доступ" : viewer.isGuest ? "Гостевой доступ · 48 часов" : data.profile.accessEndsAt ? `Доступ до ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(data.profile.accessEndsAt))}` : "Доступ не подключён";
  return <main className="workspace-shell" data-theme={data.theme}>
    <header className="workspace-topbar"><Link className="workspace-mark" href="/workspace">AI · поток</Link><nav aria-label="Разделы">{modes.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => selectMode(item.id)}>{item.title}</button>)}</nav><div className="workspace-user"><div className="topbar-menu"><button className="theme-trigger" aria-label="Выбрать тему" aria-expanded={themePickerOpen} onClick={() => { setProfileOpen(false); setThemePickerOpen((open) => !open); }}><Image src="/navigation-icons/flower.svg" alt="" width={20} height={20} /></button>{themePickerOpen && <section className="theme-menu" role="dialog" aria-label="Темы"><h2>Темы</h2><div className="theme-switcher">{(["light", "forest", "aubergine"] as WorkspaceTheme[]).map((theme) => <button key={theme} className={data.theme === theme ? `theme-dot ${theme} chosen` : `theme-dot ${theme}`} onClick={() => void chooseTheme(theme)} aria-label={`Тема: ${theme}`} />)}</div></section>}</div><div className="topbar-menu"><button className="profile-trigger" aria-label="Открыть профиль" aria-expanded={profileOpen} onClick={() => { setThemePickerOpen(false); setProfileOpen((open) => !open); }}>{profileInitial(viewer.displayName, viewer.isAdmin)}</button>{profileOpen && <section className="profile-menu" role="dialog" aria-label="Профиль"><div className="profile-menu-heading"><span className="profile-avatar">{profileInitial(viewer.displayName, viewer.isAdmin)}</span><div><strong>{viewer.displayName || (viewer.isAdmin ? "Преподаватель" : "Ученик")}</strong><p>{viewer.isAdmin ? "Преподаватель · администратор" : viewer.isGuest ? "Гостевой пользователь" : "Ученик"}</p></div></div><dl className="profile-details"><div><dt>Статус</dt><dd>{accessDescription}</dd></div><div><dt>{viewer.isAdmin ? "Кредиты" : "Остаток кредитов"}</dt><dd>{viewer.isAdmin ? "Без внутреннего лимита" : `${data.profile.creditBalance ?? 0} кредитов`}</dd></div><div><dt>Тариф</dt><dd>{viewer.isAdmin ? "Служебный доступ" : viewer.isGuest ? "Демонстрационный" : "Учебный пакет"}</dd></div></dl>{viewer.isAdmin && <Link className="profile-menu-link" href="/">Стенд интеграции</Link>}<button className="profile-logout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>Выйти</button></section>}</div></div></header>
    <div className="workspace-grid">
      <aside className="workspace-sidebar">
        <div className="sidebar-tabs"><button className={sidebarTab === "chats" ? "active" : ""} onClick={() => { setProjectDialogOpen(false); setSidebarTab("chats"); }}>Чаты</button><button className={sidebarTab === "projects" ? "active" : ""} onClick={() => { setProjectDialogOpen(false); setSidebarTab("projects"); }}>Проекты</button></div>
        {sidebarTab === "chats" ? <div className="sidebar-content"><button className="new-chat" disabled={busy} onClick={() => { setProjectDialogOpen(false); setSelectedChatId(null); selectMode("text"); setComposer(""); setNotice(""); }}>＋ Новый чат</button>{data.chats.length ? <ChatHistory chats={data.chats} projects={data.projects} menuChatId={menuChatId} onMenu={(id) => { setProjectDialogOpen(false); setRenameChatId(null); setDeleteChatId(null); setMenuChatId(id); }} onAction={(id, action, targetProjectId) => void chatAction(id, action, targetProjectId)} onOpen={openChat} /> : <p className="sidebar-empty">Создайте первый чат.</p>}</div> : <div className="sidebar-content"><button className="project-new" onClick={addProject} disabled={busy}><span aria-hidden>＋</span>Новый проект</button><p className="project-helper">Собирайте чаты в проекты, чтобы хранить материалы для одной идеи или задачи вместе.</p><div className="project-list">{data.projects.length ? data.projects.map((project) => { const projectChats = data.chats.filter((chat) => chat.projectId === project.id); const expanded = expandedProjectId === project.id; return <section className="project-entry" key={project.id}><button className={projectId === project.id ? "project active-project" : "project"} onClick={() => { setProjectId(project.id); setSelectedChatId(null); setExpandedProjectId(expanded ? null : project.id); }}><i style={{ background:project.color }} />{project.name}<small>{project.chatCount}</small></button>{expanded && <div className="chat-list project-chats">{projectChats.length ? projectChats.map((chat) => <ChatRow key={chat.id} chat={chat} menuOpen={menuChatId === chat.id} projects={data.projects} onMenu={(id) => { setRenameChatId(null); setDeleteChatId(null); setMenuChatId(id); }} onAction={(id, action, targetProjectId) => void chatAction(id, action, targetProjectId)} onOpen={openChat} />) : <p className="project-empty">В проекте пока нет чатов.</p>}</div>}</section>; }) : <p className="sidebar-empty">Проектов пока нет.</p>}</div></div>}
      </aside>
      <button className="sidebar-new-chat-floating" type="button" disabled={busy} aria-label={sidebarTab === "chats" ? `Новый чат: ${active.title}` : "Новый проект"} title={sidebarTab === "chats" ? `Новый чат: ${active.title}` : "Новый проект"} onClick={sidebarTab === "chats" ? () => void startNewChat() : addProject} />
      {mode === "image" && <ImageReferenceInfo modelId={selectedModelId} />}
      <section className="workspace-stage">
        <div className="stage-title"><div><p className="eyebrow">Личное пространство</p><h1>{active.title}</h1><p>{active.hint}</p></div>{viewer.isGuest && <span className="guest-badge">Гостевой доступ · 48 часов</span>}</div>
        {selectedChat ? <ChatThread chat={selectedChat} /> : <div className="empty-stage"><div className="empty-icon">✦</div><h2>{emptyStageTitle}</h2><p>Это подготовительный этап: ничего не отправляется внешнему провайдеру и кредиты не списываются.</p><div className="pill-row"><span>Только ваши данные</span><span>Без запуска генерации</span></div></div>}
        <div className={composerExpanded ? "composer composer-expanded" : "composer"}>
          <div className="composer-input">
            <button className={composerLocked ? "composer-lock locked" : "composer-lock"} type="button" aria-label={composerLocked ? "Открепить промпт" : "Закрепить промпт"} title={composerLocked ? "Промпт закреплён" : "Закрепить промпт"} aria-pressed={composerLocked} onClick={() => setComposerLocked((locked) => !locked)}><i aria-hidden /></button>
            <textarea value={composer} onChange={(event) => setComposer(event.target.value)} maxLength={8000} placeholder="Напишите ваш промпт" />
            <button className="composer-expand" type="button" aria-label={composerExpanded ? "Свернуть поле промпта" : "Развернуть поле промпта"} title={composerExpanded ? "Свернуть поле" : "Развернуть поле"} aria-pressed={composerExpanded} onClick={() => setComposerExpanded((expanded) => !expanded)}><i aria-hidden /></button>
          </div>
          <div className="composer-bottom">
            <div className="composer-controls">
              <input className="sr-only" ref={composerFileInput} type="file" accept={mode === "video" ? "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
              <button className="composer-clip" type="button" aria-label="Прикрепить референс" title="Прикрепить референс" onClick={() => composerFileInput.current?.click()}><i aria-hidden /></button>
              {composerAspect && <span className={`composer-chip composer-aspect${composerAspect === "1:1" ? " composer-aspect-square" : ""}`}><i aria-hidden />{composerAspect}</span>}
              {composerQuality && <span className="composer-chip">{composerQuality}</span>}
            </div>
            <div className="composer-actions">
              <span className="composer-cost" title="Ориентировочная стоимость по текущему тарифу"><strong>{composerCost}</strong><i aria-hidden /></span>
              <button className="composer-send" type="button" disabled={busy} onClick={saveIdea} aria-label={selectedChat ? "Добавить сообщение" : "Сохранить идею"} title={selectedChat ? "Добавить сообщение" : "Сохранить идею"}><i aria-hidden /></button>
            </div>
          </div>
        </div>
        {notice && <p className="workspace-notice" role="status">{notice}</p>}
      </section>
      <aside className="workspace-settings"><div className="settings-section"><h2>Модель</h2><div className="model-picker"><button className="model-trigger" aria-expanded={modelMenuOpen} onClick={() => { setAspectMenuOpen(false); setQualityMenuOpen(false); setVideoAspectMenuOpen(false); setVideoQualityMenuOpen(false); setVideoDurationMenuOpen(false); setModelMenuOpen((open) => !open); }}><span className="model-label">{selectedModel.icon && <i className="model-icon" aria-hidden style={{ maskImage: `url(${selectedModel.icon})`, WebkitMaskImage: `url(${selectedModel.icon})` }} />}{selectedModel.title}</span><i className="model-trigger-arrow" aria-hidden /></button>{modelMenuOpen && <div className="model-menu" role="listbox" aria-label="Модели">{activeModels.map((model) => <button key={model.id} role="option" aria-selected={selectedModelId === model.id} onClick={() => { setSelectedModelId(model.id); setModelMenuOpen(false); }}><span className="model-label">{model.icon && <i className="model-icon" aria-hidden style={{ maskImage: `url(${model.icon})`, WebkitMaskImage: `url(${model.icon})` }} />}{model.title}</span>{selectedModelId === model.id && <b aria-hidden>✓</b>}</button>)}</div>}</div></div>{mode === "image" && <><ImageSettingPicker title="Соотношение сторон" value={imageAspectRatio} options={imageAspectRatios} open={aspectMenuOpen} onToggle={() => { setModelMenuOpen(false); setQualityMenuOpen(false); setAspectMenuOpen((open) => !open); }} onChoose={(value) => { setImageAspectRatio(value); setAspectMenuOpen(false); }} /><ImageSettingPicker title="Качество" value={imageQuality} options={imageQualities} open={qualityMenuOpen} onToggle={() => { setModelMenuOpen(false); setAspectMenuOpen(false); setQualityMenuOpen((open) => !open); }} onChoose={(value) => { setImageQuality(value); setQualityMenuOpen(false); }} /><p className="image-setting-note">Генерации в 4K доступны в разделе <span className="no-wrap">«Премиум-генерации».</span></p></>}{mode === "video" && <><ImageSettingPicker title="Соотношение сторон" value={videoAspectRatio} options={videoAspectRatios} open={videoAspectMenuOpen} onToggle={() => { setModelMenuOpen(false); setVideoQualityMenuOpen(false); setVideoDurationMenuOpen(false); setVideoAspectMenuOpen((open) => !open); }} onChoose={(value) => { setVideoAspectRatio(value); setVideoAspectMenuOpen(false); }} /><ImageSettingPicker title="Качество" value={videoQuality} options={videoQualities} open={videoQualityMenuOpen} onToggle={() => { setModelMenuOpen(false); setVideoAspectMenuOpen(false); setVideoDurationMenuOpen(false); setVideoQualityMenuOpen((open) => !open); }} onChoose={(value) => { setVideoQuality(value); setVideoQualityMenuOpen(false); }} /><p className="image-setting-note">Качество 1080p доступно в разделе <span className="no-wrap">«Премиум-генерации».</span></p><ImageSettingPicker title="Длительность" value={videoDuration} options={videoDurations} open={videoDurationMenuOpen} onToggle={() => { setModelMenuOpen(false); setVideoAspectMenuOpen(false); setVideoQualityMenuOpen(false); setVideoDurationMenuOpen((open) => !open); }} onChoose={(value) => { setVideoDuration(value); setVideoDurationMenuOpen(false); }} /></>}{(mode === "image" || mode === "video") && <div className="settings-section"><div className="settings-row"><h2>Референсы</h2></div><input className="sr-only" ref={fileInput} type="file" accept={mode === "image" ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />{data.references.length ? <ul className="reference-list">{data.references.map((asset) => <li key={asset.id}><a href={`/api/workspace/assets/${asset.id}`}>{asset.originalFilename || "Референс"}</a><small>{Math.ceil(Number(asset.byteSize) / 1024)} КБ</small></li>)}</ul> : <button className="reference-drop" onClick={() => fileInput.current?.click()}>＋<br /><span>{mode === "image" ? "Изображение" : "Изображение или видео"}<br />до 50 МБ</span></button>}</div>}</aside>
    </div>{renameChatId && <section className="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title"><h2 id="rename-title">Переименовать чат</h2><label>Новое название<input autoFocus value={renameTitle} maxLength={80} onChange={(event) => setRenameTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitRename(); if (event.key === "Escape") setRenameChatId(null); }} /></label><div className="rename-dialog-actions"><button type="button" className="primary" disabled={busy || !renameTitle.trim()} onClick={() => void submitRename()}>Сохранить</button><button type="button" onClick={() => setRenameChatId(null)}>Отмена</button></div></section>}{deleteChatId && <section className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Удалить чат?</h2><p>Чат и его сообщения исчезнут из личной истории.</p><div className="rename-dialog-actions"><button type="button" className="danger" disabled={busy} onClick={() => void confirmDelete()}>Удалить</button><button type="button" onClick={() => setDeleteChatId(null)}>Отмена</button></div></section>}{projectDialogOpen && <section className="project-dialog" role="dialog" aria-modal="true" aria-label="Новый проект"><label>Название проекта<input autoFocus value={projectName} maxLength={80} aria-invalid={Boolean(projectNameError)} onChange={(event) => { setProjectName(event.target.value); if (projectNameError) setProjectNameError(""); }} onKeyDown={(event) => { if (event.key === "Enter") void submitProject(); if (event.key === "Escape") setProjectDialogOpen(false); }} /></label>{projectNameError && <p className="project-field-error" role="alert">{projectNameError}</p>}<div className="project-color-field"><span>Цвет</span><div className="project-color-palette">{projectColors.map((color) => <button key={color} type="button" aria-label={`Выбрать цвет ${color}`} className={projectColor === color ? "color-swatch chosen" : "color-swatch"} style={{ backgroundColor: color }} onClick={() => setProjectColor(color)} />)}</div><div className="project-custom-color-row"><output className="project-custom-color">{projectColor.toUpperCase()}</output><button type="button" className="project-custom-swatch" aria-label="Открыть палитру произвольного цвета" style={{ backgroundColor: projectColor }} onClick={openCustomPicker} />{customPickerOpen && <div className="custom-color-picker"><div className="custom-color-top"><span className="color-picker-preview" style={{ backgroundColor: pickerDraftColor }} /><button type="button" onClick={() => setCustomPickerOpen(false)} aria-label="Отменить выбор цвета">×</button></div><div className="color-picker-area" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${pickerHue} 100% 50%))` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pickColorPosition(event.currentTarget, event.clientX, event.clientY); }} onPointerMove={(event) => { if (event.buttons === 1) pickColorPosition(event.currentTarget, event.clientX, event.clientY); }}><span className="color-picker-cursor" style={{ left: `${pickerSaturation * 100}%`, top: `${(1 - pickerValue) * 100}%` }} /></div><input className="color-hue-slider" aria-label="Оттенок" type="range" min="0" max="360" value={pickerHue} onChange={(event) => updatePickerColor(Number(event.target.value), pickerSaturation, pickerValue)} /><div className="color-picker-footer"><output className="color-picker-hex">{pickerDraftColor.toUpperCase()}</output><button type="button" className="color-picker-accept" onClick={acceptCustomColor}>OK</button></div></div>}</div></div><div className="rename-dialog-actions"><button type="button" className="primary" disabled={busy} onClick={() => void submitProject()}>Создать</button><button type="button" onClick={() => setProjectDialogOpen(false)}>Отмена</button></div></section>}
  </main>;
}
