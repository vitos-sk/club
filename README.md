# NEXT · закрытый клуб (Telegram Mini App)

Стадия: **макет интерфейса** (UI/UX). Все экраны нарисованы, логики нет: кнопки ведут по экранам, формы и данные — заглушки.

Стек: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4.

## Запуск

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # проверка production-сборки
```

## Стиль «Графит»

- Цвета: `src/app/globals.css` (блок `@theme`), меняются в одном месте.
- Шрифт: `src/lib/fonts.ts` (сейчас Manrope).
- Тестовые данные: `src/lib/mock.ts`.

## Экраны

| Маршрут | Экран |
|---|---|
| `/` | Холл: табличка, ключ-карта, «У стойки», комнаты |
| `/key` | Ключ-карта с QR |
| `/board`, `/board/help` | Доска запросов: «Нужна помощь» / «Могу помочь» |
| `/board/new` → `/board/active` → `/board/choose` → `/board/connected` → `/board/confirm` | Путь записки: создать, отклики, выбор помощника, связь в Telegram, подтверждение |
| `/board/respond` | Отклик на чужую записку |
| `/meet`, `/meet/scan`, `/meet/scanned`, `/meet/request` | Зал встреч, сканер, встреча засчитана, запрос встречи |
| `/library`, `/library/[slug]` | Библиотека и статьи |
| `/fireplace` | Каминная: горячий стул, ритм клуба |
| `/council` | Совет (закрыто для Участника) |
| `/study` | Кабинет: профиль, Пульс, ключи, письма |
| `/study/focus`, `/study/connections`, `/study/benefits`, `/study/rules`, `/study/pause` | Фокус недели, карта связей, что даёт клуб, законы, пауза |

## Дальше (не сделано)

Supabase (БД, вход по подписи Telegram), бот на grammY (анкета, уведомления), настоящие QR (живые, подписанные сервером), Пульс и правила начисления, отклики и чат через Telegram.
# club
