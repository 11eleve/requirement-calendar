/* Shared domain rules for the browser and desktop host. No UI or storage side effects. */
(function (scope) {
  'use strict';
  const VERSION = 6;
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
  function monthOffset(anchor, delta) {
    if (!Number.isInteger(delta)) throw new ValidationError('月份偏移需要是整数。');
    const date = parse(anchor); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+delta);
    const result = iso(date); return validDate(result) ? result : null;
  }
  function monthGrid(anchor) {
    const date = parse(anchor); date.setUTCDate(1); const first=iso(date);
    const end = new Date(date); end.setUTCMonth(end.getUTCMonth()+1); end.setUTCDate(0); const last=iso(end);
    const start=add(first,-((date.getUTCDay()+6)%7)),count=Math.ceil((days(start,last)+1)/7);
    return {first,last,start,count};
  }
  function allocateLanes(items, start, end, preferred = null) {
    const visible=items.filter(item=>item.start<=end&&item.end>=start);
    const clippedStart=item=>item.start<start?start:item.start;
    const compare=(a,b)=>clippedStart(a).localeCompare(clippedStart(b))||a.start.localeCompare(b.start)||b.end.localeCompare(a.end)||a.id.localeCompare(b.id);
    visible.sort(compare);
    // Find this week's actual peak before carrying any previous row positions.
    // Keeping a high old row must not reserve empty rows for the whole month.
    const peakEnds=[];
    for(const item of visible){let lane=peakEnds.findIndex(value=>value<clippedStart(item));if(lane<0)lane=peakEnds.length;peakEnds[lane]=item.end;}
    const count=peakEnds.length,mapping=Object.create(null),ends=Array(count).fill(null);
    const previousLane=item=>{const lane=preferred?.[item.id];return Number.isInteger(lane)&&lane>=0&&lane<count?lane:-1;};
    // Reserve usable continuation positions before compacting displaced bands.
    visible.sort((a,b)=>clippedStart(a).localeCompare(clippedStart(b))||Number(previousLane(b)>=0)-Number(previousLane(a)>=0)||compare(a,b));
    for(const item of visible){
      const previous=previousLane(item),free=lane=>ends[lane]===null||ends[lane]<clippedStart(item);
      const lane=previous>=0&&free(previous)?previous:ends.findIndex((_,index)=>free(index));
      ends[lane]=item.end;mapping[item.id]=lane;
    }
    return {mapping,count};
  }
  function validReminder(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validDate(value.slice(0,10))) return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && localDate(date) + 'T' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0') === value;
  }
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
    const reminder = value.reminder ?? null;
    if (reminder !== null && !validReminder(reminder)) throw new ValidationError('提醒时间无效。', '提醒');
    return { id, title, reminder, short: title, tone: ['', 'blue', 'green'].includes(value.tone) ? value.tone : '', start: value.start, end: value.end, phases, resources, tasks: value.tasks.map(task => task.trim()), done: [...value.done], note: typeof value.note === 'string' ? value.note : value.note == null ? '' : text(value.note, '备忘') };
  }
  function snapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('保存的数据格式无效。');
    const source = value.privateContent ?? value;
    if (![4, 5, VERSION].includes(source.version)) throw new ValidationError('数据版本不受支持，原始数据已保留。');
    if (!validDate(source.anchor) || !Array.isArray(source.requirements)) throw new ValidationError('保存的数据不完整，原始数据已保留。');
    const requirements = source.requirements.map(requirement), ids = new Set(requirements.map(item => item.id));
    if (ids.size !== requirements.length) throw new ValidationError('需求标识重复，无法安全载入数据。');
    return { version: VERSION, anchor: source.anchor, requirements };
  }
  const api = { VERSION, ValidationError, validDate, parse, iso, add, days, localDate, format, monthOffset, monthGrid, allocateLanes, validReminder, newId, safeURL, iconFor, requirement, snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CalendarModel = api;
})(globalThis);
