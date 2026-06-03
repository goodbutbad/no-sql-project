# NoSQL-KG — Лёгкая NoSQL СУБД с кыргызским DSL

## Структура проекта

```
nosql-ru/
├── backend/
│   ├── package.json   — express, lowdb, exceljs, cors
│   ├── server.js      — Express API (порт 3001)
│   ├── db.js          — Lowdb + дефолтные данные (users, orders)
│   ├── parser.js      — Парсер кыршызского DSL
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



