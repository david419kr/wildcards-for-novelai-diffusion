// injector.js
(() => {
  const TARGET = 'https://image.novelai.net/ai/generate-image';
  const WILDCARD = /__([A-Za-z0-9_-]+)__/g;
  let dict = {};

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === '__WILDCARD_INIT__' || e.data?.type === '__WILDCARD_UPDATE__')
      dict = e.data.map || {};
  });

  /******** 1. swap logic ********/
  const swap = txt => txt.replace(WILDCARD, (_, name) => {
    let raw = dict[name];
    if (!raw) return _;

    raw = raw
      .replace(/\\\(/g, '(')   // \(  → (
      .replace(/\\\)/g, ')');  // \)  → )
  
    const parts = raw.split(/\r?\n/).filter(Boolean);
    return parts.length ? `||${parts.join('|')}||` : _;
  });

  const deepSwap = o => {
    if (typeof o === 'string') return swap(o);
    if (Array.isArray(o))      return o.map(deepSwap);
    if (o && typeof o === 'object') {
      for (const k in o) {
        o[k] = deepSwap(o[k]);
        if (k === 'char_captions' && Array.isArray(o[k]) && o[k].length > 6)
          o[k] = o[k].slice(0, 6);
      }
    }
    return o;
  };

  /******** 2‑A. fetch patch ********/
  const $fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input.url;
      const m   = (init.method || input.method || 'GET').toUpperCase();
      if (m === 'POST' && url.startsWith(TARGET)) {
        let body = init.body || (input instanceof Request ? input.body : null);
        if (body) {
          const txt  = typeof body === 'string' ? body : await new Response(body).text();
          const json = JSON.parse(txt);
          const newB = JSON.stringify(deepSwap(json));

          if (typeof input === 'string') {
            init = { ...init, body: newB };
          } else {
            input = new Request(input, { body: newB });
          }
        }
      }
    } catch (e) { console.error('[Wildcard] fetch patch error:', e); }
    return $fetch(input, init);
  };

  /******** 2‑B. XHR patch ********/
  const $open = XMLHttpRequest.prototype.open;
  const $send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (m, url, ...rest) {
    this.__wild_m = m; this.__wild_u = url;
    return $open.call(this, m, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__wild_m?.toUpperCase() === 'POST' && this.__wild_u?.startsWith(TARGET) && typeof body === 'string') {
        const newBody = JSON.stringify(deepSwap(JSON.parse(body)));
        return $send.call(this, newBody);
      }
    } catch (e) { console.error('[Wildcard] XHR patch error:', e); }
    return $send.call(this, body);
  };

    /******* 3. Autocomplete ********/
  (function initWildcardAutocomplete_PM () {
    /* ---------- 0. 스타일 ---------- */
    const STYLE = `
    .wildcard-suggest{
      position:absolute; z-index:2147483647; background:#222; color:#fff;
      border:1px solid #555; border-radius:4px; font-size:12px;
      max-height:240px; overflow-y:auto; box-shadow:0 2px 8px #000a;
    }
    .wildcard-suggest li{padding:3px 8px; cursor:pointer; white-space:nowrap;}
    .wildcard-suggest li.active{background:#444;}
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    /* ---------- 1. 에디터 탐색 ---------- */
    const seen = new WeakSet();
    const mo   = new MutationObserver(scan);
    mo.observe(document, {childList:true, subtree:true});
    scan();

    function scan () {
      document.querySelectorAll('div.ProseMirror[contenteditable="true"]')
        .forEach(el => { if (!seen.has(el)) hook(el); });
    }

    /* ---------- 2. 에디터 훅 ---------- */
    function hook (editor) {
      seen.add(editor);

      const list = document.createElement('ul');
      list.className = 'wildcard-suggest';
      list.style.display = 'none';
      document.body.appendChild(list);

      let selIdx = -1;

      editor.addEventListener('input',  update);
      editor.addEventListener('keydown', nav);
      editor.addEventListener('blur',   hide, true);   // capture

      /* ── 2‑A. caret 앞 텍스트 ── */
      function textBeforeCaret () {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return '';
        const rng = sel.getRangeAt(0).cloneRange();
        rng.collapse(true);
        rng.setStart(editor, 0);
        return rng.toString();
      }

      /* ── 2‑B. 제안 목록 갱신 ── */
      function update () {
        const txt = textBeforeCaret();

        /* ① 라인(토큰 내부) 자동완성?  __name__partial  패턴 */
        let m = txt.match(/__([A-Za-z0-9_-]+)__(?:([A-Za-z0-9 \-_]*))$/);
        if (m && dict[m[1]]) {
          const fileKey = m[1];
          const part    = (m[2] || '').toLowerCase();

          const lines = dict[fileKey]
            .replace(/\\\(/g,'(').replace(/\\\)/g,')')        // \(, \) 정리
            .split(/\r?\n/)
            .filter(Boolean)
            .filter(l => l.toLowerCase().startsWith(part))
            .slice(0, 100);                                   // 과도한 리스트 방지

          if (lines.length) {
            render(lines.map(l => ({type:'value', text:l, key:fileKey})));
            return;
          }
        }

        /* ② 토큰 이름 자동완성  __partial  패턴 */
        m = txt.match(/__([A-Za-z0-9_-]*)$/);
        if (m) {
          const prefix = m[1].toLowerCase();
          const keys   = Object.keys(dict)
                        .filter(k => k.toLowerCase().startsWith(prefix))
                        .sort();
          if (keys.length) {
            render(keys.map(k => ({type:'token', text:`__${k}__`})));
            return;
          }
        }

        hide();
      }

      /* ── 2‑C. 렌더링 & 위치 ── */
      function render (items) {
        list.innerHTML = '';
        items.forEach(({type,text}) => {
          const li = document.createElement('li');
          li.textContent = text;
          li.dataset.type = type;          // token | value
          list.appendChild(li);
        });
        selIdx = 0; highlight();

        /* caret 좌표 */
        const sel = window.getSelection();
        const rng = sel.getRangeAt(0).cloneRange();
        const rect= rng.getBoundingClientRect();
        list.style.left   = (rect.left + window.scrollX) + 'px';
        list.style.top    = (rect.bottom + window.scrollY + 2) + 'px';
        list.style.display= 'block';
      }

      /* ── 2‑D. 키보드 네비 ── */
      function nav (e) {
        if (list.style.display === 'none') return;

        const items = list.querySelectorAll('li');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault(); selIdx = (selIdx + 1) % items.length; highlight();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); selIdx = (selIdx - 1 + items.length) % items.length; highlight();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault(); choose(items[selIdx]);
        } else if (e.key === 'Escape') {
          hide();
        }
      }

      /* ── 2‑E. 마우스 선택 ── */
      list.addEventListener('mousedown', e => {
        if (e.target.tagName === 'LI') {
          e.preventDefault(); choose(e.target);
        }
      });

      /* ── 2‑F. 삽입 로직 ── */
      function choose (li) {
        const type = li.dataset.type;
        const text = li.textContent;
        const sel  = window.getSelection();
        const rng  = sel.getRangeAt(0);

        if (type === 'token') {
          /* __partial → __key__ */
          const before = rng.cloneRange();
          before.setStart(editor, 0);
          const len = before.toString().match(/__([A-Za-z0-9_-]*)$/)[0].length;
          rng.setStart(rng.endContainer, rng.endOffset - len);
          rng.deleteContents();
          rng.insertNode(document.createTextNode(text));
          sel.collapse(rng.endContainer, rng.endOffset - 0);
        } else { /* value */
          /* __name__partial → lineText */
          const before = rng.cloneRange();
          before.setStart(editor, 0);
          const len = before.toString()
                    .match(/__([A-Za-z0-9_-]+)__(?:[A-Za-z0-9 \-_]*)$/)[0].length;
          rng.setStart(rng.endContainer, rng.endOffset - len);
          rng.deleteContents();
          rng.insertNode(document.createTextNode(text));
          sel.collapse(rng.endContainer, rng.endOffset);
        }
        hide();
      }

      function highlight () {
        list.querySelectorAll('li').forEach((li,i)=>
          li.classList.toggle('active', i===selIdx));
      }
      function hide () { list.style.display='none'; selIdx=-1; }
    }
  })();


  console.log('[Wildcard] injector ready');
})();


