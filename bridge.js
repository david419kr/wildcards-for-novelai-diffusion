// bridge.js
(async () => {
  // 1) get wildcards from storage
  const { wildcards = {}, v3mode = false } = await chrome.storage.local.get(['wildcards', 'v3mode']);

  // 2) inject script to page
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    window.postMessage({ type: '__WILDCARD_INIT__', map: wildcards, v3: v3mode }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // 3) Real-time propagation of changes afterwards
  chrome.storage.onChanged.addListener(ch => {
    if (ch.wildcards || ch.v3mode)
      window.postMessage({ type: '__WILDCARD_UPDATE__',
                           map: (ch.wildcards ? ch.wildcards.newValue : wildcards) || {},
                           v3 : (ch.v3mode   ? ch.v3mode.newValue   : v3mode   ) || false }, '*');
  });

  const csvUrl = chrome.runtime.getURL('dictionary.csv');
  const res = await fetch(csvUrl);
  const text = await res.text();

  const autocompleteDict = text.split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const [word, colorCode, popCount, ...rest] = line.split(',');
      const aliases = rest.join(','); 
      return {
        word,
        colorCode: colorCode.trim(),
        popCount: parseInt(popCount),
        aliases: aliases.replace(/"/g,'').split(',').map(a => a.trim())
      };
    });

  window.postMessage({ type: '__AUTOCOMPLETE_DICT__', data: autocompleteDict }, '*');

})();
