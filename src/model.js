/* Shared domain rules for the browser and desktop host. No UI or storage side effects. */
(function (scope) {
  'use strict';
  const VERSION = 5;
  class ValidationError extends Error {
    constructor(message, path = '') { super(message); this.name = 'ValidationError'; this.path = path; }
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function parse(value) {
    if (!validDate(value)) throw new ValidationError('日期无效。');
    return new Date(value + 'T12:00:00Z');
  }
  const iso = date => date.toISOString().slice(0, 10);
  function add(value, count) {
    if (!Number.isInteger(count)) throw new ValidationError('日期偏移需要是整数。');
    const date = parse(value); date.setUTCDate(date.getUTCDate() + count);
    const result = iso(date);
    if (!validDate(result)) throw new ValidationError('日期超出支持范围。');
    return result;
  }
  const days = (start, end) => Math.round((parse(end) - parse(start)) / 86400000);
  const localDate = (date = new Date()) => [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const format = value => Number(value.slice(5, 7)) + '.' + Number(value.slice(8));
  function newId(crypto = scope.crypto) {
    if (crypto?.randomUUID) return crypto.randomUUID();
    if (!crypto?.getRandomValues) throw new Error('当前运行环境不支持安全生成需求标识。');
    return 'r-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  }
  function text(value, path, required = false) {
    if (typeof value !== 'string' || (required && !value.trim())) throw new ValidationError('请填写' + path + '。', path);
    return value.trim();
  }
  function safeURL(value) {
    if (value === '') return '';
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new ValidationError('链接包含无效字符。', '链接');
    let url;
    try { url = new URL(value.trim()); } catch { throw new ValidationError('请填写完整的 http:// 或 https:// 链接。', '链接'); }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new ValidationError('链接需要使用 http:// 或 https://，且不能包含账号密码。', '链接');
    return url.href;
  }
  function iconFor(value, type = '') {
    let host = '';
    try { host = new URL(safeURL(value)).hostname.toLowerCase(); } catch {}
    const matches = domain => host === domain || host.endsWith('.' + domain);
    if (matches('dingtalk.com') || matches('alidocs.com')) return '钉';
    if (matches('figma.com')) return 'F';
    if (matches('github.com') || matches('gitlab.com')) return 'G';
    return /设计|交互/.test(type) ? '稿' : /代码|接口/.test(type) ? '码' : '文';
  }
  function requirement(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('需求数据无效。');
    const id = text(value.id, '需求标识', true), title = text(value.title, '需求名称', true);
    if (!validDate(value.start) || !validDate(value.end) || value.end < value.start) throw new ValidationError('需求的起止日期无效。', '周期');
    if (!Array.isArray(value.phases)) throw new ValidationError('阶段数据无效。', '阶段');
    const phases = value.phases.map((phase, index) => {
      if (!phase || typeof phase !== 'object') throw new ValidationError('阶段数据无效。', '阶段');
      const name = text(phase.name, '阶段名称', true);
      if (!validDate(phase.start) || !validDate(phase.end) || phase.end < phase.start || phase.start < value.start || phase.end > value.end) throw new ValidationError('阶段日期需要落在需求周期内。', '阶段.' + index);
      return { name, start: phase.start, end: phase.end };
    }).sort((a, b) => a.start.localeCompare(b.start));
    if (phases.some((phase, index) => index > 0 && phase.start <= phases[index - 1].end)) throw new ValidationError('阶段日期存在重叠。', '阶段');
    if (!Array.isArray(value.resources)) throw new ValidationError('资料数据无效。', '资料');
    const resources = value.resources.map(resource => {
      if (!resource || typeof resource !== 'object') throw new ValidationError('资料数据无效。', '资料');
      const name = text(resource.name, '资料名称', true), type = text(resource.type ?? '', '资料类型'), url = safeURL(resource.url ?? '');
      return { name, type, url, icon: url ? iconFor(url, type) : (typeof resource.icon === 'string' ? resource.icon : iconFor('', type)) };
    });
    if (!Array.isArray(value.tasks) || !value.tasks.every(task => typeof task === 'string' && task.trim()) || !Array.isArray(value.done) || value.done.length !== value.tasks.length || !value.done.every(done => typeof done === 'boolean')) throw new ValidationError('事项与完成状态不一致。', '事项');
    return { id, title, short: title, tone: ['', 'blue', 'green'].includes(value.tone) ? value.tone : '', start: value.start, end: value.end, phases, resources, tasks: value.tasks.map(task => task.trim()), done: [...value.done], note: text(value.note ?? '', '备忘') };
  }
  function snapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('保存的数据格式无效。');
    const source = value.privateContent ?? value;
    if (![4, VERSION].includes(source.version)) throw new ValidationError('数据版本不受支持，原始数据已保留。');
    if (!validDate(source.anchor) || !Array.isArray(source.requirements)) throw new ValidationError('保存的数据不完整，原始数据已保留。');
    const requirements = source.requirements.map(requirement), ids = new Set(requirements.map(item => item.id));
    if (ids.size !== requirements.length) throw new ValidationError('需求标识重复，无法安全载入数据。');
    return { version: VERSION, anchor: source.anchor, requirements };
  }
  const api = { VERSION, ValidationError, validDate, parse, iso, add, days, localDate, format, newId, safeURL, iconFor, requirement, snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CalendarModel = api;
})(globalThis);
