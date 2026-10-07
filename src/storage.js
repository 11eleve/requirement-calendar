(function (scope) {
  'use strict';
  const Model = typeof module !== 'undefined' && module.exports ? require('./model.js') : scope.CalendarModel;
  const KEY = 'requirement-calendar:state:v6', BACKUP_KEY = KEY + ':last-good';
  function createStore(storage, options = {}) {
    let blocked = false;
    const decode = value => Model.snapshot(JSON.parse(value));
    function load() {
      let raw;
      try {
        if (!storage) return { data: null, issue: '本机存储不可用，当前无法保存更改。' };
        raw = storage.getItem(KEY);
        if (raw !== null) {
          try { return { data: decode(raw), issue: null }; }
          catch {
            const backup = storage.getItem(BACKUP_KEY);
            if (backup !== null) {
              try { return { data: decode(backup), issue: '已从上一次有效备份恢复；原始记录仍保留。' }; } catch {}
            }
            blocked = true;
            return { data: null, issue: '本地记录无法读取，原始数据已保留。请先恢复备份，再保存更改。' };
          }
        }
        const legacyKey = storage.getItem('requirement-calendar:state:v5') !== null ? 'requirement-calendar:state:v5' : options.legacyKey;
        if (legacyKey) {
          const legacy = storage.getItem(legacyKey);
          if (legacy !== null) {
            try { return { data: decode(legacy), issue: null, migrated: true }; }
            catch { blocked = true; return { data: null, issue: '旧版记录不完整，已保留原始数据。请先恢复备份。' }; }
          }
        }
        return { data: null, issue: null };
      } catch { blocked = true; return { data: null, issue: '浏览器禁止读取本机存储，当前无法保存更改。' }; }
    }
    function save(value) {
      if (!storage || blocked) return { ok: false, issue: '无法保存到本机。原有数据未被覆盖，请恢复可用存储后重试。' };
      try {
        const content = JSON.stringify(Model.snapshot(value)), previous = storage.getItem(KEY);
        if (previous !== null) {
          try { decode(previous); storage.setItem(BACKUP_KEY, previous); } catch {}
        }
        storage.setItem(KEY, content);
        return { ok: true, issue: null };
      } catch (error) {
        return { ok: false, issue: error instanceof Model.ValidationError ? error.message : '保存失败：本机存储空间不足或不可用。更改仍保留在编辑器中，请重试。' };
      }
    }
    return { load, save };
  }
  function createNativeStore(bridge, legacyStore) {
    let blocked = false;
    async function load() {
      try {
        const result = await bridge.postMessage({ action: 'load' });
        if (result.raw !== null) return { data: Model.snapshot(JSON.parse(result.raw)), issue: result.issue };
        if (result.issue) { blocked = true; return { data: null, issue: result.issue }; }
        const legacy = legacyStore?.load();
        if (legacy?.data) {
          const data = Model.snapshot(legacy.data);
          await bridge.postMessage({ action: 'save', raw: JSON.stringify(data) });
          return { data, issue: '已将旧版本机记录迁移到独立数据文件，旧记录仍保留。', migrated: true };
        }
        if (legacy?.issue) { blocked = true; return { data: null, issue: legacy.issue }; }
        return { data: null, issue: null };
      } catch (error) { blocked = true; return { data: null, issue: '本机数据读取失败：' + error.message }; }
    }
    async function save(value, recovery = false) {
      if (blocked && !recovery) return { ok: false, issue: '本机记录无法安全覆盖，请从备份恢复后重试。' };
      try {
        const data = Model.snapshot(value);
        const result = await bridge.postMessage({ action: 'save', raw: JSON.stringify(data), recovery });
        blocked = false;
        return { ok: true, issue: null, reminderIssue: result.reminderIssue || null };
      } catch (error) { return { ok: false, issue: error.message || '本机文件保存失败，请重试。' }; }
    }
    return { load, save };
  }
  const api = { KEY, BACKUP_KEY, createStore, createNativeStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CalendarStorage = api;
})(globalThis);
