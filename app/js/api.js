// 与数据存储通信的唯一出口。
// 两种模式：
//   server —— 由本地 PowerShell / exe 服务提供 /api（桌面版）
//   local  —— 纯静态部署（GitHub Pages 等），数据存浏览器 localStorage
import { defaultState } from './defaultState.js';
import { buildCsv } from './csv.js';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const LS_STATE = 'ledger.state.v1';
const LS_REV = 'ledger.rev.v1';
const LS_BACKUPS = 'ledger.backups.v1';
const LS_LAST = 'ledger.lastBackup.v1';

let mode = 'server';

function lsGet(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 纯前端模式：数据保存在浏览器本地 */
const localBackend = {
  getState() {
    let data = lsGet(LS_STATE, null);
    if (!data) {
      data = defaultState();
      lsSet(LS_STATE, data);
      lsSet(LS_REV, 1);
    }
    return { rev: lsGet(LS_REV, 1), data };
  },

  putState(data, rev) {
    const current = lsGet(LS_REV, 1);
    if (rev !== current) {
      throw new ApiError('版本冲突', 409, { rev: current });
    }
    lsSet(LS_STATE, data);
    const next = current + 1;
    lsSet(LS_REV, next);
    return { rev: next };
  },

  backup() {
    const state = lsGet(LS_STATE, null);
    if (!state) return { file: '' };
    const list = lsGet(LS_BACKUPS, []);
    list.unshift({ time: new Date().toISOString(), data: state });
    lsSet(LS_BACKUPS, list.slice(0, 20));
    lsSet(LS_LAST, new Date().toISOString());
    return { file: 'local-backup' };
  },

  info() {
    const list = lsGet(LS_BACKUPS, []);
    const last = lsGet(LS_LAST, '');
    return {
      mode: 'local',
      dataFile: '浏览器本地存储（localStorage）',
      backupDir: '浏览器内（最多 20 份）',
      backupCount: list.length,
      lastBackup: last ? new Date(last).toLocaleString() : '',
      rev: lsGet(LS_REV, 1)
    };
  },

  download(kind, params) {
    const { data } = this.getState();
    if (kind === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      triggerDownload(blob, 'ledger-backup-' + today() + '.json');
      return;
    }
    const all = params && params.all;
    const month = params && params.month ? params.month : '';
    const csv = buildCsv(data, { all: all === '1' || all === true, month });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, 'ledger-' + today() + '.csv');
  }
};

async function jsonFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new ApiError('无法连接本地服务', 0, null);
  }
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const msg = (body && body.error) ? body.error : ('请求失败（' + res.status + '）');
    throw new ApiError(msg, res.status, body);
  }
  return body;
}

export const api = {
  get mode() { return mode; },

  /** 探测是否有本地服务；没有就切到浏览器本地存储模式。 */
  async init(ms = 1500) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
      const res = await fetch('/api/ping', controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' });
      if (timer) clearTimeout(timer);
      if (res && res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.app === 'ledger') {
          mode = 'server';
          return mode;
        }
      }
    } catch (e) {
      /* 静态环境没有后端，属正常情况 */
    }
    mode = 'local';
    return mode;
  },

  ping() {
    if (mode === 'local') return Promise.resolve({ app: 'ledger', mode: 'local' });
    return jsonFetch('/api/ping');
  },

  getState() {
    if (mode === 'local') return Promise.resolve(localBackend.getState());
    return jsonFetch('/api/state');
  },

  putState(data, rev) {
    if (mode === 'local') return Promise.resolve(localBackend.putState(data, rev));
    return jsonFetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Rev': String(rev) },
      body: JSON.stringify(data, null, 2)
    });
  },

  backup() {
    if (mode === 'local') return Promise.resolve(localBackend.backup());
    return jsonFetch('/api/backup', { method: 'POST' });
  },

  info() {
    if (mode === 'local') return Promise.resolve(localBackend.info());
    return jsonFetch('/api/info');
  },

  /** 导出：两种模式行为一致，都是下载一个文件 */
  downloadExport(kind, params) {
    if (mode === 'local') {
      localBackend.download(kind, params);
      return;
    }
    const url = kind === 'json' ? '/api/export.json' : '/api/export.csv?' + new URLSearchParams(params || {}).toString();
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.append(a);
    a.click();
    a.remove();
  },

  exportJsonUrl() {
    return '/api/export.json';
  },

  exportCsvUrl(params) {
    const qs = new URLSearchParams(params || {});
    return '/api/export.csv?' + qs.toString();
  }
};
