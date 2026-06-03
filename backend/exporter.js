import ExcelJS from 'exceljs';

export async function exportToExcel(tableName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NoSQL-KG';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(tableName, {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // Header row with styling
  sheet.columns = columns.map(col => ({
    header: col,
    key: col,
    width: Math.max(col.length + 4, 15)
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2D5A9B' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;
  headerRow.commit();

  // Data rows
  rows.forEach((row, idx) => {
    const dataRow = sheet.addRow(columns.map(col => row[col] ?? ''));
    if (idx % 2 === 1) {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F4FA' }
      };
    }
    dataRow.alignment = { vertical: 'middle' };
    dataRow.height = 20;
    dataRow.commit();
  });

  // Borders for all cells
  const lastRow = sheet.rowCount;
  const lastCol = columns.length;
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

export function exportToCsv(columns, rows) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const header = columns.join(';');
  const dataRows = rows.map(row =>
    columns.map(col => {
      const val = row[col] ?? '';
      const str = String(val);
      // Escape values with semicolons or quotes
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(';')
  );
  return BOM + [header, ...dataRows].join('\r\n');
}
