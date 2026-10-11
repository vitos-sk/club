# bot/

Бот на grammY **пока не написан**: ему нужен токен из @BotFather, а работа идёт на заглушках без токенов.

Вся логика бота уже есть в `../core/` и покрыта тестами. Бот станет тонкой обёрткой:

| Что делает бот | Какая функция ядра |
|---|---|
| кодовое слово, проверка гостя, анкета | `startCandidate`, `saveAnswer`, `submitApplication` |
| оценка анкеты двумя проверяющими | `reviewAnswer` |
| звонок, приём, посвящение, законы | `recordCall`, `acceptCandidate`, `admit`, `signLaws` |
| гость, событие, явка | `markGuest`, `createEvent`, `markAttendance` |
| подтверждение помощи | `confirmHelp` |
| «встретились», запрос встречи | `pressMet`, `requestMeeting` |
| дежурный | `assignDuty`, `recordPing` |
| часы создателя | таблица `creator_hours` |
| /report | `computeMetrics`, `formatReport`, `allCsv` |
| напоминания | `tick(store, now)` пишет в таблицу `notifications`; бот отправит их в Telegram |

Команды латиницей (`/report`, `/guest`…), русские варианты ловить текстом (docs/decisions.md D6).
Нужно от заказчика: `BOT_TOKEN`, `CREATOR_TG_ID`, `NEWS_CHANNEL_ID` — в `.env` (см. `.env.example`).
