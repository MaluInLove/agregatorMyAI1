# Инструкции для агентов

## Обязательные файлы для чтения

- `project-requirements.md`
- `tasks.md`

## Правило работы с ТЗ и планом

В каждой сессии до начала работы читайте `project-requirements.md` и `tasks.md`, пока все задачи из `tasks.md` не будут реализованы и приняты пользователем. После реализации и приёмки всех задач эти файлы можно перестать подгружать автоматически.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
