// injector.js
(() => {
  const TARGET = 'https://image.novelai.net/ai/generate-image';

  const curlyPattern = /{(?:[^|{}]+\|)+[^|{}]+}/;
  const doublePipePattern = /\|\|(?:[^|]+\|)+[^|]+\|\|/;
  const simpleWildcardPattern = /__([A-Za-z0-9_\/\.\-]+)__/;

  function containsWildcardSyntax(text) {
    return simpleWildcardPattern.test(text) ||
      curlyPattern.test(text) ||
      doublePipePattern.test(text);
  }

  let dict = {};
  let v3 = false;
  let preservePrompt = true;
  let alternativeDanbooruAutocomplete = true;
  let triggerTab = false;
  let triggerSpace = true;

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
   * 0. PNG 메타데이터 유틸 ────────────────────── */   // <<< NEW
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
  }                                                   // <<< NEW

  async function applyImg2ImgMetadata(json) {               // <<< NEW
    try {
      if (json?.action !== 'img2img' ||
        !json?.parameters?.image) return;

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
  }                                                   // <<< NEW

  /******** 1. swap logic ********/
  function swap(txt) {
    // 1. __ 토큰 처리
    let result = txt.replace(/__([A-Za-z0-9_\/\.\-]+)__/g, (match, name) => {
      // 1-1. 정확히 매칭되는 키가 있는지
      let raw = dict[name];
  
      // 1-2. 없으면, name에 슬래시가 없을 때 폴더 구조 중에서 파일명만 같은 키를 찾아서 대체
      if (!raw && !name.includes('/')) {
        const fallbackKey = Object.keys(dict)
          .find(k => k.split('/').pop() === name);
        if (fallbackKey) raw = dict[fallbackKey];
      }
  
      // 1-3. 여전히 raw가 없으면 치환 안 함
      if (!raw) return match;

      // 이스케이프 문자 복원
      raw = raw.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return match;

      // 파일의 각 줄 중 하나라도 다른 wildcard 문법이 남아 있으면 강제로 V3 모드 적용
      const forceV3 = lines.some(line => containsWildcardSyntax(line));
      const effectiveV3 = forceV3 || v3;

      if (effectiveV3) {
        // 랜덤으로 한 줄 선택 (한 번만 치환)
        return lines[Math.floor(Math.random() * lines.length)];
      } else {
        // V3 모드가 아니라면 전체 라인을 파이프(|)로 연결한 후 ||...|| 형태로 반환
        return `||${lines.join('|')}||`;
      }
    });

    // 2. {text1|text2|text3} 문법 처리
    result = result.replace(/{([^|{}]+(?:\|[^|{}]+)+)}/g, (match, group) => {
      const opts = group.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });

    // 3. ||text1|text2|text3|| 문법 처리
    result = result.replace(/\|\|((?:[^|]+\|)+[^|]+)\|\|/g, (match, group) => {
      const opts = group.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });

    return result;
  }

  function recursiveSwap(txt) {
    let current = txt;
    let iteration = 0;
    // 최대 100회 반복하여 무한 루프 방지
    while (containsWildcardSyntax(current) && iteration < 100) {
      const next = swap(current);
      // 더 이상 변화가 없으면 중단
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

          /* ② img2img 메타데이터 반영 */      // <<< NEW
          if (preservePrompt) await applyImg2ImgMetadata(json);            // <<< NEW

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

        /* ② img2img 메타데이터 반영 */        // <<< NEW
        if (preservePrompt) json = applyImg2ImgMetadata(json);              // <<< NEW

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

  let autocompleteDict = [];
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    const { type, map, v3: newV3, preservePrompt: newPreserve, alternativeDanbooruAutocomplete: newAlt, triggerTab: newTab, triggerSpace: newSpace, data } = e.data || {};

    // 옵션 초기화 및 업데이트 처리
    if (type === '__WILDCARD_INIT__' || type === '__WILDCARD_UPDATE__') {
      dict = map || {};
      v3 = !!newV3;
      preservePrompt = !!newPreserve;
      triggerTab = !!newTab;
      triggerSpace = !!newSpace;

      // alternativeDanbooruAutocomplete 토글 즉시 반영
      if (typeof newAlt !== 'undefined') {
        alternativeDanbooruAutocomplete = !!newAlt;
        if (alternativeDanbooruAutocomplete) {
          // 켜졌을 때 사전 재요청
          window.postMessage({ type: '__REQUEST_AUTOCOMPLETE_DICT__' }, '*');
        } else {
          // 꺼졌을 때 기존 사전 초기화
          autocompleteDict = [];
        }
      }
    }
    // 실제 사전 데이터 수신
    else if (type === '__AUTOCOMPLETE_DICT__') {
      if (alternativeDanbooruAutocomplete) {
        autocompleteDict = data || [];
      }
    }
  });

  /******* 3. Autocomplete ********/
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
      editor.addEventListener('blur', hide, true);   // capture

      function textBeforeCaret() {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return '';
        const rng = sel.getRangeAt(0).cloneRange();
        rng.collapse(true);
        rng.setStart(editor, 0);
        return rng.toString();
      }

      const colorMap = {
        "0": "lightblue",
        "1": "indianred",
        "3": "violet",
        "4": "lightgreen",
        "5": "orange",
        "6": "red",
        "7": "lightblue",
        "8": "gold",
        "9": "gold",
        "10": "violet",
        "11": "lightgreen",
        "12": "tomato",
        "14": "whitesmoke",
        "15": "seagreen"
      };

      function formatCount(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n + '';
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

        m = txt.match(/__([A-Za-z0-9_\/\.\-]*)$/);
        if (m) {
          const prefix = m[1].toLowerCase();
          const allKeys = Object.keys(dict)

          // 1) 폴더명을 단독으로 입력한 경우: 해당 폴더 안의 모든 key 제안
          const folderKeys = allKeys.filter(k => k.toLowerCase().startsWith(prefix + '/'));
          if (folderKeys.length && !prefix.includes('/')) {
            render(folderKeys.map(k => ({ type: 'token', text: `__${k}__` })));
            return;
          }
          
          const keys = allKeys.filter(k => k.toLowerCase().includes(prefix))
            .sort();
          if (keys.length) {
            render(keys.map(k => ({ type: 'token', text: `__${k}__` })));
            return;
          }
        }

        m = txt.match(/([A-Za-z0-9_-]{1,})$/);
        if (m && autocompleteDict.length) {
          const prefix = m[1].toLowerCase();
          // 1) 원본 단어에 매치되는 항목
          const origMatches = autocompleteDict
            .filter(d => d.word.toLowerCase().includes(prefix))
            .map(d => ({
              type: 'dict',
              original: d.word,
              text: d.word,
              color: colorMap[d.colorCode] || 'red',
              rawCount: d.popCount,
              aliasUsed: false
            }));

          // 2) 원본에 매치 안 되고 alias에만 매치되는 항목
          const aliasMatches = autocompleteDict
            .filter(d =>
              !d.word.toLowerCase().includes(prefix) &&
              d.aliases.some(a => a.toLowerCase().includes(prefix))
            )
            .map(d => ({
              type: 'dict',
              original: d.aliases.find(a => a.toLowerCase().includes(prefix)),
              text: d.word,
              color: colorMap[d.colorCode] || 'red',
              rawCount: d.popCount,
              aliasUsed: true
            }));

          // 3) 합치고 rawCount 기준 내림차순 정렬
          let entries = origMatches.concat(aliasMatches);
          entries.sort((a, b) => b.rawCount - a.rawCount);

          // 4) 포맷 적용 및 상위 50개 추출
          entries = entries
            .slice(0, 50)
            .map(e => ({
              type: e.type,
              original: e.original,
              text: e.text,
              color: e.color,
              popCount: formatCount(e.rawCount),
              aliasUsed: e.aliasUsed
            }));

          // 5) 렌더링
          if (entries.length) {
            render(entries);
            return;
          }
        }

        hide();
      }


      function render(items) {
        list.innerHTML = '';
        items.forEach(({ type, text, color, popCount, aliasUsed, original }, index) => {
          const li = document.createElement('li');
          li.dataset.type = type;
          li.dataset.index = index;

          if (type === 'dict') {
            li.style.color = color || 'red';
            if (aliasUsed) {
              li.innerHTML = `<span style="color:${color};">${original} → ${text}</span> <span style="opacity:0.6;font-size:0.8em;">(${popCount})</span>`;
            } else {
              li.innerHTML = `<span style="color:${color};">${text}</span> <span style="opacity:0.6;font-size:0.8em;">(${popCount})</span>`;
            }
          } else {
            li.textContent = text;
          }

          li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            choose(e.currentTarget);
          });

          li.addEventListener('mouseenter', () => {
            selIdx = index;
            highlight();
          });

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

        if (triggerTab && e.key === 'Tab') {
          e.preventDefault(); choose(items[selIdx]);
        } else if (triggerSpace && e.key === ' ') {
          e.preventDefault(); choose(items[selIdx]);
        } else if (e.key === 'Escape') {
          hide();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault(); selIdx = (selIdx + 1) % items.length; highlight();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); selIdx = (selIdx - 1 + items.length) % items.length; highlight();
        }
      }

      function choose(li) {
        const type = li.dataset.type;
        let text = li.textContent;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) { hide(); return; }

        const rng = sel.getRangeAt(0);

        const before = rng.cloneRange();
        before.setStart(editor, 0);
        const full = before.toString();

        let len = 0;
        if (type === 'token') {
          const m = full.match(/__([A-Za-z0-9_\/\.\-]*)$/);
          len = m ? m[0].length : 0;
        } else if (type === 'value') {
          const m = full.match(/__([A-Za-z0-9_\/\.\-]+)__(?:[A-Za-z0-9 \-_]*)$/);
          len = m ? m[0].length : 0;
        } else if (type === 'dict') {
          const m = full.match(/[A-Za-z0-9_-]{1,}$/);
          len = m ? m[0].length : 0;

          text = text.replace(/\s\([0-9.]+[MK]?\)$/, '').replace(/_/g, ' ');

          // alias 표시가 있는 경우 "→" 앞부분을 제거하여 원본 단어만 남김
          if (text.includes('→')) {
            text = text.split('→')[1].trim();
          }
        }

        if (len) {
          sel.collapse(rng.endContainer, rng.endOffset);
          for (let i = 0; i < len; i++) {
            sel.modify('extend', 'backward', 'character');
          }
        }

        const needsComma = !text.startsWith('__');      // 와일드카드 토큰이면 쉼표 생략
        document.execCommand(
          'insertText',
          false,
          needsComma ? `${text}, ` : text               // 공백도 불필요하면 그냥 text 만
        );
        hide();

        if (type === 'token') {
          setTimeout(update, 0);
        }
      }



      function highlight() {
        // 1) active 클래스 토글
        list.querySelectorAll('li').forEach((li, i) =>
          li.classList.toggle('active', i === selIdx)
        );

        // 2) 활성화된 항목이 보이도록 스크롤
        const activeLi = list.querySelector('li.active');
        if (activeLi) {
          activeLi.scrollIntoView({ block: 'nearest' });
        }
      }
      function hide() {
        list.style.display = 'none'; selIdx = -1;
      }
    }
  })();


  console.log('[Wildcard] injector ready');
})();


