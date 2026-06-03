# NoSQL-RU — Лёгкая NoSQL СУБД с русским DSL

## Структура проекта

```
nosql-ru/
├── backend/
│   ├── package.json   — express, lowdb, exceljs, cors
│   ├── server.js      — Express API (порт 3001)
│   ├── db.js          — Lowdb + дефолтные данные (users, orders)
│   ├── parser.js      — Парсер русского DSL
│   ├── executor.js    — CRUD / SELECT / JOIN
│   └── exporter.js    — Excel (exceljs) и CSV
└── frontend/
    ├── package.json   — svelte ^5, @sveltejs/vite-plugin-svelte ^4
    ├── vite.config.js — Vite + прокси → :3001
    ├── index.html
    └── src/
        ├── main.js    — точка входа Svelte 5
        └── App.svelte — три вкладки ($state, $derived, $effect)
```

## Запуск

```bash
# Терминал 1 — бэкенд
cd backend
npm install
npm start
# → http://localhost:3001

# Терминал 2 — фронтенд
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## DSL-команды

| Команда | Пример |
|---|---|
| ПОКАЗАТЬ ТАБЛИЦЫ | `ПОКАЗАТЬ ТАБЛИЦЫ` |
| СОЗДАТЬ ТАБЛИЦУ | `СОЗДАТЬ ТАБЛИЦУ products (name, price, category)` |
| УДАЛИТЬ ТАБЛИЦУ | `УДАЛИТЬ ТАБЛИЦУ products` |
| ВСТАВИТЬ В | `ВСТАВИТЬ В users (name, age, email, city) ЗНАЧЕНИЯ ('Анна', 29, 'a@mail.ru', 'Казань')` |
| ВЫБРАТЬ | `ВЫБРАТЬ * ИЗ users ГДЕ age > 25` |
| ВЫБРАТЬ + СОДЕРЖИТ | `ВЫБРАТЬ * ИЗ users ГДЕ city СОДЕРЖИТ Москва` |
| ВЫБРАТЬ + СОЕДИНИТЬ | `ВЫБРАТЬ * ИЗ orders СОЕДИНИТЬ users ПО userId=id` |
| ОБНОВИТЬ | `ОБНОВИТЬ users УСТАНОВИТЬ city='Уфа' ГДЕ id=3` |
| УДАЛИТЬ ИЗ | `УДАЛИТЬ ИЗ orders ГДЕ amount < 1000` |
| ЭКСПОРТ В EXCEL | `ЭКСПОРТ users В EXCEL` |
| ЭКСПОРТ В CSV | `ЭКСПОРТ orders В CSV` |

## Операторы условий
`=` `>` `<` `>=` `<=` `СОДЕРЖИТ` · Составные: `И` / `ИЛИ`

## API эндпоинты
- `POST /query` — выполнить DSL-запрос
- `POST /export-file` — скачать Excel/CSV
- `GET /tables` — список таблиц
- `GET /tables/:name` — данные таблицы
