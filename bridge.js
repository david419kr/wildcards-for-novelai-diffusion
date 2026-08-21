(async () => {
  const stored = await chrome.storage.local.get([
    'wildcards',
    'v3mode',
    'preservePrompt',
    'alternativeDanbooruAutocomplete',
    'useDanbooruAutocomplete',
    'useE621Autocomplete',
    'triggerTab',
    'triggerSpace'
  ]);

  let wildcards = stored.wildcards || {};
  let v3mode = stored.v3mode ?? false;
  let preservePrompt = stored.preservePrompt ?? true;
  let useDanbooruAutocomplete = stored.useDanbooruAutocomplete
    ?? stored.alternativeDanbooruAutocomplete
    ?? true;
  let useE621Autocomplete = stored.useE621Autocomplete ?? false;
  let triggerTab = stored.triggerTab ?? false;
  let triggerSpace = stored.triggerSpace ?? false;

  const migration = {};
  if (stored.useDanbooruAutocomplete === undefined) {
    migration.useDanbooruAutocomplete = useDanbooruAutocomplete;
  }
  if (stored.useE621Autocomplete === undefined) {
    migration.useE621Autocomplete = useE621Autocomplete;
  }
  if (Object.keys(migration).length) await chrome.storage.local.set(migration);

  const dictionaryPromises = new Map();

  function parseCsvLine(line) {
    const row = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        row.push(value);
        value = '';
      } else {
        value += char;
      }
    }
    row.push(value);
    return row;
  }

  function parseDictionary(text, source) {
    return text.split(/\r?\n/).filter(Boolean).map(line => {
      const row = parseCsvLine(line);
      const [word, category, count, aliasText = ''] = row;
      return {
        word,
        colorCode: source === 'e621' ? String(Number(category) + 7) : category.trim(),
        popCount: Number.parseInt(count, 10),
        aliases: aliasText.split(',').map(alias => alias.trim()).filter(Boolean)
      };
    });
  }

  function loadDictionary(source) {
    if (!dictionaryPromises.has(source)) {
      const file = source === 'e621' ? 'dictionary-e621.csv' : 'dictionary.csv';
      dictionaryPromises.set(source, fetch(chrome.runtime.getURL(file))
        .then(response => response.text())
        .then(text => parseDictionary(text, source)));
    }
    return dictionaryPromises.get(source);
  }

  function mergeDictionaries(dictionaries) {
    const merged = new Map();
    for (const dictionary of dictionaries) {
      for (const entry of dictionary) {
        const existing = merged.get(entry.word);
        if (!existing) {
          merged.set(entry.word, { ...entry });
          continue;
        }

        existing.popCount = Math.max(existing.popCount, entry.popCount);
        existing.aliases = [...new Set([...existing.aliases, ...entry.aliases])];
      }
    }
    return [...merged.values()];
  }

  window.addEventListener('message', async event => {
    if (event.source !== window || event.data?.type !== '__REQUEST_AUTOCOMPLETE_DICT__') return;

    const sources = {
      danbooru: !!event.data.useDanbooruAutocomplete,
      e621: !!event.data.useE621Autocomplete
    };
    const requests = [];
    if (sources.danbooru) requests.push(loadDictionary('danbooru'));
    if (sources.e621) requests.push(loadDictionary('e621'));

    window.postMessage({
      type: '__AUTOCOMPLETE_DICT__',
      data: mergeDictionaries(await Promise.all(requests)),
      sources
    }, '*');
  });

  function postSettings(type) {
    window.postMessage({
      type,
      map: wildcards,
      v3: v3mode,
      preservePrompt,
      useDanbooruAutocomplete,
      useE621Autocomplete,
      triggerTab,
      triggerSpace
    }, '*');
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const relevant = [
      'wildcards',
      'v3mode',
      'preservePrompt',
      'useDanbooruAutocomplete',
      'useE621Autocomplete',
      'triggerTab',
      'triggerSpace'
    ];
    if (!relevant.some(key => changes[key])) return;

    if (changes.wildcards) wildcards = changes.wildcards.newValue || {};
    if (changes.v3mode) v3mode = changes.v3mode.newValue ?? false;
    if (changes.preservePrompt) preservePrompt = changes.preservePrompt.newValue ?? true;
    if (changes.useDanbooruAutocomplete) {
      useDanbooruAutocomplete = changes.useDanbooruAutocomplete.newValue ?? false;
    }
    if (changes.useE621Autocomplete) {
      useE621Autocomplete = changes.useE621Autocomplete.newValue ?? false;
    }
    if (changes.triggerTab) triggerTab = changes.triggerTab.newValue ?? false;
    if (changes.triggerSpace) triggerSpace = changes.triggerSpace.newValue ?? false;
    postSettings('__WILDCARD_UPDATE__');
  });

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injector.js');
  script.onload = () => {
    postSettings('__WILDCARD_INIT__');
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();
