// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list      = document.getElementById('list');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const key  = file.name.replace(/\.[^.]+$/, '');

  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.get('wildcards', d => {
      const map = d.wildcards || {};
      map[key]  = reader.result;
      chrome.storage.local.set({ wildcards: map }, refresh);
    });
  };
  reader.readAsText(file);
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
