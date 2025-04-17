// NovelAI Wildcards – popup.js
let currentFolder = null;

const list            = document.getElementById('list');
const folderInput     = document.getElementById('newFolderName');
const createFolderBtn = document.getElementById('createFolderBtn');
const backBtn         = document.getElementById('backBtn');
const viewTitle       = document.getElementById('viewTitle');
const fileRoot        = document.getElementById('fileRoot');
const fileInFolder    = document.getElementById('fileInFolder');
const rootContent     = document.getElementById('rootContent');

// Create new folder
document.getElementById('createFolderBtn').addEventListener('click', () => {
  const name = folderInput.value.trim();
  if (!name) return alert('Input folder name.');
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map     = d.wildcards || {};
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

// Root upload handler
fileRoot.addEventListener('change', e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map = d.wildcards || {};
    let remaining = files.length;
    files.forEach(f => {
      const rel = f.webkitRelativePath || f.name;
      const key = rel.replace(/\.txt$/i, '');
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
      const base = f.name.replace(/\.txt$/i, '');
      const key  = `${currentFolder}/${base}`;
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
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map     = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    list.innerHTML = '';

    // Toggle root vs folder view
    if (currentFolder) {
      backBtn.style.display      = 'inline-block';
      viewTitle.textContent      = `Folder: ${currentFolder}`;
      rootContent.style.display  = 'none';
      fileRoot.style.display     = 'none';
      fileInFolder.style.display = 'inline-block';
    } else {
      backBtn.style.display      = 'none';
      viewTitle.textContent      = 'Settings';
      rootContent.style.display  = 'block';
      fileRoot.style.display     = 'inline-block';
      fileInFolder.style.display = 'none';
    }

    // Delete all button
    // Delete all 버튼 (root vs folder 구분)
    const delAll = document.createElement('button');
    delAll.textContent = 'delete all';
    delAll.style.cssText = 'float:right; margin-top:-25px;';

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