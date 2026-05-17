/**
 * 家族アルバムアプリ - script.js
 * 機能: パスワード認証ゲートウェイ + バルクロード・動画再生マルチメディア対応版
 */
import PhotoSwipeLightbox from 'https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe-lightbox.esm.min.js';

const GAS_API_URL = CONFIG.GAS_API_URL;
const ALBUM_PASSWORD = CONFIG.ALBUM_PASSWORD;
let currentFolderId = null;

const lightbox = new PhotoSwipeLightbox({
  gallery: '#photo-grid',
  children: 'a.pswp-link',
  pswpModule: () => import('https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe.esm.min.js')
});
lightbox.init();

const sections = {
  view: document.getElementById('section-view'),
  create: document.getElementById('section-create'),
  photos: document.getElementById('section-photos')
};

let touchStart = 0;
let pullDistance = 0;
const threshold = 80;
const container = document.getElementById('main-container');
const pullIndicator = document.getElementById('pull-indicator');
const arrow = pullIndicator.querySelector('.arrow-icon');
const spinner = pullIndicator.querySelector('.refresh-spinner');

window.onload = () => {
  if (sessionStorage.getItem('family_album_auth') === 'true') {
    document.getElementById('lock-screen').style.display = 'none';
    showSection('view');
    loadAlbums();
  } else {
    document.getElementById('lock-screen').style.display = 'flex';
  }
  initPullToRefresh();
  initVideoModalEvents(); // 動画再生イベント初期化
};

document.getElementById('btn-login').onclick = () => {
  const input = document.getElementById('password-input').value;
  const errorEl = document.getElementById('lock-error');
  
  if (input === ALBUM_PASSWORD) {
    errorEl.style.display = 'none';
    sessionStorage.setItem('family_album_auth', 'true');
    document.getElementById('lock-screen').style.display = 'none';
    showSection('view');
    loadAlbums();
  } else {
    errorEl.style.display = 'block';
    document.getElementById('password-input').value = '';
  }
};

document.getElementById('password-input').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
};

function initPullToRefresh() {
  window.addEventListener('touchstart', e => {
    if (window.scrollY === 0) touchStart = e.touches[0].pageY;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (touchStart === 0 || window.scrollY > 0) return;
    const touchY = e.touches[0].pageY;
    pullDistance = Math.max(0, (touchY - touchStart) * 0.4);
    if (pullDistance > 0) {
      container.style.transform = `translateY(${pullDistance}px)`;
      pullIndicator.style.transform = `translateY(${pullDistance}px)`;
      arrow.style.transform = `rotate(${Math.min(180, (pullDistance/threshold)*180)}deg)`;
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (pullDistance >= threshold && sections.view.style.display !== 'none') {
      arrow.style.display = 'none';
      spinner.style.display = 'block';
      await loadAlbums();
      setTimeout(() => { resetPull(); }, 500);
    } else {
      resetPull();
    }
    touchStart = 0;
    pullDistance = 0;
  });
}

function resetPull() {
  container.style.transform = '';
  pullIndicator.style.transform = '';
  setTimeout(() => {
    arrow.style.display = 'block';
    spinner.style.display = 'none';
    arrow.style.transform = '';
  }, 200);
}

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
      const card = document.createElement('div');
      card.className = 'album-card';
      
      const coverEl = document.createElement('div');
      coverEl.className = 'album-cover';
      
      if (a.coverUrl) {
        coverEl.style.backgroundImage = `url('${a.coverUrl}')`;
        coverEl.innerText = '';
      } else {
        coverEl.innerText = '📂';
      }
      
      const infoEl = document.createElement('div');
      infoEl.className = 'album-info';
      infoEl.innerHTML = `<span class="album-name">${a.name}</span>`;
      
      card.appendChild(coverEl);
      card.appendChild(infoEl);
      card.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(card);
    });
    toggleLoading(false);
  } else {
    toggleLoading(true, "エラー: " + result.error);
  }
}

/**
 * 変更：画像・動画のマルチレイアウトレンダリング対応
 */
async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  document.getElementById('album-memo').value = "";
  
  toggleLoading(true, "データを取得中...");
  
  const folderDataRes = await callApi('GET', { action: 'getFolderData', folderId: id });
  let currentCoverId = null;
  if (folderDataRes.success) {
    document.getElementById('album-memo').value = folderDataRes.data.memo || "";
    currentCoverId = folderDataRes.data.coverId;
  }

  const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
  toggleLoading(false);

  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';
  
  if (photoRes.success && photoRes.data.length > 0) {
    photoRes.data.forEach(p => {
      const photoItem = document.createElement('div');
      photoItem.className = 'photo-item';
      
      if (p.isVideo) {
        // 【動画用構造】タップ時にPhotoSwipeではなく専用モーダルをキックするラッパー
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        videoWrapper.style.position = 'relative';
        videoWrapper.style.width = '100%';
        videoWrapper.style.height = '100%';
        videoWrapper.style.cursor = 'pointer';
        
        const img = document.createElement('img');
        img.src = p.viewUrl;
        img.loading = 'lazy';
        
        // 動画であることを示す▶バッジを中央に配置
        const playBadge = document.createElement('div');
        playBadge.className = 'video-badge';
        playBadge.innerHTML = '▶';
        
        videoWrapper.appendChild(img);
        videoWrapper.appendChild(playBadge);
        videoWrapper.onclick = () => openVideoModal(p.videoUrl);
        
        photoItem.appendChild(videoWrapper);
      } else {
        // 【画像用構造】PhotoSwipeLightboxが検知する従来のアンカーリンク
        const a = document.createElement('a');
        a.className = 'pswp-link';
        if (p.viewUrl) {
          a.href = p.viewUrl.replace(/&sz=w\d+/, '&sz=w1600');
        }
        
        const img = document.createElement('img');
        img.loading = 'lazy';
        if (p.viewUrl) img.src = p.viewUrl;
        
        img.onload = () => {
          if (img.naturalWidth > 0) {
            a.setAttribute('data-pswp-width', img.naturalWidth);
            a.setAttribute('data-pswp-height', img.naturalHeight);
          }
        };
        a.appendChild(img);
        photoItem.appendChild(a);
      }
      
      const coverBtn = document.createElement('button');
      coverBtn.className = 'set-cover-btn';
      if (p.id === currentCoverId) coverBtn.classList.add('is-cover');
      coverBtn.innerHTML = '★';
      coverBtn.onclick = (e) => {
        e.stopPropagation();
        setAsCover(p.id);
      };

      photoItem.appendChild(coverBtn);
      grid.appendChild(photoItem);
    });
  }
}

/**
 * 【新規追加】動画再生モーダルの制御ロジック
 */
function openVideoModal(videoUrl) {
  const modal = document.getElementById('video-modal');
  const video = document.getElementById('modal-video');
  video.src = videoUrl;
  modal.style.display = 'flex';
  video.play().catch(() => {}); // オートプレイの試行
}

function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  const video = document.getElementById('modal-video');
  video.pause();
  video.src = ''; // メモリリーク防止と通信遮断
  modal.style.display = 'none';
}

function initVideoModalEvents() {
  document.getElementById('btn-close-video').onclick = () => closeVideoModal();
  // 背景の黒い部分をタップしても閉じられる親切設計
  document.getElementById('video-modal').onclick = (e) => {
    if (e.target.id === 'video-modal') closeVideoModal();
  };
}

async function setAsCover(fileId) {
  if (!confirm('この写真をカバーに設定しますか？')) return;
  toggleLoading(true, "設定中...");
  const result = await callApi('POST', { action: 'setCover', folderId: currentFolderId, fileId: fileId });
  toggleLoading(false);
  if (result.success) {
    loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
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
