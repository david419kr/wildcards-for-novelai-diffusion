// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list = document.getElementById('list');
const v3chk = true; // document.getElementById('v3mode');

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;

  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};

    let remaining = files.length;
    files.forEach(f => {
      const key = f.name.replace(/\.[^.]+$/, '');

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

function refresh() {
  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};
    list.innerHTML = '';

    const delAll = document.createElement('button');
    delAll.textContent = 'delete all';
    delAll.style.float = 'right';
    delAll.style.marginRight = '0px';
    delAll.style.marginTop = '-25px';
    delAll.onclick = () => {
      if (!confirm('Are you sure you want to delete all wildcards?')) return;
      chrome.storage.local.set({ wildcards: {} }, refresh);
    };
    if (Object.keys(map).length) {
      delAll.style.display = 'block';
    } else {
      delAll.style.display = 'none';
    }
    list.appendChild(delAll);

    Object.keys(map).forEach(name => {
      const li = document.createElement('li');
      li.textContent = `${name}.txt`;
      const del = document.createElement('button');
      del.textContent = 'delete';
      del.onclick = () => {
        delete map[name];
        chrome.storage.local.set({ wildcards: map }, refresh);
      };
      li.appendChild(del);
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
