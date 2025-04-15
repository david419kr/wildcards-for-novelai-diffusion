// bridge.js
(async () => {
  // 1) get settings from storage  ← preservePrompt 포함
  const {
    wildcards      = {},
    v3mode         = false,
    preservePrompt = false      // ★ 추가
  } = await chrome.storage.local.get(['wildcards','v3mode','preservePrompt']);

  // 2) inject script to page
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    window.postMessage({
      type : '__WILDCARD_INIT__',
      map  : wildcards,
      v3   : v3mode,
      preservePrompt                // ★ 추가
    }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // 3) propagate later changes
  chrome.storage.onChanged.addListener(ch => {
    if (ch.wildcards || ch.v3mode || ch.preservePrompt)
      window.postMessage({
        type : '__WILDCARD_UPDATE__',
        map  : (ch.wildcards      ? ch.wildcards.newValue      : wildcards)      || {},
        v3   : (ch.v3mode         ? ch.v3mode.newValue         : v3mode)         || false,
        preservePrompt : (ch.preservePrompt ? ch.preservePrompt.newValue : preservePrompt) || false
      }, '*');
  });
})();
