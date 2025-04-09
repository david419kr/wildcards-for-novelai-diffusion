// bridge.js
(async () => {
  // 1) get wildcards from storage
  const { wildcards = {} } = await chrome.storage.local.get('wildcards');

  // 2) inject script to page
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    window.postMessage({ type: '__WILDCARD_INIT__', map: wildcards }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // 3) Real-time propagation of changes afterwards
  chrome.storage.onChanged.addListener(ch => {
    if (ch.wildcards)
      window.postMessage({ type: '__WILDCARD_UPDATE__', map: ch.wildcards.newValue || {} }, '*');
  });
})();
