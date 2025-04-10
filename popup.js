// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list      = document.getElementById('list');
const v3chk     = true; // document.getElementById('v3mode');

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

// chrome.storage.local.get('v3mode', d => {
//   v3chk.checked = !!d.v3mode;
// });

// v3chk.addEventListener('change', () => {
//   chrome.storage.local.set({ v3mode: v3chk.checked });
// });

document.addEventListener('DOMContentLoaded', refresh);
