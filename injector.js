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

  console.log('[Wildcard] injector ready');
})();
