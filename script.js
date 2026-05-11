/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト
 */
import PhotoSwipeLightbox from 'https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe-lightbox.esm.min.js';

const GAS_API_URL = CONFIG.GAS_API_URL;
let currentFolderId = null;

// PhotoSwipeライブラリの初期化
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

// --- 初期化 ---
window.onload = () => {
  showSection('view');
  loadAlbums();
};

// --- イベントリスナーの登録 (モジュール化対応) ---
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

// --- 通信共通関数 ---
async function callApi(method, payload = null) {
  const options = { method: method, redirect: 'follow' };
  if (method === 'POST' && payload) options.body = JSON.stringify(payload);

  try {
    const url = method === 'GET' && payload 
      ? `${GAS_API_URL}?${new URLSearchParams(payload)}` 
      : GAS_API_URL;

    const response = await fetch(url, options);
    const result = await response.json();
    return result;
  } catch (err) {
    console.error('API通信失敗:', err);
    return { success: false, error: err.message };
  }
}

// --- アルバム一覧取得 ---
async function loadAlbums() {
  toggleLoading(true);
  const result = await callApi('GET', { action: 'getAlbums' });
  toggleLoading(false);

  const list = document.getElementById('album-list');
  list.innerHTML = '';

  if (result.success) {
    if (result.data.length === 0) {
      list.innerHTML = '<p style="text-align:center; color:#70757a; padding:20px;">アルバムがまだありません</p>';
      return;
    }
    result.data.sort((a, b) => b.name.localeCompare(a.name));
    result.data.forEach(a => {
      const div = document.createElement('div');
      div.className = 'album-item';
      div.innerHTML = `<span class="album-name">📂 ${a.name}</span>▶`;
      div.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(div);
    });
  }
}

// --- 写真とメモの表示 ---
async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  document.getElementById('album-memo').value = "";
  document.getElementById('memo-status').innerText = "";
  
  toggleLoading(true);
  const memoRes = await callApi('GET', { action: 'getMemo', folderId: id });
  if (memoRes.success) document.getElementById('album-memo').value = memoRes.data || "";

  const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
  toggleLoading(false);

  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';

  if (photoRes.success) {
    photoRes.data.forEach(p => {
      const fullUrl = p.viewUrl.replace('&sz=w800', '');
      const a = document.createElement('a');
      a.href = fullUrl;
      // サイズはPhotoSwipeの動作に必要ですが、一旦固定値を入れています
      a.setAttribute('data-pswp-width', '1600'); 
      a.setAttribute('data-pswp-height', '1200');
      a.target = '_blank';

      const img = document.createElement('img');
      img.src = p.viewUrl;
      img.loading = 'lazy';
      
      a.appendChild(img);
      grid.appendChild(a);
    });
  }
}

// --- メモ保存 ---
document.getElementById('btn-save-memo').onclick = async () => {
  const status = document.getElementById('memo-status');
  status.innerText = "保存中...";
  const result = await callApi('POST', { action: 'saveMemo', folderId: currentFolderId, memo: document.getElementById('album-memo').value });
  status.innerText = result.success ? "保存しました ✨" : "失敗しました";
  setTimeout(() => status.innerText = "", 2000);
};

// --- アルバム作成 ---
document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return alert('名前を入力してください');
  
  toggleLoading(true);
  const result = await callApi('POST', { action: 'createFolder', name: name });
  toggleLoading(false);

  if (result.success) {
    document.getElementById('eventName').value = '';
    await loadAlbums();
    showSection('view');
  }
};

// --- アップロード (EXIFリネーム付き) ---
document.getElementById('file-upload').onchange = async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  
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
