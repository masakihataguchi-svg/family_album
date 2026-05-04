const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbx56QU-rgReKP0Xaw4BM2h0U010MD76eptuQ_IZowNtsPOIy3jOnh-zpeElYBvgkrLLAA/exec';
let currentFolderId = null;

// 要素取得
const sections = {
  create: document.getElementById('section-create'),
  view: document.getElementById('section-view'),
  photos: document.getElementById('section-photos')
};

// タブ切り替え
document.getElementById('tab-create').onclick = () => showSection('create');
document.getElementById('tab-view').onclick = () => { showSection('view'); loadAlbums(); };

function showSection(id) {
  Object.keys(sections).forEach(key => sections[key].style.display = key === id ? 'block' : 'none');
  document.getElementById('tab-create').classList.toggle('active', id === 'create');
  document.getElementById('tab-view').classList.toggle('active', id === 'view' || id === 'photos');
  document.getElementById('main-tabs').style.display = id === 'photos' ? 'none' : 'flex';
}

// アルバム作成
document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return alert('名前を入力してください');
  toggleLoading(true);
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'createFolder', name: name })
  });
  const result = await res.json();
  toggleLoading(false);
  if (result.success) {
    const msg = document.getElementById('create-msg');
    msg.style.display = 'block';
    msg.innerHTML = `成功！ <a href="${result.data.url}" target="_blank">ドライブで確認</a>`;
    document.getElementById('eventName').value = '';
  }
};

// 一覧取得
async function loadAlbums() {
  toggleLoading(true);
  const res = await fetch(`${GAS_API_URL}?action=getAlbums`);
  const result = await res.json();
  toggleLoading(false);
  const list = document.getElementById('album-list');
  list.innerHTML = '';
  result.data.forEach(a => {
    const div = document.createElement('div');
    div.className = 'album-item';
    div.innerHTML = `<span>📂 ${a.name}</span>▶`;
    div.onclick = () => loadPhotos(a.id, a.name);
    list.appendChild(div);
  });
}

// 写真表示
async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  toggleLoading(true);
  const res = await fetch(`${GAS_API_URL}?action=getPhotos&folderId=${id}`);
  const result = await res.json();
  toggleLoading(false);
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';
  result.data.forEach(p => {
    const img = document.createElement('img');
    img.src = p.viewUrl;
    img.loading = 'lazy';
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.appendChild(img);
    grid.appendChild(card);
  });
}

// アップロード
document.getElementById('file-upload').onchange = async (e) => {
  const files = e.target.files;
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  for (let i = 0; i < files.length; i++) {
    status.innerText = `送信中... (${i + 1}/${files.length})`;
    const base64Full = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(files[i]); });
    const [header, data] = base64Full.split(',');
    await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'upload',
        folderId: currentFolderId,
        fileName: files[i].name,
        base64Data: data,
        mimeType: header.match(/:(.*?);/)[1]
      })
    });
  }
  status.innerText = '完了しました';
  loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
};

document.getElementById('btn-back').onclick = () => showSection('view');
function toggleLoading(show) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; }
