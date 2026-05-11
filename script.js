/**
 * 家族アルバムアプリ - script.js
 * Androidフリーズ対策(非同期ロード) & アスペクト比完全修正版
 */
import PhotoSwipeLightbox from 'https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe-lightbox.esm.min.js';

const GAS_API_URL = CONFIG.GAS_API_URL;
let currentFolderId = null;

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
document.getElementById('btn-back-to-list').onclick = () => { showSection('view'); loadAlbums(); };

function showSection(id) {
  Object.keys(sections).forEach(key => sections[key].style.display = (key === id) ? 'block' : 'none');
}

async function callApi(method, payload = null) {
  const options = { method: method, redirect: 'follow' };
  if (method === 'POST' && payload) options.body = JSON.stringify(payload);
  try {
    const url = method === 'GET' && payload ? `${GAS_API_URL}?${new URLSearchParams(payload)}` : GAS_API_URL;
    const response = await fetch(url, options);
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function loadAlbums() {
  toggleLoading(true, "アルバムを取得中...");
  const result = await callApi('GET', { action: 'getAlbums' });
  if (result.success) {
    const list = document.getElementById('album-list');
    list.innerHTML = '';
    result.data.forEach(a => {
      const div = document.createElement('div');
      div.className = 'album-item';
      div.innerHTML = `<span>📂 ${a.name}</span>▶`;
      div.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(div);
    });
    toggleLoading(false);
  } else {
    toggleLoading(true, "エラー: " + result.error);
  }
}

async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  
  toggleLoading(true, "データを取得中...");
  
  // メモの取得（非同期で並行して行わないことで負荷を抑える）
  const memoRes = await callApi('GET', { action: 'getMemo', folderId: id });
  if (memoRes.success) document.getElementById('album-memo').value = memoRes.data || "";

  // 写真リストの取得
  const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
  
  // リストが届いたらすぐにロード画面を消す（Androidのフリーズ防止）
  toggleLoading(false);

  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';
  
  if (photoRes.success && photoRes.data.length > 0) {
    // ファイル名で時系列ソート
    photoRes.data.sort((a, b) => a.name.localeCompare(b.name));

    photoRes.data.forEach(p => {
      // 拡大用は w1600 を指定（アスペクト比維持のため）
      const fullUrl = p.viewUrl.replace(/&sz=w\d+/, '&sz=w1600');
      const thumbUrl = p.viewUrl.replace(/&sz=w\d+/, '&sz=w400'); // サムネイルは軽量化

      const a = document.createElement('a');
      a.href = fullUrl;
      
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.loading = 'lazy';

      // 【アスペクト比修正の核心】
      // 画像が読み込まれたらその画像の本来のサイズをPhotoSwipeに伝える
      img.onload = () => {
        if (img.naturalWidth > 0) {
          a.setAttribute('data-pswp-width', img.naturalWidth);
          a.setAttribute('data-pswp-height', img.naturalHeight);
        }
      };

      // デフォルト値（読み込み失敗時用）
      a.setAttribute('data-pswp-width', '1200');
      a.setAttribute('data-pswp-height', '1200');

      a.appendChild(img);
      grid.appendChild(a);
    });
  } else if (photoRes.success) {
    grid.innerHTML = '<p style="text-align:center; padding:20px;">写真がありません</p>';
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
  toggleLoading(true, "作成中...");
  const result = await callApi('POST', { action: 'createFolder', name: name });
  if (result.success) {
    document.getElementById('eventName').value = '';
    loadAlbums();
    showSection('view');
  } else {
    toggleLoading(true, "エラー: " + result.error);
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
  status.innerText = '完了';
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

function toggleLoading(show, text = "処理中...") { 
  const overlay = document.getElementById('loading');
  const textEl = document.getElementById('loading-text');
  if (textEl) textEl.innerText = text;
  overlay.style.display = show ? 'flex' : 'none'; 
}
