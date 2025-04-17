// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list = document.getElementById('list');
const v3chk = true; // document.getElementById('v3mode');
const folderInput     = document.getElementById('newFolderName');
const createFolderBtn = document.getElementById('createFolderBtn');

// 폴더 생성
createFolderBtn.addEventListener('click', () => {
  const name = folderInput.value.trim();
  if (!name) return alert('폴더명을 입력하세요.');
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    if (folders.includes(name) || map[name]) {
      return alert('이미 동일한 이름의 폴더/파일이 존재합니다.');
    }
    folders.push(name);
    chrome.storage.local.set({ wildcardFolders: folders }, refresh);
    folderInput.value = '';
  });
});

// 파일 업로드
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    let remaining = files.length;

    files.forEach(f => {
      const rel = f.webkitRelativePath || f.name;
      const key = rel.replace(/\.txt$/i, '');
      if (map[key]) {
        alert(`이미 존재하는 키입니다: ${key}`);
        if (--remaining === 0) chrome.storage.local.set({ wildcards: map }, refresh);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        map[key] = reader.result;
        if (--remaining === 0) {
          chrome.storage.local.set({ wildcards: map }, refresh);
        }
      };
      reader.readAsText(f);
    });
  });
  fileInput.value = '';
});

// 목록 렌더링
function refresh() {
  chrome.storage.local.get(['wildcards','wildcardFolders'], d => {
    const map = d.wildcards || {};
    const folders = d.wildcardFolders || [];
    list.innerHTML = '';

    // 전체 삭제 버튼
    const delAll = document.createElement('button');
    delAll.textContent = 'delete all';
    delAll.style.cssText = 'float:right; margin-top:-25px;';
    delAll.onclick = () => {
      if (!confirm('모두 삭제하시겠습니까?')) return;
      chrome.storage.local.set({ wildcards: {}, wildcardFolders: [] }, refresh);
    };
    delAll.style.display = Object.keys(map).length || folders.length ? 'block' : 'none';
    list.appendChild(delAll);

    // 각 폴더별 렌더링
    folders.sort().forEach(folder => {
      const li = document.createElement('li');
      // 헤더
      const hdr = document.createElement('div');
      hdr.className = 'folder-header';
      const title = document.createElement('span');
      title.textContent = folder;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'delete folder';
      delBtn.onclick = () => {
        if (!confirm(`폴더 '${folder}' 와 그 안의 모든 파일을 삭제하시겠습니까?`)) return;
        const newMap = { ...map };
        Object.keys(newMap).forEach(k => {
          if (k.startsWith(folder + '/')) delete newMap[k];
        });
        const newFolders = folders.filter(f => f !== folder);
        chrome.storage.local.set({ wildcards: newMap, wildcardFolders: newFolders }, refresh);
      };
      hdr.append(title, delBtn);
      li.appendChild(hdr);

      // 파일 리스트
      const subul = document.createElement('ul');
      subul.className = 'folder-list';
      subul.style.paddingLeft = '12px';
      Object.keys(map)
        .filter(k => k.startsWith(folder + '/'))
        .sort()
        .forEach(fullKey => {
          const fileName = fullKey.slice(folder.length + 1);
          const fileLi = document.createElement('li');
          fileLi.className = 'file-item';
          fileLi.textContent = fileName + '.txt';

          // 삭제 버튼
          const delFile = document.createElement('button');
          delFile.textContent = 'delete';
          delFile.onclick = () => {
            delete map[fullKey];
            chrome.storage.local.set({ wildcards: map }, refresh);
          };

          // 이동 드롭다운
          const moveSel = document.createElement('select');
          const rootOpt = document.createElement('option');
          rootOpt.value = '';
          rootOpt.textContent = 'root';
          moveSel.append(rootOpt);
          folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            moveSel.append(opt);
          });
          moveSel.value = folder;
          moveSel.onchange = () => {
            const target = moveSel.value;
            const newKey = target ? `${target}/${fileName}` : fileName;
            if (newKey === fullKey) return;
            if (map[newKey]) return alert(`키 중복: ${newKey}`);
            map[newKey] = map[fullKey];
            delete map[fullKey];
            chrome.storage.local.set({ wildcards: map }, refresh);
          };

          fileLi.append(delFile, moveSel);
          subul.appendChild(fileLi);
        });
      li.appendChild(subul);
      hdr.addEventListener('click', () => {
        subul.style.display = subul.style.display === 'none' ? 'block' : 'none';
      });
      list.appendChild(li);
    });

    // 루트 파일 렌더링
    Object.keys(map)
      .filter(k => !k.includes('/'))
      .sort()
      .forEach(name => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.textContent = name + '.txt';
        const del = document.createElement('button');
        del.textContent = 'delete';
        del.onclick = () => {
          delete map[name];
          chrome.storage.local.set({ wildcards: map }, refresh);
        };
        // 이동 드롭다운
        const moveSel = document.createElement('select');
        const rootOpt = document.createElement('option'); rootOpt.value = ''; rootOpt.textContent = 'root'; moveSel.append(rootOpt);
        folders.forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.textContent = f; moveSel.append(opt); });
        moveSel.value = '';
        moveSel.onchange = () => {
          const target = moveSel.value;
          const newKey = target ? `${target}/${name}` : name;
          if (map[newKey]) return alert(`키 중복: ${newKey}`);
          map[newKey] = map[name];
          delete map[name];
          chrome.storage.local.set({ wildcards: map }, refresh);
        };
        li.append(del, moveSel);
        list.appendChild(li);
      });
  });
}

// 0. 새 체크박스 핸들러 ───────────────────────────
const preserveChk = document.getElementById('preservePrompt');

// 저장값 → 체크박스 반영
chrome.storage.local.get('preservePrompt', d => {
  preserveChk.checked = !!d.preservePrompt;
});

// 체크 변경 → 저장
preserveChk.addEventListener('change', () => {
  chrome.storage.local.set({ preservePrompt: preserveChk.checked });
});

const autoCompleteChk = document.getElementById('alternativeDanbooruAutocomplete');

// 저장값 → 체크박스 반영
chrome.storage.local.get('alternativeDanbooruAutocomplete', d => {
  autoCompleteChk.checked = !!d.alternativeDanbooruAutocomplete;
});

// 체크 변경 → 저장
autoCompleteChk.addEventListener('change', () => {
  chrome.storage.local.set({ alternativeDanbooruAutocomplete: autoCompleteChk.checked });
});

const tabChk = document.getElementById('triggerTab');

// 저장값 → 체크박스 반영
chrome.storage.local.get('triggerTab', d => {
  tabChk.checked = !!d.triggerTab;
});

// 체크 변경 → 저장
tabChk.addEventListener('change', () => {
  chrome.storage.local.set({ triggerTab: tabChk.checked });
});

const spaceChk = document.getElementById('triggerSpace');

// 저장값 → 체크박스 반영
chrome.storage.local.get('triggerSpace', d => {
  spaceChk.checked = !!d.triggerSpace;
});

// 체크 변경 → 저장
spaceChk.addEventListener('change', () => {
  chrome.storage.local.set({ triggerSpace: spaceChk.checked });
});

document.addEventListener('DOMContentLoaded', refresh);
