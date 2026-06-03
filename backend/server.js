import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { parse } from './parser.js';
import { execute } from './executor.js';
import { exportToExcel, exportToCsv } from './exporter.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Сервер ишке киргенде маалымат базасын даярдоо
await initDb();
console.log('✅ Маалымат базасы даярдалды');

/**
 * POST /query
 * Body: { query: "ТАНДА * ИЧИНЕН users" }
 * Жооп: JSON натыйжа
 */
app.post('/query', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      success: false,
      error: '"query" талаасы милдеттүү'
    });
  }

  try {
    const parsed = parse(query.trim());
    const result = await execute(parsed);

    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /export-file
 * Body: { query: "ЭКСПОРТ users В EXCEL" }
 * Натыйжа: файл жүктөө
 */
app.post('/export-file', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: '"query" талаасы милдеттүү'
    });
  }

  try {
    const parsed = parse(query.trim());

    if (parsed.command !== 'ЭКСПОРТ') {
      return res.status(400).json({
        success: false,
        error: 'Буйрук ЭКСПОРТ болушу керек'
      });
    }

    const result = await execute(parsed);
    const { table, format, columns, rows } = result;

    if (format === 'EXCEL') {
      const buffer = await exportToExcel(table, columns, rows);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${table}_export.xlsx"`
      );

      res.send(Buffer.from(buffer));
    } else if (format === 'CSV') {
      const csv = exportToCsv(columns, rows);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${table}_export.csv"`
      );

      res.send(csv);
    } else {
      res.status(400).json({
        success: false,
        error: `Белгисиз формат: ${format}`
      });
    }
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /tables
 * Бардык таблицалардын тизмеси
 */
app.get('/tables', async (req, res) => {
  try {
    const result = await execute({
      command: 'ТАБЛИЦАЛАРДЫ_КӨРСӨТ'
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /tables/:name
 * Белгилүү бир таблицанын бардык саптарын кайтарат
 */
app.get('/tables/:name', async (req, res) => {
  try {
    const result = await execute({
      command: 'ТАНДА',
      fields: '*',
      table: req.params.name,
      condition: null,
      join: null
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер ишке кирди: http://localhost:${PORT}`);
  console.log('📋 API чекиттери:');
  console.log('   POST /query        — DSL сурамын аткаруу');
  console.log('   POST /export-file  — Excel/CSV форматына экспорттоо');
  console.log('   GET  /tables       — таблицалардын тизмеси');
  console.log('   GET  /tables/:name — таблицадагы маалыматтар');
});