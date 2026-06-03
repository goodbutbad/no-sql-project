import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'db.json');

const defaultData = {
  tables: {
    users: {
      columns: ['id', 'name', 'age', 'email', 'city'],
      rows: [
        { id: 1, name: 'Алексей', age: 28, email: 'alex@mail.ru', city: 'Москва' },
        { id: 2, name: 'Мария', age: 34, email: 'maria@mail.ru', city: 'Санкт-Петербург' },
        { id: 3, name: 'Дмитрий', age: 22, email: 'dima@mail.ru', city: 'Казань' },
        { id: 4, name: 'Ольга', age: 45, email: 'olga@mail.ru', city: 'Москва' },
        { id: 5, name: 'Иван', age: 31, email: 'ivan@mail.ru', city: 'Новосибирск' }
      ],
      nextId: 6
    },
    orders: {
      columns: ['id', 'userId', 'product', 'amount', 'status'],
      rows: [
        { id: 1, userId: 1, product: 'Ноутбук', amount: 75000, status: 'доставлен' },
        { id: 2, userId: 2, product: 'Телефон', amount: 45000, status: 'в пути' },
        { id: 3, userId: 1, product: 'Мышь', amount: 2500, status: 'доставлен' },
        { id: 4, userId: 3, product: 'Клавиатура', amount: 5000, status: 'обработка' },
        { id: 5, userId: 4, product: 'Монитор', amount: 32000, status: 'в пути' },
        { id: 6, userId: 5, product: 'Наушники', amount: 8000, status: 'доставлен' }
      ],
      nextId: 7
    }
  }
};

const adapter = new JSONFile(dbPath);
const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  if (!db.data || !db.data.tables) {
    db.data = defaultData;
    await db.write();
  }
  return db;
}

export { db };
