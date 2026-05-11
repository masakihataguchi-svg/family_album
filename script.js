/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト
 */
import PhotoSwipeLightbox from 'https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe-lightbox.esm.min.js';

const GAS_API_URL = CONFIG.GAS_API_URL;
let currentFolderId = null;

// PhotoSwipe初期化
const lightbox = new PhotoSwipeLightbox({
  gallery: '#photo-grid',
  children: 'a',
  pswpModule: () => import('https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe.esm.min.js')
});
lightbox.init();

const sections = {
  view: document.getElementById('section-view'),
  create: document.getElementById('section-create'),
  photos: document.getElementById('section-photos')
};

window.onload = () => {
  showSection('view');
  loadAlbums();
};

document.getElementById('btn-show-create').onclick = () => showSection('create');
document.getElementById('btn-back-from-create').onclick = () => showSection('view');
document.getElementById('btn-back-to-list').onclick = () => {
  showSection('view');
  loadAlbums();
};

function showSection(id) {
  Object.keys(sections).forEach(key => {
    sections[key].style.display = (key === id) ? 'block' : 'none';
  });
  if (id === 'view') currentFolderId = null;
}

async function callApi(method, payload = null) {
  const options = { method: method, redirect: 'follow' };
  if (method === 'POST' && payload) options.body = JSON.stringify(payload);
  try {
    const url = method === 'GET' && payload ? `${GAS_API_URL}?${new URLSearchParams(payload)}` : GAS_API_URL;
    const response = await fetch(url, options);
    return await response.json();
  } catch (err) {
    console.error('API失敗:', err);
    return { success: false, error: err.message };
  }
}

async function loadAlbums() {
  toggleLoading(true);
  const result = await callApi('GET', { action: 'getAlbums' });
  toggleLoading(false);
  const list = document.getElementById('album-list');
  list.innerHTML = '';
  if (result.success) {
    result.data.forEach(a => {
      const div = document.createElement('div');
      div.className = 'album-item';
      div.innerHTML = `<span class="album-name">📂 ${a.name}</span>▶`;
      div.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(div);
    });
  }
}

async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  document.getElementById('album-memo').value = "";
  
  toggleLoading(true);
  const memoRes = await callApi('GET', { action: 'getMemo', folderId: id });
  if (memoRes.success) document.getElementById('album-memo').value = memoRes.data || "";

  const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
  
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';

  if (photoRes.success) {
    const imageLoadPromises = [];

    photoRes.data.forEach(p => {
      const promise = new Promise((resolve) => {
        // 【修正ポイント】拡大用URLに w1600 を指定。これでアスペクト比が維持されます。
        const fullUrl = p.viewUrl.replace('&sz=w800', '&sz=w1600');
        
        const a = document.createElement('a');
        a.href = fullUrl;
        a.target = '_blank';

        const img = document.createElement('img');
        img.src = p.viewUrl; // サムネイルは w800
        img.loading = 'lazy';
        
        img.onload = () => {
          // サムネイルの縦横比をそのまま拡大枠に適用
          a.setAttribute('data-pswp-width', img.naturalWidth * 2); // 1600px相当に計算
          a.setAttribute('data-pswp-height', img.naturalHeight * 2);
          resolve();
        };
        img.onerror = resolve;

        a.appendChild(img);
        grid.appendChild(a);
      });
      imageLoadPromises.push(promise);
    });

    await Promise.all(imageLoadPromises);
    toggleLoading(false);
  } else {
    toggleLoading(false);
  }
}

document.getElementById('btn-save-memo').onclick = async () => {
  const status = document.getElementById('memo-status');
  status.innerText = "保存中...";
  const result = await callApi('POST', { action: 'saveMemo', folderId: currentFolderId, memo: document.getElementById('album-memo').value });
  status.innerText = result.success ? "保存しました ✨" : "失敗しました";
  setTimeout(() => status.innerText = "", 2000);
};

document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return;
  toggleLoading(true);
  const result = await callApi('POST', { action: 'createFolder', name: name });
  toggleLoading(false);
  if (result.success) {
    document.getElementById('eventName').value = '';
    loadAlbums();
    showSection('view');
  }
};

document.getElementById('file-upload').onchange = async (e) => {
  const files = e.target.files;
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  for (let i = 0; i < files.length; i++) {
    status.innerText = `送信中... (${i + 1}/${files.length})`;
    const newFileName = await generateFileNameFromExif(files[i]);
    const base64Full = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(files[i]); });
    const [header, data] = base64Full.split(',');
    await callApi('POST', { action: 'upload', folderId: currentFolderId, fileName: newFileName, base64Data: data, mimeType: header.match(/:(.*?);/)[1] });
  }
  status.innerText = 'アップロード完了 ✨';
  setTimeout(() => status.style.display = 'none', 2000);
  loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
};

async function generateFileNameFromExif(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    const data = await exifr.parse(file);
    if (data && data.DateTimeOriginal) {
      const d = data.DateTimeOriginal;
      const f = (n) => ("0" + n).slice(-2);
      return `${d.getFullYear()}${f(d.getMonth()+1)}${f(d.getDate())}_${f(d.getHours())}${f(d.getMinutes())}${f(d.getSeconds())}.${ext}`;
    }
  } catch (e) {}
  const d = new Date(file.lastModified || Date.now());
  const f = (n) => ("0" + n).slice(-2);
  return `${d.getFullYear()}${f(d.getMonth()+1)}${f(d.getDate())}_${f(d.getHours())}${f(d.getMinutes())}${f(d.getSeconds())}_${file.name}`;
}

function toggleLoading(show) { 
  document.getElementById('loading').style.display = show ? 'flex' : 'none'; 
}
