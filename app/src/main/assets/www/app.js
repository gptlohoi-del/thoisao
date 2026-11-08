/* Nhac 1.0.0 — offline-first MP3/SRT player. No external JS/CDN. */
(() => {
  'use strict';
  const Srt = window.NhacSrt;
  const $ = id => document.getElementById(id);
  const STORAGE = 'nhac.settings.v1';
  const SRT_PREFIX = 'nhac.srt.v1:';
  const CHECK_KEY = 'nhac.ota.lastCheck';
  const DEFAULTS = {
    speed: { label: 'Tốc độ phát', min: 0.5, max: 2, value: 1, default: 1, step: 0.05, hardMin: 0.25, hardMax: 3 },
    mainEng: { label: 'Cỡ chữ Tiếng Anh (phụ đề chính)', min: 0.8, max: 2.5, value: 1.3, default: 1.3, step: 0.05, hardMin: 0.5, hardMax: 4 },
    mainVn: { label: 'Cỡ chữ Tiếng Việt (phụ đề chính)', min: 0.7, max: 2.2, value: 1.05, default: 1.05, step: 0.05, hardMin: 0.5, hardMax: 4 },
    listEng: { label: 'Cỡ chữ danh sách câu', min: 0.75, max: 2, value: 1, default: 1, step: 0.05, hardMin: 0.5, hardMax: 4 },
    loopPadding: { label: 'Bù trừ thời gian lặp (giây)', min: 0, max: 3, value: 1, default: 1, step: 0.1, hardMin: 0, hardMax: 10 }
  };
  const SHOW_DEFAULTS = { boldMain: false, boldList: false, showNumber: true, showTime: true, showTranslation: true };
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const round = x => Math.round(x * 1000) / 1000;

  let settings = readSettings();
  let tracks = [];
  let activeTrack = null;
  let cues = [];
  let selected = new Set();
  let looping = false;
  let activeCue = -1;
  let editing = -1;
  let appConfig = { version: '1.0.1', githubOwner: '', githubRepo: '' };
  let latestRelease = null;
  let toastTimer = null;
  let loadSerial = 0;
  const media = $('myMedia');

  function readSettings() {
    const fresh = { ranges: clone(DEFAULTS), show: clone(SHOW_DEFAULTS), githubOwner: '', githubRepo: '' };
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      for (const [key, source] of Object.entries(DEFAULTS)) {
        const saved = raw.ranges && raw.ranges[key];
        if (!saved) continue;
        const entry = fresh.ranges[key];
        entry.min = clamp(finite(saved.min, source.min), source.hardMin, source.hardMax - 0.01);
        entry.max = clamp(finite(saved.max, source.max), entry.min + 0.01, source.hardMax);
        entry.default = clamp(finite(saved.default, source.default), entry.min, entry.max);
        entry.step = clamp(finite(saved.step, source.step), 0.01, 1);
        entry.value = clamp(finite(saved.value, source.value), entry.min, entry.max);
      }
      for (const key of Object.keys(SHOW_DEFAULTS)) {
        if (typeof raw.show?.[key] === 'boolean') fresh.show[key] = raw.show[key];
      }
      fresh.githubOwner = typeof raw.githubOwner === 'string' ? raw.githubOwner : '';
      fresh.githubRepo = typeof raw.githubRepo === 'string' ? raw.githubRepo : '';
    } catch (e) { console.warn('Cài đặt cũ không đọc được:', e); }
    return fresh;
  }
  function saveSettings() { localStorage.setItem(STORAGE, JSON.stringify(settings)); }
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
  }
  function showDialog(id) { const el = $(id); if (!el.open) el.showModal(); }
  function closeDialog(id) { const el = $(id); if (el.open) el.close(); }
  function on(id, event, cb) { $(id).addEventListener(event, cb); }
  function setSubtitle(text, translation = '') {
    $('mainSubEng').textContent = text;
    $('mainSubVn').textContent = settings.show.showTranslation ? translation : '';
  }
  function split(cue) { return Srt.splitDisplay(cue?.text || ''); }
  function fileKey(track) { return SRT_PREFIX + track.subtitleFilename; }
  function formatBrief(seconds) {
    const n = Math.max(0, Math.floor(seconds));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }
  function getVersion() {
    try { return window.Android?.getVersionName() || appConfig.version; } catch (_) { return appConfig.version; }
  }

  async function loadTracks() {
    const [trRes, cfgRes] = await Promise.all([fetch('tracks.json'), fetch('app-config.json')]);
    if (!trRes.ok || !cfgRes.ok) throw new Error('Không đọc được danh sách bài hát đóng gói.');
    const list = await trRes.json();
    appConfig = await cfgRes.json();
    if (!Array.isArray(list)) throw new Error('tracks.json phải là danh sách.');
    tracks = list;
    $('appVersion').textContent = 'Phiên bản ' + getVersion();
    $('trackSelector').replaceChildren();
    tracks.forEach((track, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1}. ${track.title}`;
      $('trackSelector').appendChild(option);
    });
    if (tracks.length) await switchTrack(0);
    else setSubtitle('Chưa có bài MP3/SRT trong ứng dụng.');
  }
  async function switchTrack(index) {
    const track = tracks[index];
    if (!track) return;
    const loadId = ++loadSerial;
    looping = false;
    selected.clear();
    activeCue = -1;
    renderLoopButton();
    activeTrack = track;
    media.pause();
    media.src = track.audio;
    media.load();
    media.playbackRate = settings.ranges.speed.value;
    $('trackSelector').value = String(index);
    setSubtitle('Đang nạp: ' + track.title);
    try {
      const result = await fetch(track.subtitle);
      if (!result.ok) throw new Error(`Không đọc được SRT: ${result.status}`);
      const original = Srt.parse(await result.text());
      if (loadId !== loadSerial) return;
      cues = original;
      try {
        const saved = localStorage.getItem(fileKey(track));
        if (saved !== null) {
          const edited = Srt.parse(saved);
          if (edited.length) cues = edited;
          else throw new Error('SRT lưu offline rỗng');
        }
      } catch (e) { toast('Bản SRT đã lưu không đọc được; đang dùng bản gốc.'); }
      renderSentences();
      updateSrtStatus();
      setSubtitle(`Đã chọn: ${track.title}\nBấm Play hoặc chọn câu để nghe.`);
    } catch (error) {
      if (loadId !== loadSerial) return;
      cues = [];
      renderSentences();
      setSubtitle('Không mở được SRT: ' + error.message);
    }
  }
  function updateSrtStatus() {
    const edited = activeTrack && localStorage.getItem(fileKey(activeTrack)) !== null;
    $('srtStatus').textContent = edited ? '● SRT đã chỉnh sửa — lưu offline' : 'SRT gốc — có sẵn offline';
  }
  function renderSentences() {
    const list = $('sentencesList');
    list.replaceChildren();
    if (!cues.length) {
      const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Không có câu SRT.'; list.appendChild(p);
      renderSelectedCount(); return;
    }
    cues.forEach((cue, index) => {
      const parts = split(cue);
      const row = document.createElement('div');
      row.className = 'sentence-row';
      row.id = `sentence-${index}`;
      row.classList.toggle('selected', selected.has(index));
      row.classList.toggle('current', index === activeCue);
      const check = document.createElement('input');
      check.type = 'checkbox'; check.className = 'sentence-check';
      check.checked = selected.has(index);
      check.setAttribute('aria-label', `Chọn câu ${index + 1}`);
      check.addEventListener('change', () => toggleSelected(index, check.checked));
      const body = document.createElement('div'); body.className = 'sentence-body';
      if (settings.show.showNumber) {
        const nr = document.createElement('span'); nr.className = 'sentence-nr'; nr.textContent = `${index + 1}. `; body.appendChild(nr);
      }
      const txt = document.createElement('span'); txt.className = 'sentence-text'; txt.textContent = parts.main; body.appendChild(txt);
      if (settings.show.showTranslation && parts.translation) {
        const vn = document.createElement('span'); vn.className = 'sentence-secondary'; vn.textContent = parts.translation; body.appendChild(vn);
      }
      if (settings.show.showTime) {
        const time = document.createElement('span'); time.className = 'sentence-time';
        time.textContent = `⏱ ${formatBrief(cue.start)} – ${formatBrief(cue.end)}`; body.appendChild(time);
      }
      body.addEventListener('click', () => {
        toggleSelected(index, !selected.has(index));
        media.currentTime = cue.start;
        activeCue = index;
        const display = split(cue); setSubtitle(display.main, display.translation);
        markActive();
      });
      const edit = document.createElement('button');
      edit.className = 'edit-btn'; edit.type = 'button'; edit.textContent = '✎';
      edit.setAttribute('aria-label', `Chỉnh sửa SRT câu ${index + 1}`);
      edit.addEventListener('click', () => openEdit(index));
      row.append(check, body, edit);
      list.appendChild(row);
    });
    renderSelectedCount();
  }
  function toggleSelected(index, yes) {
    if (yes) selected.add(index); else selected.delete(index);
    const row = $(`sentence-${index}`);
    if (row) { row.classList.toggle('selected', yes); row.querySelector('input[type=checkbox]').checked = yes; }
    renderSelectedCount();
    if (!selected.size && looping) stopLoop();
  }
  function renderSelectedCount() { $('selectedCount').textContent = `${selected.size} câu`; }
  function markActive() {
    document.querySelectorAll('.sentence-row.current').forEach(row => row.classList.remove('current'));
    const row = $(`sentence-${activeCue}`);
    if (row) {
      row.classList.add('current');
      if (!media.paused) row.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }
  function renderLoopButton() {
    $('btnToggleLoop').textContent = looping ? '■ Dừng lặp' : '🔄 Bắt đầu lặp';
  }
  function stopLoop() { looping = false; renderLoopButton(); }
  function blocks() {
    const order = [...selected].filter(index => !!cues[index]).sort((a, b) => a - b);
    if (!order.length) return [];
    const groups = [];
    let group = [order[0]];
    for (const index of order.slice(1)) {
      if (index === group[group.length - 1] + 1) group.push(index);
      else { groups.push(group); group = [index]; }
    }
    groups.push(group);
    const pad = settings.ranges.loopPadding.value;
    return groups.map(g => ({
      start: Math.max(0, cues[g[0]].start - pad),
      end: cues[g[g.length - 1]].end + pad,
      indices: g
    }));
  }
  function beginLoop() {
    const groupList = blocks();
    if (!groupList.length) { toast('Hãy chọn ít nhất một câu.'); return; }
    looping = true;
    renderLoopButton();
    media.currentTime = groupList[0].start;
    media.play().catch(() => toast('Bấm Play để bắt đầu phát nhạc.'));
  }
  function loopTick() {
    const groupList = blocks();
    if (!groupList.length) { stopLoop(); return; }
    const now = media.currentTime;
    const position = groupList.findIndex(group => now >= group.start - 0.05 && now < group.end - 0.025);
    if (position >= 0) return;
    const next = groupList.find(group => group.start > now + 0.03);
    media.currentTime = (next || groupList[0]).start;
  }
  function timeTick() {
    if (looping) loopTick();
    const now = media.currentTime;
    // Nếu hai câu chồng thời gian, ưu tiên câu xuất hiện trước; không tự sửa SRT.
    const current = cues.findIndex(cue => now >= cue.start && now <= cue.end);
    if (current !== activeCue) {
      activeCue = current;
      const display = current === -1 ? { main: '♪ ♪ ♪', translation: '' } : split(cues[current]);
      setSubtitle(display.main, display.translation);
      markActive();
    }
  }
  function parseRange(input) {
    if (input.trim() === '*') return cues.map((_, i) => i);
    const found = new Set();
    for (const part of input.split(/[,;\s]+/)) {
      if (!part) continue;
      if (/^\d+-\d+$/.test(part)) {
        let [a, b] = part.split('-').map(Number);
        if (a > b) [a, b] = [b, a];
        for (let n = Math.max(1, a); n <= Math.min(cues.length, b); n++) found.add(n - 1);
      } else if (/^\d+$/.test(part)) {
        const n = Number(part);
        if (n >= 1 && n <= cues.length) found.add(n - 1);
      } else throw new Error(`Không hiểu: ${part}`);
    }
    return [...found].sort((a, b) => a - b);
  }
  function applyRange(andLoop) {
    try {
      const indexes = parseRange($('rangeInput').value);
      if (!indexes.length) { toast('Không tìm thấy câu phù hợp.'); return; }
      selected = new Set(indexes);
      stopLoop();
      renderSentences();
      closeDialog('rangeDialog');
      if (andLoop) beginLoop();
    } catch (error) { toast(error.message); }
  }
  function openEdit(index) {
    editing = index;
    const cue = cues[index];
    $('editTitle').textContent = `✎ Sửa SRT — câu ${index + 1}`;
    $('editText').value = cue.text;
    $('editStart').value = Srt.formatTime(cue.start);
    $('editEnd').value = Srt.formatTime(cue.end);
    $('editError').textContent = '';
    showDialog('editDialog');
  }
  function saveEdit() {
    const text = $('editText').value.trim();
    const error = $('editError');
    if (!text) { error.textContent = 'Nội dung câu không được để trống.'; return; }
    let start, end;
    try { start = Srt.parseTime($('editStart').value); end = Srt.parseTime($('editEnd').value); }
    catch (e) { error.textContent = e.message; return; }
    if (start >= end) { error.textContent = 'Thời gian bắt đầu phải nhỏ hơn kết thúc.'; return; }
    if (!activeTrack || !cues[editing]) return;
    const before = cues[editing];
    cues[editing] = { start, end, text };
    try { localStorage.setItem(fileKey(activeTrack), Srt.serialize(cues)); }
    catch (e) { cues[editing] = before; error.textContent = 'Không thể lưu SRT vào bộ nhớ điện thoại.'; return; }
    const display = split(cues[editing]);
    if (activeCue === editing) setSubtitle(display.main, display.translation);
    renderSentences();
    updateSrtStatus();
    closeDialog('editDialog');
    toast('Đã lưu chỉnh sửa SRT offline.');
  }
  function exportSrt() {
    if (!activeTrack || !cues.length) { toast('Chưa có phụ đề để xuất.'); return; }
    const filename = activeTrack.subtitleFilename;
    const data = Srt.serialize(cues);
    if (typeof window.Android?.exportSrt === 'function') {
      try { window.Android.exportSrt(filename, data); toast('Chọn nơi lưu file SRT trên điện thoại.'); }
      catch (error) { toast('Không mở được trình lưu file: ' + error.message); }
    } else {
      const blob = new Blob([data], { type: 'application/x-subrip;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  }
  function applySettings() {
    document.documentElement.style.setProperty('--main-eng-size', settings.ranges.mainEng.value + 'em');
    document.documentElement.style.setProperty('--main-vn-size', settings.ranges.mainVn.value + 'em');
    document.documentElement.style.setProperty('--list-eng-size', settings.ranges.listEng.value + 'em');
    $('mainSubEng').style.fontWeight = settings.show.boldMain ? '700' : '400';
    $('mainSubVn').style.fontWeight = settings.show.boldMain ? '700' : '400';
    $('sentencesList').style.fontWeight = settings.show.boldList ? '700' : '400';
    const sp = settings.ranges.speed;
    $('speedSlider').min = String(sp.min);
    $('speedSlider').max = String(sp.max);
    $('speedSlider').step = String(sp.step);
    $('speedSlider').value = String(sp.value);
    $('speedValue').textContent = sp.value.toFixed(2) + 'x';
    media.playbackRate = sp.value;
  }
  function setRangeValue(key, value, rerender = false) {
    const spec = settings.ranges[key];
    spec.value = round(clamp(value, spec.min, spec.max));
    saveSettings(); applySettings();
    if (rerender) renderSettings();
  }
  function stepValue(key, direction) {
    const spec = settings.ranges[key];
    setRangeValue(key, spec.value + direction * spec.step, key !== 'speed');
  }
  function renderSettings() {
    const container = $('settingControls');
    container.replaceChildren();
    for (const [key, spec] of Object.entries(settings.ranges)) {
      const group = document.createElement('section'); group.className = 'settings-group';
      const title = document.createElement('div'); title.className = 'setting-row';
      const label = document.createElement('label'); label.textContent = spec.label;
      title.appendChild(label);
      const controls = buildSlider({ label: null, min: spec.min, max: spec.max, step: spec.step, value: spec.value, suffix: key === 'speed' ? 'x' : key === 'loopPadding' ? 's' : 'em', onInput: value => {
        setRangeValue(key, value);
        controls.output.textContent = String(round(settings.ranges[key].value)) + controls.suffix;
      }, onStep: delta => { stepValue(key, delta); renderSettings(); } });
      title.appendChild(controls.element);
      const useDefault = document.createElement('button');
      useDefault.type = 'button'; useDefault.className = 'outline small-btn';
      useDefault.textContent = `Về Default (${spec.default})`;
      useDefault.addEventListener('click', () => setRangeValue(key, spec.default, true));
      title.appendChild(useDefault);
      group.appendChild(title);
      const advanced = document.createElement('details'); advanced.className = 'advanced';
      const summary = document.createElement('summary'); summary.textContent = 'Chỉnh Min / Max / Default / Step';
      advanced.appendChild(summary);
      for (const field of ['min', 'max', 'default', 'step']) {
        const base = DEFAULTS[key];
        const rangeMin = field === 'step' ? 0.01 : base.hardMin;
        const rangeMax = field === 'step' ? 1 : base.hardMax;
        // Không vẽ lại DOM liên tục khi đang kéo: giữ thanh trượt hoạt động mượt.
        let numeric;
        const change = (value, refresh = false) => {
          modifyLimit(key, field, value);
          control.output.textContent = String(spec[field]);
          if (numeric && document.activeElement !== numeric) numeric.value = String(spec[field]);
          if (refresh) {
            const reopen = advanced.open;
            renderSettings();
            const replacement = container.children[Object.keys(settings.ranges).indexOf(key)].querySelector('details');
            replacement.open = reopen;
          }
        };
        const control = buildSlider({ label: field[0].toUpperCase() + field.slice(1), min: rangeMin, max: rangeMax, step: 0.01, value: spec[field], suffix: '', onInput: value => change(value), onStep: d => change(round(spec[field] + d * (field === 'step' ? 0.01 : 0.05)), true) });
        control.input.addEventListener('change', () => change(Number(control.input.value), true));
        numeric = document.createElement('input');
        numeric.type = 'number'; numeric.step = 'any'; numeric.min = String(rangeMin); numeric.max = String(rangeMax);
        numeric.value = spec[field]; numeric.setAttribute('aria-label', `${field} của ${spec.label}`);
        numeric.addEventListener('change', () => change(finite(numeric.value, spec[field]), true));
        // Khi nhập bằng bàn phím, chỉ cập nhật sau khi nhập xong để không mất con trỏ.
        control.element.appendChild(numeric);
        advanced.appendChild(control.element);
      }
      group.appendChild(advanced);
      container.appendChild(group);
    }
    Object.keys(SHOW_DEFAULTS).forEach(id => { $(id).checked = settings.show[id]; });
    $('githubOwner').value = settings.githubOwner || appConfig.githubOwner || '';
    $('githubRepo').value = settings.githubRepo || appConfig.githubRepo || '';
    const otaReady = validRepoPart(appConfig.githubOwner || '') && validRepoPart(appConfig.githubRepo || '');
    $('otaManualRepoFields').hidden = otaReady;
    $('btnSaveRepo').hidden = otaReady;
    $('otaRepoMessage').textContent = otaReady
      ? 'Nhac tự kiểm tra phiên bản mới qua GitHub Releases. Bạn không cần cài đặt gì thêm.'
      : 'Chưa kết nối GitHub: hãy nhập owner và tên repository công khai để kiểm tra phiên bản.';
  }
  function buildSlider({ label, min, max, step, value, suffix, onInput, onStep }) {
    const line = document.createElement('div'); line.className = 'number-line';
    if (label) { const node = document.createElement('label'); node.textContent = label; line.appendChild(node); }
    const minus = document.createElement('button'); minus.className = 'step-btn'; minus.textContent = '−'; minus.type = 'button'; minus.setAttribute('aria-label', `Giảm ${label || 'giá trị'}`);
    minus.addEventListener('click', () => onStep(-1));
    const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.setAttribute('aria-label', label || 'Giá trị');
    input.addEventListener('input', () => onInput(Number(input.value)));
    const plus = document.createElement('button'); plus.className = 'step-btn'; plus.textContent = '+'; plus.type = 'button'; plus.setAttribute('aria-label', `Tăng ${label || 'giá trị'}`);
    plus.addEventListener('click', () => onStep(1));
    const output = document.createElement('output'); output.textContent = round(value) + suffix;
    line.append(minus, input, plus, output);
    return { element: line, input, output, suffix };
  }
  function modifyLimit(key, field, raw) {
    const c = settings.ranges[key], src = DEFAULTS[key];
    const value = round(clamp(finite(raw, c[field]), field === 'step' ? 0.01 : field === 'max' ? src.hardMin + 0.01 : src.hardMin, field === 'step' ? 1 : field === 'min' ? src.hardMax - 0.01 : src.hardMax));
    c[field] = value;
    if (c.min >= c.max) {
      if (field === 'min') c.max = round(Math.min(src.hardMax, c.min + 0.01));
      else c.min = round(Math.max(src.hardMin, c.max - 0.01));
    }
    c.default = clamp(c.default, c.min, c.max);
    c.value = clamp(c.value, c.min, c.max);
    saveSettings(); applySettings();
  }
  function githubSettings() {
    const owner = settings.githubOwner || appConfig.githubOwner || '';
    const repo = settings.githubRepo || appConfig.githubRepo || '';
    return { owner: owner.trim(), repo: repo.trim() };
  }
  function validRepoPart(value) { return /^[a-zA-Z0-9_.-]{1,100}$/.test(value) && value !== '.' && value !== '..'; }
  function saveRepo() {
    const owner = $('githubOwner').value.trim();
    const repo = $('githubRepo').value.trim().replace(/\.git$/i, '');
    if ((owner || repo) && (!validRepoPart(owner) || !validRepoPart(repo))) { toast('Owner/repo chỉ được chứa chữ, số, dấu -, _ hoặc dấu chấm.'); return false; }
    settings.githubOwner = owner;
    settings.githubRepo = repo;
    saveSettings();
    toast(owner && repo ? 'Đã lưu repository để kiểm tra OTA.' : 'Đã tắt kiểm tra OTA tự động.');
    return true;
  }
  function semver(version) {
    const m = String(version).trim().match(/^[vV]?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return m ? m.slice(1).map(Number) : null;
  }
  function isNewer(remote, local) {
    const a = semver(remote), b = semver(local);
    if (!a || !b) return false;
    return a.some((n, i) => n > b[i] && a.slice(0, i).every((p, j) => p === b[j]));
  }
  async function checkForUpdates(manual = false) {
    const { owner, repo } = githubSettings();
    if (!validRepoPart(owner) || !validRepoPart(repo)) {
      if (manual) { showDialog('settingsDialog'); $('settingsUpdateStatus').textContent = 'Hãy nhập GitHub owner và repository để bật OTA.'; }
      return;
    }
    if (!manual && Date.now() - Number(localStorage.getItem(CHECK_KEY) || 0) < 24 * 3600 * 1000) return;
    if (manual) showDialog('updateDialog');
    $('updateStatus').textContent = 'Đang kiểm tra GitHub Releases...';
    $('updateNotes').textContent = '';
    $('btnDownloadUpdate').hidden = true;
    latestRelease = null;
    try {
      const controller = new AbortController();
      const handle = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, cache: 'no-store'
        });
      } finally { clearTimeout(handle); }
      if (!response.ok) throw new Error(response.status === 404 ? 'Repo chưa có Release công khai.' : 'GitHub trả về lỗi ' + response.status);
      const release = await response.json();
      const remote = String(release.tag_name || '').replace(/^[vV]/, '');
      const local = getVersion();
      localStorage.setItem(CHECK_KEY, String(Date.now()));
      if (!isNewer(remote, local)) {
        $('updateStatus').textContent = `Bạn đang dùng phiên bản mới nhất (${local}).`;
        if (!manual) return;
      } else {
        const expectedName = `NHAC-V${remote}.apk`;
        const asset = (release.assets || []).find(a => a.name === expectedName && typeof a.browser_download_url === 'string');
        $('updateStatus').textContent = `Có phiên bản Nhac ${remote} mới (đang dùng ${local}).`;
        $('updateNotes').textContent = (release.body || '').slice(0, 1200) || 'Có bản cập nhật mới trên GitHub Releases.';
        if (asset) { latestRelease = asset; $('btnDownloadUpdate').hidden = false; }
        else $('updateNotes').textContent += `\nChưa tìm thấy file ${expectedName} trong Release.`;
        showDialog('updateDialog');
      }
    } catch (e) {
      if (manual) $('updateStatus').textContent = 'Không kiểm tra được: ' + (e.name === 'AbortError' ? 'Hết thời gian kết nối.' : e.message);
    }
  }
  function downloadUpdate() {
    if (!latestRelease) return;
    const url = latestRelease.browser_download_url, name = latestRelease.name;
    $('updateStatus').textContent = `Đang tải ${name}...`;
    $('btnDownloadUpdate').disabled = true;
    if (typeof window.Android?.downloadApk === 'function') {
      try { window.Android.downloadApk(url, name, latestRelease.digest || ''); }
      catch (e) { $('updateStatus').textContent = 'Không tải được: ' + e.message; $('btnDownloadUpdate').disabled = false; }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
      $('updateStatus').textContent = 'Đã mở liên kết tải APK trong trình duyệt.';
      $('btnDownloadUpdate').disabled = false;
    }
  }
  window.NhacNative = Object.freeze({
    onExportResult: ok => toast(ok ? 'Đã xuất file SRT thành công.' : 'Đã hủy xuất hoặc lưu thất bại.'),
    onDownloadProgress: percent => { $('updateStatus').textContent = `Đang tải bản cập nhật: ${percent}%`; },
    onDownloadError: message => { $('updateStatus').textContent = 'Lỗi tải APK: ' + message; $('btnDownloadUpdate').disabled = false; },
    onDownloadComplete: () => { $('updateStatus').textContent = 'APK đã tải. Hãy xác nhận cài đặt trong Android.'; $('btnDownloadUpdate').disabled = false; }
  });
  window.NhacApp = Object.freeze({ checkForUpdates, closeTopDialog: () => { const dialog = [...document.querySelectorAll('dialog')].find(el => el.open); if (!dialog) return false; dialog.close(); return true; } });

  function bindEvents() {
    on('trackSelector', 'change', e => switchTrack(Number(e.target.value)));
    media.addEventListener('timeupdate', timeTick);
    media.addEventListener('ended', () => { if (looping && blocks().length) { media.currentTime = blocks()[0].start; media.play().catch(() => {}); } });
    on('speedSlider', 'input', e => setRangeValue('speed', Number(e.target.value)));
    on('speedMinus', 'click', () => stepValue('speed', -1));
    on('speedPlus', 'click', () => stepValue('speed', 1));
    on('btnToggleLoop', 'click', () => looping ? stopLoop() : beginLoop());
    on('btnClearSelection', 'click', () => { selected.clear(); stopLoop(); renderSentences(); });
    on('btnRange', 'click', () => { $('rangeInput').value = ''; showDialog('rangeDialog'); });
    on('btnApplyRange', 'click', () => applyRange(false));
    on('btnApplyRangeLoop', 'click', () => applyRange(true));
    on('btnSaveEdit', 'click', saveEdit);
    on('btnCloseEdit', 'click', () => closeDialog('editDialog'));
    on('btnCancelEdit', 'click', () => closeDialog('editDialog'));
    on('btnExportSrt', 'click', exportSrt);
    on('btnSettings', 'click', () => { renderSettings(); showDialog('settingsDialog'); });
    on('btnCloseSettings', 'click', () => closeDialog('settingsDialog'));
    for (const id of Object.keys(SHOW_DEFAULTS)) {
      on(id, 'change', e => { settings.show[id] = e.target.checked; saveSettings(); applySettings(); renderSentences(); if (activeCue >= 0) { const p = split(cues[activeCue]); setSubtitle(p.main, p.translation); } });
    }
    on('resetSettings', 'click', () => {
      if (!confirm('Khôi phục các thông số hiển thị và tốc độ về mặc định? (Không xóa SRT đã sửa và địa chỉ GitHub.)')) return;
      settings.ranges = clone(DEFAULTS); settings.show = clone(SHOW_DEFAULTS);
      saveSettings(); applySettings(); renderSettings(); renderSentences(); toast('Đã khôi phục cài đặt.');
    });
    on('btnSaveRepo', 'click', saveRepo);
    on('btnCheckUpdateSettings', 'click', () => { if ($('otaManualRepoFields').hidden || saveRepo()) checkForUpdates(true); });
    on('btnUpdate', 'click', () => checkForUpdates(true));
    on('btnCloseUpdate', 'click', () => closeDialog('updateDialog'));
    on('btnDismissUpdate', 'click', () => closeDialog('updateDialog'));
    on('btnDownloadUpdate', 'click', downloadUpdate);
  }
  async function init() {
    bindEvents();
    applySettings();
    try {
      await loadTracks();
      renderSettings();
      checkForUpdates(false);
    } catch (e) {
      setSubtitle('Không thể khởi tạo: ' + e.message);
      toast('Lỗi nạp dữ liệu offline.');
    }
  }
  init();
})();
