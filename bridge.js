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
      const regex = /"([^"]*(?:""[^"]*)*)"|([^,]+)/g;
      const row = [];
      let match;

      // 정규표현식을 순회하며 매치된 그룹을 배열에 저장
      while ((match = regex.exec(line))) {
        if (match[1] !== undefined) {
          // 큰따옴표 내부 내용: 내부의 이스케이프된 큰따옴표 처리 (예: "" -> ")
          row.push(match[1].replace(/""/g, '"'));
        } else if (match[2] !== undefined) {
          // 큰따옴표에 묶이지 않은 필드
          row.push(match[2]);
        }
      }

      let [word, colorCode, popCount, aliases] = row;
      if (aliases) aliases = `"${aliases}"`;
      else aliases = '""';
      return {
        word,
        colorCode: colorCode.trim(),
        popCount: parseInt(popCount),
        aliases: aliases.replace(/"/g,'').split(',').map(a => a.trim())
      };
    });

  window.postMessage({ type: '__AUTOCOMPLETE_DICT__', data: autocompleteDict }, '*');

})();
