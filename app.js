/* =========================================================================
   Hedon139 — 헤돈139  ·  portfolio front-end
   app.js  (ES2017, no build step)
   ========================================================================= */
(function () {
  'use strict';

  var DRAFT_KEY = 'hedon139.draft'; /* admin.html 이 저장하는 임시 편집본 키 */
  var WORKS_PAGE = 12;             /* 처음에 보여 줄 작품 수 */
  var WORKS_MORE = 12;             /* 더 보기 한 번에 추가할 작품 수 */

  /* ---------------------------------------------------------- offline copy
     data/portfolio.json 을 읽지 못했을 때(예: index.html 을 파일로 바로 연 경우)
     화면이 비어 보이지 않도록 쓰는 최소 사본입니다. 실제 데이터 원본은 언제나
     data/portfolio.json 입니다. --------------------------------------------- */
  var FALLBACK = {
    profile: {
      name: 'Hedon139',
      nameKo: '헤돈139',
      tagline: 'Hedon is Everywhere',
      genre: 'Romantic Punk · Graffiti & Neo-Pop Art',
      crew: 'Unlimited Crew',
      manifesto: 'Love is sweet.\nLove bites.',
      statement: ['작품 데이터를 불러오지 못해 임시 화면을 보여 주고 있습니다.'],
      instagram: { handle: '@hedonhideul139', url: 'https://www.instagram.com/hedonhideul139' }
    },
    works: [
      { id: 'w001', title: 'Seven Hevils: Luxuria 1', series: 'Seven Hevils', year: '2024', size: 'F30 · 90.9 × 72.7 cm', medium: '캔버스에 혼합매체', image: 'images/works/w01-seven-hevils-luxuria-1.jpg' },
      { id: 'w015', title: 'Romantic Punk', series: 'Romantic Punk', year: '2025', size: 'F30 · 90.9 × 72.7 cm', medium: '캔버스에 혼합매체', image: 'images/works/w15-romantic-punk.jpg' }
    ],
    murals: [],
    exhibitions: [],
    performances: [],
    awards: []
  };

  var KIND_LABEL = { solo: '개인전', group: '단체전', fair: '아트페어' };

  var state = {
    data: null,
    workFilter: 'all',
    worksShown: WORKS_PAGE,
    recordTab: 'exhibitions',
    exhFilter: 'all',
    offline: false
  };

  /* -------------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* -------------------------------------------------------- data loading */
  function normalize(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var profile = data.profile && typeof data.profile === 'object' ? data.profile : {};
    var ig = profile.instagram && typeof profile.instagram === 'object' ? profile.instagram : {};
    var handle = String(ig.handle || '').trim();
    var url = String(ig.url || '').trim();
    if (!url && handle) url = 'https://www.instagram.com/' + handle.replace(/^@/, '');

    var works = (Array.isArray(data.works) ? data.works : []).filter(function (w) {
      return w && (w.title || w.image);
    }).map(function (w, i) {
      return {
        id: String(w.id || 'w' + i),
        title: String(w.title || 'Untitled'),
        series: String(w.series || ''),
        year: String(w.year || ''),
        size: String(w.size || ''),
        medium: String(w.medium || ''),
        image: String(w.image || ''),
        ratio: Number(w.ratio) > 0 ? Number(w.ratio) : 0,
        description: String(w.description || '')
      };
    });

    var murals = (Array.isArray(data.murals) ? data.murals : []).filter(function (m) {
      return m && (m.title || m.image);
    }).map(function (m, i) {
      return {
        id: String(m.id || 'm' + i),
        title: String(m.title || ''),
        venue: String(m.venue || ''),
        city: String(m.city || ''),
        year: String(m.year || ''),
        image: String(m.image || ''),
        ratio: Number(m.ratio) > 0 ? Number(m.ratio) : 0,
        note: String(m.note || '')
      };
    });

    var exh = (Array.isArray(data.exhibitions) ? data.exhibitions : []).filter(function (e) {
      return e && (e.title || e.venue);
    }).map(function (e, i) {
      var kind = String(e.kind || 'group');
      if (kind !== 'solo' && kind !== 'group' && kind !== 'fair') kind = 'group';
      return {
        id: String(e.id || 'x' + i),
        kind: kind,
        start: String(e.start || e.date || ''),
        end: String(e.end || ''),
        period: String(e.period || e.date || ''),
        title: String(e.title || ''),
        venue: String(e.venue || ''),
        city: String(e.city || ''),
        detail: String(e.detail || ''),
        note: String(e.note || KIND_LABEL[kind])
      };
    });

    var perf = (Array.isArray(data.performances) ? data.performances : []).filter(function (p) {
      return p && (p.title || p.venue);
    }).map(function (p, i) {
      return {
        id: String(p.id || 'p' + i),
        date: String(p.date || ''),
        title: String(p.title || ''),
        venue: String(p.venue || ''),
        city: String(p.city || '')
      };
    });

    var awards = (Array.isArray(data.awards) ? data.awards : []).filter(function (a) {
      return a && (a.title || a.venue);
    }).map(function (a, i) {
      return {
        id: String(a.id || 'a' + i),
        date: String(a.date || ''),
        end: String(a.end || ''),
        title: String(a.title || ''),
        venue: String(a.venue || ''),
        city: String(a.city || ''),
        type: String(a.type || '프로젝트')
      };
    });

    var statement = profile.statement;
    if (typeof statement === 'string') {
      statement = statement.split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (!Array.isArray(statement)) statement = [];

    return {
      profile: {
        name: String(profile.name || 'Hedon139'),
        nameKo: String(profile.nameKo || ''),
        tagline: String(profile.tagline || ''),
        genre: String(profile.genre || ''),
        crew: String(profile.crew || ''),
        portrait: String(profile.portrait || ''),
        manifesto: String(profile.manifesto || ''),
        statement: statement.map(String),
        statementEn: (Array.isArray(profile.statementEn) ? profile.statementEn : []).map(String).filter(Boolean),
        bioEn: String(profile.bioEn || ''),
        genreEn: String(profile.genreEn || ''),
        basedIn: String(profile.basedIn || ''),
        characters: (Array.isArray(profile.characters) ? profile.characters : []).map(function (c) {
          c = c || {};
          return {
            name: String(c.name || ''),
            nameKo: String(c.nameKo || ''),
            role: String(c.role || ''),
            descEn: String(c.descEn || '')
          };
        }).filter(function (c) { return c.name; }),
        instagram: { handle: handle, url: url }
      },
      works: works,
      murals: murals,
      exhibitions: exh,
      performances: perf,
      awards: awards
    };
  }

  /* 임시본에 담긴(아직 깃허브에 올리지 않은) 이미지 data URL 을 미리보기에 끼워 넣는다 */
  function applyDraftImages(draft) {
    var data = draft.data;
    var imgs = draft.draftImages;
    if (!imgs || !data) return data;
    var copy = JSON.parse(JSON.stringify(data));
    ['works', 'murals'].forEach(function (key) {
      if (!Array.isArray(copy[key])) return;
      copy[key].forEach(function (item) {
        var m = /^images\/(.+)$/.exec(item.image || '');
        if (m && imgs[m[1]]) item.image = imgs[m[1]];
      });
    });
    return copy;
  }

  function readDraft() {
    try {
      var raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.data) return parsed;
    } catch (err) { /* 저장된 초안이 깨졌으면 무시하고 실제 데이터를 쓴다 */ }
    return null;
  }

  function loadData() {
    var params = {};
    try {
      new URLSearchParams(window.location.search).forEach(function (v, k) { params[k] = v; });
    } catch (err) { /* 구형 브라우저: 미리보기 없이 진행 */ }

    if (params.preview === '1') {
      var draft = readDraft();
      if (draft) {
        var banner = $('#previewBanner');
        if (banner) banner.hidden = false;
        return Promise.resolve(applyDraftImages(draft));
      }
    }

    return fetch('./data/portfolio.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        if (window.console && console.warn) {
          console.warn('[Hedon139] portfolio.json 을 불러오지 못해 내장 사본으로 표시합니다.', err);
        }
        state.offline = true;
        return FALLBACK;
      });
  }

  /* -------------------------------------------------------------- render */
  function renderHeroTitle(p) {
    var title = $('.hero-title');
    if (!title) return;
    var tagline = String(p.tagline || 'Hedon is Everywhere').trim();
    if (!tagline) return;
    var words = tagline.split(/\s+/);
    var line1 = words[0];
    var line2 = '';
    var line3 = '';
    if (words.length === 1) {
      line3 = '';
    } else if (words.length === 2) {
      line3 = words[1];
    } else {
      line2 = words.slice(1, -1).join(' ');
      line3 = words[words.length - 1];
    }
    var html = '<span class="line line-1">' + esc(line1) + '</span>';
    if (line2) html += '<span class="line line-2">' + esc(line2) + '</span>';
    if (line3) html += '<span class="line line-3">' + esc(line3) + '</span>';
    title.innerHTML = html;
  }

  function bindProfile() {
    var p = state.data.profile;
    renderHeroTitle(p);

    $$('[data-bind]').forEach(function (el) {
      var key = el.getAttribute('data-bind');
      if (key === 'worksCount') {
        el.textContent = state.data.works.length ? '— ' + state.data.works.length + '점' : '';
        return;
      }
      if (key === 'muralsCount') {
        el.textContent = state.data.murals.length ? '— ' + state.data.murals.length + '곳' : '';
        return;
      }
      if (key === 'ig-handle') {
        el.textContent = p.instagram.handle || '@hedonhideul139';
        return;
      }
      if (p[key]) el.textContent = p[key];
    });

    if (p.instagram.url) {
      $$('[data-instagram]').forEach(function (a) {
        a.setAttribute('href', p.instagram.url);
      });
    }

    document.title = (p.name || 'Hedon139') +
      (p.nameKo ? ' (' + p.nameKo + ')' : '') +
      ' | 로맨틱 펑크 그래피티 아티스트 공식 포트폴리오';

    var desc = $('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content',
        (p.name || 'Hedon139') + (p.nameKo ? '(' + p.nameKo + ')' : '') + ' — ' +
        '로맨틱 펑크(Romantic Punk) 그래피티·네오 팝아트 작가. ' +
        '아기 천사 헨젤(Hangel)과 아기 악마 헤빌(Hevil)로 사랑의 달콤함과 위험한 이면을 그립니다. ' +
        '작품 ' + state.data.works.length + '점, 전시 ' + state.data.exhibitions.length + '회, ' +
        '벽화 ' + state.data.murals.length + '곳. 전시·벽화 의뢰는 인스타그램 DM.');
    }
  }

  function renderHeroStats() {
    var host = $('#heroStats');
    if (!host) return;
    var rows = [
      ['Works', state.data.works.length],
      ['Murals', state.data.murals.length],
      ['Exhibitions', state.data.exhibitions.length],
      ['Live', state.data.performances.length]
    ].filter(function (r) { return r[1] > 0; });

    host.innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('');
  }

  function renderHeroStack() {
    var host = $('#heroStack');
    if (!host) return;
    var works = state.data.works;
    function pick(re) {
      for (var i = 0; i < works.length; i++) {
        if (re.test(works[i].title)) return works[i];
      }
      return null;
    }
    var chosen = [
      pick(/Romantic Punk/i),
      pick(/Black Book/i),
      pick(/오늘부터 아기로/),
      pick(/Leopard/i)
    ].filter(Boolean);

    chosen = chosen.concat(works).slice(0, 3);

    host.innerHTML = chosen.map(function (w, i) {
      var ratio = w.ratio ? ' style="aspect-ratio:' + w.ratio + '"' : '';
      return '<figure class="hero-card hero-card-' + (i + 1) + '"' + ratio + '>' +
        '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + '" ' +
        (i === 0 ? '' : 'loading="lazy" ') + 'decoding="async">' +
        '</figure>';
    }).join('');
  }

  function renderTicker() {
    var track = $('#tickerTrack');
    if (!track) return;
    var p = state.data.profile;
    var words = [
      p.tagline || 'HEDON IS EVERYWHERE',
      'ROMANTIC PUNK',
      'GRAFFITI & NEO-POP',
      '헤돈은 어디에나',
      p.crew || 'UNLIMITED CREW',
      'HEDON IS EVERYWHERE',
      'SINCE 139'
    ];

    function makeRun() {
      return words.map(function (w) {
        return '<span class="ticker-item"><em>' + esc(w) + '</em><b>✦</b></span>';
      }).join('');
    }
    track.innerHTML = makeRun() + makeRun();
  }

  /* ---------------------------------------------------------------- works */
  function workSeries() {
    var seen = {};
    var out = [];
    state.data.works.forEach(function (w) {
      var s = w.series || 'Other';
      if (!seen[s]) { seen[s] = 0; out.push(s); }
      seen[s] += 1;
    });
    return { list: out, counts: seen };
  }

  function filteredWorks() {
    return state.data.works.filter(function (w) {
      return state.workFilter === 'all' || (w.series || 'Other') === state.workFilter;
    });
  }

  function renderWorkFilters() {
    var host = $('#workFilters');
    if (!host) return;
    var info = workSeries();
    var total = state.data.works.length;
    var items = [{ key: 'all', label: 'All', n: total }].concat(
      info.list.map(function (s) { return { key: s, label: s, n: info.counts[s] }; })
    );

    host.innerHTML = items.map(function (it) {
      return '<button class="filter" type="button" role="tab" aria-selected="' +
        (state.workFilter === it.key ? 'true' : 'false') + '" data-work-filter="' + esc(it.key) + '">' +
        esc(it.label) + '<span class="n">' + it.n + '</span></button>';
    }).join('');
  }

  function workCard(w, i) {
    var showSeries = w.series && w.title.indexOf(w.series) !== 0 ? w.series : '';
    var sub = [showSeries, w.medium].filter(Boolean).join(' · ');
    var img = w.image
      ? '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + ' 작품 이미지" loading="' +
        (i < 3 ? 'eager' : 'lazy') + '" decoding="async">'
      : placeholderMarkup(w.title);

    return '<article class="work-card" style="animation-delay:' + Math.min(i * 40, 320) + 'ms">' +
      '<div class="work-media" data-work-open="' + esc(w.id) + '" role="button" tabindex="0" ' +
      'aria-label="' + esc(w.title) + ' 크게 보기">' +
      img +
      '<span class="work-view">View ↗</span>' +
      '</div>' +
      '<div class="work-info">' +
      '<div><h3 class="work-title">' + esc(w.title) + '</h3>' +
      (sub ? '<p class="work-sub">' + esc(sub) + '</p>' : '') +
      '</div>' +
      (w.year ? '<span class="work-year">' + esc(w.year) + '</span>' : '') +
      '</div>' +
      '</article>';
  }

  function renderWorks() {
    var grid = $('#worksGrid');
    var msg = $('#worksState');
    var more = $('#worksMore');
    if (!grid) return;

    var list = filteredWorks();
    var shown = list.slice(0, state.worksShown);

    grid.innerHTML = shown.map(workCard).join('');

    if (more) {
      var left = list.length - shown.length;
      more.hidden = left <= 0;
      if (left > 0) {
        var cnt = $('#worksMoreCount');
        if (cnt) cnt.textContent = '(+' + Math.min(left, WORKS_MORE) + ')';
      }
    }

    if (msg) {
      if (!list.length) {
        msg.hidden = false;
        msg.textContent = state.data.works.length
          ? '이 시리즈에는 아직 등록된 작품이 없습니다.'
          : '아직 등록된 작품이 없습니다. admin.html 에서 작품을 추가해 보세요.';
      } else if (state.offline) {
        msg.hidden = false;
        msg.innerHTML = '지금은 <code>data/portfolio.json</code> 을 읽지 못해 내장된 예시 데이터로 보여주고 있습니다. ' +
          '파일을 직접 열었다면 로컬 서버(<code>python3 -m http.server</code>)나 GitHub Pages 주소로 열어 주세요.';
      } else {
        msg.hidden = true;
      }
    }

    $$('img', grid).forEach(function (img) {
      img.addEventListener('error', function () {
        var holder = document.createElement('div');
        holder.className = 'work-media-empty';
        holder.textContent = '?';
        holder.setAttribute('aria-hidden', 'true');
        if (img.parentNode) img.parentNode.replaceChild(holder, img);
      });
    });

    $$('[data-work-open]', grid).forEach(function (node) {
      var id = node.getAttribute('data-work-open');
      node.addEventListener('click', function () {
        openGallery(workGallery(), id);
      });
      node.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openGallery(workGallery(), id);
        }
      });
    });

    revealScan(grid);
  }

  function placeholderMarkup(title) {
    var initial = String(title || 'H').trim().charAt(0).toUpperCase();
    return '<div class="work-media-empty" aria-hidden="true" style="display:grid;place-items:center;width:100%;height:100%;' +
      'background:linear-gradient(150deg,rgba(255,79,163,.18),rgba(255,246,251,.03));' +
      'font-family:var(--font-en);font-size:56px;font-weight:700;color:rgba(255,246,251,.35)">' +
      esc(initial) + '</div>';
  }

  /* --------------------------------------------------------------- murals */
  function renderMurals() {
    var host = $('#muralGrid');
    var msg = $('#muralState');
    if (!host) return;

    host.innerHTML = state.data.murals.map(function (m, i) {
      return '<article class="mural-card">' +
        '<div class="mural-media" data-mural-open="' + esc(m.id) + '" role="button" tabindex="0" ' +
        'aria-label="' + esc(m.title) + ' 크게 보기">' +
        (m.image ? '<img src="' + esc(m.image) + '" alt="' + esc(m.title) + ' 벽화" loading="' +
          (i < 2 ? 'eager' : 'lazy') + '" decoding="async">' : placeholderMarkup(m.title)) +
        '<span class="work-view">View ↗</span>' +
        '</div>' +
        '<div class="mural-info">' +
        '<div>' +
        '<h3 class="mural-title">' + esc(m.title) + '</h3>' +
        (m.venue || m.city ? '<p class="mural-sub">' + esc([m.venue, m.city].filter(Boolean).join(' · ')) + '</p>' : '') +
        '</div>' +
        (m.year ? '<span class="work-year">' + esc(m.year) + '</span>' : '') +
        '</div>' +
        '</article>';
    }).join('');

    $$('[data-mural-open]', host).forEach(function (node) {
      var id = node.getAttribute('data-mural-open');
      function go() { openGallery(muralGallery(), id); }
      node.addEventListener('click', go);
      node.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    });

    if (msg) msg.hidden = state.data.murals.length > 0 || !state.offline;
    revealScan(host);
  }

  /* --------------------------------------------------------------- records */
  function renderRecordTabs() {
    var host = $('#recordTabs');
    if (!host) return;
    var items = [
      { key: 'exhibitions', label: '전시', n: state.data.exhibitions.length },
      { key: 'performances', label: '퍼포먼스', n: state.data.performances.length },
      { key: 'awards', label: '수상 · 프로젝트', n: state.data.awards.length }
    ];
    host.innerHTML = items.map(function (it) {
      return '<button class="record-tab" type="button" role="tab" aria-selected="' +
        (state.recordTab === it.key ? 'true' : 'false') + '" data-record-tab="' + it.key + '">' +
        esc(it.label) + '<span class="n">' + it.n + '</span></button>';
    }).join('');
  }

  function renderRecordPanels() {
    $$('[data-record-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-record-panel') !== state.recordTab;
    });
  }

  function renderExhFilters() {
    var host = $('#exhFilters');
    if (!host) return;
    var counts = { all: state.data.exhibitions.length, solo: 0, group: 0, fair: 0 };
    state.data.exhibitions.forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });

    var items = [
      { key: 'all', label: '전체', n: counts.all },
      { key: 'solo', label: KIND_LABEL.solo, n: counts.solo },
      { key: 'group', label: KIND_LABEL.group, n: counts.group },
      { key: 'fair', label: KIND_LABEL.fair, n: counts.fair }
    ];

    host.innerHTML = items.map(function (it) {
      return '<button class="filter" type="button" role="tab" aria-selected="' +
        (state.exhFilter === it.key ? 'true' : 'false') + '" data-exh-filter="' + it.key + '">' +
        esc(it.label) + '<span class="n">' + it.n + '</span></button>';
    }).join('');
  }

  function yearOf(item) {
    var d = String(item.start || item.date || '');
    var m = /^(\d{4})/.exec(d);
    return m ? m[1] : '—';
  }

  function groupByYear(list) {
    var groups = [];
    var byYear = {};
    list.forEach(function (item) {
      var y = yearOf(item);
      if (!byYear[y]) { byYear[y] = { year: y, items: [] }; groups.push(byYear[y]); }
      byYear[y].items.push(item);
    });
    groups.sort(function (a, b) {
      if (a.year === '—') return 1;
      if (b.year === '—') return -1;
      return a.year < b.year ? 1 : a.year > b.year ? -1 : 0;
    });
    return groups;
  }

  function sortByDateDesc(list) {
    return list.map(function (item, i) { return { item: item, i: i, k: String(item.start || item.date || '') }; })
      .sort(function (a, b) {
        if (a.k && b.k) return a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i;
        if (a.k && !b.k) return -1;
        if (!a.k && b.k) return 1;
        return a.i - b.i;
      })
      .map(function (row) { return row.item; });
  }

  function renderTimeline() {
    var host = $('#timeline');
    var msg = $('#exhState');
    if (!host) return;

    var list = state.data.exhibitions.filter(function (e) {
      return state.exhFilter === 'all' || e.kind === state.exhFilter;
    });

    host.innerHTML = groupByYear(sortByDateDesc(list)).map(function (g) {
      var head = g.year === '—'
        ? '<span class="no-year">SELECTED</span>'
        : esc(g.year) + '<em>' + g.items.length + '</em>';

      return '<div class="tl-group reveal">' +
        '<h3 class="tl-year">' + head + '</h3>' +
        '<ul class="tl-list">' +
        g.items.map(function (e) {
          return '<li class="tl-item">' +
            '<span class="tl-date">' + esc(e.period || e.start || '—') + '</span>' +
            '<div class="tl-main">' +
            '<p class="tl-title">' +
            (e.title ? '<span class="q">《</span>' + esc(e.title) + '<span class="q">》</span>' : '') +
            '</p>' +
            (e.venue || e.city ? '<p class="tl-venue">' + esc([e.venue, e.city].filter(Boolean).join(', ')) + '</p>' : '') +
            (e.detail ? '<p class="tl-detail">' + esc(e.detail) + '</p>' : '') +
            '</div>' +
            '<span class="tl-kind" data-kind="' + esc(e.kind) + '">' +
            esc(e.note || KIND_LABEL[e.kind] || '') + '</span>' +
            '</li>';
        }).join('') +
        '</ul></div>';
    }).join('');

    if (msg) {
      if (!list.length) { msg.hidden = false; msg.textContent = '해당하는 전시 기록이 아직 없습니다.'; }
      else msg.hidden = true;
    }
    revealScan(host);
  }

  function fmtDate(value) {
    var v = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.replace(/-/g, '.') : v;
  }

  function rangeLabel(item) {
    var s = fmtDate(item.start || item.date || '');
    var e = fmtDate(item.end || '');
    if (!s) return '';
    if (!e || e === s) return s;
    return s + ' — ' + e;
  }

  function renderPerformances() {
    var host = $('#perfTimeline');
    if (!host) return;
    var list = sortByDateDesc(state.data.performances);
    if (!list.length) {
      var msg = $('#perfState');
      if (msg) { msg.hidden = false; msg.textContent = '등록된 퍼포먼스 기록이 없습니다.'; }
      host.innerHTML = '';
      return;
    }
    host.innerHTML = list.map(function (p) {
      return '<article class="rec-row reveal">' +
        '<span class="rec-date">' + esc(fmtDate(p.date) || '—') + '</span>' +
        '<div class="rec-main">' +
        '<h3 class="rec-title">' + esc(p.title) + '</h3>' +
        '<p class="rec-venue">' + esc([p.venue, p.city].filter(Boolean).join(', ')) + '</p>' +
        '</div>' +
        '<span class="rec-kind">Live</span>' +
        '</article>';
    }).join('');
    revealScan(host);
  }

  function renderAwards() {
    var host = $('#awardTimeline');
    if (!host) return;
    var list = sortByDateDesc(state.data.awards);
    if (!list.length) {
      var msg = $('#awardState');
      if (msg) { msg.hidden = false; msg.textContent = '등록된 수상·프로젝트 기록이 없습니다.'; }
      host.innerHTML = '';
      return;
    }
    host.innerHTML = list.map(function (a) {
      return '<article class="rec-row reveal">' +
        '<span class="rec-date">' + esc(rangeLabel(a) || '—') + '</span>' +
        '<div class="rec-main">' +
        '<h3 class="rec-title">' + esc(a.title) + '</h3>' +
        '<p class="rec-venue">' + esc([a.venue, a.city].filter(Boolean).join(', ')) + '</p>' +
        '</div>' +
        '<span class="rec-kind" data-type="' + esc(a.type) + '">' + esc(a.type) + '</span>' +
        '</article>';
    }).join('');
    revealScan(host);
  }

  /* ---------------------------------------------------------------- about */
  function renderAbout() {
    var p = state.data.profile;

    var fig = $('#aboutPortrait');
    if (fig) {
      if (p.portrait) {
        var im = $('#aboutPortraitImg');
        if (im) im.src = p.portrait;
        fig.hidden = false;
      } else {
        fig.hidden = true;
      }
    }

    var st = $('#statement');
    if (st) {
      st.innerHTML = p.statement.map(function (line) {
        return '<p>' + esc(line) + '</p>';
      }).join('');
    }

    var mf = $('#manifesto');
    if (mf) {
      if (p.manifesto) {
        mf.textContent = p.manifesto;
        mf.hidden = false;
      } else {
        mf.hidden = true;
      }
    }

    renderEnglishNote(p);

    var facts = $('#facts');
    if (facts) {
      var rows = [];
      if (p.name) {
        rows.push(['Artist', esc(p.name) + (p.nameKo ? ' <span style="color:var(--muted-2)">/ ' + esc(p.nameKo) + '</span>' : '')]);
      }
      if (p.genre) rows.push(['Genre', esc(p.genre)]);
      if (p.basedIn) rows.push(['Based in', esc(p.basedIn)]);
      if (p.crew) rows.push(['Crew', esc(p.crew)]);
      rows.push(['Character', '헨젤 <span style="color:var(--muted-2)">(아기 천사)</span> · 헤빌 <span style="color:var(--muted-2)">(아기 악마)</span>']);
      rows.push(['Material', '스프레이 락카 · 젤스톤 · 모델링 페이스트 · 아크릴']);
      if (p.instagram.handle && p.instagram.url) {
        rows.push(['Instagram', '<a href="' + esc(p.instagram.url) + '" target="_blank" rel="noopener">' +
          esc(p.instagram.handle) + '</a>']);
      }
      facts.innerHTML = rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('');
    }
  }

  /* 영문 아티스트 노트 — 해외 큐레이터·심사위원·방문자용 (data/portfolio.json 의 profile.*En) */
  function renderEnglishNote(p) {
    var host = $('#artist-note-en');
    if (!host) return;

    var hasAny = (p.statementEn && p.statementEn.length) || p.bioEn || (p.characters && p.characters.length);
    host.hidden = !hasAny;
    if (!hasAny) return;

    var st = $('#statementEn');
    if (st) {
      st.innerHTML = (p.statementEn || []).map(function (line) {
        return '<p>' + esc(line) + '</p>';
      }).join('');
    }

    var bio = $('#bioEn');
    if (bio) {
      bio.textContent = p.bioEn || '';
      bio.hidden = !p.bioEn;
      if (bio.previousElementSibling) bio.previousElementSibling.hidden = !p.bioEn;
    }

    var facts = $('#enFacts');
    if (facts) {
      var rows = [];
      if (p.genreEn || p.genre) rows.push(['Genre', p.genreEn || p.genre]);
      if (p.basedIn) rows.push(['Based in', p.basedIn]);
      if (p.crew) rows.push(['Crew', p.crew]);
      if (p.instagram.handle && p.instagram.url) {
        rows.push(['Instagram', '<a href="' + esc(p.instagram.url) + '" target="_blank" rel="noopener">' +
          esc(p.instagram.handle) + '</a>']);
      }
      facts.innerHTML = rows.map(function (r) {
        return '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('');
      facts.hidden = !rows.length;
    }

    var chars = $('#enChars');
    if (chars) {
      chars.innerHTML = (p.characters || []).map(function (c) {
        return '<article class="en-char">' +
          '<div class="en-char-head">' +
          '<h4 class="en-char-name">' + esc(c.name) +
          (c.nameKo ? '<em>' + esc(c.nameKo) + '</em>' : '') + '</h4>' +
          (c.role ? '<p class="en-char-role">' + esc(c.role) + '</p>' : '') +
          '</div>' +
          (c.descEn ? '<p>' + esc(c.descEn) + '</p>' : '') +
          '</article>';
      }).join('');
      var head = chars.previousElementSibling;
      if (head && !chars.innerHTML) head.hidden = true;
    }
  }

  /* ------------------------------------------------------------- lightbox */
  var lb = {
    el: null,
    index: 0,
    list: [],
    lastFocus: null,
    kind: 'work'
  };

  function workGallery() {
    return filteredWorks().map(function (w) {
      return {
        id: w.id,
        image: w.image,
        kind: 'work',
        series: w.series,
        title: w.title,
        desc: w.description || '',
        meta: [w.year, w.size, w.medium].filter(Boolean)
      };
    });
  }

  function muralGallery() {
    return state.data.murals.map(function (m) {
      return {
        id: m.id,
        image: m.image,
        kind: 'mural',
        series: 'Mural',
        title: m.title,
        desc: m.note || '',
        meta: [m.year, m.venue, m.city].filter(Boolean)
      };
    });
  }

  function openGallery(list, id) {
    if (!list || !list.length) return;
    var idx = -1;
    list.forEach(function (item, i) { if (item.id === id) idx = i; });
    if (idx < 0) return;

    lb.list = list;
    lb.kind = list[0].kind;
    lb.lastFocus = document.activeElement;

    var info = list[idx];
    var seriesEl = $('#lbSeries');
    if (seriesEl) seriesEl.textContent = info.series || '';

    lb.el.hidden = false;
    document.body.classList.add('is-locked');
    showSlide(idx);

    var closeBtn = $('.lb-close', lb.el);
    if (closeBtn) closeBtn.focus();
  }

  function showSlide(i) {
    var total = lb.list.length;
    if (!total) return;
    lb.index = (i + total) % total;
    var item = lb.list[lb.index];

    var img = $('#lbImg');
    if (item.image) {
      img.src = item.image;
      img.style.visibility = 'visible';
    } else {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
    }
    img.alt = item.title + (lb.kind === 'mural' ? ' 벽화' : ' 작품 이미지');

    $('#lbTitle').textContent = item.title;
    $('#lbDesc').textContent = item.desc || '';
    $('#lbYear').textContent = item.meta[0] || '';
    $('#lbSize').textContent = item.meta[1] || '';
    $('#lbMedium').textContent = item.meta[2] || '';
    $('#lbIndex').textContent = String(lb.index + 1);
    $('#lbTotal').textContent = String(total);

    var multi = total > 1;
    $('.lb-prev', lb.el).style.display = multi ? '' : 'none';
    $('.lb-next', lb.el).style.display = multi ? '' : 'none';

    /* 옆 작품 미리 받아두기 */
    [lb.index + 1, lb.index - 1].forEach(function (j) {
      var next = lb.list[(j + total) % total];
      if (next && next.image && next.image.indexOf('data:') !== 0) {
        var pre = new Image();
        pre.src = next.image;
      }
    });

    var cap = $('.lb-caption', lb.el);
    if (cap) cap.scrollTop = 0;
  }

  function closeLightbox() {
    if (!lb.el || lb.el.hidden) return;
    lb.el.hidden = true;
    document.body.classList.remove('is-locked');
    $('#lbImg').removeAttribute('src');
    if (lb.lastFocus && lb.lastFocus.focus) lb.lastFocus.focus();
  }

  function bindLightbox() {
    lb.el = $('#lightbox');
    if (!lb.el) return;

    $('[data-lb-close]', lb.el).addEventListener('click', closeLightbox);
    $('[data-lb-prev]', lb.el).addEventListener('click', function () { showSlide(lb.index - 1); });
    $('[data-lb-next]', lb.el).addEventListener('click', function () { showSlide(lb.index + 1); });

    lb.el.addEventListener('click', function (ev) {
      if (ev.target === lb.el || ev.target.classList.contains('lb-stage')) closeLightbox();
    });

    document.addEventListener('keydown', function (ev) {
      if (lb.el.hidden) return;
      if (ev.key === 'Escape') { ev.preventDefault(); closeLightbox(); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); showSlide(lb.index + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); showSlide(lb.index - 1); }
      else if (ev.key === 'Tab') {
        var focusables = $$('button', lb.el).filter(function (b) { return b.offsetParent !== null; });
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });

    /* 모바일 스와이프 */
    var sx = 0, sy = 0;
    lb.el.addEventListener('touchstart', function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      sx = ev.touches[0].clientX;
      sy = ev.touches[0].clientY;
    }, { passive: true });

    lb.el.addEventListener('touchend', function (ev) {
      if (!ev.changedTouches || !ev.changedTouches.length) return;
      var dx = ev.changedTouches[0].clientX - sx;
      var dy = ev.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
        showSlide(lb.index + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------ navigation */
  function bindNav() {
    var nav = $('#nav');
    var toggle = $('.nav-toggle');
    var menu = $('#mobile-menu');

    function onScroll() {
      if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 24);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        toggle.setAttribute('aria-label', open ? '메뉴 열기' : '메뉴 닫기');
        menu.hidden = open;
      });

      $$('a', menu).forEach(function (a) {
        a.addEventListener('click', function () {
          toggle.setAttribute('aria-expanded', 'false');
          menu.hidden = true;
        });
      });
    }

    /* 현재 섹션 표시 */
    var links = $$('.nav-links a');
    var sections = links.map(function (a) {
      var id = a.getAttribute('href').replace('#', '');
      return { id: id, el: document.getElementById(id), link: a };
    }).filter(function (s) { return s.el; });

    if ('IntersectionObserver' in window && sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var match = sections.filter(function (s) { return s.el === entry.target; })[0];
          if (!match) return;
          if (entry.isIntersecting) {
            links.forEach(function (l) { l.classList.remove('is-active'); });
            match.link.classList.add('is-active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { io.observe(s.el); });
    }

    var year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* --------------------------------------------------------------- reveals */
  var revealObserver = null;

  function revealScan(root) {
    var nodes = $$('.reveal', root || document).filter(function (n) { return !n.classList.contains('is-in'); });
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    nodes.forEach(function (n) { revealObserver.observe(n); });
  }

  function prepareReveals() {
    $$('.section-head, .about-main, .about-side, .ig-card, .contact .section-index')
      .forEach(function (el) { el.classList.add('reveal'); });
    revealScan(document);
  }

  /* ------------------------------------------------------------------- init */
  function init() {
    bindNav();
    bindLightbox();

    document.addEventListener('click', function (ev) {
      var target = ev.target.closest ? ev.target : null;
      if (!target) return;

      var wf = target.closest('[data-work-filter]');
      if (wf) {
        state.workFilter = wf.getAttribute('data-work-filter');
        state.worksShown = WORKS_PAGE;
        renderWorkFilters();
        renderWorks();
        return;
      }

      var ef = target.closest('[data-exh-filter]');
      if (ef) {
        state.exhFilter = ef.getAttribute('data-exh-filter');
        renderExhFilters();
        renderTimeline();
        return;
      }

      var rt = target.closest('[data-record-tab]');
      if (rt) {
        state.recordTab = rt.getAttribute('data-record-tab');
        renderRecordTabs();
        renderRecordPanels();
        revealScan(document);
      }
    });

    var moreBtn = $('#worksMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        state.worksShown += WORKS_MORE;
        renderWorks();
      });
    }

    loadData().then(function (raw) {
      state.data = normalize(raw);
      bindProfile();
      renderHeroStats();
      renderHeroStack();
      renderTicker();
      renderWorkFilters();
      renderWorks();
      renderMurals();
      renderRecordTabs();
      renderRecordPanels();
      renderExhFilters();
      renderTimeline();
      renderPerformances();
      renderAwards();
      renderAbout();
      prepareReveals();
    }).catch(function (err) {
      if (window.console && console.error) console.error(err);
      var msg = $('#worksState');
      if (msg) {
        msg.hidden = false;
        msg.textContent = '작품 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
