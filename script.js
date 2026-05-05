/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト
 * 
 * 機能:
 * 1. GAS APIとの通信 (アルバム取得、写真取得、アップロード、フォルダ作成)
 * 2. EXIF解析による写真リネーム (YYYYMMDD_HHMMSS.jpg)
 * 3. 撮影日時（ファイル名）順のソート表示
 */

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwNiF9m2wALA9UtVf46zEaFRtvDsmtjJPP4FmwuMgVBLhTfUBbQQ-IfjqgXAdgxrmPEjw/exec';
let currentFolderId = null;

// HTML要素の定義
const sections = {
  view: document.getElementById('section-view'),
  create: document.getElementById('section-create'),
  photos: document.getElementById('section-photos')
};

// --- 初期化処理 ---
window.onload = () => {
  showSection('view');
  loadAlbums(); // 起動時にアルバム一覧を読み込む
};

// --- セクション切り替え ---
function showSection(id) {
  Object.keys(sections).forEach(key => {
    sections[key].style.display = (key === id) ? 'block' : 'none';
  });
  // 写真表示画面以外ではメインタブを表示（必要に応じて）
  const tabs = document.getElementById('main-tabs');
  if (tabs) tabs.style.display = (id === 'photos') ? 'none' : 'flex';
  
  if (id === 'view') currentFolderId = null;
}

// --- 通信共通関数 (CORS/リダイレクト対応) ---
async function callApi(method, payload = null) {
  const options = {
    method: method,
    redirect: 'follow' // GASの302リダイレクトを追跡
  };
  
  if (method === 'POST' && payload) {
    options.body = JSON.stringify(payload);
  }

  try {
    const url = method === 'GET' && payload 
      ? `${GAS_API_URL}?${new URLSearchParams(payload)}` 
      : GAS_API_URL;

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    
    return await response.json();
  } catch (err) {
    console.error('API通信失敗:', err);
    alert('通信に失敗しました。GASの設定（アクセス権限: 全員）を確認してください。\n' + err.message);
    toggleLoading(false);
    return { success: false, error: err.message };
  }
}

// --- アルバム一覧の取得と表示 ---
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
    // アルバム名でソート（Code.gs側でもソート済みだが念のため）
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

// --- 写真一覧の取得と表示 (日付順) ---
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
    if (result.data.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#70757a; padding:40px 0;">写真がありません</p>';
      return;
    }

    // ファイル名（YYYYMMDD_HHMMSS）で昇順にソート
    result.data.sort((a, b) => a.name.localeCompare(b.name));

    result.data.forEach(p => {
      const img = document.createElement('img');
      img.src = p.viewUrl;
      img.loading = 'lazy';
      const card = document.createElement('div');
      card.className = 'photo-card';
      // クリックで別タブで拡大表示（sz=w800を除去して元画像に近いサイズを狙う）
      card.onclick = () => window.open(p.viewUrl.replace('&sz=w800', ''));
      card.appendChild(img);
      grid.appendChild(card);
    });
  }
}

// --- アルバム作成処理 ---
document.getElementById('btn-show-create').onclick = () => showSection('create');

document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return alert('アルバム名を入力してください');
  
  toggleLoading(true);
  const result = await callApi('POST', { action: 'createFolder', name: name });
  toggleLoading(false);

  if (result.success) {
    document.getElementById('eventName').value = '';
    const msg = document.getElementById('create-msg');
    msg.style.display = 'block';
    msg.innerText = '作成しました！一覧に戻ります。';
    
    setTimeout(() => {
      msg.style.display = 'none';
      loadAlbums();
      showSection('view');
    }, 1500);
  }
};

// --- 写真アップロード (EXIF解析リネーム付き) ---
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
      // 1. EXIFから撮影日時を取得してリネーム後のファイル名を生成
      const newFileName = await generateFileNameFromExif(file);

      // 2. Base64化
      const base64Full = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const [header, data] = base64Full.split(',');
      const mimeType = header.match(/:(.*?);/)[1];
      
      // 3. GAS APIへ送信
      await callApi('POST', {
        action: 'upload',
        folderId: currentFolderId,
        fileName: newFileName,
        base64Data: data,
        mimeType: mimeType
      });
    } catch (err) {
      console.error('Upload Error:', err);
      alert(`${file.name} のアップロードに失敗しました。`);
    }
  }
  
  status.innerText = 'アップロード完了 ✨';
  status.style.background = '#e6f4ea';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
  
  // 表示を更新
  loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
};

/**
 * EXIF.jsを使用して撮影日時を抽出し、リネーム用文字列を生成する
 * 形式: YYYYMMDD_HHMMSS.jpg
 */
function generateFileNameFromExif(file) {
  return new Promise((resolve) => {
    // 拡張子を取得
    const ext = file.name.split('.').pop().toLowerCase();
    
    // EXIF解析実行 (exif-jsライブラリを使用)
    EXIF.getData(file, function() {
      const dateTime = EXIF.getTag(this, "DateTimeOriginal");
      let finalName;

      if (dateTime) {
        // EXIF形式 "2026:05:05 12:34:56" を "20260505_123456" に変換
        finalName = dateTime.replace(/:/g, "").replace(" ", "_") + "." + ext;
      } else {
        // EXIFがない場合は現在のタイムスタンプを付与してファイル名の衝突を避ける
        const now = new Date();
        const ts = now.getFullYear() + 
                   ("0" + (now.getMonth() + 1)).slice(-2) + 
                   ("0" + now.getDate()).slice(-2) + "_" + 
                   ("0" + now.getHours()).slice(-2) + 
                   ("0" + now.getMinutes()).slice(-2) + 
                   ("0" + now.getSeconds()).slice(-2);
        finalName = ts + "_" + file.name;
      }
      resolve(finalName);
    });
  });
}

// 戻るボタンの挙動
document.getElementById('btn-back-to-list').onclick = () => {
  showSection('view');
  loadAlbums();
};

function toggleLoading(show) { 
  document.getElementById('loading').style.display = show ? 'flex' : 'none'; 
}
