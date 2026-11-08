const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Srt = require('../app/src/main/assets/www/srt.js');
const subtitles = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'subtitles');

test('bundled SRT files parse and round-trip, including overlapping cues', () => {
  for (const file of fs.readdirSync(subtitles)) {
    const original = fs.readFileSync(path.join(subtitles, file), 'utf8');
    const cues = Srt.parse(original);
    assert.ok(cues.length >= 10, `${file} needs captions`);
    assert.deepEqual(Srt.parse(Srt.serialize(cues)), cues);
  }
});
test('timestamp validates minutes, retains millisecond precision', () => {
  assert.equal(Srt.parseTime('00:01:02,003'), 62.003);
  assert.equal(Srt.formatTime(3601.999), '01:00:01,999');
  assert.throws(() => Srt.parseTime('00:60:02,003'));
});
test('SRT text is preserved including multiline and pipe separator', () => {
  const input = '\uFEFF1\r\n00:00:00,123 --> 00:00:01,234\r\nĐô | Hỗ trợ\r\ndòng thứ hai\r\n';
  const parsed = Srt.parse(input);
  assert.equal(parsed[0].text, 'Đô | Hỗ trợ\ndòng thứ hai');
  assert.equal(Srt.splitDisplay('Lời | Dịch').translation, 'Dịch');
  assert.equal(Srt.parse(Srt.serialize(parsed))[0].text, parsed[0].text);
});
test('overlap is intentionally allowed and no automatic correction', () => {
  const input = '1\n00:00:01,000 --> 00:00:05,000\nMột\n\n2\n00:00:04,500 --> 00:00:07,000\nHai\n';
  const parsed = Srt.parse(input);
  assert.equal(parsed[0].end, 5);
  assert.equal(parsed[1].start, 4.5);
  assert.equal(Srt.parse(Srt.serialize(parsed))[1].start, 4.5);
});
test('fail to export invalid start/end duration', () => {
  assert.throws(() => Srt.serialize([{start: 5, end: 2, text:'bad'}]));
});
