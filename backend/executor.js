import { db } from './db.js';

function applyCondition(row, condition, joinRow = null) {
  if (!condition) return true;
  const merged = joinRow ? { ...row, ...joinRow } : row;

  if (condition.type === 'AND') {
    return condition.conditions.every(c => applyCondition(merged, c));
  }
  if (condition.type === 'OR') {
    return condition.conditions.some(c => applyCondition(merged, c));
  }

  const { field, op, value } = condition;
  const rowVal = merged[field];

  switch (op) {
    case '=': return String(rowVal) === String(value);
    case '>': return Number(rowVal) > Number(value);
    case '<': return Number(rowVal) < Number(value);
    case '>=': return Number(rowVal) >= Number(value);
    case '<=': return Number(rowVal) <= Number(value);
    case 'КАМТЫЙТ': return String(rowVal).toLowerCase().includes(String(value).toLowerCase());
    default: return false;
  }
}

function filterFields(row, fields) {
  if (fields === '*' || (Array.isArray(fields) && fields[0] === '*')) return row;
  const result = {};
  for (const f of fields) {
    result[f] = row[f];
  }
  return result;
}

export async function execute(parsed) {
  await db.read();
  const tables = db.data.tables;

  switch (parsed.command) {
    case 'ТАБЛИЦАЛАРДЫ_КӨРСӨТ': {
      return {
        success: true,
        tables: Object.keys(tables).map(name => ({
          name,
          columns: tables[name].columns,
          rowCount: tables[name].rows.length
        }))
      };
    }

    case 'ТАБЛИЦА_ТҮЗ': {
      const { table, columns } = parsed;
      if (tables[table]) {
        throw new Error(`"${table}" таблицасы мурунтан эле бар`);
      }
      if (!columns.includes('id')) {
        columns.unshift('id');
      }
      tables[table] = { columns, rows: [], nextId: 1 };
      await db.write();
      return { success: true, message: `"${table}" таблицасы түзүлдү`, columns };
    }

    case 'ТАБЛИЦАНЫ_ӨЧҮР': {
      const { table } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }
      delete tables[table];
      await db.write();
      return { success: true, message: `"${table}" таблицасы өчүрүлдү` };
    }

    case 'КОШ': {
      const { table, columns, values } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }
      if (columns.length !== values.length) {
        throw new Error(`Мамычалардын саны (${columns.length}) маанилердин санына (${values.length}) дал келбейт`);
      }
      const row = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]] = values[i];
      }
      if (!row.id) {
        row.id = tables[table].nextId++;
      }
      tables[table].rows.push(row);
      await db.write();
      return { success: true, message: 'Жазуу кошулду', inserted: row };
    }

    case 'ЖАҢЫЛА': {
      const { table, updates, condition } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }
      let count = 0;
      tables[table].rows = tables[table].rows.map(row => {
        if (applyCondition(row, condition)) {
          count++;
          return { ...row, ...updates };
        }
        return row;
      });
      await db.write();
      return { success: true, message: `Жаңыртылган жазуулар: ${count}`, count };
    }

    case 'ӨЧҮР': {
      const { table, condition } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }
      const before = tables[table].rows.length;
      tables[table].rows = tables[table].rows.filter(row => !applyCondition(row, condition));
      const deleted = before - tables[table].rows.length;
      await db.write();
      return { success: true, message: `Өчүрүлгөн жазуулар: ${deleted}`, count: deleted };
    }

    case 'ТАНДА': {
      const { fields, table, condition, join } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }

      let rows = tables[table].rows;

      if (join) {
        if (!tables[join.table]) {
          throw new Error(`БИРИКТИР үчүн "${join.table}" таблицасы табылган жок`);
        }
        const joinRows = tables[join.table].rows;
        const joined = [];
        for (const row of rows) {
          for (const jRow of joinRows) {
            const prefixedJRow = {};
            for (const [k, v] of Object.entries(jRow)) {
              prefixedJRow[`${join.table}.${k}`] = v;
            }
            const mergedForCondition = { ...row, ...prefixedJRow };

            const joinOnLeft = join.on.field;
            const joinOnRight = join.on.value;

            const leftVal = row[joinOnLeft] ?? mergedForCondition[joinOnLeft];
            const rightVal = jRow[joinOnRight] ?? jRow[String(joinOnRight).replace(`${join.table}.`, '')];

            if (String(leftVal) === String(rightVal)) {
              joined.push(mergedForCondition);
            }
          }
        }
        rows = joined;
      }

      if (condition) {
        rows = rows.filter(row => applyCondition(row, condition));
      }

      const result = rows.map(row => filterFields(row, fields));

      return {
        success: true,
        table,
        count: result.length,
        rows: result
      };
    }

    case 'ЭКСПОРТ': {
      const { table, format } = parsed;
      if (!tables[table]) {
        throw new Error(`"${table}" таблицасы табылган жок`);
      }
      return {
        success: true,
        export: true,
        table,
        format,
        columns: tables[table].columns,
        rows: tables[table].rows
      };
    }

    default:
      throw new Error(`Белгисиз буйрук: ${parsed.command}`);
  }
}