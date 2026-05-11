/**
 * 家族アルバムアプリ - フロントエンド制御スクリプト (GitHub Pages用)
 * * 機能:
 * 1. GAS APIとのJSON通信 (アルバム・写真の取得、アップロード、フォルダ作成)
 * 2. exifrライブラリによるHEIC/JPEGのEXIF解析と自動リネーム
 * 3. 撮影日時（ファイル名）に基づく昇順ソート表示
 * 4. PhotoSwipeによる画像ビューアー表示 (アスペクト比修正済み)
 */
import PhotoSwipeLightbox from 'https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.3.7/photoswipe-lightbox.esm.min.js';

const GAS_API_URL = CONFIG.GAS_API_URL;
let currentFolderId = null;

// PhotoSwipeライブラリの初期化 (以前のまま維持)
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

// --- 初期化処理 ---
window.onload = () => {
  showSection('view');
  loadAlbums(); // 起動時にアルバム一覧を自動読み込み
};

// --- イベントリスナーの登録 (モジュール化対応) ---
document.getElementById('btn-show-create').onclick = () => showSection('create');
document.getElementById('btn-back-from-create').onclick = () => showSection('view');
document.getElementById('btn-back-to-list').onclick = () => {
  showSection('view');
  loadAlbums(); // 一覧に戻るときに再読み込み
};

// --- セクション切り替え管理 ---
function showSection(id) {
  Object.keys(sections).forEach(key => {
    sections[key].style.display = (key === id) ? 'block' : 'none';
  });
  if (id === 'view') currentFolderId = null;
}

// --- 通信共通関数 (CORS/リダイレクト対応) ---
async function callApi(method, payload = null) {
  const options = { method: method, redirect: 'follow' };
  if (method === 'POST' && payload) options.body = JSON.stringify(payload);

  try {
    const url = method === 'GET' && payload 
      ? `${GAS_API_URL}?${new URLSearchParams(payload)}` 
      : GAS_API_URL;

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    
    const result = await response.json();
    console.log('API Response:', result); 
    return result;
  } catch (err) {
    console.error('API通信失敗:', err);
    return { success: false, error: '通信に失敗しました: ' + err.message };
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
    
    // アルバム名（日付）で降順ソート
    result.data.sort((a, b) => b.name.localeCompare(a.name));
    
    result.data.forEach(a => {
      const div = document.createElement('div');
      div.className = 'album-item';
      div.innerHTML = `<span class="album-name">📂 ${a.name}</span>▶`;
      div.onclick = () => loadPhotos(a.id, a.name);
      list.appendChild(div);
    });
  } else {
    alert('アルバム一覧の取得に失敗しました:\n' + result.error);
  }
}

// --- 写真とメモの表示 (アスペクト比修正済み) ---
async function loadPhotos(id, name) {
  currentFolderId = id;
  showSection('photos');
  document.getElementById('current-album-name').innerText = name;
  document.getElementById('album-memo').value = "";
  document.getElementById('memo-status').innerText = "";
  
  toggleLoading(true); // 読み込み中であることを明示

  // メモの読み込み
  const memoRes = await callApi('GET', { action: 'getMemo', folderId: id });
  if (memoRes.success) document.getElementById('album-memo').value = memoRes.data || "";

  // 写真の読み込み
  const photoRes = await callApi('GET', { action: 'getPhotos', folderId: id });
  // ここでtoggleLoading(false)をしない。画像読み込み完了後に消す。

  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '';

  if (photoRes.success) {
    if (result.data.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#70757a; padding:40px 0;">写真がありません</p>';
      toggleLoading(false);
      return;
    }

    // ファイル名（YYYYMMDD_HHMMSS）で昇順にソートして時系列にする
    photoRes.data.sort((a, b) => a.name.localeCompare(b.name));

    // 画像読み込み完了を待機するためのプロミスの配列
    const imageLoadPromises = [];

    photoRes.data.forEach(p => {
      const promise = new Promise((resolve) => {
        const fullUrl = p.viewUrl.replace('&sz=w800', '');
        const a = document.createElement('a');
        a.href = fullUrl;
        a.target = '_blank';

        const img = document.createElement('img');
        img.src = p.viewUrl;
        img.loading = 'lazy';
        
        img.onload = () => {
          // 修正ポイント：グリッド用のサムネイル画像が読み込まれたら、
          // その naturalWidth / naturalHeight を元に data-pswp-width / height を設定
          a.setAttribute('data-pswp-width', img.naturalWidth.toString());
          a.setAttribute('data-pswp-height', img.naturalHeight.toString());
          resolve();
        };
        img.onerror = () => {
          // 読み込み失敗時はフォールバックとして固定値を設定
          a.setAttribute('data-pswp-width', '1600');
          a.setAttribute('data-pswp-height', '1200');
          resolve();
        };

        a.appendChild(img);
        grid.appendChild(a);
      });
      imageLoadPromises.push(promise);
    });

    // すべてのサムネイル画像の読み込み（アスペクト比取得）が完了するのを待つ
    // toggleLoading(true); // 以前のtoggleLoading(true)が効いているので不要
    await Promise.all(imageLoadPromises);
    toggleLoading(false); // すべて完了したらローディングを消す
  } else {
    alert('写真一覧の取得に失敗しました:\n' + result.error);
    toggleLoading(false); // 失敗時も消す
  }
}

// --- メモ保存 ---
document.getElementById('btn-save-memo').onclick = async () => {
  const status = document.getElementById('memo-status');
  status.innerText = "保存中...";
  const memo = document.getElementById('album-memo').value;
  const result = await callApi('POST', { action: 'saveMemo', folderId: currentFolderId, memo: memo });
  
  if (result.success) {
    status.innerText = "保存しました ✨";
    setTimeout(() => status.innerText = "", 2000);
  } else {
    status.innerText = "保存に失敗しました";
  }
};

// --- アルバム作成 ---
document.getElementById('btn-create').onclick = async () => {
  const name = document.getElementById('eventName').value;
  if (!name) return alert('アルバム名を入力してください');
  
  toggleLoading(true);
  const result = await callApi('POST', { action: 'createFolder', name: name });
  toggleLoading(false);

  if (result.success) {
    document.getElementById('eventName').value = '';
    await loadAlbums(); // 一覧を更新
    showSection('view'); // 一覧に戻る
  }
};

// --- アップロード (HEIC対応・EXIFリネーム付き) ---
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
      // 1. exifrを使用して撮影日時を取得し、リネーム
      const newFileName = await generateFileNameFromExif(file);

      // 2. Base64変換
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
    }
  }
  
  status.innerText = 'アップロード完了 ✨';
  status.style.background = '#e6f4ea';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
  
  // 表示を最新の状態に更新
  loadPhotos(currentFolderId, document.getElementById('current-album-name').innerText);
};

/**
 * exifrを使用してHEIC/JPEGから撮影日時を抽出し、ファイル名を生成する
 * 形式: YYYYMMDD_HHMMSS.ext
 */
async function generateFileNameFromExif(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  try {
    // exifr.parse() はHEICのメタデータ読み取りもサポート
    const data = await exifr.parse(file);
    const dateTime = data ? data.DateTimeOriginal : null;

    // DateTimeOriginal が Date オブジェクトか確認
    if (dateTime instanceof Date) {
      const y = dateTime.getFullYear();
      const m = ("0" + (dateTime.getMonth() + 1)).slice(-2);
      const d = ("0" + dateTime.getDate()).slice(-2);
      const hh = ("0" + dateTime.getHours()).slice(-2);
      const mm = ("0" + dateTime.getMinutes()).slice(-2);
      const ss = ("0" + dateTime.getSeconds()).slice(-2);
      return `${y}${m}${d}_${hh}${mm}${ss}.${ext}`;
    }
  } catch (err) {
    console.warn("EXIF解析に失敗しました。ファイル日時を使用します:", err);
  }

  // EXIFが取得できない場合のフォールバック（最終更新日時を使用）
  const fallbackDate = new Date(file.lastModified || Date.now());
  const f = (n) => ("0" + n).slice(-2);
  return `${fallbackDate.getFullYear()}${f(fallbackDate.getMonth()+1)}${f(fallbackDate.getDate())}_${f(fallbackDate.getHours())}${f(fallbackDate.getMinutes())}${f(fallbackDate.getSeconds())}_${file.name}`;
}

function toggleLoading(show) { 
  document.getElementById('loading').style.display = show ? 'flex' : 'none'; 
}
