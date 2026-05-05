/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト
 */

// config.jsからURLを取得するように変更
const GAS_API_URL = CONFIG.GAS_API_URL;
let currentFolderId = null;

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

function showSection(id) {
  Object.keys(sections).forEach(key => {
    sections[key].style.display = (key === id) ? 'block' : 'none';
  });
  if (id === 'view') currentFolderId = null;
}

// --- 通信共通関数 ---
async function callApi(method, payload = null) {
  const options = {
    method: method,
    redirect: 'follow'
  };
  if (method === 'POST' && payload) options.body = JSON.stringify(payload);

  try {
    const url = method === 'GET' && payload 
      ? `${GAS_API_URL}?${new URLSearchParams(payload)}` 
      : GAS_API_URL;

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('API通信失敗:', err);
    alert('通信に失敗しました。config.jsのURLと、GASのデプロイ設定を確認してください。');
    toggleLoading(false);
    return { success: false, error: err.message };
  }
}

// --- アルバム一覧の取得 ---
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
      div.innerHTML = `<span class="album-name">📂 ${a.name}</span><span class="arrow">▶</span>`;
      div.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(div);
    });
  }
}

// --- 写真一覧の表示 ---
async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  
  toggleLoading(true);
  const result = await callApi('GET', { action: 'getPhotos', folderId: id });
  toggleLoading(false);

  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';

  if (result.success) {
    result.data.sort((a, b) => a.name.localeCompare(b.name));
    result.data.forEach(p => {
      const img = document.createElement('img');
      img.src = p.viewUrl;
      img.loading = 'lazy';
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.onclick = () => window.open(p.viewUrl.replace('&sz=w800', ''));
      card.appendChild(img);
      grid.appendChild(card);
    });
  }
}

// --- アルバム作成 ---
document.getElementById('btn-show-create').onclick = () => showSection('create');

document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return alert('アルバム名を入力してください');
  
  toggleLoading(true);
  const result = await callApi('POST', { action: 'createFolder', name: name });
  toggleLoading(false);

  if (result.success) {
    document.getElementById('eventName').value = '';
    loadAlbums();
    showSection('view');
  }
};

// --- アップロード (HEIC/EXIF対応) ---
document.getElementById('file-upload').onchange = async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  status.style.background = '#fff3cd';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    status.innerText = `送信中... (${i + 1}/${files.length})`;

    try {
      const newFileName = await generateFileNameFromExif(file);
      const base64Full = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const [header, data] = base64Full.split(',');
      const mimeType = header.match(/:(.*?);/)[1];
      
      await callApi('POST', {
        action: 'upload',
        folderId: currentFolderId,
        fileName: newFileName,
        base64Data: data,
        mimeType: mimeType
      });
    } catch (err) { console.error(err); }
  }
  
  status.innerText = 'アップロード完了 ✨';
  status.style.background = '#e6f4ea';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
  loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
};

async function generateFileNameFromExif(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    const data = await exifr.parse(file);
    const dateTime = data ? data.DateTimeOriginal : null;
    if (dateTime instanceof Date) {
      const f = (n) => ("0" + n).slice(-2);
      return `${dateTime.getFullYear()}${f(dateTime.getMonth()+1)}${f(dateTime.getDate())}_${f(dateTime.getHours())}${f(dateTime.getMinutes())}${f(dateTime.getSeconds())}.${ext}`;
    }
  } catch (err) { console.warn(err); }

  const fallbackDate = new Date(file.lastModified || Date.now());
  const f = (n) => ("0" + n).slice(-2);
  return `${fallbackDate.getFullYear()}${f(fallbackDate.getMonth()+1)}${f(fallbackDate.getDate())}_${f(fallbackDate.getHours())}${f(fallbackDate.getMinutes())}${f(fallbackDate.getSeconds())}_${file.name}`;
}

document.getElementById('btn-back-to-list').onclick = () => {
  showSection('view');
  loadAlbums();
};

function toggleLoading(show) { 
  document.getElementById('loading').style.display = show ? 'flex' : 'none'; 
}
