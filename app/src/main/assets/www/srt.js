/* Nhac SRT core: no dependencies; also exported for Node.js tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NhacSrt = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const TIME = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/;
  function parseTime(value) {
    const m = String(value).trim().match(TIME);
    if (!m) throw new Error('Mốc thời gian phải có dạng 00:00:00,000');
    const hours = Number(m[1]), minutes = Number(m[2]), seconds = Number(m[3]);
    if (minutes > 59 || seconds > 59) throw new Error('Phút và giây phải từ 00 đến 59');
    const milliseconds = Number(m[4].padEnd(3, '0'));
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }
  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Thời gian không hợp lệ');
    const ms = Math.round(value * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60, rest = ms % 1000;
    return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(s).padStart(2, '0')].join(':') + ',' + String(rest).padStart(3, '0');
  }
  function parse(text) {
    if (typeof text !== 'string') throw new TypeError('SRT cần là chuỗi');
    const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
    const result = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const timeLine = lines.findIndex(x => x.includes('-->'));
      if (timeLine < 0) continue;
      const pair = lines[timeLine].match(/^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/);
      if (!pair) continue;
      let start, end;
      try { start = parseTime(pair[1]); end = parseTime(pair[2]); } catch (_) { continue; }
      result.push({ start, end, text: lines.slice(timeLine + 1).join('\n') });
    }
    return result;
  }
  function serialize(cues) {
    return cues.map((cue, index) => {
      if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start >= cue.end) {
        throw new Error(`Mốc bắt đầu/kết thúc ở câu ${index + 1} không hợp lệ`);
      }
      return `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${String(cue.text).replace(/\r\n?/g, '\n').trim()}`;
    }).join('\n\n') + '\n';
  }
  function splitDisplay(text) {
    const sep = String(text).indexOf('|');
    return sep === -1 ? { main: String(text), translation: '' }
      : { main: String(text).slice(0, sep).trim(), translation: String(text).slice(sep + 1).trim() };
  }
  return Object.freeze({ parseTime, formatTime, parse, serialize, splitDisplay });
});
