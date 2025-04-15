// injector.js
(() => {
  const TARGET = 'https://image.novelai.net/ai/generate-image';
  const curlyPattern = /{(?:[^|{}]+\|)+[^|{}]+}/;
  const doublePipePattern = /\|\|(?:[^|]+\|)+[^|]+\|\|/;
  const simpleWildcardPattern = /__([A-Za-z0-9_-]+)__/;
  function containsWildcardSyntax(text) {
    return simpleWildcardPattern.test(text) ||
      curlyPattern.test(text) ||
      doublePipePattern.test(text);
  }
  let dict = {};
  let v3 = false;
  let preservePrompt = false; // img2img 프롬프트 유지 기능 플래그
  function waitForElement(selector) {
    return new Promise(resolve => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }
      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }
  /* -------------------------------------------------
   * 0. PNG 메타데이터 유틸 ────────────────────── */
  function extractPngMetadata(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < sig.length; i++) {
      if (dv.getUint8(i) !== sig[i]) throw new Error("Invalid PNG file.");
    }
    let off = 8;
    const meta = {};
    while (off < dv.byteLength) {
      if (off + 8 > dv.byteLength) break;
      const len = dv.getUint32(off); off += 4;
      let type = "";
      for (let i = 0; i < 4; i++) type += String.fromCharCode(dv.getUint8(off + i));
      off += 4;
      const chunk = new Uint8Array(arrayBuffer, off, len);
      off += len + 4;
      if (type === "tEXt") {
        const nul = chunk.indexOf(0);
        if (nul === -1) continue;
        const key = new TextDecoder("ascii").decode(chunk.slice(0, nul));
        const val = new TextDecoder("latin1").decode(chunk.slice(nul + 1));
        meta[key] = val;
      } else if (type === "iTXt") {
        let p = 0;
        const keyEnd = chunk.indexOf(0, p);
        if (keyEnd === -1) continue;
        const key = new TextDecoder("utf-8").decode(chunk.slice(p, keyEnd));
        p = keyEnd + 3;
        const langEnd = chunk.indexOf(0, p);
        if (langEnd === -1) continue;
        p = langEnd + 1;
        const transEnd = chunk.indexOf(0, p);
        if (transEnd === -1) continue;
        p = transEnd + 1;
        const val = new TextDecoder("utf-8").decode(chunk.slice(p));
        meta[key] = val;
      }
    }
    return meta;
  }
  async function applyImg2ImgMetadata(json) {
    try {
      if (json?.action !== 'img2img' || !json?.parameters?.image) return;
      const grid = await waitForElement(".display-grid-images");
      let img = null;
      grid.childNodes.forEach(c => {
        if (c.querySelector("img")) {
          img = c.querySelector("img");
        }
      });
      if (!img || !img.src) return alert("No image!");
      const ab = await (await fetch(img.src)).arrayBuffer();
      const raw = extractPngMetadata(ab);
      const commentChunk = raw.Comment;
      if (!commentChunk) return;
      const pngMeta = JSON.parse(commentChunk);
      /* 1) prompt / uc 반영 */
      if (pngMeta.prompt) json.input = pngMeta.prompt;
      /* 2) charPrompt 빌드 */
      const characterPrompts = [];
      const v4Prompt = pngMeta.v4_prompt;
      const v4NegativePrompt = pngMeta.v4_negative_prompt;
      if (v4Prompt?.caption?.char_captions?.length) {
        const pCaps = v4Prompt.caption.char_captions;
        const nCaps = (v4NegativePrompt?.caption?.char_captions) || [];
        const cnt = Math.min(pCaps.length, nCaps.length, 6);
        for (let i = 0; i < cnt; i++) {
          characterPrompts.push({
            prompt: pCaps[i].char_caption,
            uc: nCaps[i].char_caption,
            center: (pCaps[i].centers?.[0]) || { x: 0.5, y: 0.5 },
            enabled: true
          });
        }
      }
      /* 3) v4‑prompt 계열 세팅 */
      if (json.model === 'nai-diffusion-4-full' ||
        json.model === 'nai-diffusion-4-curated-preview') {
        json.parameters.v4_prompt = {
          caption: v4Prompt?.caption
            ?? { base_caption: pngMeta.prompt, char_captions: [] },
          use_coords: false,
          use_order: true
        };
        json.parameters.v4_negative_prompt = {
          caption: v4NegativePrompt?.caption
            ?? { base_caption: pngMeta.uc, char_captions: [] },
          legacy_uc: false
        };
        json.parameters.characterPrompts = characterPrompts;
      }
    } catch (err) {
      console.error('[Wildcard] img2img metadata 처리 오류:', err);
    }
  }
  /* ------------------------------------------------- */
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === '__WILDCARD_INIT__' || e.data?.type === '__WILDCARD_UPDATE__') {
      dict = e.data.map || {};
      v3 = !!e.data.v3;
      preservePrompt = !!e.data.preservePrompt; // preservePrompt 플래그 설정
    }
  });
  /******** 1. swap logic ********/
  function swap(txt) {
    let result = txt.replace(/__([A-Za-z0-9_-]+)__/g, (match, name) => {
      let raw = dict[name];
      if (!raw) return match;
      raw = raw.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return match;
      const forceV3 = lines.some(line => containsWildcardSyntax(line));
      const effectiveV3 = forceV3 || v3;
      if (effectiveV3) {
        return lines[Math.floor(Math.random() * lines.length)];
      } else {
        return `||${lines.join('|')}||`;
      }
    });
    result = result.replace(/{([^|{}]+(?:\|[^|{}]+)+)}/g, (match, group) => {
      const opts = group.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });
    result = result.replace(/\|\|((?:[^|]+\|)+[^|]+)\|\|/g, (match, group) => {
      const opts = group.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });
    return result;
  }
  function recursiveSwap(txt) {
    let current = txt;
    let iteration = 0;
    while (containsWildcardSyntax(current) && iteration < 100) {
      const next = swap(current);
      if (next === current) break;
      current = next;
      iteration++;
    }
    return current;
  }
  const deepSwap = o => {
    if (typeof o === 'string') return recursiveSwap(o);
    if (Array.isArray(o)) return o.map(deepSwap);
    if (o && typeof o === 'object') {
      for (const k in o) {
        o[k] = deepSwap(o[k]);
        if (k === 'char_captions' && Array.isArray(o[k]) && o[k].length > 6)
          o[k] = o[k].slice(0, 6);
      }
      return o;
    }
    return o;
  };
  /* 2‑A. fetch 패치 */
  const $fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input.url;
      const m = (init.method || input.method || 'GET').toUpperCase();
      if (m === 'POST' && url.startsWith(TARGET)) {
        let body = init.body || (input instanceof Request ? input.body : null);
        if (body) {
          const txt = typeof body === 'string' ? body
            : await new Response(body).text();
          let json = JSON.parse(txt);
          /* ① wildcard 치환 */
          json = deepSwap(json);
          /* ② img2img 메타데이터 반영 */
          if (preservePrompt) await applyImg2ImgMetadata(json);
          /* ③ cosmetic: base_caption = input */
          if (json?.parameters?.v4_prompt?.caption &&
            typeof json.parameters.v4_prompt.caption.base_caption !== 'undefined' &&
            typeof json.input === 'string') {
            json.parameters.v4_prompt.caption.base_caption = json.input;
          }
          const newBody = JSON.stringify(json);
          if (typeof input === 'string') {
            init = { ...init, body: newBody };
          } else {
            input = new Request(input, { body: newBody });
          }
        }
      }
    } catch (e) { console.error('[Wildcard] fetch patch error:', e); }
    return $fetch(input, init);
  };
  /* 2‑B. XHR 패치 */
  const $open = XMLHttpRequest.prototype.open;
  const $send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...rest) {
    this.__wild_m = m; this.__wild_u = url;
    return $open.call(this, m, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__wild_m?.toUpperCase() === 'POST' &&
        this.__wild_u?.startsWith(TARGET) &&
        typeof body === 'string') {
        let json = JSON.parse(body);
        /* ① wildcard 치환 */
        json = deepSwap(json);
        /* ② img2img 메타데이터 반영 */
        if (preservePrompt) applyImg2ImgMetadata(json);
        /* ③ cosmetic: base_caption = input */
        if (json?.parameters?.v4_prompt?.caption &&
          typeof json.parameters.v4_prompt.caption.base_caption !== 'undefined' &&
          typeof json.input === 'string') {
          json.parameters.v4_prompt.caption.base_caption = json.input;
        }
        const newBody = JSON.stringify(json);
        return $send.call(this, newBody);
      }
    } catch (e) { console.error('[Wildcard] XHR patch error:', e); }
    return $send.call(this, body);
  };
  /******* 3. Autocomplete ********/
  // 자동완성 관련 코드는 HEAD 기준으로 유지하며, 다른 브랜치의 추가 기능은 선택적으로 반영 가능
  (function initWildcardAutocomplete_PM() {
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
    const seen = new WeakSet();
    const mo = new MutationObserver(scan);
    mo.observe(document, { childList: true, subtree: true });
    scan();
    function scan() {
      document.querySelectorAll('div.ProseMirror[contenteditable="true"]')
        .forEach(el => { if (!seen.has(el)) hook(el); });
    }
    function hook(editor) {
      seen.add(editor);
      const list = document.createElement('ul');
      list.className = 'wildcard-suggest';
      list.style.display = 'none';
      document.body.appendChild(list);
      let selIdx = -1;
      editor.addEventListener('input', update);
      editor.addEventListener('keydown', nav);
      editor.addEventListener('blur', hide, true); // capture
      function textBeforeCaret() {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return '';
        const rng = sel.getRangeAt(0).cloneRange();
        rng.collapse(true);
        rng.setStart(editor, 0);
        return rng.toString();
      }
      function update() {
        const txt = textBeforeCaret();
        let m = txt.match(/__([A-Za-z0-9_-]+)__(?:([A-Za-z0-9 \-_]*))$/);
        if (m && dict[m[1]]) {
          const fileKey = m[1];
          const part = (m[2] || '').toLowerCase();
          const lines = dict[fileKey]
            .replace(/\\\(/g, '(').replace(/\\\)/g, ')')
            .split(/\r?\n/)
            .filter(Boolean)
            .filter(l => l.toLowerCase().includes(part))
            .slice(0, 100);
          if (lines.length) {
            render(lines.map(l => ({ type: 'value', text: l, key: fileKey })));
            return;
          }
        }
        m = txt.match(/__([A-Za-z0-9_-]*)$/);
        if (m) {
          const prefix = m[1].toLowerCase();
          const keys = Object.keys(dict)
            .filter(k => k.toLowerCase().includes(prefix))
            .sort();
          if (keys.length) {
            render(keys.map(k => ({ type: 'token', text: `__${k}__` })));
            return;
          }
        }
        hide();
      }
      function render(items) {
        list.innerHTML = '';
        items.forEach(({ type, text }) => {
          const li = document.createElement('li');
          li.textContent = text;
          li.dataset.type = type;
          list.appendChild(li);
        });
        selIdx = 0;
        highlight();
        const sel = window.getSelection();
        const rng = sel.getRangeAt(0).cloneRange();
        const rect = rng.getBoundingClientRect();
        list.style.left = (rect.left + window.scrollX) + 'px';
        list.style.top = (rect.bottom + window.scrollY + 2) + 'px';
        list.style.display = 'block';
      }
      function nav(e) {
        if (list.style.display === 'none') return;
        const items = list.querySelectorAll('li');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault(); selIdx = (selIdx + 1) % items.length; highlight();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); selIdx = (selIdx - 1 + items.length) % items.length; highlight();
        } else if (e.key === 'Tab' || e.key === ' ') {
          e.preventDefault(); choose(items[selIdx]);
        } else if (e.key === 'Escape') {
          hide();
        }
      }
      list.addEventListener('mousedown', e => {
        if (e.target.tagName === 'LI') {
          e.preventDefault(); choose(e.target);
        }
      });
      function choose(li) {
        const type = li.dataset.type;
        const text = li.textContent;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) { hide(); return; }
        const rng = sel.getRangeAt(0);
        const before = rng.cloneRange();
        before.setStart(editor, 0);
        const full = before.toString();
        let len = 0;
        if (type === 'token') {
          const m = full.match(/__([A-Za-z0-9_-]*)$/);
          len = m ? m[0].length : 0;
        } else {
          const m = full.match(/__([A-Za-z0-9_-]+)__(?:[A-Za-z0-9 \-_]*)$/);
          len = m ? m[0].length : 0;
        }
        if (len) {
          sel.collapse(rng.endContainer, rng.endOffset);
          for (let i = 0; i < len; i++) {
            sel.modify('extend', 'backward', 'character');
          }
        }
        document.execCommand('insertText', false, text);
        hide();
        if (type === 'token') {
          setTimeout(update, 0);
        }
      }
      function highlight() {
        list.querySelectorAll('li').forEach((li, i) =>
          li.classList.toggle('active', i === selIdx));
      }
      function hide() {
        list.style.display = 'none'; selIdx = -1;
      }
    }
  })();

  console.log('[Wildcard] injector ready');
})();