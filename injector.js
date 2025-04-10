// injector.js
(() => {
  const TARGET = 'https://image.novelai.net/ai/generate-image';
  const WILDCARD = /__([A-Za-z0-9_-]+)__/g;
  let dict = {};
  let v3   = false; 

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === '__WILDCARD_INIT__' || e.data?.type === '__WILDCARD_UPDATE__') {
      dict = e.data.map || {};
      v3   = !!e.data.v3;
    }
  });

  /******** 1. swap logic ********/
  const swap = txt => txt.replace(WILDCARD, (_, name) => {
    let raw = dict[name];
    if (!raw) return _;
  
    raw = raw.replace(/\\\(/g,'(').replace(/\\\)/g,')');
    const lines = raw.split(/\r?\n/).filter(Boolean);
  
    if (!lines.length) return _;
  
    if (v3) {
      return lines[Math.floor(Math.random() * lines.length)];
    } else {
      return `||${lines.join('|')}||`;
    }
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

  let autocompleteDict = [];
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === '__WILDCARD_INIT__' || e.data?.type === '__WILDCARD_UPDATE__') {
      dict = e.data.map || {};
      v3   = !!e.data.v3;
    }
  
    if (e.data?.type === '__AUTOCOMPLETE_DICT__') {
      autocompleteDict = e.data.data || [];
    }
  });

    /******* 3. Autocomplete ********/
  (function initWildcardAutocomplete_PM () {
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
    const mo   = new MutationObserver(scan);
    mo.observe(document, {childList:true, subtree:true});
    scan();

    function scan () {
      document.querySelectorAll('div.ProseMirror[contenteditable="true"]')
        .forEach(el => { if (!seen.has(el)) hook(el); });
    }

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

      function textBeforeCaret () {
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
        if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
        if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
        return n+'';
      }

      function update () {
        const txt = textBeforeCaret();
      
        let m = txt.match(/__([A-Za-z0-9_-]+)__(?:([A-Za-z0-9 \-_]*))$/);
        if (m && dict[m[1]]) {
          const fileKey = m[1];
          const part    = (m[2] || '').toLowerCase();
      
          const lines = dict[fileKey]
            .replace(/\\\(/g,'(').replace(/\\\)/g,')') 
            .split(/\r?\n/)
            .filter(Boolean)
            .filter(l => l.toLowerCase().includes(part))
            .slice(0, 100);
      
          if (lines.length) {
            render(lines.map(l => ({type:'value', text:l, key:fileKey})));
            return;
          }
        }
      
        m = txt.match(/__([A-Za-z0-9_-]*)$/);
        if (m) {
          const prefix = m[1].toLowerCase();
          const keys   = Object.keys(dict)
                        .filter(k => k.toLowerCase().includes(prefix)) 
                        .sort();
          if (keys.length) {
            render(keys.map(k => ({type:'token', text:`__${k}__`})));
            return;
          }
        }

        m = txt.match(/([A-Za-z0-9_-]{1,})$/);
        if (m && autocompleteDict.length) {
          const prefix = m[1].toLowerCase();
          const entries = autocompleteDict
            .filter(d => 
              d.word.toLowerCase().includes(prefix) ||
              d.aliases.some(a => a.toLowerCase().includes(prefix))
            )
            .map(d => {
              const matchedAlias = d.aliases.find(a => a.toLowerCase().includes(prefix));
              return {
                word: d.word,
                alias: matchedAlias,
                colorCode: d.colorCode,
                popCount: d.popCount
              };
            })
            .sort((a,b) => b.popCount - a.popCount)
            .slice(0, 50);

          if (entries.length) {
            render(entries.map(e => ({
              type: 'dict',
              original: e.alias || e.word,
              text: e.word,
              color: colorMap[e.colorCode] || 'red',
              popCount: formatCount(e.popCount),
              aliasUsed: !!e.alias && e.alias.toLowerCase().includes(prefix)
            })));
            return;
          }
        }
      
        hide();
      }
      

      function render(items) {
        list.innerHTML = '';
        items.forEach(({type, text, color, popCount, aliasUsed, original}, index) => {
          const li = document.createElement('li');
          li.dataset.type = type;
          li.dataset.index = index;
      
          if (type === 'dict') {
            li.style.color = color || 'red';
            if(aliasUsed) {
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
        const rect= rng.getBoundingClientRect();
        list.style.left   = (rect.left + window.scrollX)+'px';
        list.style.top    = (rect.bottom + window.scrollY+2)+'px';
        list.style.display= 'block';
      }
      
      

      function nav (e) {
        if (list.style.display === 'none') return;

        const items = list.querySelectorAll('li');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault(); selIdx = (selIdx + 1) % items.length; highlight();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); selIdx = (selIdx - 1 + items.length) % items.length; highlight();
        } else if (e.key === 'Tab') {
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

      function choose (li) {
        const type = li.dataset.type;
        let text = li.textContent;
        const sel  = window.getSelection();
        if (!sel || !sel.rangeCount) { hide(); return; }
      
        const rng = sel.getRangeAt(0);
      
        const before = rng.cloneRange();
        before.setStart(editor, 0);
        const full = before.toString();
      
        let len = 0;
        if (type === 'token') {
          const m = full.match(/__([A-Za-z0-9_-]*)$/);
          len = m ? m[0].length : 0;
        } else if (type === 'value') {
          const m = full.match(/__([A-Za-z0-9_-]+)__(?:[A-Za-z0-9 \-_]*)$/);
          len = m ? m[0].length : 0;
        } else if (type === 'dict') {
          const m = full.match(/[A-Za-z0-9_-]{1,}$/);
          len = m ? m[0].length : 0;
      
          text = text.replace(/\s\([0-9.]+[MK]?\)$/,'').replace(/_/g,' ');
      
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
      
        document.execCommand('insertText', false, text);
        hide();
      
        if (type === 'token') {
          setTimeout(update, 0);
        }
      }
      
      

      function highlight () {
        list.querySelectorAll('li').forEach((li,i)=>
          li.classList.toggle('active', i===selIdx));
      }
      function hide () { 
        list.style.display='none'; selIdx=-1; 
      }
    }
  })();


  console.log('[Wildcard] injector ready');
})();


