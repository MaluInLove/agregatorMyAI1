# Docker Compose, резервные копии и восстановление

Этот документ готовит будущий VPS. Для обычной локальной разработки по-прежнему используются PostgreSQL на компьютере и `npm.cmd run dev`; Docker не обязателен.

## Запуск в Docker

1. Скопируйте `.env.docker.example` в `.env.docker` и задайте уникальные `POSTGRES_PASSWORD`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_EMAIL`, `POLZA_API_KEY` и публичный `APP_URL`. Не добавляйте `.env.docker` в Git.
2. Запустите сервисы:

   ```powershell
   docker compose --project-name ai-aggregator --env-file .env.docker up --build -d
   ```

   Контейнер `migrate` один раз применяет миграции, создаёт первоначального администратора и модели. Только после его успешного завершения стартуют `web` и `worker`.
3. По умолчанию веб-сервис доступен только на `127.0.0.1:3000`. На VPS поставьте перед ним HTTPS reverse proxy; не открывайте PostgreSQL наружу. Для просмотра состояния используйте:

   ```powershell
   docker compose --project-name ai-aggregator --env-file .env.docker ps
   docker compose --project-name ai-aggregator --env-file .env.docker logs --tail=100 web worker
   ```

Локальные результаты хранятся в Docker volume `ai-aggregator_app_storage`; база — в `ai-aggregator_postgres_data`. При `OBJECT_STORAGE_DRIVER=s3` результаты живут в указанном S3-совместимом хранилище вместо локального volume.

## Резервная копия

Перед бэкапом проверьте, что worker и web здоровы. Дамп БД и файлы содержат персональные данные, хеши паролей, токены сессий, историю и результаты; храните их только в зашифрованном закрытом месте.

На Linux VPS создайте закрытый каталог `backups` и выполните:

```bash
mkdir -p backups
docker compose --project-name ai-aggregator --env-file .env.docker exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backups/postgres-$(date +%F-%H%M).dump
docker run --rm -v ai-aggregator_app_storage:/source:ro -v "$PWD/backups:/backup" alpine sh -c 'tar czf /backup/storage-$(date +%F-%H%M).tgz -C /source .'
```

Для S3 вместо второй команды настройте версионирование/репликацию в самом хранилище либо выполняйте серверный `aws s3 sync` в закрытое хранилище. Бэкап базы и объектов должен быть согласован по времени: сначала временно остановите `worker`, затем сохраните БД и файлы, после чего запустите worker снова.

Периодически проверяйте восстановление на отдельной машине или отдельном Docker-проекте. Не восстанавливайте дамп поверх рабочей базы без заранее проверенной копии.

## Восстановление

Ниже команды для Linux VPS. Они заменяют данные выбранного Compose-проекта, поэтому перед началом убедитесь, что указан именно нужный проект и нужные файлы бэкапа.

```bash
docker compose --project-name ai-aggregator --env-file .env.docker stop web worker
docker compose --project-name ai-aggregator --env-file .env.docker cp backups/postgres-YYYY-MM-DD-HHMM.dump postgres:/tmp/restore.dump
docker compose --project-name ai-aggregator --env-file .env.docker exec postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/restore.dump'
docker run --rm -v ai-aggregator_app_storage:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'rm -rf /target/* && tar xzf /backup/storage-YYYY-MM-DD-HHMM.tgz -C /target'
docker compose --project-name ai-aggregator --env-file .env.docker up -d web worker
```

Для S3 не выполняйте восстановление локального volume: восстановите нужную версию объектов средствами провайдера, сохраняя ключи файлов из базы. После запуска проверьте вход администратора, рабочее пространство, загрузку одного известного результата и `/api/diagnostics`.

## Обновление

Перед обновлением сделайте бэкап. Затем загрузите проверенный код, соберите контейнеры и запустите Compose той же командой `up --build -d`. Миграции выполняет одноразовый `migrate`; если он завершился ошибкой, `web` и `worker` не запускаются.
