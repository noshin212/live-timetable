import * as Y from 'https://esm.sh/yjs@13';
import { WebsocketProvider } from 'https://esm.sh/y-websocket@1.5';

// 1. 部屋IDの取得と接続
let roomId = new URLSearchParams(window.location.search).get('id');
if (!roomId) {
  roomId = Math.random().toString(36).substring(2, 9);
  window.history.replaceState(null, '', '?id=' + roomId);
}

const ydoc = new Y.Doc();
const yMetadata = ydoc.getMap('metadata'); 

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws`; 
const provider = new WebsocketProvider(wsUrl, roomId, ydoc);

provider.on('status', event => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    if (event.status === 'connected') {
      statusEl.textContent = `🟢 リアルタイム同期中 (ルーム: ${roomId})`;
      statusEl.style.color = '#2ecc71';
    } else {
      statusEl.textContent = '🔴 接続が切れました。再接続中...';
      statusEl.style.color = '#e74c3c';
    }
  }
});

// ---------------------------------------------------
// 複数タブ（日程）の管理ロジック
// ---------------------------------------------------
let currentTabId = null;
let currentArrayObserver = null;
let selectedIndex = null; 

function getActiveTimetable() {
  if (!currentTabId) return null;
  return ydoc.getArray(currentTabId);
}

setTimeout(() => {
  if (!yMetadata.has('tabs')) {
    ydoc.transact(() => {
      yMetadata.set('tabs', [{ id: 'day1', name: '1日目' }]);
      yMetadata.set('startTime_day1', '13:00');
      
      const oldTimetable = ydoc.getArray('timetable');
      const oldData = oldTimetable.toArray();
      if (oldData.length > 0) {
        ydoc.getArray('day1').insert(0, oldData);
        oldTimetable.delete(0, oldData.length);
      }
    });
  }
}, 500);

yMetadata.observe(() => {
  const tabs = yMetadata.get('tabs');
  if (!tabs || tabs.length === 0) return;

  if (!currentTabId) {
    window.switchTab(tabs[0].id);
  } else {
    renderTabs();
    
    const time = yMetadata.get(`startTime_${currentTabId}`) || '13:00';
    if (document.getElementById('startTime').value !== time) {
      document.getElementById('startTime').value = time;
    }
    renderList();
  }
});

function renderTabs() {
  const tabs = yMetadata.get('tabs') || [];
  const container = document.getElementById('tabContainer');
  container.innerHTML = '';

  tabs.forEach(tab => {
    const div = document.createElement('div');
    div.className = `tab ${tab.id === currentTabId ? 'active' : ''}`;
    div.textContent = tab.name;
    div.onclick = () => window.switchTab(tab.id);
    container.appendChild(div);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'tab-add';
  addBtn.textContent = '＋ 追加';
  addBtn.onclick = window.addTab;
  container.appendChild(addBtn);
}

// ---------------------------------------------------
// グローバル関数 (window経由でHTMLから呼ばれる)
// ---------------------------------------------------

window.switchTab = function(tabId) {
  if (currentTabId === tabId) return;

  if (currentTabId && currentArrayObserver) {
    ydoc.getArray(currentTabId).unobserve(currentArrayObserver);
  }
  
  currentTabId = tabId;
  selectedIndex = null; 

  document.getElementById('startTime').value = yMetadata.get(`startTime_${tabId}`) || '13:00';

  currentArrayObserver = () => { renderList(); };
  ydoc.getArray(currentTabId).observe(currentArrayObserver);

  renderTabs();
  renderList();
};

// ① モーダルを開く処理
window.addTab = function() {
  const tabs = yMetadata.get('tabs') || [];
  const input = document.getElementById('newTabNameInput');
  input.value = `${tabs.length + 1}日目`; 
  
  const modal = document.getElementById('tabModalOverlay');
  modal.style.display = 'flex'; 
  input.focus(); 
};

// ② モーダルを閉じる処理
window.closeAddTabModal = function() {
  document.getElementById('tabModalOverlay').style.display = 'none';
};

// ③ 追加ボタンが押された時の処理
window.confirmAddTab = function() {
  const input = document.getElementById('newTabNameInput');
  const newName = input.value.trim();
  
  if (!newName) {
    alert('日程の名前を入力してください');
    input.focus();
    return;
  }

  const tabs = [...(yMetadata.get('tabs') || [])];
  const newId = 'day' + Date.now(); 
  tabs.push({ id: newId, name: newName });
  
  ydoc.transact(() => {
    yMetadata.set('tabs', tabs);
    yMetadata.set(`startTime_${newId}`, '13:00');
  });

  window.switchTab(newId);
  window.closeAddTabModal();
};

document.getElementById('startTime').addEventListener('change', (e) => {
  if (currentTabId) {
    yMetadata.set(`startTime_${currentTabId}`, e.target.value);
  }
});

// ==========================================
// リストの描画とSortableJSの設定
// ==========================================
const timetableElement = document.getElementById('timetable');

new Sortable(timetableElement, {
  animation: 150,
  onEnd: function (evt) {
    if (evt.oldIndex === evt.newIndex) return;
    const currentTimetable = getActiveTimetable();
    ydoc.transact(() => {
      const item = currentTimetable.get(evt.oldIndex);
      currentTimetable.delete(evt.oldIndex, 1);
      currentTimetable.insert(evt.newIndex, [item]);
    });
  }
});

function renderList() {
  const currentTimetable = getActiveTimetable();
  if (!currentTimetable) return;

  timetableElement.innerHTML = '';
  const data = currentTimetable.toArray();

  let startTimeStr = yMetadata.get(`startTime_${currentTabId}`) || '13:00';
  let [hours, minutes] = startTimeStr.split(':').map(Number);
  let currentTime = new Date(2000, 0, 1, hours, minutes);

  data.forEach((item, index) => {
    const start = currentTime.toTimeString().slice(0, 5);
    const duration = parseInt(item.duration) || 0;
    currentTime.setMinutes(currentTime.getMinutes() + duration);
    const end = currentTime.toTimeString().slice(0, 5);

    const div = document.createElement('div');
    div.className = `item ${item.type}`;
    if (selectedIndex === index) div.classList.add('selected');
    
    div.dataset.index = index;

    div.innerHTML = `
      <span class="time-display">${start} 〜 ${end}</span>
      <div class="item-main">
        <span class="title">${item.name}</span>
        <input type="number" class="duration-edit hide-on-export" value="${duration}" min="1" onchange="window.updateDuration(this)">
        <span class="hide-on-export">分</span>
      </div>
      <div class="hide-on-export">
        <button class="btn share-btn" style="padding:4px 8px;" onclick="window.toggleSelect(${index})">⇄</button>
        <button class="btn reset-btn" style="padding:4px 8px;" onclick="window.removeItem(${index})">✖</button>
      </div>
    `;
    timetableElement.appendChild(div);
  });
}

// ==========================================
// アイテムの操作関数
// ==========================================
window.addItemFromInput = function(type) {
  const currentTimetable = getActiveTimetable();
  const bandNameInput = document.getElementById('bandName');
  const durationInput = document.getElementById('duration');

  let name = type === 'setup' ? '転換（セッティング）' : type === 'break' ? '休憩' : (bandNameInput.value || '名称未設定');
  let duration = type === 'setup' ? 10 : type === 'break' ? (parseInt(durationInput.value) || 15) : (parseInt(durationInput.value) || 20);

  currentTimetable.push([{ type, name, duration }]);
  if (type === 'band') bandNameInput.value = ''; 
};

window.updateDuration = function(inputElement) {
  const index = parseInt(inputElement.closest('.item').dataset.index);
  let newDuration = parseInt(inputElement.value);
  if (isNaN(newDuration) || newDuration < 0) newDuration = 0;

  const currentTimetable = getActiveTimetable();
  ydoc.transact(() => {
    const item = currentTimetable.get(index);
    currentTimetable.delete(index, 1);
    currentTimetable.insert(index, [{ ...item, duration: newDuration }]);
  });
};

window.toggleSelect = function(index) {
  const currentTimetable = getActiveTimetable();
  if (selectedIndex === index) {
    selectedIndex = null;
  } else if (selectedIndex === null) {
    selectedIndex = index;
  } else {
    ydoc.transact(() => {
      const arr = currentTimetable.toArray();
      const temp = arr[selectedIndex];
      arr[selectedIndex] = arr[index];
      arr[index] = temp;
      currentTimetable.delete(0, currentTimetable.length);
      currentTimetable.insert(0, arr);
    });
    selectedIndex = null;
  }
  renderList();
};

window.removeItem = function(index) {
  getActiveTimetable().delete(index, 1);
  if (selectedIndex === index) selectedIndex = null;
};

window.clearData = function() {
  if (confirm('現在のタブ（日程）のタイムテーブルを初期化しますか？')) {
    const currentTimetable = getActiveTimetable();
    ydoc.transact(() => {
      currentTimetable.delete(0, currentTimetable.length);
      yMetadata.set(`startTime_${currentTabId}`, '13:00');
    });
  }
};

// ==========================================
// エクスポート機能
// ==========================================
window.generateShareLink = function() {
  window.prompt('【スタッフ共有用】以下のURLをLINE等で共有してください：', window.location.href);
};

window.downloadAsImage = function() {
  const captureArea = document.getElementById('capture-area');
  captureArea.classList.add('exporting');
  
  html2canvas(captureArea, { backgroundColor: '#ffffff', scale: 2 }).then(canvas => {
    captureArea.classList.remove('exporting');
    const link = document.createElement('a');
    link.download = 'timetable.png'; 
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
};

window.downloadAsExcel = function() {
  const tabs = yMetadata.get('tabs') || [];
  const workbook = XLSX.utils.book_new();
  let hasAnyData = false;

  tabs.forEach(tab => {
    const data = ydoc.getArray(tab.id).toArray();
    if (data.length === 0) return; 

    let startTimeStr = yMetadata.get(`startTime_${tab.id}`) || '13:00';
    let [hours, minutes] = startTimeStr.split(':').map(Number);
    let currentTime = new Date(2000, 0, 1, hours, minutes);

    const excelData = data.map(item => {
      const start = currentTime.toTimeString().slice(0, 5);
      const duration = parseInt(item.duration) || 0;
      currentTime.setMinutes(currentTime.getMinutes() + duration);
      const end = currentTime.toTimeString().slice(0, 5);

      let typeName = 'バンド';
      if (item.type === 'setup') typeName = '転換';
      if (item.type === 'break') typeName = '休憩';

      return { "時間": `${start} - ${end}`, "種類": typeName, "名前": item.name, "分数": duration };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 5 }];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, tab.name);
    hasAnyData = true;
  });

  if (!hasAnyData) {
    alert('出力できるデータがありません（すべてのタブが空です）。');
    return;
  }

  XLSX.writeFile(workbook, "timetable.xlsx");
};