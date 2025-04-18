// bridge.js
(async () => {
  // 1) get settings from storage  ← preservePrompt 포함
  let {
    wildcards = {},
    v3mode = false,
    preservePrompt = true,
    alternativeDanbooruAutocomplete = true,
    triggerTab = false,
    triggerSpace = true
  } = await chrome.storage.local.get(['wildcards', 'v3mode', 'preservePrompt', 'alternativeDanbooruAutocomplete', 'triggerTab', 'triggerSpace']);

  // 2) inject script to page
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    window.postMessage({
      type: '__WILDCARD_INIT__',
      map: wildcards,
      v3: v3mode,
      preservePrompt,
      alternativeDanbooruAutocomplete,
      triggerTab,
      triggerSpace
    }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // 3) propagate later changes
  chrome.storage.onChanged.addListener(changes => {
    // wildcards, v3mode, preservePrompt, alternativeDanbooruAutocomplete 중 하나라도 바뀌면 반영
    if (changes.wildcards ||
      changes.v3mode ||
      changes.preservePrompt ||
      changes.alternativeDanbooruAutocomplete ||
      changes.triggerTab ||
      changes.triggerSpace) {

      wildcards = changes.wildcards
        ? changes.wildcards.newValue
        : wildcards;
      v3mode = changes.v3mode
        ? changes.v3mode.newValue
        : v3mode;
      preservePrompt = changes.preservePrompt
        ? changes.preservePrompt.newValue
        : preservePrompt;
      alternativeDanbooruAutocomplete = changes.alternativeDanbooruAutocomplete
        ? changes.alternativeDanbooruAutocomplete.newValue
        : alternativeDanbooruAutocomplete;
      triggerTab = changes.triggerTab
        ? changes.triggerTab.newValue
        : triggerTab;
      triggerSpace = changes.triggerSpace
        ? changes.triggerSpace.newValue
        : triggerSpace;

      window.postMessage({
        type: '__WILDCARD_UPDATE__',
        map: wildcards,
        v3: v3mode,
        preservePrompt,
        alternativeDanbooruAutocomplete,
        triggerTab,
        triggerSpace,
      }, '*');
    }
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
        aliases: aliases.replace(/"/g, '').split(',').map(a => a.trim())
      };
    });

  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.type !== '__REQUEST_AUTOCOMPLETE_DICT__') return;
    window.postMessage({
      type: '__AUTOCOMPLETE_DICT__',
      data: autocompleteDict
    }, '*');
  });
})();
