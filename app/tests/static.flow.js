// 静态部署模式测试：模拟 GitHub Pages 这类没有后端的托管环境。
import { buildCsv } from '../js/csv.js';

const results = [];
let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(name, fn) {
  try { await fn(); passed++; results.push({ ok: true, name }); }
  catch (e) { failed++; results.push({ ok: false, name: name + ' :: ' + e.message }); }
}

function eq(a, b, msg = '') {
  const as = JSON.stringify(a); const bs = JSON.stringify(b);
  if (as !== bs) throw new Error((msg ? msg + ' ' : '') + '期望 ' + bs + '，实际 ' + as);
}
function ok(v, msg = '期望为真') { if (!v) throw new Error(msg); }

function clearLedgerStorage() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('ledger.'))
    .forEach((k) => localStorage.removeItem(k));
}

// 关键：先把 fetch 打桩，模拟“没有 /api 的静态托管”
window.fetch = () => Promise.reject(new TypeError('static hosting: no backend'));

const { api } = await import('../js/api.js');
const { store } = await import('../js/store.js');
const home = await import('../js/pages/home.js');

async function run() {
  clearLedgerStorage();

  await test('无后端时自动进入本地模式', async () => {
    const mode = await api.init(300);
    eq(mode, 'local');
    eq(api.mode, 'local');
  });

  await test('首次使用生成默认数据', async () => {
    await store.load();
    eq(store.state.accounts.length, 4);
    eq(store.state.categories.length, 38);
    eq(store.state.transactions.length, 0);
  });

  await test('记账后写入浏览器本地存储', async () => {
    const before = store.state.transactions.length;
    await store.commit((s) => {
      s.transactions.push({
        id: 'static-1', kind: 'expense', amount: 2850, accountId: 'a1', toAccountId: null,
        categoryId: 'c1', date: new Date().toISOString().slice(0, 10), note: '静态模式测试',
        tagIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    });
    eq(store.state.transactions.length, before + 1);
    const raw = JSON.parse(localStorage.getItem('ledger.state.v1'));
    eq(raw.transactions.length, before + 1);
    eq(raw.transactions[0].note, '静态模式测试');
  });

  await test('重新读取（等价刷新页面）数据仍在', async () => {
    const again = await api.getState();
    eq(again.data.transactions.length, 1);
    eq(again.rev >= 2, true);
  });

  await test('版本冲突会被拒绝', async () => {
    const st = await api.getState();
    let caught = null;
    try {
      await api.putState(st.data, st.rev - 1);
    } catch (e) {
      caught = e;
    }
    ok(caught, '应当抛出冲突');
    eq(caught.status, 409);
  });

  await test('本地备份计数会增加', async () => {
    await api.backup();
    const info = await api.info();
    eq(info.mode, 'local');
    eq(info.backupCount, 1);
    ok(info.dataFile.includes('localStorage'), info.dataFile);
  });

  await test('页面在本地模式下可以正常渲染', async () => {
    const host = document.getElementById('host');
    home.mount(host, { month: new Date().toISOString().slice(0, 7), params: {}, goto() {}, openQuickAdd() {} });
    await sleep(100);
    ok(host.querySelector('[data-page="home"]'), '首页未渲染');
    ok(host.querySelector('.cal-cell'), '日历未渲染');
    ok(host.querySelectorAll('.account-card').length === 4, '账户卡数量不对');
  });

  await test('CSV 导出内容与格式正确', async () => {
    const csv = buildCsv(store.state, { all: true });
    const lines = csv.trim().split('\r\n');
    eq(lines[0], '日期,类型,金额,一级分类,二级分类,账户,标签,备注');
    eq(lines.length, 2);
    ok(lines[1].includes('28.50'), lines[1]);
    ok(lines[1].includes('餐饮'), lines[1]);
    ok(lines[1].includes('静态模式测试'), lines[1]);
  });

  await test('导入备份可以恢复数据', async () => {
    const snapshot = JSON.parse(JSON.stringify(store.state));
    snapshot.transactions = [];
    await store.commit((s) => {
      s.transactions = [];
      s.accounts = snapshot.accounts;
      s.categories = snapshot.categories;
    });
    eq(store.state.transactions.length, 0);
    snapshot.transactions = [{
      id: 'imported-1', kind: 'income', amount: 100, accountId: 'a1', categoryId: 'c10',
      date: snapshot.transactions.length ? '' : new Date().toISOString().slice(0, 10),
      note: '导入的账目', tagIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }];
    await store.commit((s) => {
      s.transactions = snapshot.transactions;
    });
    eq(store.state.transactions.length, 1);
    eq(store.state.transactions[0].note, '导入的账目');
  });
}

function render() {
  const summary = document.getElementById('summary');
  summary.textContent = 'STATIC PASS ' + passed + ' / FAIL ' + failed;
  summary.className = failed ? 'fail' : 'pass';
  const ol = document.getElementById('results');
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = (r.ok ? '✓ ' : '✗ ') + r.name;
    ol.append(li);
  });
  document.title = 'STATIC PASS ' + passed + ' FAIL ' + failed;
}

run()
  .catch((e) => {
    failed++;
    results.push({ ok: false, name: '运行异常 :: ' + (e && e.message ? e.message : e) });
  })
  .finally(() => {
    clearLedgerStorage();
    render();
  });
