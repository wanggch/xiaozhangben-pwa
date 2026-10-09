/** RFC 4180 风格的 CSV 解析/生成（支持引号、转义引号、字段内换行、CRLF） */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export function toCSV(rows: (string | number)[][]): string {
  return '\ufeff' + rows.map(r => r.map(v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // 防止表格软件把备注当公式执行
    return `"${s.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}
