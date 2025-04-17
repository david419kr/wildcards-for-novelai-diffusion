// NovelAI Wildcards – popup.js
let currentFolder = null;

const list = document.getElementById('list');
const folderInput = document.getElementById('newFolderName');
const createFolderBtn = document.getElementById('createFolderBtn');
const backBtn = document.getElementById('backBtn');
const viewTitle = document.getElementById('viewTitle');
const fileRoot = document.getElementById('fileRoot');
const fileInFolder = document.getElementById('fileInFolder');
const rootContent = document.getElementById('rootContent');
const langToggle = document.getElementById('langToggle');
let isDragging = false;
let lastSelectedIndex = null;

const LANG_KEY = 'lang';

// popup.js 최상단에 추가
const translations = {
  en: {
    settings: "Settings",
    preserveLabel: "Preserve Original img prompts on Enhance",
    preserveDesc: "・Uncheck this to randomize enhance prompts.",
    alternativeLabel: "Full Alternative Danbooru Autocomplete",
    alternativeDesc: "・a1111 WebUI style Danbooru Autocomplete.",
    triggerTitle: "Autocomplete Trigger Keys",
    space: "Space",
    spaceDesc: "Works fine along with NAI default.",
    tab: "Tab",
    tabDesc: "Use with \"Disable Tag Suggestions\" ON.",
    wildcards: "Wildcards"
  },
  jp: {
    settings: "設定",
    preserveLabel: "品質向上時、画像の元々のプロンプトを使う",
    preserveDesc: "・品質向上時もランダマイズしたい場合は解除",
    alternativeLabel: "カスタム入力候補予測（軽量）を使う",
    alternativeDesc: "・WebUiスタイルのDanbooruタグ予測変換",
    triggerTitle: "予測変換のトリガーキー",
    space: "Space",
    spaceDesc: "NAIの基本動作と衝突せず動作します。",
    tab: "Tab",
    tabDesc: "「入力候補予測をやめる」ON推奨",
    wildcards: "ワイルドカード"
  }
};

function setLang(lang) {
  const keys = translations[lang] || {};
  Object.keys(keys).forEach(key => {
    const el = document.querySelector('[data-i18n-key="' + key + '"]');
    if (el) el.textContent = keys[key];
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setLang('en'); // 초기 언어 설정
  document.getElementById('btn-en').addEventListener('click', () => setLang('en'));
  document.getElementById('btn-jp').addEventListener('click', () => setLang('jp'));
});

// Create new folder
document.getElementById('createFolderBtn').addEventListener('click', () => {
  let raw = folderInput.value.trim();
  let name = raw.replace(/\s+/g, '_').replace(/_+/g, '_');
  if (!name) return alert('Input folder name.');
  chrome.storage.local.get(['wildcards', 'wildcardFolders'], d => {
    const map = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    if (folders.includes(name) || map[name]) {
      return alert('Folder already exists: ' + name);
    }
    folders.push(name);
    chrome.storage.local.set({ wildcardFolders: folders }, refresh);
    folderInput.value = '';
  });
});

// Back to root view
backBtn.addEventListener('click', () => {
  currentFolder = null;
  refresh();
});
backBtn.addEventListener('dragenter', e => {
  if (!currentFolder) return;
  e.preventDefault();
  backBtn.classList.add('drop-target');
});
backBtn.addEventListener('dragleave', e => {
  backBtn.classList.remove('drop-target');
});
backBtn.addEventListener('drop', e => {
  e.preventDefault();
  backBtn.classList.remove('drop-target');
  const keys = JSON.parse(e.dataTransfer.getData('application/json'));
  chrome.storage.local.get('wildcards', data => {
    const map = data.wildcards || {};
    keys.forEach(oldKey => {
      const prefix = currentFolder + '/';
      if (oldKey.startsWith(prefix)) {
        const base = oldKey.slice(prefix.length);
        if (!map[base]) {
          map[base] = map[oldKey];
          delete map[oldKey];
        }
      }
    });
    chrome.storage.local.set({ wildcards: map }, () => {
      currentFolder = null;
      refresh();
    });
  });
});
backBtn.addEventListener('dragover', e => {
  if (currentFolder) e.preventDefault();
});
backBtn.addEventListener('drop', e => {
  e.preventDefault();
  const keys = JSON.parse(e.dataTransfer.getData('application/json'));
  chrome.storage.local.get('wildcards', data => {
    const map = data.wildcards || {};
    keys.forEach(oldKey => {
      if (!currentFolder) return;
      // currentFolder/xxx → xxx
      const prefix = currentFolder + '/';
      if (oldKey.startsWith(prefix)) {
        const base = oldKey.slice(prefix.length);
        if (!map[base]) {
          map[base] = map[oldKey];
          delete map[oldKey];
        }
      }
    });
    chrome.storage.local.set({ wildcards: map }, () => {
      currentFolder = null;
      refresh();
    });
  });
});

// Root upload handler
fileRoot.addEventListener('change', e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  chrome.storage.local.get(['wildcards', 'wildcardFolders'], d => {
    const map = d.wildcards || {};
    let remaining = files.length;
    files.forEach(f => {
      const rel = f.webkitRelativePath || f.name;
      const rawKey = rel.replace(/\.txt$/i, '');
      const key = rawKey.replace(/\s+/g, '_').replace(/_+/g, '_');
      if (map[key]) {
        alert(`File already exists: ${key}`);
        if (--remaining === 0) chrome.storage.local.set({ wildcards: map }, refresh);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        map[key] = reader.result;
        if (--remaining === 0) chrome.storage.local.set({ wildcards: map }, refresh);
      };
      reader.readAsText(f);
    });
  });
  fileRoot.value = '';
});

// Folder upload handler
fileInFolder.addEventListener('change', e => {
  const files = Array.from(e.target.files);
  if (!currentFolder || !files.length) return;
  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};
    let remaining = files.length;
    files.forEach(f => {
      const rawBase = f.name.replace(/\.txt$/i, '');
      const sanBase = rawBase.replace(/\s+/g, '_').replace(/_+/g, '_');
      const key = `${currentFolder}/${sanBase}`;
      if (map[key]) {
        alert(`File already exists: ${key}`);
        if (--remaining === 0) chrome.storage.local.set({ wildcards: map }, refresh);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        map[key] = reader.result;
        if (--remaining === 0) chrome.storage.local.set({ wildcards: map }, refresh);
      };
      reader.readAsText(f);
    });
  });
  fileInFolder.value = '';
});

// Render list function
function refresh() {
  chrome.storage.local.get(['wildcards', 'wildcardFolders'], d => {
    const map = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    list.innerHTML = '';

    // Toggle root vs folder view
    if (currentFolder) {
      backBtn.style.display = 'inline-block';
      viewTitle.textContent = `Folder: ${currentFolder}`;
      rootContent.style.display = 'none';
      fileRoot.style.display = 'none';
      fileInFolder.style.display = 'inline-block';
      langToggle.style.display = 'none';
    } else {
      backBtn.style.display = 'none';
      viewTitle.textContent = 'Settings';
      rootContent.style.display = 'block';
      fileRoot.style.display = 'inline-block';
      fileInFolder.style.display = 'none';
      langToggle.style.display = 'block';
    }

    // Delete all button
    // Delete all 버튼 (root vs folder 구분)
    const delAll = document.createElement('button');
    delAll.textContent = 'delete all';
    delAll.style.cssText = 'float:right; margin-top:-25px;';

    if (currentFolder) {
      const renameBtn = document.createElement('button');
      renameBtn.textContent = 'rename folder';
      renameBtn.style.cssText = 'float:right; margin-top:-60px;';
      renameBtn.onclick = () => {
        const raw = prompt('Enter new folder name:', currentFolder);
        if (!raw) return;  // 취소 시 종료
        // 공백→_ 치환, 중복 _ 제거
        const sanitized = raw.trim().replace(/\s+/g, '_').replace(/_+/g, '_');
        if (!sanitized || sanitized === currentFolder) {
          return alert('Invalid folder name.');
        }
        chrome.storage.local.get(['wildcards', 'wildcardFolders'], data => {
          const map = data.wildcards || {};
          const folders = data.wildcardFolders || [];
          // 새 이름이 이미 존재하는지 검사
          if (folders.includes(sanitized) || Object.keys(map).some(k => k === sanitized || k.startsWith(sanitized + '/'))) {
            return alert('Folder already exists: ' + sanitized);
          }
          // 1) folders 배열 업데이트
          const newFolders = folders.map(f => f === currentFolder ? sanitized : f);
          // 2) wildcards map 키들 재명명
          const newMap = {};
          Object.keys(map).forEach(key => {
            if (key.startsWith(currentFolder + '/')) {
              const rest = key.slice(currentFolder.length + 1);
              newMap[sanitized + '/' + rest] = map[key];
            } else {
              newMap[key] = map[key];
            }
          });
          // 저장 후, currentFolder 갱신 및 화면 새로고침
          chrome.storage.local.set({
            wildcards: newMap,
            wildcardFolders: newFolders
          }, () => {
            currentFolder = sanitized;
            refresh();
          });
        });
      };
      list.appendChild(renameBtn);
    }

    if (!currentFolder) {
      // 1) 루트 뷰: 전체 삭제
      delAll.onclick = () => {
        if (!confirm('Delete All?')) return;
        chrome.storage.local.set({ wildcards: {}, wildcardFolders: [] }, () => {
          currentFolder = null;
          refresh();
        });
      };
      // 폴더나 파일이 하나라도 있으면 버튼 보이기
      delAll.style.display = (folders.length || Object.keys(map).length) ? 'block' : 'none';
    } else {
      // 2) 폴더 뷰: 해당 폴더 내 파일만 삭제
      const fileKeys = Object.keys(map).filter(k => k.startsWith(currentFolder + '/'));
      delAll.onclick = () => {
        if (!confirm(`Delete all files in '${currentFolder}' folder?`)) return;
        const newMap = { ...map };
        fileKeys.forEach(k => delete newMap[k]);
        chrome.storage.local.set({ wildcards: newMap, wildcardFolders: folders }, () => {
          refresh();
        });
      };
      // 해당 폴더에 파일이 있을 때만 버튼 보이기
      delAll.style.display = fileKeys.length ? 'block' : 'none';
    }
    list.appendChild(delAll);

    if (!currentFolder) {
      // Root view: list folders and root files
      folders.sort().forEach(folder => {
        const li = document.createElement('li');
        const hdr = document.createElement('div');
        hdr.className = 'folder-header';
        hdr.textContent = folder;
        hdr.onclick = () => { currentFolder = folder; refresh(); };
        hdr.addEventListener('dragover', e => e.preventDefault());
        // drop 시 파일들 해당 폴더로 이동
        hdr.addEventListener('drop', e => {
          e.preventDefault();
          const keys = JSON.parse(e.dataTransfer.getData('application/json'));
          chrome.storage.local.get(['wildcards', 'wildcardFolders'], data => {
            const map = data.wildcards || {};
            keys.forEach(oldKey => {
              const base = oldKey.includes('/') ? oldKey.split('/').pop() : oldKey;
              const newKey = `${folder}/${base}`;
              // 덮어쓰기 방지
              if (!map[newKey]) {
                map[newKey] = map[oldKey];
                delete map[oldKey];
              }
            });
            chrome.storage.local.set({ wildcards: map }, refresh);
          });
        });

        hdr.addEventListener('dragenter', e => {
          e.preventDefault();
          hdr.classList.add('drop-target');
        });
        // 다른 곳으로 빠져나갈 때 원래대로
        hdr.addEventListener('dragleave', e => {
          hdr.classList.remove('drop-target');
        });
        const delBtn = document.createElement('button');
        delBtn.textContent = 'delete folder';
        delBtn.style.cssText = 'float:right; margin-top:-18px; padding: 0 5px;';
        delBtn.onclick = e => {
          e.stopPropagation();
          if (!confirm(`Delete '${folder}' folder and all files inside?`)) return;
          const newMap = { ...map };
          Object.keys(newMap).forEach(k => { if (k.startsWith(folder + '/')) delete newMap[k]; });
          const newFolders = folders.filter(f => f !== folder);
          chrome.storage.local.set({ wildcards: newMap, wildcardFolders: newFolders }, () => {
            if (currentFolder === folder) currentFolder = null;
            refresh();
          });
        };
        li.append(hdr, delBtn);
        list.appendChild(li);
      });
      Object.keys(map).filter(k => !k.includes('/')).sort().forEach(name => {
        const li = document.createElement('li');
        li.className = 'file-item';
        // 파일 경로(key)를 data-key 에 저장
        const key = currentFolder ? `${currentFolder}/${name}` : name;
        li.dataset.key = key;
        // 드래그 가능하게
        li.setAttribute('draggable', 'true');

        // 클릭으로 선택 토글 (Ctrl/Cmd + 클릭으로 멀티셀렉트)
        li.addEventListener('click', e => {
          // 현재 리스트의 모든 파일 아이템
          const items = Array.from(document.querySelectorAll('li.file-item'));
          const thisIndex = items.indexOf(li);

          if (e.shiftKey && lastSelectedIndex !== null) {
            // Shift+Click: 마지막 선택 지점↔현재 지점 사이 모두 선택
            const [start, end] = [lastSelectedIndex, thisIndex].sort((a, b) => a - b);
            items.slice(start, end + 1).forEach(el => el.classList.add('selected'));
          }
          else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd+Click: 토글
            li.classList.toggle('selected');
          }
          else {
            // 일반 클릭: 다른 건 해제 후 현재만 선택
            items.forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
          }

          // 클릭 후에는 인덱스 기억
          lastSelectedIndex = thisIndex;
        });

        // dragstart 시 선택된 항목들의 key 리스트 전송
        li.addEventListener('dragstart', e => {
          const selItems = document.querySelectorAll('.file-item.selected');
          const keys = selItems.length
            ? Array.from(selItems).map(el => el.dataset.key)
            : [key];
          e.dataTransfer.setData('application/json', JSON.stringify(keys));
        });
        li.textContent = name + '.txt';
        const del = document.createElement('button');
        del.textContent = 'delete';
        del.onclick = () => { delete map[name]; chrome.storage.local.set({ wildcards: map }, refresh); };
        li.append(del);
        list.appendChild(li);
      });

    } else {
      // Folder view: show only files in currentFolder
      Object.keys(map).filter(k => k.startsWith(currentFolder + '/')).sort().forEach(fullKey => {
        const fileName = fullKey.slice(currentFolder.length + 1);
        const li = document.createElement('li');
        li.className = 'file-item';
        // 파일 경로(key)를 data-key 에 저장
        const key = currentFolder ? `${currentFolder}/${fileName}` : fileName;
        li.dataset.key = key;
        // 드래그 가능하게
        li.setAttribute('draggable', 'true');

        // 클릭으로 선택 토글 (Ctrl/Cmd + 클릭으로 멀티셀렉트)
        li.addEventListener('click', e => {
          // 현재 리스트의 모든 파일 아이템
          const items = Array.from(document.querySelectorAll('li.file-item'));
          const thisIndex = items.indexOf(li);

          if (e.shiftKey && lastSelectedIndex !== null) {
            // Shift+Click: 마지막 선택 지점↔현재 지점 사이 모두 선택
            const [start, end] = [lastSelectedIndex, thisIndex].sort((a, b) => a - b);
            items.slice(start, end + 1).forEach(el => el.classList.add('selected'));
          }
          else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd+Click: 토글
            li.classList.toggle('selected');
          }
          else {
            // 일반 클릭: 다른 건 해제 후 현재만 선택
            items.forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
          }

          // 클릭 후에는 인덱스 기억
          lastSelectedIndex = thisIndex;
        });

        // dragstart 시 선택된 항목들의 key 리스트 전송
        li.addEventListener('dragstart', e => {
          const selItems = document.querySelectorAll('.file-item.selected');
          const keys = selItems.length
            ? Array.from(selItems).map(el => el.dataset.key)
            : [key];
          e.dataTransfer.setData('application/json', JSON.stringify(keys));
        });
        li.textContent = fileName + '.txt';
        const del = document.createElement('button');
        del.textContent = 'delete';
        del.onclick = () => { delete map[fullKey]; chrome.storage.local.set({ wildcards: map }, refresh); };
        li.append(del);
        list.appendChild(li);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', refresh);

document.addEventListener('dragstart', e => {
  // file-item 또는 그 자식 요소에서 시작한 드래그라면
  if (e.target.closest('.file-item')) {
    backBtn.classList.add('active');
  }
});

// 드래그가 종료될 때 (drop 또는 취소)
document.addEventListener('dragend', e => {
  backBtn.classList.remove('active');
});

// 혹시 drop 이벤트에서 바로 제거되지 않는 경우 안전망으로
backBtn.addEventListener('drop', e => {
  backBtn.classList.remove('active');
});

document.addEventListener('dragstart', e => {
  if (e.target.closest('.file-item')) {
    // 백 버튼
    backBtn.classList.add('active');
    // 모든 폴더 헤더 (root 뷰에만 존재)
    document.querySelectorAll('.folder-header')
      .forEach(el => el.classList.add('active'));
  }
});

// 드래그 종료 시: active 클래스 제거
document.addEventListener('dragend', () => {
  backBtn.classList.remove('active');
  document.querySelectorAll('.folder-header')
    .forEach(el => el.classList.remove('active'));
});
// 혹시 drop 시에도 안전하게 제거
document.addEventListener('drop', () => {
  backBtn.classList.remove('active');
  document.querySelectorAll('.folder-header')
    .forEach(el => el.classList.remove('active'));
});

document.addEventListener('DOMContentLoaded', () => {
  // 1) 드래그 시작/끝 토글
  document.addEventListener('dragstart', e => {
    if (e.target.closest('.file-item')) isDragging = true;
  });
  document.addEventListener('dragend', () => { isDragging = false; });
  document.addEventListener('drop', () => { isDragging = false; });

  // 2) 자동 상하 스크롤
  document.addEventListener('dragover', e => {
    if (!isDragging) return;
    const TOP_ZONE = 40;                   // 상단에서 40px 이내
    const BOTTOM_ZONE = window.innerHeight - 40; // 하단에서 40px 이내

    if (e.clientY < TOP_ZONE) {
      // 위로
      window.scrollBy(0, -20);
    } else if (e.clientY > BOTTOM_ZONE) {
      // 아래로 (필요시)
      window.scrollBy(0, 20);
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // 1) 저장된 언어 불러오기(없으면 en)
  chrome.storage.local.get(LANG_KEY, data => {
    const lang = data[LANG_KEY] || 'en';
    setLang(lang);
  });

  // 2) 버튼 클릭 시 저장 + 반영
  document.getElementById('btn-en').addEventListener('click', () => {
    chrome.storage.local.set({ [LANG_KEY]: 'en' }, () => setLang('en'));
  });
  document.getElementById('btn-jp').addEventListener('click', () => {
    chrome.storage.local.set({ [LANG_KEY]: 'jp' }, () => setLang('jp'));
  });
});

// Settings checkbox handlers
const preserveChk = document.getElementById('preservePrompt');
chrome.storage.local.get('preservePrompt', d => { preserveChk.checked = !!d.preservePrompt; });
preserveChk.addEventListener('change', () => { chrome.storage.local.set({ preservePrompt: preserveChk.checked }); });
const autoCompleteChk = document.getElementById('alternativeDanbooruAutocomplete');
chrome.storage.local.get('alternativeDanbooruAutocomplete', d => { autoCompleteChk.checked = !!d.alternativeDanbooruAutocomplete; });
autoCompleteChk.addEventListener('change', () => { chrome.storage.local.set({ alternativeDanbooruAutocomplete: autoCompleteChk.checked }); });
const tabChk = document.getElementById('triggerTab');
chrome.storage.local.get('triggerTab', d => { tabChk.checked = !!d.triggerTab; });
tabChk.addEventListener('change', () => { chrome.storage.local.set({ triggerTab: tabChk.checked }); });
const spaceChk = document.getElementById('triggerSpace');
chrome.storage.local.get('triggerSpace', d => { spaceChk.checked = !!d.triggerSpace; });
spaceChk.addEventListener('change', () => { chrome.storage.local.set({ triggerSpace: spaceChk.checked }); });