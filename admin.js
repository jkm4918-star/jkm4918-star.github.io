/* =========================================================================
   Hedon139 — 사이트 관리자 (admin.js)
   브라우저에서 바로 GitHub REST API 로 data/portfolio.json 과 images/ 를 수정합니다.
   빌드 도구 없이 동작하는 ES2017 코드입니다.
   ========================================================================= */
(function () {
  'use strict';

  var CFG_KEY = 'hedon139.github';   /* { owner, repo, branch, token } */
  var DRAFT_KEY = 'hedon139.draft';  /* { data, draftImages, savedAt } — index.html 미리보기와 공유 */
  var MAX_EDGE = 1800;               /* 업로드 이미지 긴 변 최대 px */
  var MAX_FILE_MB = 25;

  var KIND_LABEL = { solo: '개인전', group: '단체전', fair: '아트페어' };

  var cfg = { owner: '', repo: '', branch: 'main', token: '' };

  var S = {
    data: null,
    sha: null,
    source: 'local',
    dirty: false,
    busy: false,
    pending: {},        /* 파일명 -> { b64, mime }  (아직 깃허브에 올리지 않은 이미지) */
    editingWorkId: null,
    editingExhId: null,
    editingMuralId: null,
    editingEntry: null,     /* { collection: 'performances'|'awards', id } */
    editImage: { path: '', dataUrl: '' },
    editMuralImage: { path: '', dataUrl: '' }
  };

  /* ------------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function nowLabel(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg, type) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.setAttribute('data-type', type || '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function notice(msg, type) {
    var el = $('#notice');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.setAttribute('data-type', type || '');
    el.innerHTML = msg;
  }

  function setStatus(state, text) {
    var el = $('#status');
    var t = $('#statusText');
    if (el) el.setAttribute('data-state', state);
    if (t) t.textContent = text;
  }

  function setDirty(v) {
    S.dirty = !!v;
    var flag = $('#dirtyFlag');
    if (flag) flag.hidden = !S.dirty;
  }

  function setBusy(v, label) {
    S.busy = !!v;
    ['#btnSave', '#btnReload', '#btnConnectTest'].forEach(function (sel) {
      var b = $(sel);
      if (b) b.disabled = S.busy;
    });
    if (S.busy) setStatus('busy', label || '처리 중…');
  }

  /* ------------------------------------------------------- base64 / utf8 */
  function toB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function fromB64(b64) {
    var clean = String(b64 || '').replace(/\s/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* ------------------------------------------------------------ data model */
  function normalize(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var p = data.profile && typeof data.profile === 'object' ? data.profile : {};
    var ig = p.instagram && typeof p.instagram === 'object' ? p.instagram : {};

    var handle = String(ig.handle || '').trim();
    var url = String(ig.url || '').trim();
    if (!url && handle) url = 'https://www.instagram.com/' + handle.replace(/^@/, '');

    var statement = p.statement;
    if (typeof statement === 'string') statement = statement.split(/\n{2,}/);
    if (!Array.isArray(statement)) statement = [];
    statement = statement.map(function (s) { return String(s).trim(); }).filter(Boolean);

    var works = (Array.isArray(data.works) ? data.works : []).map(function (w, i) {
      w = w || {};
      return {
        id: String(w.id || uid('w')),
        title: String(w.title || ''),
        series: String(w.series || ''),
        year: String(w.year || ''),
        size: String(w.size || ''),
        medium: String(w.medium || ''),
        image: String(w.image || ''),
        description: String(w.description || '')
      };
    });

    var exh = (Array.isArray(data.exhibitions) ? data.exhibitions : []).map(function (e) {
      e = e || {};
      var kind = String(e.kind || 'group');
      if (kind !== 'solo' && kind !== 'group' && kind !== 'fair') kind = 'group';
      var period = String(e.period || e.date || '');
      var range = parsePeriod(period);
      return {
        id: String(e.id || uid('x')),
        kind: kind,
        start: String(e.start || range.start || ''),
        end: String(e.end || range.end || ''),
        period: period,
        venue: String(e.venue || ''),
        city: String(e.city || ''),
        title: String(e.title || ''),
        note: String(e.note || KIND_LABEL[kind])
      };
    });

    var murals = (Array.isArray(data.murals) ? data.murals : []).map(function (m) {
      m = m || {};
      return {
        id: String(m.id || uid('m')),
        title: String(m.title || ''),
        venue: String(m.venue || ''),
        city: String(m.city || ''),
        year: String(m.year || ''),
        image: String(m.image || ''),
        ratio: Number(m.ratio) > 0 ? Number(m.ratio) : 0,
        note: String(m.note || '')
      };
    });

    var perf = (Array.isArray(data.performances) ? data.performances : []).map(function (p) {
      p = p || {};
      return {
        id: String(p.id || uid('p')),
        date: String(p.date || ''),
        title: String(p.title || ''),
        venue: String(p.venue || ''),
        city: String(p.city || '')
      };
    });

    var awards = (Array.isArray(data.awards) ? data.awards : []).map(function (a) {
      a = a || {};
      return {
        id: String(a.id || uid('a')),
        date: String(a.date || ''),
        end: String(a.end || ''),
        title: String(a.title || ''),
        venue: String(a.venue || ''),
        city: String(a.city || ''),
        type: String(a.type || '프로젝트')
      };
    });

    return {
      meta: {
        version: 1,
        updatedAt: new Date().toISOString().slice(0, 10),
        note: (data.meta && data.meta.note) || '이 파일은 index.html 과 admin.html 이 함께 읽는 유일한 데이터 원본입니다.'
      },
      profile: {
        name: String(p.name || 'Hedon139'),
        nameKo: String(p.nameKo || ''),
        tagline: String(p.tagline || 'Hedon is Everywhere'),
        genre: String(p.genre || ''),
        crew: String(p.crew || ''),
        portrait: String(p.portrait || ''),
        manifesto: String(p.manifesto || ''),
        statement: statement,
        instagram: { handle: handle, url: url }
      },
      works: works,
      murals: murals,
      exhibitions: exh,
      performances: perf,
      awards: awards
    };
  }

  /* '2026.11.04-12.04' 처럼 적은 기간 문자열을 start/end 로 나눈다 */
  function parsePeriod(p) {
    var value = String(p || '').trim();
    var m4 = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d{2})\.(\d{2})$/.exec(value);
    if (m4) return { start: m4[1] + '-' + m4[2] + '-' + m4[3], end: m4[1] + '-' + m4[4] + '-' + m4[5] };
    var m = /^(\d{4})\.(\d{2})\.(\d{2})(?:-(\d{2})\.(\d{2}))?/.exec(value);
    if (m) {
      var start = m[1] + '-' + m[2] + '-' + m[3];
      var end = m[4] ? m[1] + '-' + m[4] + '-' + m[5] : '';
      if (end && end < start) end = (Number(m[1]) + 1) + '-' + m[4] + '-' + m[5];
      return { start: start, end: end };
    }
    if (/^\d{4}\.\d{2}$/.test(value)) return { start: value.replace('.', '-'), end: '' };
    if (/^\d{4}$/.test(value)) return { start: value, end: '' };
    return { start: '', end: '' };
  }

  function emptyData() {
    return normalize({
      profile: { name: 'Hedon139', nameKo: '헤돈139', tagline: 'Hedon is Everywhere' },
      works: [],
      murals: [],
      exhibitions: [],
      performances: [],
      awards: []
    });
  }

  /* ------------------------------------------------------------ github api */
  function hasCfg() {
    return !!(cfg.owner && cfg.repo && cfg.token);
  }

  function repoPath() {
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }

  function contentsPath(filePath) {
    return repoPath() + '/contents/' + filePath;
  }

  function mapError(status, msg) {
    if (status === 401) return '토큰이 올바르지 않거나 만료되었습니다. GitHub에서 새 토큰을 발급해 다시 넣어 주세요.';
    if (status === 403) return '권한이 없습니다. Fine-grained 토큰의 Repository permissions → Contents 가 "Read and write" 인지 확인해 주세요. (' + msg + ')';
    if (status === 404) return '저장소·브랜치·파일 경로를 찾을 수 없습니다. 아이디/저장소 이름/브랜치를 확인해 주세요. (' + msg + ')';
    if (status === 409) return '다른 곳에서 먼저 수정되어 저장이 겹쳤습니다. "새로 불러오기"로 최신 내용을 받은 뒤 다시 저장해 주세요.';
    if (status === 413) return '파일이 너무 큽니다. 더 작은 이미지를 사용해 주세요.';
    if (status === 422) return '요청을 처리할 수 없습니다. 브랜치 이름이 정확한지, 같은 이름의 파일이 이미 있는지 확인해 주세요. (' + msg + ')';
    return msg || ('요청 실패 (' + status + ')');
  }

  function api(path, opts) {
    if (!hasCfg()) {
      return Promise.reject(new Error('GitHub 연결 정보가 없습니다. "GitHub 연결" 탭에서 아이디·저장소·토큰을 먼저 저장해 주세요.'));
    }
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    };
    if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return fetch('https://api.github.com' + path, init).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (!res.ok) {
          var raw = (json && json.message) ? json.message : ('HTTP ' + res.status);
          var err = new Error(mapError(res.status, raw));
          err.status = res.status;
          err.raw = raw;
          throw err;
        }
        return json;
      });
    }, function () {
      throw new Error('네트워크 오류입니다. 인터넷 연결을 확인하고, 관리자 페이지를 http(s) 주소(GitHub Pages 또는 로컬 서버)로 열었는지 확인해 주세요.');
    });
  }

  /* --------------------------------------------------------------- loading */
  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      cfg.owner = String(parsed.owner || '');
      cfg.repo = String(parsed.repo || '');
      cfg.branch = String(parsed.branch || 'main');
      cfg.token = String(parsed.token || '');
    } catch (e) { /* 무시 */ }
  }

  function saveCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      toast('브라우저에 설정을 저장하지 못했습니다. (저장 공간 부족)', 'err');
      return false;
    }
  }

  function loadLocalFile() {
    return fetch('./data/portfolio.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function loadFromGitHub() {
    return api(contentsPath('data/portfolio.json') + '?ref=' + encodeURIComponent(cfg.branch))
      .then(function (res) {
        var text = fromB64(res.content || '');
        var json = JSON.parse(text);
        return { data: json, sha: res.sha };
      });
  }

  function applyData(raw, sha, source) {
    S.data = normalize(raw);
    S.sha = sha || null;
    S.source = source || 'local';
    S.pending = {};
    renderAll();
  }

  /* ------------------------------------------------------------- rendering */
  function renderAll() {
    if (!S.data) return;
    $('#cntWorks').textContent = String(S.data.works.length);
    $('#cntMurals').textContent = String(S.data.murals.length);
    $('#cntExh').textContent = String(S.data.exhibitions.length);
    $('#cntPerf').textContent = String(S.data.performances.length);
    $('#cntAwards').textContent = String(S.data.awards.length);
    renderWorkList();
    renderMuralList();
    renderExhList();
    renderEntryList('performances');
    renderEntryList('awards');
    var profilePanel = $('[data-panel="profile"]');
    if (!profilePanel || profilePanel.hidden) renderProfileForm();
    renderSeriesList();
    renderDraftMeta();
    setDirty(S.dirty);
  }

  function imageFor(item) {
    if (!item.image) return '';
    if (item.image.indexOf('images/') === 0) {
      var name = item.image.slice(7);
      if (S.pending[name]) return 'data:' + S.pending[name].mime + ';base64,' + S.pending[name].b64;
    }
    return item.image;
  }

  function renderWorkList() {
    var host = $('#workList');
    var empty = $('#workEmpty');
    if (!host) return;

    var works = S.data.works;
    empty.hidden = works.length > 0;

    host.innerHTML = works.map(function (w, i) {
      var src = imageFor(w);
      var sub = [w.series, w.year, w.size, w.medium].filter(Boolean).join(' · ');
      return '<article class="row" data-id="' + esc(w.id) + '">' +
        '<div class="thumb contain">' +
        (src ? '<img src="' + esc(src) + '" alt="">' : '<span>' + esc((w.title || '?').charAt(0)) + '</span>') +
        '</div>' +
        '<div class="row-main">' +
        '<div class="row-title">' + esc(w.title || '(제목 없음)') + '</div>' +
        '<div class="row-sub">' + esc(sub || '설명 없음') + '</div>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="icon-btn" type="button" data-act="up" title="위로" aria-label="위로"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="icon-btn" type="button" data-act="down" title="아래로" aria-label="아래로"' + (i === works.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit">수정</button>' +
        '<button class="icon-btn danger" type="button" data-act="del" title="삭제" aria-label="삭제">✕</button>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderExhList() {
    var host = $('#exhList');
    var empty = $('#exhEmpty');
    if (!host) return;

    var list = S.data.exhibitions.slice();
    var order = { solo: 0, group: 1, fair: 2 };
    list.sort(function (a, b) {
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return String(b.start || '').localeCompare(String(a.start || ''));
    });

    empty.hidden = list.length > 0;

    host.innerHTML = list.map(function (e) {
      return '<article class="row" data-id="' + esc(e.id) + '">' +
        '<div class="row-main">' +
        '<div class="row-title">' + (e.title ? '《' + esc(e.title) + '》' : '(제목 없음)') + '</div>' +
        '<div class="row-sub">' + esc([e.venue, e.city, e.period || e.start].filter(Boolean).join(' · ') || '장소·날짜 없음') + '</div>' +
        '<div class="row-tags"><span class="tag ' + esc(e.kind) + '">' + esc(e.note || KIND_LABEL[e.kind]) + '</span></div>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit">수정</button>' +
        '<button class="icon-btn danger" type="button" data-act="del" title="삭제" aria-label="삭제">✕</button>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderMuralList() {
    var host = $('#muralList');
    var empty = $('#muralEmpty');
    if (!host) return;
    var list = S.data.murals;
    empty.hidden = list.length > 0;

    host.innerHTML = list.map(function (m, i) {
      var src = imageFor(m);
      var sub = [m.venue, m.city, m.year].filter(Boolean).join(' · ');
      return '<article class="row" data-id="' + esc(m.id) + '">' +
        '<div class="thumb">' +
        (src ? '<img src="' + esc(src) + '" alt="">' : '<span>' + esc((m.title || '?').charAt(0)) + '</span>') +
        '</div>' +
        '<div class="row-main">' +
        '<div class="row-title">' + esc(m.title || '(제목 없음)') + '</div>' +
        '<div class="row-sub">' + esc(sub || '장소·연도 없음') + '</div>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="icon-btn" type="button" data-act="up" title="위로" aria-label="위로"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="icon-btn" type="button" data-act="down" title="아래로" aria-label="아래로"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit">수정</button>' +
        '<button class="icon-btn danger" type="button" data-act="del" title="삭제" aria-label="삭제">✕</button>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderEntryList(collection) {
    var isPerf = collection === 'performances';
    var host = $(isPerf ? '#perfList' : '#awardList');
    var empty = $(isPerf ? '#perfEmpty' : '#awardEmpty');
    if (!host || !S.data) return;

    var list = (S.data[collection] || []).slice();
    list.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    empty.hidden = list.length > 0;

    host.innerHTML = list.map(function (item) {
      var sub = [item.venue, item.city].filter(Boolean).join(' · ');
      var tags = isPerf
        ? '<span class="tag fair">Live</span>'
        : '<span class="tag group">' + esc(item.type || '프로젝트') + '</span>';
      return '<article class="row" data-id="' + esc(item.id) + '" data-collection="' + collection + '">' +
        '<div class="row-main">' +
        '<div class="row-title">' + esc(item.title || '(제목 없음)') + '</div>' +
        '<div class="row-sub">' + esc([sub, item.date, item.end].filter(Boolean).join(' · ') || '날짜 없음') + '</div>' +
        '<div class="row-tags">' + tags + '</div>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit">수정</button>' +
        '<button class="icon-btn danger" type="button" data-act="del" title="삭제" aria-label="삭제">✕</button>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderSeriesList() {
    var dl = $('#seriesList');
    if (!dl) return;
    var seen = {};
    S.data.works.forEach(function (w) {
      if (w.series && !seen[w.series]) {
        seen[w.series] = 1;
        dl.insertAdjacentHTML('beforeend', '<option value="' + esc(w.series) + '"></option>');
      }
    });
  }

  function renderProfileForm() {
    var form = $('#profileForm');
    if (!form) return;
    var p = S.data.profile;
    form.name.value = p.name || '';
    form.nameKo.value = p.nameKo || '';
    form.tagline.value = p.tagline || '';
    form.genre.value = p.genre || '';
    form.crew.value = p.crew || '';
    form.portrait.value = p.portrait || '';
    form.manifesto.value = p.manifesto || '';
    form.statement.value = (p.statement || []).join('\n\n');
    form.igHandle.value = p.instagram.handle || '';
    form.igUrl.value = p.instagram.url || '';
  }

  function renderDraftMeta() {
    var el = $('#draftMeta');
    if (!el) return;
    var draft = readDraftRaw();
    el.textContent = draft
      ? '임시본 저장 시각: ' + nowLabel(draft.savedAt)
      : '저장된 임시본이 없습니다.';
  }

  /* ------------------------------------------------------------ draft I/O */
  function readDraftRaw() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.data) return parsed;
    } catch (e) { /* ignore */ }
    return null;
  }

  function draftPayload() {
    var images = {};
    Object.keys(S.pending).forEach(function (name) {
      images[name] = 'data:' + S.pending[name].mime + ';base64,' + S.pending[name].b64;
    });
    return { data: S.data, draftImages: images, savedAt: new Date().toISOString() };
  }

  function saveDraft(silent) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload()));
      renderDraftMeta();
      if (!silent) toast('이 브라우저에 임시 저장했습니다.', 'ok');
      return true;
    } catch (e) {
      toast('임시 저장 실패: 브라우저 저장 공간이 부족합니다. 이미지 용량을 줄여 보세요.', 'err');
      return false;
    }
  }

  function restoreDraft(showToast) {
    var raw = readDraftRaw();
    if (!raw) {
      if (showToast) toast('복원할 임시본이 없습니다.', 'warn');
      return false;
    }
    var pending = {};
    var imgs = raw.draftImages || {};
    Object.keys(imgs).forEach(function (name) {
      var m = /^data:([^;]+);base64,(.*)$/.exec(imgs[name] || '');
      if (m) pending[name] = { mime: m[1], b64: m[2] };
    });
    S.pending = pending;
    S.data = normalize(raw.data);
    renderAll();
    setDirty(true);
    $('#draftBanner').hidden = true;
    if (showToast) toast('임시본을 불러왔습니다.', 'ok');
    return true;
  }

  function clearDraft(silent) {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    renderDraftMeta();
    if (!silent) toast('임시본을 삭제했습니다.', 'ok');
  }

  /* ----------------------------------------------------------- work modal */
  function openWorkModal(id) {
    var form = $('#workForm');
    form.reset();

    var work = null;
    if (id) {
      S.data.works.forEach(function (w) { if (w.id === id) work = w; });
    }

    S.editingWorkId = work ? work.id : null;
    $('#workModalTitle').textContent = work ? '작품 수정' : '새 작품 추가';

    form.title.value = work ? work.title : '';
    form.series.value = work ? work.series : (S.data.works.length ? S.data.works[0].series : '');
    form.year.value = work ? work.year : String(new Date().getFullYear());
    form.size.value = work ? work.size : '';
    form.medium.value = work ? work.medium : '';
    form.description.value = work ? work.description : '';

    S.editImage = { path: work ? work.image : '', dataUrl: '' };
    setImagePreview();
    $('#workImagePath').value = S.editImage.path;
    $('#workImageFile').value = '';

    $('#workModal').hidden = false;
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function closeWorkModal() {
    $('#workModal').hidden = true;
    S.editingWorkId = null;
    S.editImage = { path: '', dataUrl: '' };
  }

  function imageState(mode) {
    return mode === 'mural' ? S.editMuralImage : S.editImage;
  }

  function setImagePreview(mode) {
    var m = mode || 'work';
    var host = $(m === 'mural' ? '#muralImagePreview' : '#workImagePreview');
    if (!host) return;
    var st = imageState(m);
    var src = st.dataUrl || st.path;
    if (src) {
      host.innerHTML = '<img src="' + esc(src) + '" alt="미리보기">';
      var im = host.querySelector('img');
      if (im) {
        im.addEventListener('error', function () {
          host.innerHTML = '<span>이미지를 찾을 수 없음</span>';
        });
      }
    } else {
      host.innerHTML = '<span>이미지 없음</span>';
    }
  }

  function setEditImage(path, dataUrl, mode) {
    var m = mode || 'work';
    var st = imageState(m);
    st.path = path || '';
    st.dataUrl = dataUrl || '';
    var input = $(m === 'mural' ? '#muralImagePath' : '#workImagePath');
    if (input) input.value = st.path;
    setImagePreview(m);
  }

  function submitWork(ev) {
    ev.preventDefault();
    var form = ev.target;
    var title = form.title.value.trim();
    if (!title) { form.title.focus(); toast('제목을 입력해 주세요.', 'warn'); return; }

    var work = {
      id: S.editingWorkId || uid('w'),
      title: title,
      series: form.series.value.trim(),
      year: form.year.value.trim(),
      size: form.size.value.trim(),
      medium: form.medium.value.trim(),
      image: S.editImage.path,
      description: form.description.value.trim()
    };

    if (S.editingWorkId) {
      var replaced = false;
      S.data.works = S.data.works.map(function (w) {
        if (w.id === S.editingWorkId) { replaced = true; return work; }
        return w;
      });
      if (!replaced) S.data.works.push(work);
    } else {
      S.data.works.push(work);
    }

    closeWorkModal();
    renderAll();
    setDirty(true);
    toast('목록에 적용했습니다. "깃허브에 저장"을 누르면 사이트에 반영됩니다.', 'ok');
  }

  function deleteWork(id) {
    var target = null;
    S.data.works.forEach(function (w) { if (w.id === id) target = w; });
    if (!target) return;
    if (!window.confirm('"' + target.title + '" 작품을 목록에서 삭제할까요?\n(이미지 파일은 저장소에 그대로 남습니다)')) return;
    S.data.works = S.data.works.filter(function (w) { return w.id !== id; });
    renderAll();
    setDirty(true);
  }

  function moveWork(id, dir) {
    var idx = -1;
    S.data.works.forEach(function (w, i) { if (w.id === id) idx = i; });
    var to = idx + dir;
    if (idx < 0 || to < 0 || to >= S.data.works.length) return;
    var tmp = S.data.works[idx];
    S.data.works[idx] = S.data.works[to];
    S.data.works[to] = tmp;
    renderAll();
    setDirty(true);
  }

  /* ------------------------------------------------------------ exh modal */
  function openExhModal(id) {
    var form = $('#exhForm');
    form.reset();
    var item = null;
    if (id) S.data.exhibitions.forEach(function (e) { if (e.id === id) item = e; });

    S.editingExhId = item ? item.id : null;
    $('#exhModalTitle').textContent = item ? '전시 수정' : '전시 추가';

    form.kind.value = item ? item.kind : 'solo';
    form.period.value = item ? (item.period || item.start || '') : '';
    form.title.value = item ? item.title : '';
    form.venue.value = item ? item.venue : '';
    form.city.value = item ? item.city : '';
    form.note.value = item ? item.note : '';

    $('#exhModal').hidden = false;
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function closeExhModal() {
    $('#exhModal').hidden = true;
    S.editingExhId = null;
  }

  /* ----------------------------------------------------------- mural modal */
  function openMuralModal(id) {
    var form = $('#muralForm');
    form.reset();
    var item = null;
    if (id) S.data.murals.forEach(function (m) { if (m.id === id) item = m; });

    S.editingMuralId = item ? item.id : null;
    $('#muralModalTitle').textContent = item ? '벽화 수정' : '벽화 추가';

    form.title.value = item ? item.title : '';
    form.year.value = item ? item.year : String(new Date().getFullYear());
    form.venue.value = item ? item.venue : '';
    form.city.value = item ? item.city : '';
    form.note.value = item ? item.note : '';

    S.editMuralImage = { path: item ? item.image : '', dataUrl: '' };
    setEditImage(S.editMuralImage.path, '', 'mural');
    $('#muralImageFile').value = '';

    $('#muralModal').hidden = false;
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function closeMuralModal() {
    $('#muralModal').hidden = true;
    S.editingMuralId = null;
    S.editMuralImage = { path: '', dataUrl: '' };
  }

  function submitMural(ev) {
    ev.preventDefault();
    var form = ev.target;
    var title = form.title.value.trim();
    if (!title) { form.title.focus(); toast('제목을 입력해 주세요.', 'warn'); return; }

    var item = {
      id: S.editingMuralId || uid('m'),
      title: title,
      venue: form.venue.value.trim(),
      city: form.city.value.trim(),
      year: form.year.value.trim(),
      image: S.editMuralImage.path,
      ratio: 0,
      note: form.note.value.trim()
    };

    var existing = null;
    S.data.murals.forEach(function (m) { if (m.id === item.id) existing = m; });
    if (existing && existing.ratio) item.ratio = existing.ratio;

    if (S.editingMuralId) {
      S.data.murals = S.data.murals.map(function (m) { return m.id === S.editingMuralId ? item : m; });
    } else {
      S.data.murals.push(item);
    }

    closeMuralModal();
    renderAll();
    setDirty(true);
    toast('목록에 적용했습니다. "깃허브에 저장"을 누르면 사이트에 반영됩니다.', 'ok');
  }

  function deleteMural(id) {
    var target = null;
    S.data.murals.forEach(function (m) { if (m.id === id) target = m; });
    if (!target) return;
    if (!window.confirm('"' + target.title + '" 벽화를 목록에서 삭제할까요?\n(이미지 파일은 저장소에 그대로 남습니다)')) return;
    S.data.murals = S.data.murals.filter(function (m) { return m.id !== id; });
    renderAll();
    setDirty(true);
  }

  function moveMural(id, dir) {
    var list = S.data.murals;
    var idx = -1;
    list.forEach(function (m, i) { if (m.id === id) idx = i; });
    var to = idx + dir;
    if (idx < 0 || to < 0 || to >= list.length) return;
    var tmp = list[idx];
    list[idx] = list[to];
    list[to] = tmp;
    renderAll();
    setDirty(true);
  }

  /* ------------------------------------------------ performance / award modal */
  function openEntryModal(collection, id) {
    var form = $('#entryForm');
    form.reset();
    form.collection.value = collection;

    var item = null;
    if (id) (S.data[collection] || []).forEach(function (e) { if (e.id === id) item = e; });

    S.editingEntry = { collection: collection, id: item ? item.id : null };

    var isPerf = collection === 'performances';
    $('#entryModalTitle').textContent = (isPerf ? '퍼포먼스' : '수상 · 프로젝트') + (item ? ' 수정' : ' 추가');

    $$('[data-only="awards"]', form).forEach(function (el) { el.hidden = isPerf; });

    form.date.value = item ? item.date : '';
    form.end.value = item && item.end ? item.end : '';
    form.title.value = item ? item.title : '';
    form.venue.value = item ? item.venue : '';
    form.city.value = item ? item.city : '';
    form.type.value = item ? (item.type || '') : '';

    $('#entryModal').hidden = false;
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function closeEntryModal() {
    $('#entryModal').hidden = true;
    S.editingEntry = null;
  }

  function submitEntry(ev) {
    ev.preventDefault();
    var form = ev.target;
    var collection = form.collection.value === 'awards' ? 'awards' : 'performances';
    var title = form.title.value.trim();
    if (!title) { form.title.focus(); toast('이름을 입력해 주세요.', 'warn'); return; }

    var item;
    if (collection === 'performances') {
      item = {
        id: (S.editingEntry && S.editingEntry.id) || uid('p'),
        date: form.date.value.trim(),
        title: title,
        venue: form.venue.value.trim(),
        city: form.city.value.trim()
      };
    } else {
      item = {
        id: (S.editingEntry && S.editingEntry.id) || uid('a'),
        date: form.date.value.trim(),
        end: form.end.value.trim(),
        title: title,
        venue: form.venue.value.trim(),
        city: form.city.value.trim(),
        type: form.type.value.trim() || '프로젝트'
      };
    }

    var editingId = S.editingEntry ? S.editingEntry.id : null;
    if (editingId) {
      S.data[collection] = S.data[collection].map(function (e) { return e.id === editingId ? item : e; });
    } else {
      S.data[collection].push(item);
    }

    closeEntryModal();
    renderAll();
    setDirty(true);
    toast('목록에 적용했습니다.', 'ok');
  }

  function deleteEntry(collection, id) {
    var target = null;
    (S.data[collection] || []).forEach(function (e) { if (e.id === id) target = e; });
    if (!target) return;
    if (!window.confirm('"' + (target.title || '') + '" 기록을 삭제할까요?')) return;
    S.data[collection] = S.data[collection].filter(function (e) { return e.id !== id; });
    renderAll();
    setDirty(true);
  }

  function submitExh(ev) {
    ev.preventDefault();
    var form = ev.target;
    var title = form.title.value.trim();
    if (!title) { form.title.focus(); toast('이름을 입력해 주세요.', 'warn'); return; }

    var period = form.period.value.trim();
    var range = parsePeriod(period);

    var item = {
      id: S.editingExhId || uid('x'),
      kind: form.kind.value,
      start: range.start,
      end: range.end,
      period: period,
      venue: form.venue.value.trim(),
      city: form.city.value.trim(),
      title: title,
      note: form.note.value.trim() || KIND_LABEL[form.kind.value]
    };

    if (S.editingExhId) {
      S.data.exhibitions = S.data.exhibitions.map(function (e) {
        return e.id === S.editingExhId ? item : e;
      });
    } else {
      S.data.exhibitions.push(item);
    }

    closeExhModal();
    renderAll();
    setDirty(true);
    toast('목록에 적용했습니다.', 'ok');
  }

  function deleteExh(id) {
    var target = null;
    S.data.exhibitions.forEach(function (e) { if (e.id === id) target = e; });
    if (!target) return;
    if (!window.confirm('"' + (target.title || target.venue) + '" 기록을 삭제할까요?')) return;
    S.data.exhibitions = S.data.exhibitions.filter(function (e) { return e.id !== id; });
    renderAll();
    setDirty(true);
  }

  /* --------------------------------------------------------------- profile */
  function applyProfile() {
    var form = $('#profileForm');
    var statement = form.statement.value
      .split(/\n\s*\n/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var handle = form.igHandle.value.trim();
    var url = form.igUrl.value.trim();
    if (!url && handle) url = 'https://www.instagram.com/' + handle.replace(/^@/, '');

    S.data.profile = {
      name: form.name.value.trim() || 'Hedon139',
      nameKo: form.nameKo.value.trim(),
      tagline: form.tagline.value.trim(),
      genre: form.genre.value.trim(),
      crew: form.crew.value.trim(),
      portrait: form.portrait.value.trim(),
      manifesto: form.manifesto.value,
      statement: statement,
      instagram: { handle: handle, url: url }
    };

    renderProfileForm();
    setDirty(true);
    toast('프로필을 적용했습니다. "깃허브에 저장"을 누르면 사이트에 반영됩니다.', 'ok');
  }

  /* ----------------------------------------------------------- image pick */
  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
  }

  function makeFileName(ext, mode) {
    var form = mode === 'mural' ? $('#muralForm') : $('#workForm');
    var base = slugify(form && form.title ? form.title.value : '') || (mode === 'mural' ? 'mural' : 'work');
    return base + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5) + '.' + ext;
  }

  function fromImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('이미지를 읽을 수 없습니다.'));
      };
      img.src = url;
    });
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return fromImg(file); });
    }
    return fromImg(file);
  }

  function handleImageFile(file, mode) {
    if (!file) return;
    var m = mode || 'work';
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast('이미지가 너무 큽니다. ' + MAX_FILE_MB + 'MB 이하 파일을 사용해 주세요.', 'err');
      return;
    }

    var isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);

    if (isSvg) {
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '');
        if (text.length < 20 || text.indexOf('<svg') < 0) {
          toast('SVG 파일을 읽지 못했습니다.', 'err');
          return;
        }
        var name = makeFileName('svg', m);
        S.pending[name] = { b64: toB64(text), mime: 'image/svg+xml' };
        setEditImage('images/' + name, 'data:image/svg+xml;base64,' + S.pending[name].b64, m);
        toast('이미지를 첨부했습니다. (저장 시 업로드)', 'ok');
      };
      reader.readAsText(file);
      return;
    }

    loadBitmap(file).then(function (bmp) {
      var w = bmp.width || bmp.naturalWidth;
      var h = bmp.height || bmp.naturalHeight;
      if (!w || !h) throw new Error('이미지 크기를 알 수 없습니다.');

      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));

      var usePng = (file.type === 'image/png' && file.size < 900 * 1024);
      var mime = usePng ? 'image/png' : 'image/jpeg';
      var ext = usePng ? 'png' : 'jpg';

      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      if (!usePng) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tw, th);
      }
      ctx.drawImage(bmp, 0, 0, tw, th);
      if (bmp.close) bmp.close();

      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) { resolve(blob); }, mime, 0.86);
      });
    }).then(function (blob) {
      if (!blob) throw new Error('이미지를 변환하지 못했습니다.');
      var fr = new FileReader();
      fr.onload = function () {
        var dataUrl = String(fr.result || '');
        var b64 = dataUrl.split(',')[1] || '';
        var mime = dataUrl.slice(5, dataUrl.indexOf(';'));
        var ext = mime === 'image/png' ? 'png' : 'jpg';
        var name = makeFileName(ext, m);
        S.pending[name] = { b64: b64, mime: mime };
        setEditImage('images/' + name, dataUrl, m);
        toast('이미지를 첨부했습니다. (저장 시 업로드)', 'ok');
      };
      fr.readAsDataURL(blob);
    }).catch(function (err) {
      toast(err.message || '이미지를 처리하지 못했습니다.', 'err');
    });
  }

  /* ------------------------------------------------------------ GH saving */
  function usedImageNames() {
    var names = [];
    S.data.works.concat(S.data.murals || []).forEach(function (w) {
      var m = /^images\/(.+)$/.exec(w.image || '');
      if (m) names.push(m[1]);
    });
    return names;
  }

  function uploadImage(name) {
    var item = S.pending[name];
    var path = contentsPath('images/' + name);
    return api(path + '?ref=' + encodeURIComponent(cfg.branch))
      .then(function (res) { return res && res.sha ? res.sha : null; })
      .catch(function (err) {
        if (err.status === 404) return null;
        throw err;
      })
      .then(function (sha) {
        var body = {
          message: '이미지 업로드: images/' + name,
          content: item.b64,
          branch: cfg.branch
        };
        if (sha) body.sha = sha;
        return api(path, { method: 'PUT', body: body });
      })
      .then(function () { delete S.pending[name]; });
  }

  function ensureSha() {
    return api(contentsPath('data/portfolio.json') + '?ref=' + encodeURIComponent(cfg.branch))
      .then(function (res) {
        S.sha = res.sha;
        return S.sha;
      })
      .catch(function (err) {
        if (err.status === 404) {
          S.sha = null; /* 처음 만드는 파일 */
          return null;
        }
        throw err;
      });
  }

  function putPortfolio() {
    var json = JSON.stringify(S.data, null, 2) + '\n';
    var body = {
      message: '사이트 내용 업데이트 — ' + nowLabel(),
      content: toB64(json),
      branch: cfg.branch
    };
    if (S.sha) body.sha = S.sha;

    return api(contentsPath('data/portfolio.json'), { method: 'PUT', body: body })
      .then(function (res) {
        if (res && res.content && res.content.sha) S.sha = res.content.sha;
      });
  }

  function saveToGitHub() {
    if (!S.data) return;
    if (S.busy) return;

    if (!hasCfg()) {
      notice('GitHub 연결이 아직 없습니다. <b>GitHub 연결</b> 탭에서 아이디·저장소·토큰을 입력하고 저장해 주세요. ' +
        '연결 없이도 <b>백업 · 미리보기</b>에서 JSON으로 내려받을 수는 있습니다.', 'warn');
      switchTab('connect');
      return;
    }

    notice('');
    setBusy(true, '저장 중…');
    setStatus('busy', '저장 중…');

    var used = usedImageNames();
    var names = Object.keys(S.pending).filter(function (n) { return used.indexOf(n) >= 0; });

    var chain = ensureSha();
    names.forEach(function (name) {
      chain = chain.then(function () { return uploadImage(name); });
    });

    chain
      .then(function () { return putPortfolio(); })
      .then(function () {
        setDirty(false);
        setStatus('on', '연결됨 · 저장 완료');
        clearDraft(true);
        toast('깃허브에 저장했습니다. 사이트 반영까지 1~2분 걸릴 수 있습니다.', 'ok');
      })
      .catch(function (err) {
        setStatus('error', '저장 실패');
        notice('<b>저장하지 못했습니다.</b><br>' + esc(err.message) +
          (err.status === 409 ? '<br>위쪽 <b>새로 불러오기</b>로 최신 내용을 받은 뒤 다시 시도해 주세요.' : ''), 'err');
      })
      .then(function () { setBusy(false); });
  }

  /* ------------------------------------------------------------- reloading */
  function reloadAll() {
    if (S.dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 새로 불러올까요?')) return;

    if (!hasCfg()) {
      loadLocalFile().then(function (raw) {
        applyData(raw, null, 'local');
        S.dirty = false;
        setStatus('off', 'GitHub 미연결 · 로컬 파일');
        toast('data/portfolio.json 을 새로 불러왔습니다.', 'ok');
      }).catch(function () {
        toast('로컬 파일을 읽지 못했습니다. 서버로 열었는지 확인해 주세요.', 'err');
      });
      return;
    }

    setBusy(true, '불러오는 중…');
    setStatus('busy', '불러오는 중…');
    loadFromGitHub()
      .then(function (res) {
        applyData(res.data, res.sha, 'github');
        setDirty(false);
        setStatus('on', '연결됨 · ' + cfg.owner + '/' + cfg.repo);
        toast('깃허브에서 최신 내용을 불러왔습니다.', 'ok');
      })
      .catch(function (err) {
        setStatus('error', '불러오기 실패');
        notice('<b>깃허브에서 불러오지 못했습니다.</b><br>' + esc(err.message), 'err');
      })
      .then(function () { setBusy(false); });
  }

  /* ------------------------------------------------------------- connect */
  function fillConnectForm() {
    var form = $('#connectForm');
    form.owner.value = cfg.owner;
    form.repo.value = cfg.repo;
    form.branch.value = cfg.branch || 'main';
    form.token.value = cfg.token;
  }

  function readConnectForm() {
    var form = $('#connectForm');
    cfg.owner = form.owner.value.trim();
    cfg.repo = form.repo.value.trim();
    cfg.branch = form.branch.value.trim() || 'main';
    cfg.token = form.token.value.trim();

    if (!cfg.owner || !cfg.repo || !cfg.token) {
      showConnectResult(false, '아이디·저장소·토큰을 모두 입력해 주세요.');
      return false;
    }
    return true;
  }

  function showConnectResult(ok, html) {
    var el = $('#connectResult');
    el.hidden = false;
    el.setAttribute('data-ok', ok ? 'true' : 'false');
    el.innerHTML = html;
  }

  function testConnection() {
    if (!readConnectForm()) return;
    saveCfg();
    setStatus('busy', '연결 확인 중…');
    showConnectResult(true, '확인하는 중…');

    api(repoPath())
      .then(function (repo) {
        var canWrite = repo && repo.permissions && repo.permissions.push;
        var branch = (repo && repo.default_branch) || cfg.branch;

        return api(contentsPath('data/portfolio.json') + '?ref=' + encodeURIComponent(cfg.branch))
          .then(function (res) {
            return { repo: repo, canWrite: canWrite, branch: branch, file: res };
          })
          .catch(function (err) {
            if (err.status === 404) return { repo: repo, canWrite: canWrite, branch: branch, file: null };
            throw err;
          });
      })
      .then(function (info) {
        var lines = [];
        lines.push('저장소: <b>' + esc(info.repo.full_name) + '</b>');
        lines.push('기본 브랜치: <b>' + esc(info.branch) + '</b> / 사용 브랜치: <b>' + esc(cfg.branch) + '</b>');
        lines.push(info.canWrite
          ? '쓰기 권한: <b>있음</b> (저장 가능)'
          : '쓰기 권한: <b>없음</b> — 토큰의 Contents 권한을 Read and write 로 바꿔 주세요.');
        lines.push(info.file
          ? 'data/portfolio.json: <b>찾음</b> (이어서 수정할 수 있습니다)'
          : 'data/portfolio.json: <b>없음</b> — 저장하면 새로 만들어집니다.');

        showConnectResult(info.canWrite, lines.join('<br>'));
        setStatus('on', '연결됨 · ' + cfg.owner + '/' + cfg.repo);

        if (info.canWrite && info.file && !S.dirty) {
          var data = null;
          try { data = JSON.parse(fromB64(info.file.content || '')); } catch (e) { data = null; }
          if (data) {
            applyData(data, info.file.sha, 'github');
            toast('깃허브의 최신 내용을 편집기에 불러왔습니다.', 'ok');
          }
        } else if (info.canWrite && S.dirty) {
          notice('연결은 정상입니다. 다만 편집 중인 내용이 있어 자동으로 불러오지 않았습니다. ' +
            '깃허브 내용을 받으려면 <b>새로 불러오기</b>를 눌러 주세요.', 'warn');
        }
      })
      .catch(function (err) {
        setStatus('error', '연결 실패');
        showConnectResult(false, esc(err.message));
      });
  }

  /* --------------------------------------------------------------- 백업 I/O */
  function exportJson() {
    var json = JSON.stringify(S.data, null, 2) + '\n';
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'portfolio-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('JSON 파일을 내려받았습니다.', 'ok');
  }

  function importJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = JSON.parse(String(reader.result || '')); } catch (e) { parsed = null; }
      if (!parsed || typeof parsed !== 'object') {
        toast('JSON 파일을 읽지 못했습니다. portfolio.json 형식인지 확인해 주세요.', 'err');
        return;
      }
      if (!parsed.profile && !parsed.works && !parsed.murals) {
        toast('사이트 데이터 형식이 아닙니다. (profile / works 항목이 없습니다)', 'err');
        return;
      }
      S.data = normalize(parsed);
      renderAll();
      setDirty(true);
      toast('JSON을 불러왔습니다. "깃허브에 저장"을 눌러 반영해 주세요.', 'ok');
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ tabs */
  function switchTab(name) {
    $$('.rail-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === name);
    });
    $$('[data-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== name;
    });
    if (window.scrollY > 40 && window.innerWidth < 980) window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ init */
  function bindUI() {
    $$('.rail-btn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    $('#btnAddWork').addEventListener('click', function () { openWorkModal(null); });
    $('#btnAddMural').addEventListener('click', function () { openMuralModal(null); });
    $('#btnAddExh').addEventListener('click', function () { openExhModal(null); });
    $('#btnAddPerf').addEventListener('click', function () { openEntryModal('performances', null); });
    $('#btnAddAward').addEventListener('click', function () { openEntryModal('awards', null); });
    $('#btnSaveProfile').addEventListener('click', applyProfile);
    $('#profileForm').addEventListener('submit', function (ev) { ev.preventDefault(); applyProfile(); });
    $('#btnSave').addEventListener('click', saveToGitHub);
    $('#btnReload').addEventListener('click', reloadAll);
    $('#btnConnectTest').addEventListener('click', testConnection);

    $('#btnConnectSave').addEventListener('click', function () {
      if (!readConnectForm()) return;
      if (saveCfg()) {
        setStatus('off', '설정 저장됨 · 연결 확인 필요');
        showConnectResult(true, '설정을 저장했습니다. <b>연결 확인</b>을 눌러 토큰과 권한을 확인해 주세요.');
      }
    });

    $('#btnDisconnect').addEventListener('click', function () {
      if (!window.confirm('이 브라우저에 저장된 GitHub 토큰과 저장소 설정을 지울까요?\n(사이트 파일은 그대로 남습니다)')) return;
      cfg = { owner: '', repo: '', branch: 'main', token: '' };
      try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ }
      fillConnectForm();
      setStatus('off', 'GitHub 미연결');
      showConnectResult(true, '연결을 해제하고 저장된 토큰을 지웠습니다.');
      S.sha = null;
    });

    /* work list actions */
    $('#workList').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var row = ev.target.closest('.row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'edit') openWorkModal(id);
      else if (act === 'del') deleteWork(id);
      else if (act === 'up') moveWork(id, -1);
      else if (act === 'down') moveWork(id, 1);
    });

    /* mural list actions */
    $('#muralList').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var row = ev.target.closest('.row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'edit') openMuralModal(id);
      else if (act === 'del') deleteMural(id);
      else if (act === 'up') moveMural(id, -1);
      else if (act === 'down') moveMural(id, 1);
    });

    /* performance / award list actions */
    ['#perfList', '#awardList'].forEach(function (sel) {
      $(sel).addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-act]');
        if (!btn) return;
        var row = ev.target.closest('.row');
        if (!row) return;
        var id = row.getAttribute('data-id');
        var collection = row.getAttribute('data-collection');
        var act = btn.getAttribute('data-act');
        if (act === 'edit') openEntryModal(collection, id);
        else if (act === 'del') deleteEntry(collection, id);
      });
    });

    /* exhibition list actions */
    $('#exhList').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var row = ev.target.closest('.row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'edit') openExhModal(id);
      else if (act === 'del') deleteExh(id);
    });

    /* modals */
    $('#workForm').addEventListener('submit', submitWork);
    $('#muralForm').addEventListener('submit', submitMural);
    $('#exhForm').addEventListener('submit', submitExh);
    $('#entryForm').addEventListener('submit', submitEntry);

    function closeById(id) {
      if (id === 'workModal') closeWorkModal();
      else if (id === 'muralModal') closeMuralModal();
      else if (id === 'exhModal') closeExhModal();
      else if (id === 'entryModal') closeEntryModal();
    }

    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeById(b.getAttribute('data-close')); });
    });
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (ev) {
        if (ev.target !== m) return;
        closeById(m.id);
      });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      ['workModal', 'muralModal', 'exhModal', 'entryModal'].forEach(function (id) {
        var el = $('#' + id);
        if (el && !el.hidden) closeById(id);
      });
    });

    /* image controls */
    $('#workImageFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      handleImageFile(file, 'work');
    });
    $('#workImagePath').addEventListener('input', function (ev) {
      var value = ev.target.value.trim();
      if (value !== S.editImage.path) {
        S.editImage = { path: value, dataUrl: '' };
        setImagePreview('work');
      }
    });
    $('#workImageClear').addEventListener('click', function () { setEditImage('', '', 'work'); });

    $('#muralImageFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      handleImageFile(file, 'mural');
    });
    $('#muralImagePath').addEventListener('input', function (ev) {
      var value = ev.target.value.trim();
      if (value !== S.editMuralImage.path) {
        S.editMuralImage = { path: value, dataUrl: '' };
        setImagePreview('mural');
      }
    });
    $('#muralImageClear').addEventListener('click', function () { setEditImage('', '', 'mural'); });

    /* draft */
    $('#btnDraftSave').addEventListener('click', function () { saveDraft(false); });
    $('#btnDraftLoad').addEventListener('click', function () { restoreDraft(true); });
    $('#btnDraftClear').addEventListener('click', function () {
      if (!window.confirm('임시 저장본을 삭제할까요?')) return;
      clearDraft(false);
      $('#draftBanner').hidden = true;
    });
    $('#btnDraftRestore').addEventListener('click', function () { restoreDraft(true); });
    $('#btnDraftDiscard').addEventListener('click', function () {
      clearDraft(true);
      $('#draftBanner').hidden = true;
    });

    /* preview / backup */
    $('#btnPreview').addEventListener('click', function () {
      saveDraft(true);
      var win = window.open('index.html?preview=1', '_blank');
      if (!win) toast('팝업이 차단되었습니다. 브라우저의 팝업 허용을 켜 주세요.', 'warn');
    });
    $('#btnExport').addEventListener('click', exportJson);
    $('#importFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      importJson(file);
      ev.target.value = '';
    });

    window.addEventListener('beforeunload', function (ev) {
      if (!S.dirty) return;
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    });
  }

  function checkDraftBanner() {
    var draft = readDraftRaw();
    if (!draft) return;
    var el = $('#draftBanner');
    $('#draftTime').textContent = '(' + nowLabel(draft.savedAt) + ' 저장)';
    el.hidden = false;
  }

  function boot() {
    loadCfg();
    bindUI();
    fillConnectForm();
    checkDraftBanner();

    if (hasCfg()) {
      setStatus('busy', '불러오는 중…');
      loadFromGitHub()
        .then(function (res) {
          applyData(res.data, res.sha, 'github');
          setStatus('on', '연결됨 · ' + cfg.owner + '/' + cfg.repo);
        })
        .catch(function (err) {
          setStatus('error', 'GitHub 연결 실패');
          notice('<b>GitHub에서 불러오지 못해 로컬 파일을 사용합니다.</b><br>' + esc(err.message), 'warn');
          return loadLocalFile()
            .then(function (raw) { applyData(raw, null, 'local'); })
            .catch(function () { applyData(emptyData(), null, 'local'); });
        })
        .then(function () { setDirty(false); });
    } else {
      loadLocalFile()
        .then(function (raw) {
          applyData(raw, null, 'local');
          setStatus('off', 'GitHub 미연결 · 로컬 파일');
        })
        .catch(function () {
          applyData(emptyData(), null, 'local');
          setStatus('off', 'GitHub 미연결');
          notice('data/portfolio.json 을 읽지 못했습니다. index.html 과 같은 폴더에서 로컬 서버로 열거나 ' +
            'GitHub Pages 주소로 접속해 주세요. (admin.html 은 파일을 직접 열면 동작하지 않습니다)', 'warn');
        })
        .then(function () { setDirty(false); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
