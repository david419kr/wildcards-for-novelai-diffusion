// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list      = document.getElementById('list');

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;

  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};

    let remaining = files.length;
    files.forEach(f => {
      const key = f.name.replace(/\.[^.]+$/, ''); // 확장자 제거

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
    Object.keys(map).forEach(name => {
      const li = document.createElement('li');
      li.textContent = `${name}.txt`;
      const del = document.createElement('button');
      del.textContent = '삭제';
      del.onclick = () => {
        delete map[name];
        chrome.storage.local.set({ wildcards: map }, refresh);
      };
      li.appendChild(del);
      list.appendChild(li);
    });
  });
}

document.addEventListener('DOMContentLoaded', refresh);
