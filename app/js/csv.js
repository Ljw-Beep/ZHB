// 浏览器端生成 CSV（与本地服务的导出格式保持一致），供静态部署时使用。
const HEADER = ['日期', '类型', '金额', '一级分类', '二级分类', '账户', '标签', '备注'];

export function csvCell(value) {
  const v = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function fenToYuan(fen) {
  return (Math.round(Number(fen) || 0) / 100).toFixed(2);
}

/**
 * @param {object} state 完整数据
 * @param {{month?: string, all?: boolean}} opts month 形如 2026-10；all 为 true 时导出全部
 * @returns {string} 以 \r\n 换行的 CSV 文本（不含 BOM）
 */
export function buildCsv(state, opts = {}) {
  const { month = '', all = false } = opts;
  const cats = {};
  (state.categories || []).forEach((c) => { cats[c.id] = c; });
  const accs = {};
  (state.accounts || []).forEach((a) => { accs[a.id] = a; });
  const tags = {};
  (state.tags || []).forEach((t) => { tags[t.id] = t; });

  const list = (state.transactions || []).slice().sort((a, b) => {
    const d = String(a.date || '').localeCompare(String(b.date || ''));
    if (d !== 0) return d;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  const lines = [HEADER.map(csvCell).join(',')];

  list.forEach((t) => {
    if (!all && month && !String(t.date || '').startsWith(month)) return;

    const type = t.kind === 'income' ? '收入' : t.kind === 'transfer' ? '转账' : '支出';
    let p1 = '';
    let p2 = '';
    const cat = cats[t.categoryId];
    if (cat) {
      const parent = cat.parentId ? cats[cat.parentId] : null;
      if (parent) {
        p1 = parent.name;
        p2 = cat.name;
      } else {
        p1 = cat.name;
      }
    }

    let accountName = accs[t.accountId] ? accs[t.accountId].name : '';
    if (t.kind === 'transfer') {
      const to = accs[t.toAccountId] ? accs[t.toAccountId].name : '';
      accountName = accountName + ' → ' + to;
      p1 = '';
      p2 = '';
    }

    const tagNames = (t.tagIds || []).map((id) => (tags[id] ? tags[id].name : '')).filter(Boolean);

    lines.push([
      t.date,
      type,
      fenToYuan(t.amount),
      p1,
      p2,
      accountName,
      tagNames.join('|'),
      t.note
    ].map(csvCell).join(','));
  });

  return lines.join('\r\n') + '\r\n';
}

export const CSV_HEADER = HEADER;
