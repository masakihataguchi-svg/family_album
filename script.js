/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト
 * 修正内容: 変数名エラー(result -> photoRes)の修正、ロード画面解除のタイミング改善
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
  
  try {
    const memoRes = await callApi('GET', { action: 'getMemo', folderId: id });
    if (memoRes.success) document.getElementById('album-memo').value = memoRes.data || "";

    const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
    
    // データが取得できたらすぐにロード画面を消す
    toggleLoading(false);

    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '';

    if (photoRes.success) {
      if (photoRes.data.length === 0) { // 変数名を photoRes に修正
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#70757a; padding:40px 0;">写真がありません</p>';
        return;
      }

      photoRes.data.sort((a, b) => a.name.localeCompare(b.name));

      photoRes.data.forEach(p => {
        const fullUrl = p.viewUrl.replace('&sz=w800', '&sz=w1600');
        const a = document.createElement('a');
        a.href = fullUrl;
        a.target = '_blank';
        
        // 初期サイズを設定（アスペクト比読み込み前の仮置き）
        a.setAttribute('data-pswp-width', '1200');
        a.setAttribute('data-pswp-height', '1200');

        const img = document.createElement('img');
        img.src = p.viewUrl;
        img.loading = 'lazy';
        
        img.onload = () => {
          // 画像が読み込まれた瞬間に正しいアスペクト比に更新
          a.setAttribute('data-pswp-width', img.naturalWidth * 2);
          a.setAttribute('data-pswp-height', img.naturalHeight * 2);
        };

        a.appendChild(img);
        grid.appendChild(a);
      });
    }
  } catch (e) {
    console.error(e);
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

function toggleLoading(show) { 
  document.getElementById('loading').style.display = show ? 'flex' : 'none'; 
}
