// 批量输入解析：支持 JSON 与 CSV。一行 / 一项 = 一条视频。
import {readFile} from 'node:fs/promises';
import path from 'node:path';

/** 极简 CSV/TSV 解析，支持双引号包裹、字段内分隔符/换行、"" 转义。 */
export const parseCsv = (text, delimiter = ',') => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      field = '';
      // 跳过完全空行。
      if (row.length > 1 || row[0].trim() !== '') {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== '') {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    header.forEach((key, idx) => {
      const value = (cells[idx] ?? '').trim();
      if (value !== '') {
        obj[key] = value;
      }
    });
    return obj;
  });
};

/** 读取输入文件，按扩展名解析为行对象数组。 */
export const parseInputFile = async (filePath) => {
  // 去除 UTF-8 BOM（Excel 导出的 CSV 常带），否则首列表头会带上 ﻿。
  const text = (await readFile(filePath, 'utf8')).replace(/^﻿/, '');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : Array.isArray(data.videos) ? data.videos : [data];
    return rows;
  }
  if (ext === '.csv') return parseCsv(text, ',');
  if (ext === '.tsv') return parseCsv(text, '\t');
  throw new Error(`不支持的输入格式: ${ext}（支持 .json / .csv / .tsv）`);
};
