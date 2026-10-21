import { el } from '../components.js';
import { store } from '../store.js';
import { createEntryForm, openEditTransaction } from '../quickadd.js';
import {
  activeAccounts, accountBalances, monthSummary, daySummary, recentTx,
  budgetUsage, categoryMap, accountMap
} from '../selectors.js';
import { fmtMoney, fmtSigned, todayStr, monthLabel, escapeHtml } from '../utils.js';

export const title = '首页';

export function mount(root, ctx) {
  const page = el('div', { class: 'page', 'data-page': 'home' });

  const accountsEl = el('div', { class: 'account-row' });
  const formCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('div', { class: 'card-title', text: '快速记一笔' }))
  );
  const overviewEl = el('div', { class: 'card' });
  const recentEl = el('div', { class: 'card', style: 'margin-top:16px' });

  page.append(
    accountsEl,
    el('div', { class: 'grid-2' },
      formCard,
      el('div', {}, overviewEl, recentEl)
    )
  );
  root.append(page);

  const form = createEntryForm({});
  formCard.append(form.el);

  function renderAccounts() {
    const st = store.state;
    const bal = accountBalances(st);
    accountsEl.innerHTML = '';
    const accs = activeAccounts(st);
    if (!accs.length) {
      accountsEl.append(el('div', { class: 'account-card muted', text: '还没有账户，去设置页添加' }));
      return;
    }
    accs.forEach(a => {
      const amount = bal[a.id] || 0;
      const card = el('button', {
        class: 'account-card',
        type: 'button',
        'data-account': a.id,
        onclick: () => ctx.goto('bills', { account: a.id })
      },
        el('div', { class: 'account-name' }, el('span', { text: a.icon || '💳' }), a.name),
        el('div', { class: 'account-balance' + (amount < 0 ? ' text-expense' : ''), text: fmtMoney(amount) })
      );
      accountsEl.append(card);
    });
  }

  function renderOverview() {
    const st = store.state;
    const m = ctx.month;
    const s = monthSummary(st, m);
    const bu = budgetUsage(st, m);
    overviewEl.innerHTML = '';
    overviewEl.append(
      el('div', { class: 'card-head' },
        el('div', { class: 'card-title', text: monthLabel(m) + ' 概览' }),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goto('stats') }, '看统计')
      ),
      el('div', { class: 'overview-rows' },
        el('div', { class: 'overview-row' }, el('span', { class: 'muted', text: '支出' }), el('strong', { class: 'text-expense num', text: fmtMoney(s.expense) })),
        el('div', { class: 'overview-row' }, el('span', { class: 'muted', text: '收入' }), el('strong', { class: 'text-income num', text: fmtMoney(s.income) })),
        el('div', { class: 'overview-row' }, el('span', { class: 'muted', text: '结余' }), el('strong', { class: 'num', text: fmtMoney(s.balance) }))
      )
    );

    const budgetBox = el('div', { class: 'budget-mini' });
    if (bu.totalBudget > 0) {
      const pct = Math.min(100, bu.totalPct);
      budgetBox.append(
        el('div', { class: 'row-between budget-mini-head' },
          el('span', { class: 'muted', text: '预算剩余' }),
          el('strong', { class: 'num' + (bu.remaining < 0 ? ' text-expense' : ''), text: fmtMoney(bu.remaining) })
        ),
        el('div', { class: 'progress' },
          el('div', { class: 'progress-bar' + (bu.totalStatus === 'danger' ? ' danger' : bu.totalStatus === 'warn' ? ' warn' : ''), style: 'width:' + pct + '%' })
        ),
        el('div', { class: 'card-sub', text: '已用 ' + fmtMoney(bu.totalUsed) + ' / ' + fmtMoney(bu.totalBudget) })
      );
    } else {
      budgetBox.append(el('div', { class: 'row-between' },
        el('span', { class: 'muted', text: '本月未设预算' }),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goto('budget') }, '去设置')
      ));
    }
    overviewEl.append(budgetBox);

    if (bu.overspent.length && (st.settings ? st.settings.overspendAlert !== false : true)) {
      overviewEl.append(el('div', {
        class: 'overspend-hint',
        text: '⚠ ' + bu.overspent.map(r => r.name).join('、') + ' 已超支'
      }));
    }

    const day = daySummary(st, todayStr());
    const todayRow = el('div', { class: 'today-line' },
      el('span', { class: 'muted', text: '今日' }),
      el('span', { text: day.count ? '已花 ' + fmtMoney(day.expense) + ' · ' + day.count + ' 笔' : '今天还没记账' }),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goto('bills', { date: todayStr() }) }, '查看')
    );
    overviewEl.append(todayRow);
  }

  function renderRecent() {
    const st = store.state;
    const list = recentTx(st, 8);
    const cMap = categoryMap(st);
    const aMap = accountMap(st);
    recentEl.innerHTML = '';
    recentEl.append(el('div', { class: 'card-head' },
      el('div', { class: 'card-title', text: '最近记录' }),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.goto('bills') }, '查看全部')
    ));

    if (!list.length) {
      recentEl.append(el('div', { class: 'empty', style: 'padding:24px 8px' },
        el('div', { class: 'empty-ico', text: '🗒️' }),
        el('p', { text: '还没有账目，从上面记第一笔吧' })
      ));
      return;
    }

    const wrap = el('div', { class: 'list' });
    list.forEach(t => {
      const c = cMap[t.categoryId];
      const parentCat = c && c.parentId ? cMap[c.parentId] : null;
      const acc = aMap[t.accountId];
      const transfer = t.kind === 'transfer';
      const toAcc = aMap[t.toAccountId];
      const label = transfer ? '转账' : (c ? c.name : '未分类');
      const icon = transfer ? '🔄' : ((c && c.icon) || (parentCat && parentCat.icon) || '📦');
      const amountText = transfer ? fmtMoney(t.amount) : fmtSigned(t.amount, t.kind);
      const right = transfer ? 'text-muted' : (t.kind === 'income' ? 'text-income' : 'text-expense');

      const row = el('button', {
        class: 'list-row list-row-btn',
        type: 'button',
        onclick: () => openEditTransaction(t)
      },
        el('span', { class: 'row-ico', text: icon }),
        el('span', { class: 'row-main' },
          el('span', { class: 'row-title', text: label + (t.note ? ' · ' + t.note : '') }),
          el('span', { class: 'row-sub', text: (acc ? acc.name : '') + (transfer && toAcc ? ' → ' + toAcc.name : '') + ' · ' + t.date })
        ),
        el('span', { class: 'row-amount ' + right, text: amountText })
      );
      wrap.append(row);
    });
    recentEl.append(wrap);
  }

  function refresh() {
    renderAccounts();
    renderOverview();
    renderRecent();
  }

  refresh();
  const unsub = store.subscribe(refresh);

  return () => { unsub(); };
}
