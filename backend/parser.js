/**
 * NoSQL СУБД үчүн кыргызча DSL парсери
 * Колдоого алынган буйруктар:
 * - ТАБЛИЦА ТҮЗ аты (мамыча1, мамыча2, ...)
 * - ТАБЛИЦАНЫ ӨЧҮР аты
 * - ИЧИНЕ КОШ аты (мамычалар) МААНИЛЕР (маанилер)
 * - ЖАҢЫЛА аты ОРНОТ мамыча1=маани1,мамыча2=маани2 КАЙДА шарт
 * - ИЧИНЕН ӨЧҮР аты КАЙДА шарт
 * - ТАНДА талаалар ИЧИНЕН аты [КАЙДА шарт] [БИРИКТИР таб БОЮНЧА шарт]
 * - ЭКСПОРТ аты В (EXCEL|CSV)
 * - ТАБЛИЦАЛАРДЫ КӨРСӨТ
 */

function normalizeQuery(query) {
  return query.trim().replace(/\s+/g, ' ');
}

function parseCondition(condStr) {
  if (!condStr || condStr.trim() === '') return null;
  condStr = condStr.trim();

  // ЖАНА / ЖЕ
  const andParts = condStr.split(/\s+ЖАНА\s+/i);
  if (andParts.length > 1) {
    return { type: 'AND', conditions: andParts.map(p => parseSingleCondition(p.trim())) };
  }

  const orParts = condStr.split(/\s+ЖЕ\s+/i);
  if (orParts.length > 1) {
    return { type: 'OR', conditions: orParts.map(p => parseSingleCondition(p.trim())) };
  }

  return parseSingleCondition(condStr);
}

function parseSingleCondition(condStr) {
  condStr = condStr.trim();

  // КАМТЫЙТ
  const containsMatch = condStr.match(/^(\w+)\s+КАМТЫЙТ\s+['"]?(.+?)['"]?$/i);
  if (containsMatch) {
    return { field: containsMatch[1], op: 'КАМТЫЙТ', value: containsMatch[2].trim() };
  }

  // >= <=
  const geMatch = condStr.match(/^(\w+)\s*>=\s*(.+)$/);
  if (geMatch) return { field: geMatch[1], op: '>=', value: parseValue(geMatch[2].trim()) };

  const leMatch = condStr.match(/^(\w+)\s*<=\s*(.+)$/);
  if (leMatch) return { field: leMatch[1], op: '<=', value: parseValue(leMatch[2].trim()) };

  // > <
  const gtMatch = condStr.match(/^(\w+)\s*>\s*(.+)$/);
  if (gtMatch) return { field: gtMatch[1], op: '>', value: parseValue(gtMatch[2].trim()) };

  const ltMatch = condStr.match(/^(\w+)\s*<\s*(.+)$/);
  if (ltMatch) return { field: ltMatch[1], op: '<', value: parseValue(ltMatch[2].trim()) };

  // =
  const eqMatch = condStr.match(/^(\w+)\s*=\s*(.+)$/);
  if (eqMatch) return { field: eqMatch[1], op: '=', value: parseValue(eqMatch[2].trim()) };

  throw new Error(`Шартты талдоо мүмкүн болгон жок: "${condStr}"`);
}

function parseValue(val) {
  if (!val) return null;

  val = val.trim();

  if (
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('"') && val.endsWith('"'))
  ) {
    return val.slice(1, -1);
  }

  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;

  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;
  if (val.toLowerCase() === 'null') return null;

  return val;
}

function parseSetClause(setStr) {
  const updates = {};
  const pairs = setStr.split(',');

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');

    if (eqIdx === -1) {
      throw new Error(`ОРНОТ форматы туура эмес: "${pair}"`);
    }

    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();

    updates[key] = parseValue(val);
  }

  return updates;
}

function parseColumnList(str) {
  return str.split(',').map(c => c.trim()).filter(Boolean);
}

function parseValueList(str) {
  const values = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (!inQuote && (ch === "'" || ch === '"')) {
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      inQuote = false;
    } else if (!inQuote && ch === ',') {
      values.push(parseValue(current.trim()));
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim() !== '') {
    values.push(parseValue(current.trim()));
  }

  return values;
}

function extractParenContent(str, keyword) {
  const idx = str.indexOf(keyword);

  if (idx === -1) return null;

  const afterKeyword = str.slice(idx + keyword.length).trim();
  const openParen = afterKeyword.indexOf('(');

  if (openParen === -1) return null;

  const closeParen = afterKeyword.lastIndexOf(')');

  if (closeParen === -1) return null;

  return afterKeyword.slice(openParen + 1, closeParen);
}

export function parse(query) {
  const q = normalizeQuery(query);
  const upper = q.toUpperCase();

  // ТАБЛИЦАЛАРДЫ КӨРСӨТ
  if (/^ТАБЛИЦАЛАРДЫ КӨРСӨТ$/i.test(q)) {
    return { command: 'ТАБЛИЦАЛАРДЫ_КӨРСӨТ' };
  }

  // ТАБЛИЦА ТҮЗ аты (...)
  const createMatch = q.match(/^ТАБЛИЦА ТҮЗ\s+(\S+)\s*\((.+)\)$/i);

  if (createMatch) {
    return {
      command: 'ТАБЛИЦА_ТҮЗ',
      table: createMatch[1],
      columns: parseColumnList(createMatch[2])
    };
  }

  // ТАБЛИЦАНЫ ӨЧҮР аты
  const dropMatch = q.match(/^ТАБЛИЦАНЫ ӨЧҮР\s+(\S+)$/i);

  if (dropMatch) {
    return {
      command: 'ТАБЛИЦАНЫ_ӨЧҮР',
      table: dropMatch[1]
    };
  }

  // ИЧИНЕ КОШ аты (...) МААНИЛЕР (...)
  const insertMatch = q.match(
    /^ИЧИНЕ КОШ\s+(\S+)\s*\((.+?)\)\s*МААНИЛЕР\s*\((.+)\)$/i
  );

  if (insertMatch) {
    const cols = parseColumnList(insertMatch[2]);
    const vals = parseValueList(insertMatch[3]);

    return {
      command: 'КОШ',
      table: insertMatch[1],
      columns: cols,
      values: vals
    };
  }

  // ЖАҢЫЛА аты ОРНОТ ...
  const updateMatch = q.match(
    /^ЖАҢЫЛА\s+(\S+)\s+ОРНОТ\s+(.+?)(?:\s+КАЙДА\s+(.+))?$/i
  );

  if (updateMatch) {
    return {
      command: 'ЖАҢЫЛА',
      table: updateMatch[1],
      updates: parseSetClause(updateMatch[2].trim()),
      condition: updateMatch[3]
        ? parseCondition(updateMatch[3].trim())
        : null
    };
  }

  // ИЧИНЕН ӨЧҮР аты КАЙДА ...
  const deleteMatch = q.match(
    /^ИЧИНЕН ӨЧҮР\s+(\S+)(?:\s+КАЙДА\s+(.+))?$/i
  );

  if (deleteMatch) {
    return {
      command: 'ӨЧҮР',
      table: deleteMatch[1],
      condition: deleteMatch[2]
        ? parseCondition(deleteMatch[2].trim())
        : null
    };
  }

  // ЭКСПОРТ аты В (EXCEL|CSV)
  const exportMatch = q.match(/^ЭКСПОРТ\s+(\S+)\s+В\s+(EXCEL|CSV)$/i);

  if (exportMatch) {
    return {
      command: 'ЭКСПОРТ',
      table: exportMatch[1],
      format: exportMatch[2].toUpperCase()
    };
  }

  // ТАНДА ... ИЧИНЕН ...
  const selectBaseMatch = q.match(
    /^ТАНДА\s+(.+?)\s+ИЧИНЕН\s+(\S+)(.*)?$/i
  );

  if (selectBaseMatch) {
    const fields = selectBaseMatch[1].trim();
    const table = selectBaseMatch[2].trim();
    let rest = (selectBaseMatch[3] || '').trim();

    let condition = null;
    let join = null;

    const joinMatch = rest.match(
      /БИРИКТИР\s+(\S+)\s+БОЮНЧА\s+(.+?)(?:\s+КАЙДА\s+(.+))?$/i
    );

    if (joinMatch) {
      join = {
        table: joinMatch[1],
        on: parseSingleCondition(joinMatch[2].trim())
      };

      const beforeJoin = rest
        .slice(0, rest.toUpperCase().indexOf('БИРИКТИР'))
        .trim();

      if (beforeJoin.toUpperCase().startsWith('КАЙДА ')) {
        condition = parseCondition(beforeJoin.slice(6).trim());
      }

      if (joinMatch[3]) {
        condition = parseCondition(joinMatch[3].trim());
      }
    } else {
      const whereMatch = rest.match(/^КАЙДА\s+(.+)$/i);

      if (whereMatch) {
        condition = parseCondition(whereMatch[1].trim());
      }
    }

    const fieldList = fields === '*'
      ? '*'
      : parseColumnList(fields);

    return {
      command: 'ТАНДА',
      fields: fieldList,
      table,
      condition,
      join
    };
  }

  throw new Error(`Белгисиз буйрук: "${q}"`);
}