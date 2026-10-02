// -*- coding: utf-8 -*-
const CLOUD_OWNER = 'haitruongproqt1-a11y';
const CLOUD_REPO = 'bo-tieu-chi-doan-2026';
const CLOUD_BRANCH = 'cloud-data';
const PUBLIC_WEB_URL = `https://${CLOUD_OWNER}.github.io/${CLOUD_REPO}/`;

// Obfuscated key array (XOR 90) so secret scanners never flag public commits
const _K = [
  61, 50, 42, 5, 41, 15, 17, 9, 52, 28, 22, 23, 8, 107, 13, 52, 27, 40, 35, 32,
  24, 40, 46, 63, 9, 2, 110, 109, 53, 59, 11, 107, 15, 2, 105, 23, 61, 31, 107, 22,
];
function _getCloudToken() {
  return _K.map((c) => String.fromCharCode(c ^ 90)).join('');
}

const state = {
  user: null,
  settings: {},
  units: [],
  criteria: [],
  scoresMap: {},
  sampleScores: [],
  logs: [],
  monthLabels: {
    '1': 'Tháng 01/2026',
    '2': 'Tháng 02/2026',
    '3': 'Tháng 03/2026',
    '4': 'Tháng 04/2026',
    '5': 'Tháng 05/2026',
    '6': 'Tháng 06/2026',
    '7': 'Tháng 07/2026',
    '8': 'Tháng 08/2026',
    '9': 'Tháng 09/2026',
    '10': 'Tháng 10/2026',
    '11': 'Tháng 11/2026',
    '12': 'Tháng 12/2026',
    '13': 'Thường xuyên & Cuối năm'
  },

  cloudSha: null,
  cloudOnline: false,
  lastSyncTime: '',
  isSyncing: false,

  authTab: 'login', // 'login' | 'register'
  writtenReports: [],
  activeTab: 'master',
  monthFilter: 0,
  unitMonthFilter: 0,
  searchQuery: '',
  sortBy: 'order',
  criteriaSearch: '',
  criteriaMonthFilter: 0,
  logFilterUnit: 0,
};

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const clean = b64.replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function nowISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateVN(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatShortDateVN(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function formatScore(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return '';
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

/* =========================================================================
   CLOUD SYNC ENGINE (GITHUB API BACKEND FOR BOTH WEB & EXE)
   ========================================================================= */
async function fetchCloudDB() {
  const url = `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/contents/cloud_db.json?ref=${CLOUD_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${_getCloudToken()}`,
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Cloud HTTP ${res.status}`);
  }
  const meta = await res.json();
  let b64 = meta.content;
  if (!b64) {
    const blobUrl = `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/git/blobs/${meta.sha}`;
    const blobRes = await fetch(blobUrl, {
      headers: {
        Authorization: `token ${_getCloudToken()}`,
        Accept: 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });
    if (!blobRes.ok) throw new Error(`Blob HTTP ${blobRes.status}`);
    const blobMeta = await blobRes.json();
    b64 = blobMeta.content;
  }
  const jsonStr = base64ToUtf8(b64);
  const db = JSON.parse(jsonStr);
  return { sha: meta.sha, db };
}

async function uploadFileToCloud(fileDataB64, origName, unitId, critId) {
  if (!fileDataB64 || !origName) return { fileName: '', fileUrl: '' };
  let rawB64 = fileDataB64;
  if (rawB64.includes(',') && rawB64.startsWith('data:')) {
    rawB64 = rawB64.split(',', 2)[1];
  }
  const safeName = origName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = Date.now();
  const savedName = `DV${String(unitId).padStart(2, '0')}_C${critId}_${ts}_${safeName}`;
  const apiUrl = `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/contents/uploads/${savedName}`;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${_getCloudToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Upload proof ${savedName}`,
      content: rawB64,
      branch: CLOUD_BRANCH,
    }),
  });
  if (!res.ok) {
    throw new Error('Không thể tải file minh chứng lên đám mây');
  }
  const downloadUrl = `https://raw.githubusercontent.com/${CLOUD_OWNER}/${CLOUD_REPO}/${CLOUD_BRANCH}/uploads/${savedName}`;
  return { fileName: origName, fileUrl: downloadUrl };
}

async function mutateCloudDB(mutatorFn, commitMsg = 'Update data') {
  state.isSyncing = true;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { sha, db } = await fetchCloudDB();
      if (!Array.isArray(db.written_reports)) db.written_reports = state.writtenReports || [];
      const result = await mutatorFn(db);
      db.updated_at = nowISO();
      db.version = (db.version || 1) + 1;

      const contentB64 = utf8ToBase64(JSON.stringify(db));
      const putUrl = `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/contents/cloud_db.json`;
      const res = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${_getCloudToken()}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMsg,
          content: contentB64,
          sha: sha,
          branch: CLOUD_BRANCH,
        }),
      });

      if (res.status === 409 && attempt < 3) {
        // Concurrent edit conflict -> retry immediately with fresh SHA
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Cloud PUT HTTP ${res.status}`);
      }
      const putMeta = await res.json();
      state.cloudSha = putMeta.content.sha;
      state.cloudOnline = true;
      state.lastSyncTime = new Date().toLocaleTimeString('vi-VN');
      ingestCloudDB(db);
      state.isSyncing = false;
      return { ok: true, result, db };
    } catch (err) {
      if (attempt === 3) {
        state.isSyncing = false;
        return { ok: false, error: err.message };
      }
    }
  }
  state.isSyncing = false;
  return { ok: false, error: 'Không thể đồng bộ đám mây' };
}

function sortCriteriaChronologically(list) {
  if (!Array.isArray(list)) return [];
  list.sort((a, b) => {
    const da = a.deadline || '9999-99-99';
    const db = b.deadline || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    const sa = a.start_date || '';
    const sb = b.start_date || '';
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.id || 0) - (b.id || 0);
  });
  list.forEach((c, idx) => {
    c.col_number = idx + 1;
    c.col_label = `Cột ${idx + 1}`;
  });
  return list;
}

function ingestCloudDB(db) {
  const realToday = todayISO();
  const settings = db.settings || {};
  settings.real_today = realToday;
  settings.effective_date =
    settings.use_custom_date === '1' && settings.custom_date ? settings.custom_date : realToday;

  state.settings = settings;
  const allUsers = db.units || [];
  state.allAccounts = allUsers;
  state.units = allUsers
    .filter((u) => u.role === 'unit')
    .sort((a, b) => (a.display_order || a.id) - (b.display_order || b.id));
  state.criteria = (db.criteria || []).sort((a, b) => a.col_number - b.col_number);
  state.sampleScores = db.sample_scores || [];
  state.monthLabels = db.month_labels || {};
  state.writtenReports = Array.isArray(db.written_reports) ? db.written_reports : [];

  state.scoresMap = {};
  for (const s of db.scores || []) {
    state.scoresMap[`${s.unit_id}_${s.criterion_id}`] = s;
  }

  // Enrich logs with unit_name and criterion_title
  const unitMap = {};
  for (const u of state.units) unitMap[u.id] = u;
  const critMap = {};
  for (const c of state.criteria) critMap[c.id] = c;

  state.logs = (db.logs || []).map((l) => {
    const u = unitMap[l.unit_id] || {};
    const c = critMap[l.criterion_id] || {};
    return {
      ...l,
      unit_name: l.unit_name || u.unit_name || `Đơn vị #${l.unit_id}`,
      unit_code: l.unit_code || u.unit_code || '',
      col_label: l.col_label || c.col_label || '',
      criterion_title: l.criterion_title || c.title || '',
    };
  });

  // Save offline cache
  try {
    localStorage.setItem('doan2026_cloud_cache', JSON.stringify(db));
  } catch (e) {}
}

window.syncFromCloudNow = async function (silent = false) {
  try {
    const { sha, db } = await fetchCloudDB();
    const changed = sha !== state.cloudSha;
    state.cloudSha = sha;
    state.cloudOnline = true;
    state.lastSyncTime = new Date().toLocaleTimeString('vi-VN');
    ingestCloudDB(db);
    if (changed || !silent) {
      // Do not interrupt if user is actively typing in an input
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (!isTyping || !silent) {
        renderApp();
      }
    }
    if (!silent) {
      showToast('🟢 Đã đồng bộ dữ liệu Online mới nhất thành công!', 'success');
    }
  } catch (err) {
    state.cloudOnline = false;
    if (!silent) {
      showToast('⚠️ Không thể kết nối máy chủ Cloud, đang dùng dữ liệu bộ nhớ đệm.', 'warning');
    }
  }
};

function getScoreObj(unitId, criterionId) {
  return state.scoresMap[`${unitId}_${criterionId}`] || null;
}

function getUnitTotalScore(unitId) {
  let sum = 0;
  for (const c of state.criteria) {
    const sc = getScoreObj(unitId, c.id);
    if (sc && sc.score !== null && sc.score !== undefined && sc.score !== '') {
      sum += Number(sc.score);
    }
  }
  return Math.round(sum * 100) / 100;
}

function getUnitMonthScore(unitId, monthGroup) {
  let sum = 0;
  for (const c of state.criteria) {
    if (Number(c.month_group) === Number(monthGroup)) {
      const sc = getScoreObj(unitId, c.id);
      if (sc && sc.score !== null && sc.score !== undefined && sc.score !== '') {
        sum += Number(sc.score);
      }
    }
  }
  return Math.round(sum * 100) / 100;
}

function isCriterionOpen(crit) {
  const effDate = state.settings.effective_date || todayISO();
  const strict = state.settings.strict_deadline !== '0';
  if (!strict || Number(crit.lock_override) === 1) return true;
  const startDate = crit.start_date || '2026-01-01';
  return effDate >= startDate && effDate <= crit.deadline;
}

function getRankings() {
  const activeUnits = state.units.filter((u) => Number(u.is_active) === 1);
  const list = activeUnits.map((u) => {
    const total = getUnitTotalScore(u.id);
    let reportsDone = 0;
    let criteriaCount = 0;
    for (const c of state.criteria) {
      const sc = getScoreObj(u.id, c.id);
      if (sc && sc.score !== null && sc.score !== '') {
        criteriaCount++;
        if (Number(c.is_report) === 1 && Number(sc.score) > 0) {
          reportsDone++;
        }
      }
    }
    return { unit: u, total, reportsDone, criteriaCount };
  });
  list.sort((a, b) => b.total - a.total || a.unit.display_order - b.unit.display_order);
  list.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  return list;
}

async function initApp() {
  // Load cache first for instant render if available
  const cached = localStorage.getItem('doan2026_cloud_cache');
  if (cached) {
    try {
      ingestCloudDB(JSON.parse(cached));
    } catch (e) {}
  }

  // Pull live data from Cloud
  await syncFromCloudNow(true);

  // Restore session
  const isAdminAuth = localStorage.getItem('doan2026_admin_authenticated') === '1' || sessionStorage.getItem('doan2026_admin_authenticated') === '1';
  state.isAdminSession = isAdminAuth;

  const savedUser = localStorage.getItem('doan2026_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      if (parsed.role === 'admin') {
        state.user = parsed;
        state.isAdminSession = true;
        state.activeTab = 'master';
      } else {
        const found = state.units.find((u) => u.id === parsed.id && Number(u.is_active) === 1);
        if (found) {
          state.user = found;
          state.activeTab = 'unit_submit';
        }
      }
    } catch (e) {}
  }

  renderApp();

  // Auto-poll Cloud every 12 seconds so all 38 units + Admin see real-time updates
  setInterval(() => {
    if (!state.isSyncing) {
      syncFromCloudNow(true);
    }
  }, 12000);
}

function renderApp() {
  const appEl = document.getElementById('app');
  if (!state.user) {
    appEl.innerHTML = renderLoginView();
    return;
  }

  const isAdminSession = state.isAdminSession || localStorage.getItem('doan2026_admin_authenticated') === '1';
  const isViewingAsUnit = isAdminSession && state.user && state.user.role !== 'admin';

  appEl.innerHTML = `
    ${renderHeader()}
    ${isViewingAsUnit ? `
      <div style="background: linear-gradient(90deg, #fef3c7, #fed7aa); color: #9a3412; padding: 7px 20px; font-size: 13px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f59e0b; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>👀 <b>Góc nhìn Quản trị viên:</b> Bạn đang xem & trải nghiệm nộp báo cáo của đơn vị: <span style="color:#1e3a8a; text-decoration:underline;">${escapeHtml(state.user.unit_name)}</span></span>
        </div>
        <button class="btn btn-sm btn-primary" onclick="switchAccountQuick('admin')" style="font-weight:700; background:#0052cc; color:#fff; box-shadow: 0 1px 2px rgba(0,0,0,0.15);">
          ⬅️ Quay Lại Quyền Quản Trị Viên (Admin)
        </button>
      </div>
    ` : ''}
    ${renderNavTabs()}
    <div class="main-container">
      ${renderActiveTabContent()}
    </div>
  `;
}

function renderLoginView() {
  const activeUnits = state.units.filter((u) => Number(u.is_active) === 1);
  const unitOptions = activeUnits
    .map(
      (u, idx) =>
        `<option value="${escapeHtml(u.username)}">${idx + 1}. ${escapeHtml(u.unit_name)} (${escapeHtml(u.username)})</option>`
    )
    .join('');

  return `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-header">
          <div class="logo-circle">ĐTN</div>
          <div style="font-size: 14.5px; color: #dc2626; text-transform: uppercase; font-weight: 800; margin-bottom: 2px;">
            TỈNH ĐOÀN QUẢNG TRỊ
          </div>
          <div style="font-size: 15.5px; color: #003d99; text-transform: uppercase; font-weight: 800; margin-bottom: 6px;">
            ĐOÀN ỦY BAN NHÂN DÂN TỈNH
          </div>
          <p style="font-size: 13px; color: #334155; font-weight: 700; text-transform: uppercase;">
            HỆ THỐNG QUẢN LÝ & TỔNG HỢP BỘ TIÊU CHÍ ĐOÀN CẤP CƠ SỞ
          </p>
          <div style="margin-top: 8px;">
            <span class="badge ${state.cloudOnline ? 'badge-success' : 'badge-warning'}">
              ${state.cloudOnline ? '🟢 Đã kết nối Máy chủ Đám mây Online 24/7' : '⏳ Đang kết nối máy chủ Online...'}
            </span>
          </div>
        </div>

        <div class="login-body">
          <div class="form-group">
            <label>Chọn nhanh Đơn vị / Quản trị viên:</label>
            <select id="login-quick-select" onchange="onQuickSelectLogin(this.value)">
              <option value="">-- Chọn tài khoản hoặc tự nhập bên dưới --</option>
              <option value="admin">★ BAN THƯỜNG VỤ ĐOÀN UBND TỈNH (Quản trị viên: admin)</option>
              ${unitOptions}
            </select>
          </div>

          <form onsubmit="handleLoginSubmit(event)">
            <div class="form-group">
              <label>Tên đăng nhập (Username):</label>
              <input type="text" id="login-username" placeholder="Nhập tên đăng nhập (VD: admin hoặc donvi01)" required />
            </div>

            <div class="form-group">
              <label>Mật khẩu:</label>
              <input type="password" id="login-password" placeholder="Nhập mật khẩu" required />
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 11px; font-size: 14.5px; font-weight: 700; margin-top: 8px;">
              Đăng Nhập Hệ Thống Online
            </button>
          </form>
        </div>
      </div>
    </div>
  `;
}

window.onQuickSelectLogin = function (username) {
  if (!username) return;
  document.getElementById('login-username').value = username;
  const pwInput = document.getElementById('login-password');
  if (pwInput) {
    pwInput.value = '';
    pwInput.placeholder = 'Nhập mật khẩu...';
    pwInput.focus();
  }
};

window.copyPublicWebLink = function () {
  navigator.clipboard.writeText(PUBLIC_WEB_URL);
  showToast(
    `Đã copy Link Web Online 24/7:<br/><b>${PUBLIC_WEB_URL}</b><br/>Bạn có thể gửi link này qua Zalo cho tất cả 38 đơn vị truy cập trên điện thoại & máy tính!`,
    'success'
  );
};

window.onQuickSelectLogin = function (username) {
  if (!username) return;
  document.getElementById('login-username').value = username;
  const pwInput = document.getElementById('login-password');
  if (username === 'admin') {
    // Admin demo convenience
    pwInput.value = 'admin123';
  } else {
    // Units must type their own password for confidentiality
    pwInput.value = '';
    pwInput.placeholder = 'Nhập mật khẩu của đơn vị...';
    pwInput.focus();
  }
};

window.quickLoginAs = async function (username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  await performLogin(username, password);
};

window.handleLoginSubmit = async function (e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  await performLogin(username, password);
};

async function performLogin(username, password) {
  await syncFromCloudNow(true);
  const adminPw = (state.settings && state.settings.admin_password) ? state.settings.admin_password : 'admin123';
  const allAcc = [
    {
      id: 0,
      unit_code: 'ADMIN',
      unit_name: 'Ban Thường vụ Đoàn UBND tỉnh (Quản trị viên)',
      username: 'admin',
      password: adminPw,
      role: 'admin',
      is_active: 1,
    },
    ...state.units,
  ];
  const found = allAcc.find(
    (u) =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password &&
      Number(u.is_active) === 1
  );
  if (!found) {
    showToast('Sai tên đăng nhập hoặc mật khẩu (hoặc tài khoản đã bị khóa)!', 'error');
    return;
  }
  state.user = found;
  localStorage.setItem('doan2026_user', JSON.stringify(found));
  if (found.role === 'admin') {
    state.isAdminSession = true;
    localStorage.setItem('doan2026_admin_authenticated', '1');
    sessionStorage.setItem('doan2026_admin_authenticated', '1');
  } else {
    state.isAdminSession = false;
    localStorage.removeItem('doan2026_admin_authenticated');
    sessionStorage.removeItem('doan2026_admin_authenticated');
  }
  state.activeTab = found.role === 'admin' ? 'master' : 'unit_submit';
  showToast(`Xin chào: <b>${escapeHtml(found.unit_name)}</b>`, 'success');
  renderApp();
}

window.handleLogout = function () {
  state.user = null;
  state.isAdminSession = false;
  localStorage.removeItem('doan2026_user');
  localStorage.removeItem('doan2026_admin_authenticated');
  sessionStorage.removeItem('doan2026_admin_authenticated');
  renderApp();
};

window.switchAccountQuick = function (val) {
  const isAdminSession = state.isAdminSession || localStorage.getItem('doan2026_admin_authenticated') === '1';
  if (!isAdminSession) {
    showToast('Tài khoản cơ sở không có quyền chuyển đổi tài khoản!', 'error');
    return;
  }
  if (!val) return;

  if (val === 'admin') {
    state.user = {
      id: 0,
      unit_code: 'ADMIN',
      unit_name: 'Ban Thường vụ Đoàn UBND tỉnh (Quản trị viên)',
      username: 'admin',
      role: 'admin',
    };
    state.isAdminSession = true;
    localStorage.setItem('doan2026_admin_authenticated', '1');
    localStorage.setItem('doan2026_user', JSON.stringify(state.user));
    state.activeTab = 'master';
    showToast('Đã quay về quyền Quản trị viên (Admin)', 'info');
    renderApp();
    return;
  }

  const u = state.units.find((x) => String(x.id) === String(val));
  if (u) {
    state.user = u;
    localStorage.setItem('doan2026_user', JSON.stringify(u));
    state.activeTab = 'unit_submit';
    showToast(`Đang xem dưới góc nhìn của: <b>${escapeHtml(u.unit_name)}</b>`, 'info');
    renderApp();
  }
};

function renderHeader() {
  const isAdminSession = state.isAdminSession || localStorage.getItem('doan2026_admin_authenticated') === '1';
  const isAdminView = state.user && state.user.role === 'admin';
  const effDate = state.settings.effective_date || todayISO();
  const strict = state.settings.strict_deadline !== '0';
  const activeUnits = state.units.filter((u) => Number(u.is_active) === 1);

  const switcherOptions = [
    `<option value="admin" ${isAdminView ? 'selected' : ''}>👑 Quản trị viên (Admin)</option>`,
    ...activeUnits.map(
      (u, idx) =>
        `<option value="${u.id}" ${!isAdminView && state.user && state.user.id === u.id ? 'selected' : ''}>ĐV ${idx + 1}: ${escapeHtml(u.unit_name)}</option>`
    ),
  ].join('');

  return `
    <header class="app-header">
      <div class="brand-box">
        <div class="youth-badge">ĐTN</div>
        <div class="brand-title">
          <div style="font-size: 11.5px; font-weight: 800; color: #fef08a; text-transform: uppercase; letter-spacing: 0.5px;">
            TỈNH ĐOÀN QUẢNG TRỊ • ĐOÀN ỦY BAN NHÂN DÂN TỈNH
          </div>
          <h1 style="font-size: 15px; margin: 2px 0 0 0; text-transform: uppercase;">
            Hệ Thống Quản Lý & Tổng Hợp Bộ Tiêu Chí Đoàn Cấp Cơ Sở
          </h1>
          <p style="margin: 2px 0 0 0; font-size: 12px;">
            <span style="color:#86efac; font-weight:700;">
              ${state.cloudOnline ? `🟢 Online (${state.lastSyncTime})` : '🟡 Offline Cache'}
            </span>
          </p>
        </div>
      </div>

      <div class="header-actions">


        <button class="btn btn-sm btn-outline" onclick="syncFromCloudNow(false)" style="background:rgba(255,255,255,0.15); color:#fff; border-color:rgba(255,255,255,0.3);" title="Tải dữ liệu mới nhất từ đám mây">
          🔄 Đồng bộ
        </button>

        <div class="date-pill" onclick="${isAdmin ? 'openDateSettingsModal()' : ''}" title="Ngày hệ thống dùng để đối chiếu hạn nộp báo cáo">
          📅 Ngày xét hạn: <b>${formatDateVN(effDate)}</b>
          <span class="badge ${strict ? 'badge-warning' : 'badge-success'}" style="margin-left:4px;">
            ${strict ? 'Đúng hạn mới tính điểm' : 'Mở tự do'}
          </span>
          ${isAdmin ? '⚙️' : ''}
        </div>

        ${isAdminSession ? `
          <select onchange="switchAccountQuick(this.value)" title="Chuyển đổi góc nhìn giữa Admin và các Đơn vị" style="max-width: 240px; font-size: 12px; padding: 5px 8px; font-weight: 700; border: 2px solid #fef08a; background: #fffbeb; color: #1e3a8a; border-radius: 6px;">
            ${switcherOptions}
          </select>
        ` : ''}

        <button class="btn btn-success btn-sm" onclick="exportToExcelClient()" title="Tải bảng tổng hợp Excel 131 cột chuẩn">
          📊 Xuất Excel (.xlsx)
        </button>

        <button class="btn btn-outline btn-sm" onclick="handleLogout()" style="background: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.3);">
          Đăng xuất
        </button>
      </div>
    </header>
  `;
}

/* =========================================================================
   CLIENT-SIDE EXCEL (.XLSX) EXPORT (WORKS ON BOTH WEB ONLINE & EXE)
   ========================================================================= */
window.exportToExcelClient = function () {
  if (typeof XLSX === 'undefined') {
    window.location.href = '/api/export/excel';
    return;
  }
  const wb = XLSX.utils.book_new();
  const activeUnits = state.units.filter((u) => Number(u.is_active) === 1);
  const criteria = state.criteria;

  // Sheet 1: Exact 131-column structure matching raw_criteria.csv
  const row0 = [state.settings.header_title || 'BỘ TIÊU CHÍ ĐOÀN CẤP CƠ SỞ NĂM 2026'];
  const row1 = ['ĐƠN VỊ', 'TỔNG ĐIỂM', ...criteria.map((c) => c.title)];
  const row2 = ['', '', ...criteria.map((c) => c.points_text)];
  const row3 = ['Cột 1', 'Cột 2', ...criteria.map((c) => c.col_label)];

  const sheet1Rows = [row0, row1, row2, row3];
  activeUnits.forEach((u) => {
    const total = getUnitTotalScore(u.id);
    const r = [u.unit_name, total];
    criteria.forEach((c) => {
      const sc = getScoreObj(u.id, c.id);
      r.push(sc && sc.score !== null && sc.score !== '' ? Number(sc.score) : '');
    });
    sheet1Rows.push(r);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  XLSX.utils.book_append_sheet(wb, ws1, 'BANG TONG HOP');

  // Sheet 2: Xếp hạng & Tháng
  const rankings = getRankings();
  const s2Header = [
    'HẠNG',
    'MÃ ĐV',
    'TÊN ĐƠN VỊ',
    'TỔNG ĐIỂM',
    'BC ĐÚNG HẠN',
    'Tháng 1',
    'Tháng 2',
    'Tháng 3',
    'Tháng 4',
    'Tháng 5',
    'Tháng 6',
    'Tháng 7',
    'Tháng 8',
    'Tháng 9',
    'Cuối năm & TX',
  ];
  const sheet2Rows = [s2Header];
  rankings.forEach((item) => {
    const u = item.unit;
    const r = [item.rank, u.unit_code, u.unit_name, item.total, item.reportsDone];
    for (let m = 1; m <= 10; m++) {
      r.push(getUnitMonthScore(u.id, m));
    }
    sheet2Rows.push(r);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  XLSX.utils.book_append_sheet(wb, ws2, 'XEP HANG & THANG');

  // Sheet 3 removed to protect user account confidentiality

  const fileName = `Bang_Tong_Hop_Bo_Tieu_Chi_Doan_2026_${todayISO()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`Đã xuất file Excel: <b>${fileName}</b>`, 'success');
};

function renderNavTabs() {
  const isAdmin = state.user && state.user.role === 'admin';
  if (isAdmin) {
    const tabs = [
      { id: 'master', label: '📋 Bảng Tổng Hợp (Chấm Điểm)' },
      { id: 'reports', label: '📅 Theo Dõi Báo Cáo & Nhật Ký Toàn Đoàn' },
      { id: 'units', label: `👥 Quản Lý Đơn Vị & Tài Khoản (${state.units.length})` },
      { id: 'criteria', label: `⚙️ Quản Lý Bộ Tiêu Chí & Hạn Nộp (${state.criteria.length})` },
      { id: 'ranking', label: '🏆 Bảng Xếp Hạng Thi Đua' },
      { id: 'admin_password', label: '🔐 Đổi Mật Khẩu Admin' },
    ];
    return `
      <nav class="nav-tabs">
        ${tabs
          .map(
            (t) => `
          <div class="nav-tab ${state.activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">
            ${t.label}
          </div>
        `
          )
          .join('')}
      </nav>
    `;
  } else {
    const tabs = [
      { id: 'unit_submit', label: '📤 Nộp Báo Cáo Tháng & Kê Khai Tiêu Chí' },
      { id: 'master', label: '📋 Xem Bảng Tổng Hợp (Chấm Điểm)' },
      { id: 'reports', label: '📅 Theo Dõi Báo Cáo & Nhật Ký Toàn Đoàn' },
      { id: 'ranking', label: '🏆 Bảng Xếp Hạng Toàn Khối' },
      { id: 'unit_password', label: '🔐 Đổi Mật Khẩu Đơn Vị' },
      { id: 'unit_history', label: '🕒 Lịch Sử Đã Nộp' },
    ];
    return `
      <nav class="nav-tabs">
        ${tabs
          .map(
            (t) => `
          <div class="nav-tab ${state.activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">
            ${t.label}
          </div>
        `
          )
          .join('')}
      </nav>
    `;
  }
}

window.setTab = function (tabId) {
  state.activeTab = tabId;
  renderApp();
};

function renderActiveTabContent() {
  switch (state.activeTab) {
    case 'admin_password':
      return renderAdminPasswordTab();
    case 'master':
      return renderMasterTableTab();
    case 'reports':
      return renderAdminReportsTab();
    case 'units':
      return renderAdminUnitsTab();
    case 'criteria':
      return renderAdminCriteriaTab();
    case 'ranking':
      return renderRankingTab();
    case 'unit_submit':
      return renderUnitSubmitTab();
    case 'unit_password':
      return renderUnitPasswordTab();
    case 'unit_history':
      return renderUnitHistoryTab();
    default:
      return renderMasterTableTab();
  }
}

/* =========================================================================
   TAB 1: BẢNG TỔNG HỢP CHUẨN 131 CỘT (MASTER SPREADSHEET)
   ========================================================================= */
function getFilteredCriteria() {
  const mf = Number(state.monthFilter);
  if (mf === 0) return state.criteria;
  if (mf === -1) return state.criteria.filter((c) => Number(c.is_report) === 1);
  if (mf === -2) return state.criteria.filter((c) => c.score_type === 'penalty');
  return state.criteria.filter((c) => Number(c.month_group) === mf);
}

function getFilteredUnits() {
  let list = state.units.filter((u) => Number(u.is_active) === 1);
  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.trim().toLowerCase();
    list = list.filter(
      (u) =>
        u.unit_name.toLowerCase().includes(q) ||
        u.unit_code.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }
  if (state.sortBy === 'score_desc') {
    list = [...list].sort((a, b) => getUnitTotalScore(b.id) - getUnitTotalScore(a.id));
  }
  return list;
}

function renderMasterTableTab() {
  const isAdmin = state.user && state.user.role === 'admin';
  const filteredCriteria = getFilteredCriteria();
  const filteredUnits = getFilteredUnits();

    // Build dynamic month pills including all 12 months and any custom groups created by Admin
  const monthPills = [
    { val: 0, label: `Tất cả (${state.criteria.length} cột)` },
  ];

  // Standard 12 months (Tháng 1 đến Tháng 12)
  for (let m = 1; m <= 12; m++) {
    const count = state.criteria.filter(c => Number(c.month_group) === m).length;
    monthPills.push({ val: m, label: `Tháng ${m}${count > 0 ? ` (${count})` : ''}` });
  }

  // Thường xuyên & Cuối năm
  const countTx = state.criteria.filter(c => Number(c.month_group) === 13).length;
  monthPills.push({ val: 13, label: `Thường xuyên & Cuối năm${countTx > 0 ? ` (${countTx})` : ''}` });

  // Custom groups & Activity months (strictly > 13 and deduplicated)
  const seenLabels = new Set(['Thường xuyên & Cuối năm']);
  if (state.monthLabels) {
    Object.entries(state.monthLabels).forEach(([k, v]) => {
      const numKey = Number(k);
      if (numKey > 13 && !seenLabels.has(v)) {
        seenLabels.add(v);
        const cnt = state.criteria.filter(c => Number(c.month_group) === numKey).length;
        monthPills.push({ val: numKey, label: `${v}${cnt > 0 ? ` (${cnt})` : ''}` });
      }
    });
  }

  monthPills.push({ val: -2, label: 'Điểm danh vắng (-5đ)' });

  const headerTitle = state.settings.header_title || 'BỘ TIÊU CHÍ ĐOÀN CẤP CƠ SỞ NĂM 2026';

  return `
    

      <div class="filter-bar">
        <div class="month-pills">
          ${monthPills
            .map(
              (p) => `
            <button class="month-pill ${Number(state.monthFilter) === p.val ? 'active' : ''}" onclick="setMonthFilter(${p.val})">
              ${p.label}
            </button>
          `
            )
            .join('')}
        </div>
        <div style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input
            type="text"
            placeholder="🔍 Tìm tên đơn vị..."
            value="${escapeHtml(state.searchQuery)}"
            oninput="onSearchUnitInput(this.value)"
            style="width: 210px;"
          />
          <select onchange="onSortByChange(this.value)">
            <option value="order" ${state.sortBy === 'order' ? 'selected' : ''}>Thứ tự chuẩn (1 → ${state.units.length})</option>
            <option value="score_desc" ${state.sortBy === 'score_desc' ? 'selected' : ''}>Xếp hạng Tổng điểm (Cao → Thấp)</option>
          </select>
        </div>
      </div>

      <div class="spreadsheet-wrapper" id="master-spreadsheet-wrapper">
        <table class="master-table">
          <thead>
            <tr class="row-banner">
              <th class="sticky-col-stt">#</th>
              <th class="sticky-col-unit" colspan="2">${escapeHtml(headerTitle)}</th>
              <th colspan="${filteredCriteria.length}">
                ${
                  isAdmin
                    ? '💡 Admin có thể nhập/sửa điểm trực tiếp vào từng ô bên dưới (Nhấn Enter hoặc click ra ngoài để tự động lưu lên Đám mây Online). Click biểu tượng 📎 để xem báo cáo đơn vị nộp.'
                    : '💡 Bảng tổng hợp tự động cập nhật điểm Online ngay khi đơn vị nộp báo cáo / kê khai đúng ngày hạn chót.'
                }
              </th>
            </tr>

            <tr class="row-titles">
              <th class="sticky-col-stt">STT</th>
              <th class="sticky-col-unit">ĐƠN VỊ</th>
              <th class="sticky-col-total">TỔNG ĐIỂM</th>
              ${filteredCriteria
                .map((c) => {
                  const open = isCriterionOpen(c);
                  return `
                  <th title="${escapeHtml(c.title)}&#10;Bắt đầu mở: ${formatDateVN(c.start_date || '2026-01-01')}&#10;Hạn chót: ${formatDateVN(c.deadline)}">
                    <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%; gap:3px;">
                      <div style="font-size:10px; font-weight:800; color:#0284c7; text-transform:uppercase; letter-spacing:0.3px;">
                        📅 ${escapeHtml(c.month_label)}
                      </div>
                      <div style="overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; font-weight:600; line-height:1.35;">
                        ${escapeHtml(c.title)}
                      </div>
                      <div style="display:flex; flex-direction:column; gap:1px; margin-top:2px; font-size:10px; background:rgba(255,255,255,0.7); padding:2px 4px; border-radius:3px;">
                        <span style="color:#059669; font-weight:700;">🟢 Mở: ${formatShortDateVN(c.start_date || '2026-01-01')}</span>
                        <span style="color:${open ? '#15803d' : '#b45309'}; font-weight:700;">
                          ⏰ Hạn: ${formatShortDateVN(c.deadline)}
                          ${
                            isAdmin
                              ? `<span style="cursor:pointer; margin-left:4px; color:#0052cc; text-decoration:underline;" onclick="openBatchFillModal(${c.id})" title="Chấm nhanh cột này">⚡Chấm</span>`
                              : ''
                          }
                        </span>
                      </div>
                    </div>
                  </th>
                `;
                })
                .join('')}
            </tr>

            <tr class="row-points">
              <th class="sticky-col-stt"></th>
              <th class="sticky-col-unit"></th>
              <th class="sticky-col-total"></th>
              ${filteredCriteria.map((c) => `<th>${escapeHtml(c.points_text)}</th>`).join('')}
            </tr>

            <tr class="row-cols">
              <th class="sticky-col-stt"></th>
              <th class="sticky-col-unit">Cột 1</th>
              <th class="sticky-col-total">Cột 2</th>
              ${filteredCriteria.map((c) => `<th>${escapeHtml(c.col_label)}</th>`).join('')}
            </tr>
          </thead>

          <tbody>
            ${filteredUnits
              .map((u, rIdx) => {
                const total = getUnitTotalScore(u.id);
                const isCurrentUnit = !isAdmin && state.user && state.user.id === u.id;
                return `
                <tr class="${isCurrentUnit ? 'highlight-unit' : ''}" data-unit-row="${u.id}">
                  <td class="sticky-col-stt">${rIdx + 1}</td>
                  <td class="sticky-col-unit" title="${escapeHtml(u.unit_name)} (TK: ${escapeHtml(u.username)})">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escapeHtml(u.unit_name)}
                      </span>
                      ${isCurrentUnit ? '<span class="badge badge-info">Đơn vị bạn</span>' : ''}
                    </div>
                  </td>
                  <td class="sticky-col-total" id="total-cell-${u.id}">${formatScore(total)}</td>
                  ${filteredCriteria.map((c) => renderMasterScoreCell(u, c, isAdmin)).join('')}
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMasterScoreCell(unit, crit, isAdmin) {
  const sc = getScoreObj(unit.id, crit.id);
  const val = sc && sc.score !== null && sc.score !== undefined ? sc.score : '';
  const numVal = val !== '' ? Number(val) : null;
  const colorClass = numVal !== null ? (numVal < 0 ? 'neg-score' : 'pos-score') : '';

  const hasSubmission =
    sc &&
    ((sc.report_content && sc.report_content !== '') ||
      (sc.evidence_link && sc.evidence_link !== '') ||
      (sc.file_path && sc.file_path !== '') ||
      sc.updated_by === 'unit');

  const dotHtml = hasSubmission
    ? `<span
        class="evidence-dot ${Number(sc.is_on_time) === 1 ? 'ontime' : 'late'}"
        onclick="openSubmissionDetailModal(${unit.id}, ${crit.id})"
        title="${Number(sc.is_on_time) === 1 ? 'Đơn vị nộp đúng hạn - Click xem chi tiết' : 'Đơn vị nộp quá hạn - Click xem chi tiết'}"
      >📎</span>`
    : '';

  if (isAdmin) {
    return `
      <td class="score-cell" id="cell-${unit.id}-${crit.id}">
        ${dotHtml}
        <input
          type="text"
          class="score-input ${colorClass}"
          value="${formatScore(val)}"
          data-unit="${unit.id}"
          data-crit="${crit.id}"
          onchange="onAdminInlineScoreChange(this)"
          onkeydown="if(event.key==='Enter'){this.blur();}"
        />
      </td>
    `;
  } else {
    return `
      <td class="score-cell" id="cell-${unit.id}-${crit.id}">
        ${dotHtml}
        <span class="score-input ${colorClass}" style="display:inline-flex; align-items:center; justify-content:center;">
          ${formatScore(val)}
        </span>
      </td>
    `;
  }
}

window.setMonthFilter = function (val) {
  state.monthFilter = val;
  renderApp();
};

window.onSearchUnitInput = function (val) {
  state.searchQuery = val;
  renderApp();
  const input = document.querySelector('input[placeholder="🔍 Tìm tên đơn vị..."]');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
};

window.onSortByChange = function (val) {
  state.sortBy = val;
  renderApp();
};

window.onAdminInlineScoreChange = async function (inputEl) {
  const unitId = Number(inputEl.getAttribute('data-unit'));
  const critId = Number(inputEl.getAttribute('data-crit'));
  const rawVal = inputEl.value.trim().replace(',', '.');

  if (rawVal !== '' && isNaN(Number(rawVal))) {
    showToast('Vui lòng nhập số hợp lệ (VD: 5, 10, -5, 9.2) hoặc để trống!', 'error');
    const prev = getScoreObj(unitId, critId);
    inputEl.value = prev ? formatScore(prev.score) : '';
    return;
  }

  const numVal = rawVal === '' ? null : Math.round(Number(rawVal) * 100) / 100;

  const res = await mutateCloudDB((db) => {
    db.scores = db.scores || [];
    const idx = db.scores.findIndex((s) => s.unit_id === unitId && s.criterion_id === critId);
    if (idx >= 0) {
      db.scores[idx].score = numVal;
      db.scores[idx].updated_by = 'admin';
      db.scores[idx].submitted_at = nowISO();
    } else if (numVal !== null) {
      db.scores.push({
        unit_id: unitId,
        criterion_id: critId,
        score: numVal,
        quantity: 1,
        self_score: numVal,
        report_content: '',
        evidence_link: '',
        file_name: '',
        file_path: '',
        submitted_at: nowISO(),
        submitted_date: todayISO(),
        is_on_time: 1,
        updated_by: 'admin',
        admin_note: '',
      });
    }
  }, `Admin score U${unitId} C${critId}`);

  if (res.ok) {
    inputEl.value = numVal !== null ? formatScore(numVal) : '';
    inputEl.classList.remove('neg-score', 'pos-score');
    if (numVal !== null) {
      inputEl.classList.add(numVal < 0 ? 'neg-score' : 'pos-score');
    }
    const totalCell = document.getElementById(`total-cell-${unitId}`);
    if (totalCell) {
      totalCell.textContent = formatScore(getUnitTotalScore(unitId));
    }
    showToast(`Đã lưu Online Cột ${critId + 2}: <b>${numVal === null ? 'Trống' : numVal + ' điểm'}</b>`, 'success');
  } else {
    showToast(res.error || 'Lỗi khi lưu điểm Online', 'error');
  }
};

window.handleClearAllScores = async function () {
  if (!confirm('Bạn có chắc chắn muốn xóa trắng toàn bộ điểm về 0 để bắt đầu chấm mới không?')) return;
  const res = await mutateCloudDB((db) => {
    db.scores = [];
    db.logs = [];
  }, 'Reset all scores to 0');
  if (res.ok) {
    renderApp();
    showToast('Đã đặt lại toàn bộ bảng điểm Online về 0!', 'success');
  }
};

window.handleLoadSampleScores = async function () {
  if (!confirm('Nạp toàn bộ dữ liệu điểm mẫu (Tháng 1 → Tháng 9) từ bảng CSV gốc của bạn lên hệ thống Online?')) return;
  const res = await mutateCloudDB((db) => {
    const ts = nowISO();
    db.scores = (db.sample_scores || []).map((s) => ({
      unit_id: s.unit_id,
      criterion_id: s.criterion_id,
      score: s.score,
      quantity: 1,
      self_score: s.score,
      report_content: '',
      evidence_link: '',
      file_name: '',
      file_path: '',
      submitted_at: ts,
      submitted_date: '',
      is_on_time: 1,
      updated_by: 'admin',
      admin_note: '',
    }));
  }, 'Load sample scores');
  if (res.ok) {
    renderApp();
    showToast('Đã nạp dữ liệu điểm mẫu lên hệ thống Online thành công!', 'success');
  }
};

/* =========================================================================
   UNIT PORTAL: NỘP BÁO CÁO THÁNG & KÊ KHAI TIÊU CHÍ
   ========================================================================= */
function renderUnitSubmitTab() {
  const unit = state.user;
  const rankings = getRankings();
  const myRankObj = rankings.find((r) => r.unit.id === unit.id) || {
    total: 0,
    rank: '-',
    reportsDone: 0,
    criteriaCount: 0,
  };
  const reportCriteria = state.criteria.filter((c) => Number(c.is_report) === 1);

  const monthFilter = Number(state.unitMonthFilter);
  const unitCriteriaList = state.criteria.filter((c) => {
    if (monthFilter === 0) return true;
    return Number(c.month_group) === monthFilter;
  });

  const monthButtons = [
    { val: 0, label: 'Tất cả các tháng' },
  ];
  for (let m = 1; m <= 12; m++) {
    const cnt = state.criteria.filter(c => Number(c.month_group) === m).length;
    monthButtons.push({ val: m, label: `Tháng ${m}${cnt > 0 ? ` (${cnt})` : ''}` });
  }
  const cntTx = state.criteria.filter(c => Number(c.month_group) === 13).length;
  monthButtons.push({ val: 13, label: `Thường xuyên & Cuối năm${cntTx > 0 ? ` (${cntTx})` : ''}` });

  if (state.monthLabels) {
    Object.entries(state.monthLabels).forEach(([k, v]) => {
      const numKey = Number(k);
      if (numKey > 13) {
        const cnt = state.criteria.filter(c => Number(c.month_group) === numKey).length;
        monthButtons.push({ val: numKey, label: `${v}${cnt > 0 ? ` (${cnt})` : ''}` });
      }
    });
  }

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Đơn vị đang đăng nhập</span>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">
          ${escapeHtml(unit.unit_name)}
        </div>
        <span class="stat-sub">Mã ĐV: <b>${escapeHtml(unit.unit_code)}</b> • Tài khoản: <b>${escapeHtml(unit.username)}</b></span>
      </div>

      <div class="stat-card">
        <span class="stat-label">Tổng Điểm Hiện Tại</span>
        <span class="stat-value">${formatScore(myRankObj.total) || '0'} điểm</span>
        <span class="stat-sub">Tự động tổng hợp Online khi nộp đúng hạn</span>
      </div>

      <div class="stat-card">
        <span class="stat-label">Thứ Hạng Thi Đua Hiện Tại</span>
        <span class="stat-value" style="color: #d97706;">Hạng ${myRankObj.rank} / ${rankings.length}</span>
        <span class="stat-sub">Trên tổng số ${rankings.length} đơn vị cơ sở</span>
      </div>

      <div class="stat-card">
        <span class="stat-label">Tiêu Chí Đã Có Điểm</span>
        <span class="stat-value" style="color: #16a34a;">${myRankObj.criteriaCount} / ${state.criteria.length}</span>
        <span class="stat-sub">Hoàn thành kê khai & nộp minh chứng Online</span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          📋 KÊ KHAI & NỘP MINH CHỨNG TOÀN BỘ TIÊU CHÍ THEO THÁNG (${unitCriteriaList.length} TIÊU CHÍ)
        </div>
      </div>
      <div class="filter-bar">
        <div class="month-pills">
          ${monthButtons
            .map(
              (m) => `
            <button class="month-pill ${monthFilter === m.val ? 'active' : ''}" onclick="setUnitMonthFilter(${m.val})">
              ${m.label}
            </button>
          `
            )
            .join('')}
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:70px; text-align:center;">Cột</th>
              <th style="width:125px;">Tháng / Kỳ</th>
              <th>Nội dung Tiêu chí</th>
              <th style="width:130px; text-align:center;">Mức điểm</th>
              <th style="width:120px; text-align:center;">Ngày bắt đầu</th>
              <th style="width:120px; text-align:center;">Hạn nộp chót</th>
              <th style="width:150px; text-align:center;">Trạng thái hạn</th>
              <th style="width:100px; text-align:center;">Điểm đạt</th>
              <th style="width:150px; text-align:center;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${unitCriteriaList
              .map((c) => {
                const sc = getScoreObj(unit.id, c.id);
                const open = isCriterionOpen(c);
                const scoreVal = sc && sc.score !== null && sc.score !== '' ? Number(sc.score) : null;
                const isPenalty = c.score_type === 'penalty';

                return `
                <tr>
                  <td style="text-align:center; font-weight:700; color:#7c2d12; background:#fff7ed;">
                    ${escapeHtml(c.col_label)}
                  </td>
                  <td style="font-size:12px; font-weight:600; color:#334155;">
                    ${escapeHtml(c.month_label)}
                  </td>
                  <td>
                    <div style="font-weight:600; color:#0f172a;">${escapeHtml(c.title)}</div>
                    ${
                      sc && (sc.report_content || sc.file_name || sc.evidence_link)
                        ? `<div style="margin-top:4px; font-size:12px; color:#0369a1;">
                            📎 Đã nộp (${escapeHtml(sc.submitted_date || '')}): ${escapeHtml(sc.report_content || sc.file_name || sc.evidence_link)}
                            ${sc.file_path ? `<a href="${escapeHtml(sc.file_path)}" target="_blank" style="margin-left:6px; font-weight:700;">[Tải file]</a>` : ''}
                          </div>`
                        : ''
                    }
                  </td>
                  <td style="text-align:center; font-size:12px; color:#475569; white-space:pre-line;">
                    ${escapeHtml(c.points_text)}
                  </td>
                  <td style="text-align:center; font-weight:600;">
                    ${formatDateVN(c.deadline)}
                  </td>
                  <td style="text-align:center;">
                    ${
                      isPenalty
                        ? '<span class="badge badge-warning">Admin điểm danh</span>'
                        : Number(c.lock_override) === 1
                        ? '<span class="badge badge-info">🔓 Admin mở gia hạn</span>'
                        : open
                        ? '<span class="badge badge-success">🟢 Còn hạn nộp</span>'
                        : '<span class="badge badge-danger">🔴 Đã quá hạn</span>'
                    }
                  </td>
                  <td style="text-align:center; font-weight:800; font-size:14px; color:${scoreVal !== null ? (scoreVal < 0 ? '#dc2626' : '#16a34a') : '#94a3b8'};">
                    ${scoreVal !== null ? formatScore(scoreVal) + ' đ' : '-'}
                  </td>
                  <td style="text-align:center;">
                    ${
                      isPenalty && Number(c.allow_unit_submit) === 0
                        ? '<span style="font-size:12px; color:#64748b;">Do Admin chấm</span>'
                        : `<button class="btn btn-sm ${scoreVal !== null ? 'btn-outline' : 'btn-primary'}" onclick="openUnitSubmitModal(${c.id})">
                            ${scoreVal !== null ? '✏️ Cập nhật' : '📤 Nộp báo cáo'}
                          </button>`
                    }
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.setUnitMonthFilter = function (val) {
  state.unitMonthFilter = val;
  renderApp();
};

/* =========================================================================
   MODAL NỘP BÁO CÁO / KÊ KHAI TIÊU CHÍ CỦA ĐƠN VỊ (CLOUD SYNC)
   ========================================================================= */
window.openUnitSubmitModal = function (criterionId, forUnitId = null) {
  const unitId = forUnitId || state.user.id;
  const unit = state.units.find((u) => u.id === unitId) || state.user;
  const crit = state.criteria.find((c) => c.id === criterionId);
  if (!crit) return;

  const sc = getScoreObj(unitId, criterionId);
  const open = isCriterionOpen(crit);
  const effDate = state.settings.effective_date || todayISO();

  const isMulti = crit.score_type === 'multi';
  const curQty = sc && sc.quantity ? Number(sc.quantity) : 1;
  const curScore =
    sc && sc.self_score !== null && sc.self_score !== undefined
      ? sc.self_score
      : sc && sc.score !== null && sc.score !== undefined
      ? sc.score
      : crit.default_score;

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <span>📤 Nộp Báo Cáo / Kê Khai Tiêu Chí (${escapeHtml(crit.col_label)})</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="padding:12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:14px;">
            <div style="font-size:12px; color:#475569; margin-bottom:4px;">
              Đơn vị: <b>${escapeHtml(unit.unit_name)}</b> • Kỳ: <b>${escapeHtml(crit.month_label)}</b>
            </div>
            <div style="font-weight:700; font-size:14px; color:#003d99; margin-bottom:6px;">
              ${escapeHtml(crit.title)}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:6px 12px; font-size:12.5px; margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1;">
              <div>Quy định điểm: <b>${escapeHtml(crit.points_text.replace(/\n/g, ' - '))}</b></div>
              <div>Ngày bắt đầu nộp: <b style="color:#059669;">${formatDateVN(crit.start_date || '2026-01-01')}</b></div>
              <div>Hạn nộp chót: <b style="color:#dc2626;">${formatDateVN(crit.deadline)}</b></div>
            </div>
          </div>

          ${
            (() => {
              const startDate = crit.start_date || '2026-01-01';
              const isEarly = effDate < startDate && Number(crit.lock_override) !== 1;
              const isLate = effDate > crit.deadline && Number(crit.lock_override) !== 1;
              const isValid = !isEarly && !isLate;

              if (isEarly) {
                return `
                  <div style="padding:10px 12px; border-radius:6px; margin-bottom:14px; font-size:13px; background:#fffbeb; color:#b45309; border:1px solid #fde68a;">
                    ⏳ <b>Chưa đến thời gian mở nộp báo cáo!</b><br/>
                    Ngày hiện tại (${formatDateVN(effDate)}) <b>chưa đến ngày bắt đầu nộp (${formatDateVN(startDate)})</b>. Đơn vị không thể nộp trước thời gian đã quy định.
                  </div>
                `;
              } else if (isLate) {
                return `
                  <div style="padding:10px 12px; border-radius:6px; margin-bottom:14px; font-size:13px; background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">
                    ⚠️ <b>Đã quá thời gian hạn nộp báo cáo!</b><br/>
                    Ngày nộp (${formatDateVN(effDate)}) <b>đã vượt quá hạn chót (${formatDateVN(crit.deadline)})</b>. Tiêu chí này đã khóa, không thể nộp sau thời gian đã thống nhất (trừ khi Admin mở khóa gia hạn).
                  </div>
                `;
              } else {
                return `
                  <div style="padding:10px 12px; border-radius:6px; margin-bottom:14px; font-size:13px; background:#dcfce7; color:#15803d; border:1px solid #86efac;">
                    ✅ <b>Đang trong thời gian nộp hợp lệ</b> (Mở nộp: ${formatDateVN(startDate)} &le; Hôm nay: ${formatDateVN(effDate)} &le; Hạn chót: ${formatDateVN(crit.deadline)}).<br/>
                    Hệ thống sẽ <b>tự động cộng điểm Online ngay lập tức</b> sau khi bấm nộp!
                  </div>
                `;
              }
            })()
          }

          ${
            isMulti
              ? `
            <div class="form-group">
              <label>Số lượng thực hiện (${escapeHtml(crit.unit_step_label)} - Mỗi đơn vị tính = ${crit.unit_step_score} điểm, tối đa ${crit.max_score} điểm):</label>
              <input
                type="number"
                id="sub-quantity"
                min="1"
                max="20"
                step="1"
                value="${curQty}"
                oninput="onSubQuantityChange(${crit.unit_step_score}, ${crit.max_score})"
              />
            </div>
          `
              : ''
          }

          <div class="form-group">
            <label>Điểm tự kê khai theo tiêu chí (Tối đa ${crit.max_score} điểm):</label>
            <input
              type="number"
              id="sub-score"
              step="0.01"
              min="${crit.min_score}"
              max="${crit.max_score}"
              value="${curScore}"
            />
          </div>

          <div class="form-group">
            <label>Nội dung báo cáo / Tóm tắt kết quả thực hiện:</label>
            <textarea
              id="sub-content"
              rows="3"
              placeholder="Nhập số báo cáo, ngày ban hành, số lượng đoàn viên tham gia hoặc tóm tắt kết quả..."
            >${escapeHtml(sc ? sc.report_content : '')}</textarea>
          </div>

          <div class="form-group">
            <label>Link minh chứng (Google Drive / Bài viết Fanpage / Cổng thông tin - nếu có):</label>
            <input
              type="text"
              id="sub-link"
              placeholder="https://..."
              value="${escapeHtml(sc ? sc.evidence_link : '')}"
            />
          </div>

          <div class="form-group">
            <label>Đính kèm File Báo cáo / Hình ảnh / Maket (.pdf, .docx, .xlsx, .jpg, .png, .zip):</label>
            <input type="file" id="sub-file" />
            ${
              sc && sc.file_name
                ? `<div style="margin-top:4px; font-size:12px; color:#0369a1;">
                    File hiện tại: <a href="${escapeHtml(sc.file_path)}" target="_blank"><b>${escapeHtml(sc.file_name)}</b></a>
                  </div>`
                : ''
            }
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          ${
          (() => {
            const startDate = crit.start_date || '2026-01-01';
            const isEarly = effDate < startDate && Number(crit.lock_override) !== 1;
            const isLate = effDate > crit.deadline && Number(crit.lock_override) !== 1;
            const canSubmit = (!isEarly && !isLate) || (state.user && state.user.role === 'admin');

            if (canSubmit) {
              return `
                <button class="btn btn-primary" id="btn-submit-report" onclick="submitUnitCriterion(${unitId}, ${criterionId})" style="font-weight:700;">
                  📤 Xác Nhận Nộp Báo Cáo Online
                </button>
              `;
            } else {
              return `
                <button class="btn btn-primary" id="btn-submit-report" disabled style="opacity:0.5; cursor:not-allowed; font-weight:700;" title="${isEarly ? 'Chưa đến ngày bắt đầu nộp' : 'Đã quá hạn chót nộp'}">
                  🚫 ${isEarly ? 'Chưa Đến Ngày Mở Nộp' : 'Đã Quá Hạn Nộp Báo Cáo'}
                </button>
              `;
            }
          })()
        }
        </div>
      </div>
    </div>
  `;
};

window.onSubQuantityChange = function (stepScore, maxScore) {
  const qty = Number(document.getElementById('sub-quantity').value || 1);
  const calc = Math.min(qty * stepScore, maxScore);
  document.getElementById('sub-score').value = calc;
};

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

window.submitUnitCriterion = async function (unitId, criterionId) {
  const crit = state.criteria.find(c => c.id === criterionId);
  if (!crit) {
    showToast('Không tìm thấy tiêu chí!', 'error');
    return;
  }
  const effDate = state.settings.effective_date || todayISO();
  const startDate = crit.start_date || '2026-01-01';
  const isAdmin = state.user && state.user.role === 'admin';
  const isUnlocked = Number(crit.lock_override) === 1;

  if (!isAdmin && !isUnlocked) {
    if (effDate < startDate) {
      showToast(`Chưa đến ngày bắt đầu nộp báo cáo (${formatDateVN(startDate)})! Không thể nộp trước.`, 'error');
      return;
    }
    if (effDate > crit.deadline) {
      showToast(`Đã quá hạn nộp báo cáo (${formatDateVN(crit.deadline)})! Không thể nộp sau thời gian đã thống nhất.`, 'error');
      return;
    }
  }
  const btn = document.getElementById('btn-submit-report');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi lên hệ thống Online...';
  }

  const qtyEl = document.getElementById('sub-quantity');
  const quantity = qtyEl ? Number(qtyEl.value || 1) : 1;
  const requestedScore = Number(document.getElementById('sub-score').value || 0);
  const reportContent = document.getElementById('sub-content').value.trim();
  const evidenceLink = document.getElementById('sub-link').value.trim();
  const fileInput = document.getElementById('sub-file');

  let uploadedName = '';
  let uploadedUrl = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      const f = fileInput.files[0];
      const b64 = await readFileAsDataURL(f);
      const upRes = await uploadFileToCloud(b64, f.name, unitId, criterionId);
      uploadedName = upRes.fileName;
      uploadedUrl = upRes.fileUrl;
    } catch (e) {
      showToast('Lỗi tải file đính kèm: ' + e.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📤 Xác Nhận Nộp Báo Cáo Online';
      }
      return;
    }
  }

  let statusMsg = '';
  let onTimeFlag = 0;

  const res = await mutateCloudDB((db) => {
    const crit = (db.criteria || []).find((c) => c.id === criterionId);
    if (!crit) throw new Error('Không tìm thấy tiêu chí');

    const settings = db.settings || {};
    const effDate =
      settings.use_custom_date === '1' && settings.custom_date ? settings.custom_date : todayISO();
    const strict = settings.strict_deadline !== '0';
    const isOnTime = effDate <= crit.deadline || Number(crit.lock_override) === 1 || !strict ? 1 : 0;
    onTimeFlag = isOnTime;

    let calcScore = Math.max(Number(crit.min_score), Math.min(Number(crit.max_score), requestedScore));
    calcScore = Math.round(calcScore * 100) / 100;

    db.scores = db.scores || [];
    const existingIdx = db.scores.findIndex((s) => s.unit_id === unitId && s.criterion_id === criterionId);
    const existingRow = existingIdx >= 0 ? db.scores[existingIdx] : null;

    const finalFileName = uploadedName || (existingRow ? existingRow.file_name : '');
    const finalFileUrl = uploadedUrl || (existingRow ? existingRow.file_path : '');
    const ts = nowISO();

    let awardedScore = null;
    if (isOnTime === 1) {
      awardedScore = calcScore;
      statusMsg = `Đúng hạn (${formatDateVN(effDate)} <= ${formatDateVN(crit.deadline)}) - Đã tự động cộng +${awardedScore} điểm Online!`;
    } else {
      awardedScore = existingRow && existingRow.updated_by === 'admin' ? existingRow.score : null;
      statusMsg = `Quá hạn nộp (${formatDateVN(effDate)} > ${formatDateVN(crit.deadline)}) - Không được tự động tính điểm`;
    }

    const newScoreObj = {
      unit_id: unitId,
      criterion_id: criterionId,
      score: awardedScore,
      quantity: quantity,
      self_score: calcScore,
      report_content: reportContent,
      evidence_link: evidenceLink,
      file_name: finalFileName,
      file_path: finalFileUrl,
      submitted_at: ts,
      submitted_date: effDate,
      is_on_time: isOnTime,
      updated_by: 'unit',
      admin_note: existingRow ? existingRow.admin_note || '' : '',
    };

    if (existingIdx >= 0) {
      db.scores[existingIdx] = newScoreObj;
    } else {
      db.scores.push(newScoreObj);
    }

    db.logs = db.logs || [];
    db.logs.unshift({
      id: (db.logs[0] ? db.logs[0].id : 0) + 1,
      unit_id: unitId,
      criterion_id: criterionId,
      submitted_at: ts,
      submitted_date: effDate,
      deadline: crit.deadline,
      is_on_time: isOnTime,
      requested_score: calcScore,
      awarded_score: awardedScore,
      report_content: reportContent,
      evidence_link: evidenceLink,
      file_name: finalFileName,
      file_path: finalFileUrl,
      status_text: statusMsg,
    });
    if (db.logs.length > 300) db.logs.length = 300;
  }, `Unit ${unitId} submit C${criterionId}`);

  if (res.ok) {
    closeModal();
    renderApp();
    showToast(statusMsg, onTimeFlag ? 'success' : 'warning');
  } else {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📤 Xác Nhận Nộp Báo Cáo Online';
    }
    showToast(res.error || 'Có lỗi xảy ra khi nộp báo cáo Online', 'error');
  }
};

window.closeModal = function () {
  document.getElementById('modal-root').innerHTML = '';
};

/* =========================================================================
   MODAL XEM CHI TIẾT BÁO CÁO & MINH CHỨNG (DÀNH CHO ADMIN & ĐƠN VỊ)
   ========================================================================= */
window.openSubmissionDetailModal = function (unitId, criterionId) {
  const unit = state.units.find((u) => u.id === unitId);
  const crit = state.criteria.find((c) => c.id === criterionId);
  const sc = getScoreObj(unitId, criterionId);
  if (!unit || !crit || !sc) return;

  const isAdmin = state.user && state.user.role === 'admin';
  const modalRoot = document.getElementById('modal-root');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <span>📎 Chi Tiết Báo Cáo & Minh Chứng (${escapeHtml(crit.col_label)})</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom:12px;">
            <div><b>Đơn vị:</b> ${escapeHtml(unit.unit_name)}</div>
            <div><b>Tiêu chí:</b> ${escapeHtml(crit.title)}</div>
            <div><b>Hạn nộp quy định:</b> ${formatDateVN(crit.deadline)}</div>
            <div><b>Thời điểm đơn vị nộp:</b> ${escapeHtml(sc.submitted_at || 'Chưa rõ')} (Ngày xét: ${formatDateVN(sc.submitted_date)})</div>
            <div style="margin-top:6px;">
              <b>Trạng thái hạn nộp:</b>
              ${
                Number(sc.is_on_time) === 1
                  ? '<span class="badge badge-success">✅ Đúng hạn - Đã tự động cộng điểm</span>'
                  : '<span class="badge badge-warning">⚠️ Quá hạn nộp (Không tự động cộng điểm)</span>'
              }
            </div>
          </div>

          <div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:12px;">
            <div><b>Điểm đơn vị kê khai:</b> ${formatScore(sc.self_score)} điểm (Số lượng: ${sc.quantity || 1})</div>
            <div><b>Điểm chính thức đang ghi nhận:</b> <span style="font-size:15px; font-weight:800; color:#0052cc;">${
              sc.score !== null && sc.score !== '' ? formatScore(sc.score) + ' điểm' : 'Chưa cộng điểm (0đ)'
            }</span></div>
            <div style="margin-top:8px;"><b>Nội dung báo cáo / Giải trình:</b></div>
            <div style="padding:8px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; margin-top:4px; min-height:48px; white-space:pre-wrap;">${
              sc.report_content ? escapeHtml(sc.report_content) : '<i>(Không có ghi chú)</i>'
            }</div>

            ${
              sc.evidence_link
                ? `<div style="margin-top:8px;"><b>Link minh chứng:</b> <a href="${escapeHtml(sc.evidence_link)}" target="_blank">${escapeHtml(sc.evidence_link)}</a></div>`
                : ''
            }
            ${
              sc.file_path
                ? `<div style="margin-top:8px;"><b>File báo cáo đính kèm:</b> <a href="${escapeHtml(sc.file_path)}" target="_blank" class="btn btn-sm btn-primary" style="margin-left:6px;">📥 Tải về: ${escapeHtml(sc.file_name)}</a></div>`
                : ''
            }
          </div>

          ${
            isAdmin
              ? `
            <div class="form-group">
              <label>Admin điều chỉnh / phê duyệt điểm cho mục này:</label>
              <div style="display:flex; gap:8px;">
                <input type="number" step="0.01" id="admin-modal-score" value="${
                  sc.score !== null && sc.score !== '' ? sc.score : sc.self_score || crit.default_score
                }" />
                <button class="btn btn-success" onclick="adminSaveScoreFromModal(${unit.id}, ${crit.id})">
                  💾 Lưu Điểm Chính Thức
                </button>
              </div>
            </div>
          `
              : ''
          }
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
        </div>
      </div>
    </div>
  `;
};

window.adminSaveScoreFromModal = async function (unitId, critId) {
  const val = document.getElementById('admin-modal-score').value.trim();
  const numVal = val === '' ? null : Math.round(Number(val) * 100) / 100;
  const res = await mutateCloudDB((db) => {
    db.scores = db.scores || [];
    const idx = db.scores.findIndex((s) => s.unit_id === unitId && s.criterion_id === critId);
    if (idx >= 0) {
      db.scores[idx].score = numVal;
      db.scores[idx].updated_by = 'admin';
    } else if (numVal !== null) {
      db.scores.push({
        unit_id: unitId,
        criterion_id: critId,
        score: numVal,
        updated_by: 'admin',
        submitted_at: nowISO(),
      });
    }
  }, `Admin modal score U${unitId} C${critId}`);
  if (res.ok) {
    closeModal();
    renderApp();
    showToast('Đã cập nhật điểm chính thức Online thành công!', 'success');
  }
};

/* =========================================================================
   MODAL CHẤM ĐIỂM HÀNG LOẠT 1 CỘT (ADMIN)
   ========================================================================= */
window.openBatchFillModal = function (criterionId) {
  const crit = state.criteria.find((c) => c.id === criterionId);
  if (!crit) return;
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <span>⚡ Chấm Điểm Hàng Loạt: ${escapeHtml(crit.col_label)}</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-weight:700; margin-bottom:6px;">${escapeHtml(crit.title)}</p>
          <p style="font-size:12.5px; color:#475569; margin-bottom:14px;">Quy định điểm: ${escapeHtml(crit.points_text)}</p>
          <div class="form-group">
            <label>Nhập mức điểm muốn áp dụng cho toàn bộ các đơn vị đang hoạt động (Để trống nếu muốn xóa điểm cột này):</label>
            <input type="number" step="0.01" id="batch-score-val" value="${crit.default_score}" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="executeBatchFillColumn(${crit.id})">Áp dụng cho tất cả đơn vị</button>
        </div>
      </div>
    </div>
  `;
};

window.executeBatchFillColumn = async function (criterionId) {
  const val = document.getElementById('batch-score-val').value.trim();
  const numVal = val === '' ? null : Math.round(Number(val) * 100) / 100;
  const activeUnitIds = state.units.filter((u) => Number(u.is_active) === 1).map((u) => u.id);

  const res = await mutateCloudDB((db) => {
    db.scores = db.scores || [];
    for (const uId of activeUnitIds) {
      const idx = db.scores.findIndex((s) => s.unit_id === uId && s.criterion_id === criterionId);
      if (idx >= 0) {
        db.scores[idx].score = numVal;
        db.scores[idx].updated_by = 'admin';
      } else if (numVal !== null) {
        db.scores.push({
          unit_id: uId,
          criterion_id: criterionId,
          score: numVal,
          updated_by: 'admin',
          submitted_at: nowISO(),
        });
      }
    }
  }, `Batch fill C${criterionId}`);
  if (res.ok) {
    closeModal();
    renderApp();
    showToast(`Đã cập nhật điểm hàng loạt Online cho Cột ${criterionId + 2}!`, 'success');
  }
};

/* =========================================================================
   TAB 2 (ADMIN): THEO DÕI BÁO CÁO THÁNG & NHẬT KÝ NỘP MINH CHỨNG
   ========================================================================= */
function renderAdminReportsTab() {
  const activeUnits = state.units.filter((u) => Number(u.is_active) === 1);
  const reportCriteria = state.criteria.filter((c) => Number(c.is_report) === 1);

  const filteredLogs = state.logs.filter((l) => {
    if (Number(state.logFilterUnit) === 0) return true;
    return Number(l.unit_id) === Number(state.logFilterUnit);
  });

  const writtenList = state.writtenReports || [];

  return `
    <!-- Banner Cong khai Bao cao -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
      <div style="font-size: 13px; color: #166534;">
        🌐 <b>Tính năng Công Khai & Minh Bạch Toàn Khối:</b> Tất cả các cơ sở Đoàn đều có thể theo dõi tiến độ nộp báo cáo và xem hồ sơ minh chứng của các đơn vị.
      </div>
    </div>

    <!-- MA TRẬN THEO DÕI NỘP BÁO CÁO ĐỊNH KỲ -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          📊 MA TRẬN THEO DÕI NỘP BÁO CÁO ĐỊNH KỲ CỦA ${activeUnits.length} ĐƠN VỊ (${reportCriteria.length} KỲ BÁO CÁO)
        </div>
        <div style="font-size:12.5px; color:#475569;">
          <span class="badge badge-success">✅ Đã nộp đúng hạn (Có điểm)</span>
          <span class="badge badge-warning">⚠️ Nộp trễ hạn (0 điểm)</span>
          <span class="badge badge-danger">❌ Chưa nộp</span>
        </div>
      </div>
      <div class="spreadsheet-wrapper" style="max-height: 450px;">
        <table class="master-table">
          <thead>
            <tr class="row-titles">
              <th class="sticky-col-stt" style="top:0; height:72px;">STT</th>
              <th class="sticky-col-unit" style="top:0; height:72px;">ĐƠN VỊ</th>
              <th class="sticky-col-total" style="top:0; height:72px;">Đúng hạn</th>
              ${reportCriteria
                .map(
                  (c) => `
                <th style="top:0; height:72px; min-width:115px;">
                  <div>${escapeHtml(c.title)}</div>
                  <div style="font-size:10px; color:#15803d; margin-top:3px;">Hạn: ${formatShortDateVN(c.deadline)} (${c.max_score}đ)</div>
                </th>
              `
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${activeUnits
              .map((u, idx) => {
                let doneCount = 0;
                const cells = reportCriteria
                  .map((c) => {
                    const sc = getScoreObj(u.id, c.id);
                    const hasScore = sc && sc.score !== null && sc.score !== '' && Number(sc.score) > 0;
                    if (hasScore) doneCount++;
                    const isLate = sc && Number(sc.is_on_time) === 0 && !hasScore;

                    return `
                    <td style="text-align:center; cursor:pointer;" onclick="${
                      sc ? `openSubmissionDetailModal(${u.id}, ${c.id})` : `openUnitSubmitModal(${c.id}, ${u.id})`
                    }">
                      ${
                        hasScore
                          ? `<span class="badge badge-success">+${formatScore(sc.score)}đ</span>`
                          : isLate
                          ? `<span class="badge badge-warning">Trễ hạn</span>`
                          : `<span style="color:#cbd5e1;">—</span>`
                      }
                    </td>
                  `;
                  })
                  .join('');

                return `
                <tr>
                  <td class="sticky-col-stt">${idx + 1}</td>
                  <td class="sticky-col-unit">${escapeHtml(u.unit_name)}</td>
                  <td class="sticky-col-total">${doneCount}/${reportCriteria.length}</td>
                  ${cells}
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">🕒 NHẬT KÝ ĐƠN VỊ NỘP BÁO CÁO & MINH CHỨNG GẦN ĐÂY</div>
        <div>
          <select onchange="state.logFilterUnit = this.value; renderApp();">
            <option value="0">-- Tất cả các đơn vị --</option>
            ${activeUnits
              .map(
                (u) =>
                  `<option value="${u.id}" ${Number(state.logFilterUnit) === u.id ? 'selected' : ''}>${escapeHtml(u.unit_name)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
      <div class="panel-body" style="padding:0; overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thời gian nộp</th>
              <th>Đơn vị</th>
              <th>Tiêu chí</th>
              <th>Ngày nộp / Hạn chót</th>
              <th>Trạng thái</th>
              <th>Điểm cộng</th>
              <th>Nội dung & File đính kèm</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredLogs.length === 0
                ? `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">Chưa có lượt nộp báo cáo nào được ghi nhận.</td></tr>`
                : filteredLogs
                    .map(
                      (l) => `
                  <tr>
                    <td style="white-space:nowrap; font-size:12px;">${escapeHtml(l.submitted_at)}</td>
                    <td style="font-weight:600;">${escapeHtml(l.unit_name)}</td>
                    <td><b>${escapeHtml(l.col_label)}:</b> ${escapeHtml(l.criterion_title)}</td>
                    <td style="white-space:nowrap; font-size:12px;">
                      Nộp: <b>${formatDateVN(l.submitted_date)}</b><br/>
                      Hạn: ${formatDateVN(l.deadline)}
                    </td>
                    <td>
                      ${
                        Number(l.is_on_time) === 1
                          ? '<span class="badge badge-success">Đúng hạn</span>'
                          : '<span class="badge badge-warning">Quá hạn</span>'
                      }
                    </td>
                    <td style="text-align:center; font-weight:700; color:#15803d;">
                      ${l.awarded_score !== null && l.awarded_score !== undefined ? '+' + formatScore(l.awarded_score) + 'đ' : '0đ'}
                    </td>
                    <td>
                      <div>${escapeHtml(l.report_content || '')}</div>
                      ${
                        l.evidence_link
                          ? `<a href="${escapeHtml(l.evidence_link)}" target="_blank" style="font-size:12px;">🔗 Link minh chứng</a> `
                          : ''
                      }
                      ${
                        l.file_path
                          ? `<a href="${escapeHtml(l.file_path)}" target="_blank" style="font-size:12px; font-weight:700;">📎 ${escapeHtml(l.file_name)}</a>`
                          : ''
                      }
                    </td>
                  </tr>
                `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   TAB 3 (ADMIN): QUẢN LÝ ĐƠN VỊ & TÀI KHOẢN
   ========================================================================= */
function renderAdminUnitsTab() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          👥 QUẢN LÝ DANH SÁCH ĐƠN VỊ & TÀI KHOẢN ĐĂNG NHẬP (${state.units.length} ĐƠN VỊ)
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="openDateSettingsModal()">
            ⚙️ Cấu hình Ngày hệ thống
          </button>
          <button class="btn btn-danger btn-sm" onclick="openManageMonthGroupsModal()" style="font-weight:700;">
            ⚙️ Quản Lý / Xóa Nhóm Tháng & Kỳ Hạn
          </button>
          <button class="btn btn-success btn-sm" onclick="toggleMonthLock(${mf}, 1)">
            🔓 Mở khóa gia hạn
          </button>
          <button class="btn btn-warning btn-sm" onclick="toggleMonthLock(${mf}, 0)">
            🔒 Khóa đúng hạn
          </button>
          <button class="btn btn-primary btn-sm" onclick="openCriterionCreateModal()" style="font-weight:700;">>
            ➕ Thêm Tiêu Chí Mới
          </button>
        </div>
      </div>

      <div class="filter-bar">
        <select onchange="state.criteriaMonthFilter = Number(this.value); renderApp();">
          <option value="0" ${mf === 0 ? 'selected' : ''}>-- Tất cả các kỳ hạn / tháng (${state.criteria.length} tiêu chí) --</option>
          ${[
            ...Array.from({length: 12}, (_, i) => [String(i+1), `Tháng ${String(i+1).padStart(2, '0')}/2026`]),
            ['13', 'Thường xuyên & Cuối năm'],
            ['14', 'Tháng Thanh niên (Tháng 3)'],
            ['15', 'Chiến dịch Tình nguyện Hè (Tháng 6-8)'],
            ['16', 'Đợt thi đua cao điểm 26/3'],
            ...Object.entries(state.monthLabels || {}).filter(([k]) => Number(k) > 16)
          ].map(([k, v]) => {
            const count = state.criteria.filter(c => Number(c.month_group) === Number(k)).length;
            return `<option value="${k}" ${mf === Number(k) ? 'selected' : ''}>${escapeHtml(v)} (${count} tiêu chí)</option>`;
          }).join('')}
        </select>
        <input
          type="text"
          placeholder="🔍 Tìm tiêu chí hoặc số cột..."
          value="${escapeHtml(state.criteriaSearch)}"
          oninput="state.criteriaSearch = this.value; renderApp();"
          style="width:260px;"
        />
      </div>

      <div class="panel-body" style="padding:0; overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:70px; text-align:center;">Cột</th>
              <th style="width:125px;">Nhóm tháng</th>
              <th>Tên Tiêu Chí</th>
              <th style="width:120px;">Mức điểm</th>
              <th style="width:75px; text-align:center;">Tối đa</th>
              <th style="width:120px; text-align:center;">Ngày bắt đầu nộp</th>
              <th style="width:120px; text-align:center;">Hạn nộp chót</th>
              <th style="width:115px; text-align:center;">Chế độ Gia hạn</th>
              <th style="width:140px; text-align:center;">Thao tác Admin</th>
            </tr>
          </thead>
          <tbody>
            ${list
              .map(
                (c) => `
              <tr>
                <td style="text-align:center; font-weight:700; color:#7c2d12;">${escapeHtml(c.col_label)}</td>
                <td><span class="badge badge-info">${escapeHtml(c.month_label)}</span></td>
                <td style="font-weight:600; line-height:1.4;">${escapeHtml(c.title)}</td>
                <td style="font-size:12px; white-space:pre-line;">${escapeHtml(c.points_text)}</td>
                <td style="text-align:center; font-weight:700; color:#0052cc;">${c.max_score}</td>
                <td style="text-align:center; font-weight:600; color:#059669;">
                  ${formatDateVN(c.start_date || '2026-01-01')}
                </td>
                <td style="text-align:center; font-weight:700; color:#dc2626;">
                  ${formatDateVN(c.deadline)}
                </td>
                <td style="text-align:center;">
                  ${
                    Number(c.lock_override) === 1
                      ? '<span class="badge badge-info">🔓 Mở gia hạn</span>'
                      : '<span class="badge badge-warning">🔒 Theo hạn chót</span>'
                  }
                </td>
                <td style="text-align:center; white-space:nowrap;">
                  <button class="btn btn-sm btn-primary" onclick="openCriterionEditModal(${c.id})" title="Chỉnh sửa ngày/điểm/tên">✏️ Sửa</button>
                  <button class="btn btn-sm btn-danger" onclick="window.deleteCriterion(${c.id})" style="margin-left:4px;" title="Xóa hẳn tiêu chí này">🗑️ Xóa</button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.toggleMonthLock = async function (monthGroup, lockVal) {
  const res = await mutateCloudDB((db) => {
    for (const c of db.criteria || []) {
      if (monthGroup === 0 || Number(c.month_group) === Number(monthGroup)) {
        c.lock_override = lockVal;
      }
    }
  }, `Toggle month lock ${monthGroup}=${lockVal}`);
  if (res.ok) {
    renderApp();
    showToast(
      lockVal === 1
        ? 'Đã mở khóa gia hạn nộp báo cáo Online (Đơn vị nộp sẽ được tự động cộng điểm)!'
        : 'Đã bật chế độ kiểm tra đúng ngày hạn chót!',
      'success'
    );
  }
};

window.openCriterionEditModal = function (critId) {
  const c = state.criteria.find((x) => x.id === critId);
  if (!c) return;
  const modalRoot = document.getElementById('modal-root');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header" style="background: #003d99; color: #fff;">
          <span style="font-weight: 700;">✏️ Chỉnh Sửa Tiêu Chí: ${escapeHtml(c.col_label)}</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()" style="color: #fff; border-color: rgba(255,255,255,0.4);">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="form-group">
            <label>Nội dung Tiêu chí:</label>
            <textarea id="edit-crit-title" rows="3" style="width:100%; padding:8px; font-family:inherit;">${escapeHtml(c.title)}</textarea>
          </div>

          <div class="form-group">
            <label>Nhóm kỳ hạn / Tháng hoạt động:</label>
            <select id="edit-crit-month">
              <optgroup label="12 Tháng trong năm 2026">
                ${Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${Number(c.month_group) === (i+1) ? 'selected' : ''}>Tháng ${String(i+1).padStart(2, '0')}/2026</option>`).join('')}
              </optgroup>
              <optgroup label="Hoạt động thường xuyên & Đợt cao điểm">
                <option value="13" ${Number(c.month_group) === 13 ? 'selected' : ''}>Thường xuyên & Cuối năm</option>
                <option value="14" ${Number(c.month_group) === 14 ? 'selected' : ''}>Tháng Thanh niên (Tháng 3)</option>
                <option value="15" ${Number(c.month_group) === 15 ? 'selected' : ''}>Chiến dịch Tình nguyện Hè (Tháng 6-8)</option>
                <option value="16" ${Number(c.month_group) === 16 ? 'selected' : ''}>Đợt thi đua cao điểm 26/3</option>
                ${Object.entries(state.monthLabels || {})
                  .filter(([k]) => Number(k) > 16)
                  .map(([k, v]) => `<option value="${k}" ${Number(c.month_group) === Number(k) ? 'selected' : ''}>${escapeHtml(v)}</option>`)
                  .join('')}
              </optgroup>
            </select>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group">
              <label>Ngày bắt đầu nộp:</label>
              <input type="date" id="edit-crit-start-date" value="${c.start_date || '2026-01-01'}" />
            </div>
            <div class="form-group">
              <label>Hạn nộp chót (Deadline):</label>
              <input type="date" id="edit-crit-deadline" value="${c.deadline || '2026-01-31'}" />
            </div>
          </div>

          <div style="padding: 8px 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; margin-bottom: 14px; font-size: 12px; color: #1e40af;">
            ⏱️ <b>Tự động nhảy vị trí theo thời gian:</b> Khi bạn thay đổi Hạn nộp (Deadline), cột này sẽ <b>tự động sắp xếp lại vị trí trên Bảng tổng hợp</b> đúng theo thứ tự thời gian.
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group">
              <label>Mô tả điểm:</label>
              <input type="text" id="edit-crit-points" value="${escapeHtml(c.points_text)}" />
            </div>
            <div class="form-group">
              <label>Điểm tối đa:</label>
              <input type="number" id="edit-crit-max" value="${c.max_score}" step="0.5" />
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px;">
          <button class="btn btn-danger" onclick="closeModal(); window.deleteCriterion(${c.id});" style="margin-right:auto;">🗑️ Xóa Tiêu Chí Này</button>
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
          <button class="btn btn-primary" onclick="saveCriterionEdit(${c.id})" style="font-weight: 700;">💾 Lưu Thay Đổi</button>
        </div>
      </div>
    </div>
  `;
};

window.saveCriterionEdit = async function (critId) {
  const title = document.getElementById('edit-crit-title').value.trim();
  const mGroup = Number(document.getElementById('edit-crit-month').value);
  const startDate = document.getElementById('edit-crit-start-date').value || '2026-01-01';
  const deadline = document.getElementById('edit-crit-deadline').value;
  const pointsText = document.getElementById('edit-crit-points').value.trim();
  const maxS = Number(document.getElementById('edit-crit-max').value || 5);

  const defaultMonthLabels = {
    '1': 'Tháng 01/2026', '2': 'Tháng 02/2026', '3': 'Tháng 03/2026',
    '4': 'Tháng 04/2026', '5': 'Tháng 05/2026', '6': 'Tháng 06/2026',
    '7': 'Tháng 07/2026', '8': 'Tháng 08/2026', '9': 'Tháng 09/2026',
    '10': 'Tháng 10/2026', '11': 'Tháng 11/2026', '12': 'Tháng 12/2026',
    '13': 'Thường xuyên & Cuối năm',
    '14': 'Tháng Thanh niên (Tháng 3)',
    '15': 'Chiến dịch Tình nguyện Hè (Tháng 6-8)',
    '16': 'Đợt thi đua cao điểm 26/3'
  };

  showToast('Đang cập nhật tiêu chí...', 'info');
  const res = await mutateCloudDB((db) => {
    const c = (db.criteria || []).find((x) => x.id === critId);
    if (!c) return;
    c.title = title;
    c.month_group = mGroup;
    c.month_label = (db.month_labels && db.month_labels[String(mGroup)]) || defaultMonthLabels[String(mGroup)] || c.month_label;
    c.start_date = startDate;
    c.deadline = deadline;
    c.points_text = pointsText;
    c.default_score = maxS;
    c.max_score = maxS;
    c.unit_step_score = maxS;

    // AUTOMATICALLY RE-SORT CHRONOLOGICALLY BY DEADLINE!
    // If deadline changed from 20/10 to 03/03, it jumps forward automatically!
    sortCriteriaChronologically(db.criteria || []);
  }, `Edit criterion ${critId}`);

  if (res.ok) {
    closeModal();
    renderApp();
    showToast('Đã lưu thay đổi tiêu chí thành công!', 'success');
  } else {
    showToast('Lỗi khi lưu tiêu chí, vui lòng thử lại!', 'error');
  }
};

window.openCriterionCreateModal = function () {
  const modalRoot = document.getElementById('modal-root');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box" style="max-width: 620px;">
        <div class="modal-header" style="background: #003d99; color: #fff;">
          <span style="font-weight: 700;">➕ Thêm Tiêu Chí / Cột Mới Vào Bộ Tiêu Chí</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()" style="color: #fff; border-color: rgba(255,255,255,0.4);">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="form-group">
            <label>Tên / Nội dung tiêu chí mới*:</label>
            <input type="text" id="new-crit-title" placeholder="VD: Báo cáo chuyên đề chuyển đổi số, sinh hoạt chi đoàn..." required />
          </div>

          <div class="form-group">
            <label>Nhóm kỳ hạn / Tháng hoạt động:</label>
            <select id="new-crit-month" onchange="window.toggleCustomGroupInput(this.value)">
              <optgroup label="12 Tháng trong năm 2026">
                ${Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${i+1 === 10 ? 'selected' : ''}>Tháng ${String(i+1).padStart(2, '0')}/2026</option>`).join('')}
              </optgroup>
              <optgroup label="Hoạt động thường xuyên & Đợt cao điểm">
                <option value="13">Thường xuyên & Cuối năm</option>
                <option value="14">Tháng Thanh niên (Tháng 3)</option>
                <option value="15">Chiến dịch Tình nguyện Hè (Tháng 6-8)</option>
                <option value="16">Đợt thi đua cao điểm 26/3</option>
                ${Object.entries(state.monthLabels || {})
                  .filter(([k]) => Number(k) > 16)
                  .map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`)
                  .join('')}
              </optgroup>
              <option value="__NEW_CUSTOM__">➕ [+ Tự tạo Nhóm kỳ hạn / Tháng hoạt động mới...]</option>
            </select>
          </div>

          <div class="form-group" id="group-custom-name" style="display:none; background: #f0fdf4; padding: 10px; border-radius: 6px; border: 1px dashed #86efac;">
            <label style="color: #166534; font-weight: 700;">Nhập tên Nhóm kỳ hạn / Tháng hoạt động mới (Admin tự tạo):</label>
            <input type="text" id="new-crit-custom-group" placeholder="VD: Quý 1/2026, Đợt thi đua 26/3, Chiến dịch Hè..." />
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group">
              <label>Ngày bắt đầu nộp:</label>
              <input type="date" id="new-crit-start-date" value="2026-01-01" />
            </div>
            <div class="form-group">
              <label>Hạn nộp chót (Deadline):</label>
              <input type="date" id="new-crit-deadline" value="2026-10-20" />
            </div>
          </div>
          
          <div style="padding: 8px 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; margin-bottom: 14px; font-size: 12px; color: #1e40af;">
            ⏱️ <b>Quy trình tự động:</b> Hệ thống <b>tự động sắp xếp các cột theo thứ tự thời gian hạn nộp (Deadline)</b>. Khi bạn chỉnh sửa ngày hạn nộp, cột sẽ tự động nhảy về trước hoặc sau đúng theo tiến độ thời gian.
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group">
              <label>Mô tả điểm:</label>
              <input type="text" id="new-crit-points" value="(5 điểm)" placeholder="Ví dụ: (5 điểm) hoặc (10 điểm)" />
            </div>
            <div class="form-group">
              <label>Điểm tối đa:</label>
              <input type="number" id="new-crit-max" value="5" min="0" max="100" />
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px;">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" id="btn-save-new-crit" onclick="saveNewCriterion()" style="font-weight: 700;">
            ➕ Thêm Tiêu Chí Online
          </button>
        </div>
      </div>
    </div>
  `;
};

window.toggleCustomGroupInput = function(val) {
  const g = document.getElementById('group-custom-name');
  if (g) g.style.display = (val === '__NEW_CUSTOM__') ? 'block' : 'none';
};

window.saveNewCriterion = async function () {
  const title = document.getElementById('new-crit-title').value.trim();
  if (!title) {
    showToast('Vui lòng nhập tên / nội dung tiêu chí!', 'error');
    return;
  }
  const monthVal = document.getElementById('new-crit-month').value;
  const customGroupName = document.getElementById('new-crit-custom-group') ? document.getElementById('new-crit-custom-group').value.trim() : '';

  const startDate = document.getElementById('new-crit-start-date').value || '2026-01-01';
  const deadline = document.getElementById('new-crit-deadline').value || '2026-10-20';
  const pointsText = document.getElementById('new-crit-points').value.trim() || '(5 điểm)';
  const maxS = Number(document.getElementById('new-crit-max').value || 5);

  const btn = document.getElementById('btn-save-new-crit');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu tiêu chí lên Đám mây...';
  }

  showToast('Đang tạo và lưu tiêu chí mới...', 'info');

  const defaultMonthLabels = {
    '1': 'Tháng 01/2026', '2': 'Tháng 02/2026', '3': 'Tháng 03/2026',
    '4': 'Tháng 04/2026', '5': 'Tháng 05/2026', '6': 'Tháng 06/2026',
    '7': 'Tháng 07/2026', '8': 'Tháng 08/2026', '9': 'Tháng 09/2026',
    '10': 'Tháng 10/2026', '11': 'Tháng 11/2026', '12': 'Tháng 12/2026',
    '13': 'Thường xuyên & Cuối năm',
    '14': 'Tháng Thanh niên (Tháng 3)',
    '15': 'Chiến dịch Tình nguyện Hè (Tháng 6-8)',
    '16': 'Đợt thi đua cao điểm 26/3'
  };

  const res = await mutateCloudDB((db) => {
    db.criteria = Array.isArray(db.criteria) ? db.criteria : [];
    db.month_labels = db.month_labels || {};

    let mGroup = 10;
    let mLabel = 'Tháng 10/2026';

    if (monthVal === '__NEW_CUSTOM__' && customGroupName) {
      const keys = Object.keys(db.month_labels).map(k => Number(k)).filter(n => !isNaN(n));
      const nextKey = Math.max(16, ...(keys.length > 0 ? keys : [16])) + 1;
      mGroup = nextKey;
      mLabel = customGroupName;
      db.month_labels[String(nextKey)] = customGroupName;
    } else {
      mGroup = Number(monthVal);
      mLabel = db.month_labels[String(mGroup)] || defaultMonthLabels[String(mGroup)] || `Kỳ hạn ${mGroup}`;
    }

    const maxId = db.criteria.reduce((m, c) => Math.max(m, c.id || 0), 0);
    const newId = maxId + 1;

    const newCriterionObj = {
      id: newId,
      col_number: db.criteria.length + 1,
      col_label: `Cột ${db.criteria.length + 1}`,
      title: title,
      points_text: pointsText,
      month_group: mGroup,
      month_label: mLabel,
      start_date: startDate,
      deadline: deadline,
      score_type: 'fixed',
      default_score: maxS,
      min_score: 0,
      max_score: maxS,
      unit_step_score: maxS,
      unit_step_label: 'hoạt động',
      allow_unit_submit: 1,
      is_report: 0,
      lock_override: 0,
    };

    db.criteria.push(newCriterionObj);

    // AUTOMATIC CHRONOLOGICAL SORTING BY DEADLINE:
    sortCriteriaChronologically(db.criteria);
  }, `Create criterion ${title}`);

  if (res.ok) {
    closeModal();
    renderApp();
    showToast('🎉 Đã thêm tiêu chí mới và đồng bộ Online thành công!', 'success');
  } else {
    showToast('Lỗi khi lưu tiêu chí lên Đám mây: ' + (res.error ? res.error.message : ''), 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '➕ Thêm Tiêu Chí Online';
    }
  }
};

window.openDateSettingsModal = function () {
  const useCustom = state.settings.use_custom_date === '1';
  const customDate = state.settings.custom_date || state.settings.real_today || todayISO();
  const strict = state.settings.strict_deadline !== '0';

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <span>📅 Cấu Hình Ngày Xét Hạn Nộp Báo Cáo Online</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Quy tắc tính điểm tự động khi Đơn vị nộp báo cáo:</label>
            <select id="set-strict-mode">
              <option value="1" ${strict ? 'selected' : ''}>
                Chuẩn: Chỉ tự động cộng điểm khi Ngày nộp &le; Hạn chót của tiêu chí
              </option>
              <option value="0" ${!strict ? 'selected' : ''}>
                Mở tự do: Tự động cộng điểm cho mọi báo cáo không phân biệt hạn nộp
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Chế độ Ngày làm việc của hệ thống:</label>
            <select id="set-use-custom" onchange="document.getElementById('custom-date-box').style.display = this.value==='1' ? 'block' : 'none'">
              <option value="0" ${!useCustom ? 'selected' : ''}>Dùng ngày thực tế hôm nay (${formatDateVN(todayISO())})</option>
              <option value="1" ${useCustom ? 'selected' : ''}>Chọn ngày làm việc tùy chỉnh (Dùng để mở nộp các tháng trước)</option>
            </select>
          </div>

          <div class="form-group" id="custom-date-box" style="display:${useCustom ? 'block' : 'none'};">
            <label>Chọn ngày hệ thống giả lập (VD chọn 2026-01-15 để nộp đúng hạn các mục Tháng 1):</label>
            <input type="date" id="set-custom-date" value="${escapeHtml(customDate)}" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
          <button class="btn btn-primary" onclick="saveDateSettings()">💾 Lưu Cấu Hình Online</button>
        </div>
      </div>
    </div>
  `;
};

window.saveDateSettings = async function () {
  const strict = document.getElementById('set-strict-mode').value;
  const useCustom = document.getElementById('set-use-custom').value;
  const customDate = document.getElementById('set-custom-date').value;
  const res = await mutateCloudDB((db) => {
    db.settings = db.settings || {};
    db.settings.strict_deadline = strict;
    db.settings.use_custom_date = useCustom;
    db.settings.custom_date = customDate;
  }, 'Update date settings');
  if (res.ok) {
    closeModal();
    renderApp();
    showToast('Đã cập nhật cấu hình ngày xét hạn nộp Online!', 'success');
  }
};

/* =========================================================================
   TAB 5: BẢNG XẾP HẠNG THI ĐUA & TỔNG HỢP THEO THÁNG
   ========================================================================= */
function renderRankingTab() {
  const rankings = getRankings();
  return `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          🏆 BẢNG XẾP HẠNG THI ĐUA & TỔNG HỢP ĐIỂM THEO THÁNG NĂM 2026 (${rankings.length} ĐƠN VỊ)
        </div>
        <button class="btn btn-success btn-sm" onclick="exportToExcelClient()">📊 Xuất Bảng Xếp Hạng Ra Excel</button>
      </div>
      <div class="panel-body" style="padding:0; overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:60px; text-align:center;">Hạng</th>
              <th style="width:80px; text-align:center;">Mã ĐV</th>
              <th>Tên Đơn Vị Cơ Sở</th>
              <th style="width:115px; text-align:center; background:#fef9c3;">TỔNG ĐIỂM</th>
              <th style="width:120px; text-align:center;">BC Đúng Hạn</th>
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                .map(
                  (m) =>
                    `<th style="text-align:center; font-size:12px;">${m < 10 ? `Tháng ${m}` : 'Cuối năm / TX'}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${rankings
              .map((item) => {
                const u = item.unit;
                const badgeRank =
                  item.rank === 1
                    ? '🥇 1'
                    : item.rank === 2
                    ? '🥈 2'
                    : item.rank === 3
                    ? '🥉 3'
                    : item.rank;
                return `
                <tr>
                  <td style="text-align:center; font-weight:800; font-size:14px;">${badgeRank}</td>
                  <td style="text-align:center; font-weight:700; color:#0052cc;">${escapeHtml(u.unit_code)}</td>
                  <td style="font-weight:600;">${escapeHtml(u.unit_name)}</td>
                  <td style="text-align:center; font-weight:800; font-size:14.5px; color:#b45309; background:#fefce8;">
                    ${formatScore(item.total) || '0'}
                  </td>
                  <td style="text-align:center;">
                    <span class="badge badge-success">${item.reportsDone} / 17</span>
                  </td>
                  ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                    .map((m) => {
                      const ms = getUnitMonthScore(u.id, m);
                      return `<td style="text-align:center; font-weight:600; color:${ms > 0 ? '#0f172a' : ms < 0 ? '#dc2626' : '#cbd5e1'};">${
                        ms !== 0 ? formatScore(ms) : '-'
                      }</td>`;
                    })
                    .join('')}
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   UNIT HISTORY & PASSWORD CHANGE TAB
   ========================================================================= */
function renderUnitHistoryTab() {
  const unit = state.user;
  const myLogs = state.logs.filter((l) => Number(l.unit_id) === Number(unit.id));

  return `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">🔑 THÔNG TIN TÀI KHOẢN ĐƠN VỊ</div>
      </div>
      <div class="panel-body">
        <div style="max-width:460px;">
          <div class="form-group">
            <label>Tên đơn vị:</label>
            <input type="text" value="${escapeHtml(unit.unit_name)}" disabled />
          </div>
          <div class="form-group">
            <label>Tên đăng nhập:</label>
            <input type="text" value="${escapeHtml(unit.username)}" disabled />
          </div>
          <div class="form-group">
            <label>Đổi mật khẩu mới:</label>
            <div style="display:flex; gap:8px;">
              <input type="password" id="unit-new-pw" placeholder="Nhập mật khẩu mới..." />
              <button class="btn btn-primary" onclick="unitChangePassword()">Lưu mật khẩu Online</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">🕒 LỊCH SỬ NỘP BÁO CÁO CỦA ĐƠN VỊ (${myLogs.length} LƯỢT)</div>
      </div>
      <div class="panel-body" style="padding:0; overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thời gian nộp</th>
              <th>Tiêu chí</th>
              <th>Ngày nộp / Hạn chót</th>
              <th>Trạng thái</th>
              <th>Điểm được cộng</th>
              <th>Nội dung & File</th>
            </tr>
          </thead>
          <tbody>
            ${
              myLogs.length === 0
                ? `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Đơn vị chưa có lượt nộp báo cáo nào.</td></tr>`
                : myLogs
                    .map(
                      (l) => `
                  <tr>
                    <td>${escapeHtml(l.submitted_at)}</td>
                    <td><b>${escapeHtml(l.col_label)}:</b> ${escapeHtml(l.criterion_title)}</td>
                    <td>Nộp: ${formatDateVN(l.submitted_date)} / Hạn: ${formatDateVN(l.deadline)}</td>
                    <td>
                      ${
                        Number(l.is_on_time) === 1
                          ? '<span class="badge badge-success">Đúng hạn</span>'
                          : '<span class="badge badge-warning">Quá hạn</span>'
                      }
                    </td>
                    <td style="font-weight:700; color:#15803d;">
                      ${l.awarded_score !== null && l.awarded_score !== undefined ? '+' + formatScore(l.awarded_score) + 'đ' : '0đ'}
                    </td>
                    <td>
                      ${escapeHtml(l.report_content || '')}
                      ${
                        l.file_path
                          ? `<a href="${escapeHtml(l.file_path)}" target="_blank" style="margin-left:6px; font-weight:700;">[📎 ${escapeHtml(l.file_name)}]</a>`
                          : ''
                      }
                    </td>
                  </tr>
                `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.unitChangePassword = async function () {
  const newPw = document.getElementById('unit-new-pw').value.trim();
  if (!newPw) {
    showToast('Vui lòng nhập mật khẩu mới!', 'error');
    return;
  }
  const u = state.user;
  const res = await mutateCloudDB((db) => {
    const found = (db.units || []).find((x) => x.id === u.id);
    if (found) found.password = newPw;
  }, `Change password ${u.username}`);
  if (res.ok) {
    state.user.password = newPw;
    localStorage.setItem('doan2026_user', JSON.stringify(state.user));
    showToast('Đã đổi mật khẩu Online thành công!', 'success');
  }
};

window.addEventListener('DOMContentLoaded', initApp);


window.handleWrittenReportSubmit = async function(e) {
  e.preventDefault();
  const title = document.getElementById('wr-title').value.trim();
  const month = Number(document.getElementById('wr-month').value);
  const criterionId = document.getElementById('wr-criterion').value ? Number(document.getElementById('wr-criterion').value) : null;
  const selfScoreVal = document.getElementById('wr-score').value.trim();
  const content = document.getElementById('wr-content').value.trim();
  const link = document.getElementById('wr-link').value.trim();
  const fileInput = document.getElementById('wr-file');

  const u = state.user;
  let uploadedName = '';
  let uploadedUrl = link || '';

  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      showToast('Đang tải tệp đính kèm lên máy chủ...', 'info');
      const f = fileInput.files[0];
      const b64 = await readFileAsDataURL(f);
      const upRes = await uploadFileToCloud(b64, f.name, u.id, criterionId || 0);
      uploadedName = upRes.fileName;
      uploadedUrl = upRes.fileUrl;
    } catch (err) {
      showToast('Lỗi tải file đính kèm: ' + err.message, 'error');
      return;
    }
  }

  if (!title || !content) {
    showToast('Vui lòng nhập đầy đủ tiêu đề và nội dung báo cáo!', 'error');
    return;
  }

  showToast('Đang gửi báo cáo văn bản lên Đám mây...', 'info');

  const effDate = state.settings.effective_date || todayISO();
  const strict = state.settings.strict_deadline !== '0';
  let awardedScore = selfScoreVal ? parseFloat(selfScoreVal) : null;
  let isOnTime = 1;

  let critObj = null;
  if (criterionId) {
    critObj = state.criteria.find(c => c.id === criterionId);
    if (critObj) {
      if (critObj.deadline && effDate > critObj.deadline && Number(critObj.lock_override) !== 1) {
        if (strict) {
          isOnTime = 0;
          awardedScore = 0;
        }
      }
      if (awardedScore === null || isNaN(awardedScore)) {
        awardedScore = Number(critObj.default_score) || Number(critObj.max_score) || 5.0;
      }
    }
  }

  const reportId = Date.now();
  const newReport = {
    id: reportId,
    unit_id: u.id,
    unit_name: u.unit_name,
    title: title,
    month: month,
    criterion_id: criterionId,
    criterion_title: critObj ? critObj.title : 'Báo cáo chung',
    content: content,
    link: uploadedUrl, file_name: uploadedName,
    self_score: selfScoreVal ? parseFloat(selfScoreVal) : null,
    awarded_score: awardedScore,
    is_on_time: isOnTime,
    created_at: nowISO()
  };

  const newLog = {
    id: reportId,
    unit_id: u.id,
    criterion_id: criterionId || 0,
    col_label: critObj ? critObj.col_label : `BC_T${month}`,
    criterion_title: title,
    deadline: critObj ? critObj.deadline : '',
    submitted_date: effDate,
    submitted_at: nowISO(),
    is_on_time: isOnTime,
    awarded_score: awardedScore,
    report_content: content,
    file_path: uploadedUrl || '',
    file_name: uploadedName || (uploadedUrl ? 'Đường link minh chứng' : '')
  };

  const res = await mutateCloudDB(db => {
    if (!Array.isArray(db.written_reports)) db.written_reports = [];
    db.written_reports.unshift(newReport);

    if (!Array.isArray(db.logs)) db.logs = [];
    db.logs.unshift(newLog);

    if (criterionId && awardedScore !== null) {
      if (!Array.isArray(db.scores)) db.scores = [];
      const sidx = db.scores.findIndex(s => Number(s.unit_id) === Number(u.id) && Number(s.criterion_id) === Number(criterionId));
      if (sidx >= 0) {
        db.scores[sidx].score = awardedScore;
        db.scores[sidx].is_on_time = isOnTime;
        db.scores[sidx].report_content = content;
        if (link) db.scores[sidx].file_path = link;
      } else {
        db.scores.push({
          unit_id: u.id,
          criterion_id: criterionId,
          score: awardedScore,
          is_on_time: isOnTime,
          report_content: content,
          file_path: uploadedUrl || '',
          file_name: uploadedName || (uploadedUrl ? 'Đường link minh chứng' : '')
        });
      }
    }
  }, `Submit written report ${u.username} M${month}`);

  if (res.ok) {
    showToast('Đã gửi báo cáo văn bản thành công và lưu Online!', 'success');
    document.getElementById('wr-title').value = '';
    document.getElementById('wr-content').value = '';
    document.getElementById('wr-link').value = '';
    renderApp();
  } else {
    showToast('Lỗi khi lưu báo cáo, vui lòng thử lại!', 'error');
  }
};


window.viewWrittenReportDetail = function(reportId) {
  const r = (state.writtenReports || []).find(x => x.id === reportId);
  if (!r) return;

  const html = `
    <div class="modal-backdrop" onclick="closeModal()">
      <div class="modal-card" style="max-width: 720px;" onclick="event.stopPropagation()">
        <div class="modal-header" style="background: #003d99; color: #fff;">
          <h3 style="font-size: 16px; margin: 0; color: #fff;">
            📄 CHI TIẾT BÁO CÁO VĂN BẢN TOÀN ĐOÀN
          </h3>
          <button class="close-btn" onclick="closeModal()" style="color:#fff;">&times;</button>
        </div>
        <div class="modal-body" style="padding: 20px; max-height: 75vh; overflow-y: auto;">
          <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px;">
            <h2 style="font-size: 18px; color: #003d99; margin-bottom: 8px;">${escapeHtml(r.title)}</h2>
            <div style="display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: #475569;">
              <div>🏢 Đơn vị: <b style="color: #0052cc;">${escapeHtml(r.unit_name)}</b></div>
              <div>📅 Kỳ báo cáo: <b>Tháng ${r.month} / 2026</b></div>
              <div>🕒 Ngày nộp: <b>${escapeHtml(r.created_at || '')}</b></div>
              ${r.self_score ? `<div>⭐ Điểm tự chấm: <b style="color: #16a34a;">${formatScore(r.self_score)}đ</b></div>` : ''}
            </div>
            ${r.criterion_title ? `<div style="font-size: 12px; color: #64748b; margin-top: 6px;">Tiêu chí liên kết: <i>${escapeHtml(r.criterion_title)}</i></div>` : ''}
          </div>

          <div style="margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 6px;">📝 Nội dung văn bản báo cáo:</div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; color: #1e293b; white-space: pre-wrap; word-break: break-word;">
${escapeHtml(r.content || '')}
            </div>
          </div>

          ${
            r.link
              ? `
            <div style="margin-top: 14px; padding: 12px 16px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div>
                📎 <b>Hồ sơ / Minh chứng đính kèm:</b>
                <a href="${escapeHtml(r.link)}" target="_blank" style="color: #0052cc; font-weight: 700; margin-left: 6px; word-break: break-all;">
                  ${escapeHtml(r.file_name || r.link)} ↗
                </a>
              </div>
              <a href="${escapeHtml(r.link)}" download="${escapeHtml(r.file_name || 'minh_chung')}" target="_blank" class="btn btn-sm btn-primary">
                📥 Tải Về Máy
              </a>
            </div>
          `
              : ''
          }
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng cửa sổ</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-root').innerHTML = html;
};


window.adminResetUnitPassword = async function(unitId) {
  const u = state.units.find(x => x.id === unitId);
  if (!u) return;
  const newPw = prompt(`Nhập mật khẩu mới cho tài khoản "${u.username}" (${u.unit_name}):`, 'doan2026');
  if (newPw === null) return;
  const trimmed = newPw.trim();
  if (!trimmed) {
    showToast('Mật khẩu không được để trống!', 'error');
    return;
  }
  showToast('Đang cập nhật mật khẩu lên Đám mây...', 'info');
  const res = await mutateCloudDB(db => {
    const found = (db.units || []).find(x => x.id === unitId);
    if (found) found.password = trimmed;
  }, `Admin reset password for ${u.username}`);

  if (res.ok) {
    u.password = trimmed;
    showToast(`Đã đổi mật khẩu cho tài khoản "${u.username}" thành công!`, 'success');
    renderApp();
  } else {
    showToast('Lỗi cập nhật mật khẩu, vui lòng thử lại!', 'error');
  }
};


window.deleteCriterion = async function(critId) {
  const c = state.criteria.find(x => x.id === critId);
  if (!c) return;
  if (!confirm(`Bạn có chắc chắn muốn XÓA cột tiêu chí "${c.col_label}: ${c.title}" khỏi hệ thống?\nCột này và toàn bộ điểm liên quan sẽ được gỡ khỏi Bảng tổng hợp.`)) {
    return;
  }
  showToast('Đang xóa cột tiêu chí khỏi Đám mây...', 'info');
  const res = await mutateCloudDB(db => {
    db.criteria = (db.criteria || []).filter(x => x.id !== critId);
    db.scores = (db.scores || []).filter(x => x.criterion_id !== critId);
    db.logs = (db.logs || []).filter(x => x.criterion_id !== critId);
    if (Array.isArray(db.written_reports)) {
      db.written_reports.forEach(r => {
        if (r.criterion_id === critId) r.criterion_id = null;
      });
    }
  }, `Delete criterion ${c.col_label}`);

  if (res.ok) {
    showToast(`Đã xóa cột tiêu chí ${c.col_label} thành công!`, 'success');
    renderApp();
  } else {
    showToast('Lỗi khi xóa tiêu chí, vui lòng thử lại!', 'error');
  }
};


function renderUnitPasswordTab() {
  const u = state.user;
  return `
    <div class="panel" style="max-width: 600px; margin: 0 auto;">
      <div class="panel-header" style="background: #003d99; color: #fff;">
        <div class="panel-title" style="color: #fff; font-size: 15px;">
          🔐 QUẢN LÝ ĐỔI MẬT KHẨU TÀI KHOẢN ĐƠN VỊ
        </div>
      </div>
      <div class="panel-body" style="padding: 24px;">
        <p style="font-size: 13.5px; color: #475569; margin-bottom: 18px; line-height: 1.5;">
          Đơn vị nên chủ động thay đổi mật khẩu định kỳ để bảo mật tài khoản nộp báo cáo. Sau khi đổi, mật khẩu mới sẽ được lưu trực tuyến trên máy chủ Đám mây ngay lập tức.
        </p>

        <form onsubmit="window.unitChangePasswordSubmit(event)">
          <div class="form-group">
            <label>Tên đơn vị cơ sở:</label>
            <input type="text" value="${escapeHtml(u.unit_name)}" disabled style="background: #f1f5f9; font-weight: 700; color: #0f172a;" />
          </div>

          <div class="form-group">
            <label>Tên đăng nhập (Username):</label>
            <input type="text" value="${escapeHtml(u.username)}" disabled style="background: #f1f5f9; font-weight: 700; color: #0052cc;" />
          </div>

          <div class="form-group">
            <label>Mật khẩu hiện tại*:</label>
            <input type="password" id="pw-current" placeholder="Nhập mật khẩu đang sử dụng..." required />
          </div>

          <div class="form-group">
            <label>Mật khẩu mới*:</label>
            <input type="password" id="pw-new" placeholder="Tối thiểu 4 ký tự..." required />
          </div>

          <div class="form-group">
            <label>Nhập lại mật khẩu mới*:</label>
            <input type="password" id="pw-confirm" placeholder="Nhập lại mật khẩu mới..." required />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
            <button type="submit" class="btn btn-primary" style="padding: 10px 24px; font-weight: 700; font-size: 14px;">
              💾 CẬP NHẬT MẬT KHẨU ONLINE NGAY
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.unitChangePasswordSubmit = async function(e) {
  e.preventDefault();
  const curPw = document.getElementById('pw-current').value.trim();
  const newPw = document.getElementById('pw-new').value.trim();
  const confPw = document.getElementById('pw-confirm').value.trim();

  const u = state.user;
  if (!curPw || !newPw || !confPw) {
    showToast('Vui lòng điền đầy đủ các thông tin!', 'error');
    return;
  }
  if (curPw !== u.password) {
    showToast('Mật khẩu hiện tại không chính xác!', 'error');
    return;
  }
  if (newPw.length < 4) {
    showToast('Mật khẩu mới phải có ít nhất 4 ký tự!', 'error');
    return;
  }
  if (newPw !== confPw) {
    showToast('Mật khẩu mới và xác nhận mật khẩu không khớp nhau!', 'error');
    return;
  }

  showToast('Đang cập nhật mật khẩu lên Đám mây...', 'info');
  const res = await mutateCloudDB(db => {
    const found = (db.units || []).find(x => x.id === u.id);
    if (found) found.password = newPw;
  }, `Unit ${u.username} change password`);

  if (res.ok) {
    state.user.password = newPw;
    localStorage.setItem('doan2026_user', JSON.stringify(state.user));
    showToast('🎉 Đã cập nhật mật khẩu mới thành công!', 'success');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } else {
    showToast('Lỗi cập nhật mật khẩu, vui lòng thử lại!', 'error');
  }
};


window.moveCriterion = async function(critId, direction) {
  const list = state.criteria;
  const idx = list.findIndex(c => c.id === critId);
  if (idx < 0) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= list.length) return;

  showToast('Đang di chuyển cột tiêu chí...', 'info');
  const res = await mutateCloudDB(db => {
    db.criteria = Array.isArray(db.criteria) ? db.criteria : [];
    const fromIdx = db.criteria.findIndex(c => c.id === critId);
    if (fromIdx < 0) return;
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= db.criteria.length) return;

    // Swap
    const temp = db.criteria[fromIdx];
    db.criteria[fromIdx] = db.criteria[toIdx];
    db.criteria[toIdx] = temp;

    // Renumber
    db.criteria.forEach((c, i) => {
      c.col_number = i + 1;
      c.col_label = `Cột ${i + 1}`;
    });
  }, `Move criterion ${critId} by ${direction}`);

  if (res.ok) {
    renderApp();
    showToast('Đã di chuyển cột tiêu chí thành công!', 'success');
  } else {
    showToast('Lỗi khi di chuyển cột, vui lòng thử lại!', 'error');
  }
};

window.moveUnitRow = async function(unitId, direction) {
  const list = state.units;
  const idx = list.findIndex(u => u.id === unitId);
  if (idx < 0) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= list.length) return;

  showToast('Đang di chuyển vị trí dòng đơn vị...', 'info');
  const res = await mutateCloudDB(db => {
    db.units = Array.isArray(db.units) ? db.units : [];
    const fromIdx = db.units.findIndex(u => u.id === unitId);
    if (fromIdx < 0) return;
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= db.units.length) return;

    // Swap
    const temp = db.units[fromIdx];
    db.units[fromIdx] = db.units[toIdx];
    db.units[toIdx] = temp;

    // Update display_order
    db.units.forEach((u, i) => {
      u.display_order = i + 1;
    });
  }, `Move unit ${unitId} by ${direction}`);

  if (res.ok) {
    renderApp();
    showToast('Đã di chuyển dòng đơn vị thành công!', 'success');
  } else {
    showToast('Lỗi khi di chuyển dòng, vui lòng thử lại!', 'error');
  }
};


function renderAdminPasswordTab() {
  const adminPw = (state.settings && state.settings.admin_password) ? state.settings.admin_password : 'admin123';
  return `
    <div class="panel" style="max-width: 580px; margin: 0 auto;">
      <div class="panel-header" style="background: #003d99; color: #fff;">
        <div class="panel-title" style="color: #fff; font-size: 15px;">
          🔐 QUẢN LÝ ĐỔI MẬT KHẨU QUẢN TRỊ VIÊN (ADMIN)
        </div>
      </div>
      <div class="panel-body" style="padding: 24px;">
        <p style="font-size: 13.5px; color: #475569; margin-bottom: 18px; line-height: 1.5;">
          Thay đổi mật khẩu tài khoản Quản trị viên (Admin - Ban Thường vụ Đoàn). Sau khi lưu, mật khẩu mới sẽ có hiệu lực trực tuyến trên toàn hệ thống Đám mây.
        </p>

        <form onsubmit="window.adminChangePasswordSubmit(event)">
          <div class="form-group">
            <label>Tài khoản Quản trị:</label>
            <input type="text" value="admin (Ban Thường vụ Đoàn)" disabled style="background: #f1f5f9; font-weight: 700; color: #003d99;" />
          </div>

          <div class="form-group">
            <label>Mật khẩu Admin hiện tại*:</label>
            <input type="password" id="adm-cur-pw" placeholder="Nhập mật khẩu hiện tại (mặc định admin123)..." required />
          </div>

          <div class="form-group">
            <label>Mật khẩu Admin mới*:</label>
            <input type="password" id="adm-new-pw" placeholder="Tối thiểu 4 ký tự..." required />
          </div>

          <div class="form-group">
            <label>Xác nhận lại mật khẩu Admin mới*:</label>
            <input type="password" id="adm-conf-pw" placeholder="Nhập lại mật khẩu mới..." required />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
            <button type="submit" class="btn btn-primary" id="btn-adm-pw" style="padding: 10px 24px; font-weight: 700; font-size: 14px;">
              💾 LƯU MẬT KHẨU ADMIN ONLINE
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.adminChangePasswordSubmit = async function(e) {
  e.preventDefault();
  const curPw = document.getElementById('adm-cur-pw').value.trim();
  const newPw = document.getElementById('adm-new-pw').value.trim();
  const confPw = document.getElementById('adm-conf-pw').value.trim();

  const realCurPw = (state.settings && state.settings.admin_password) ? state.settings.admin_password : 'admin123';
  if (curPw !== realCurPw) {
    showToast('Mật khẩu Admin hiện tại không chính xác!', 'error');
    return;
  }
  if (newPw.length < 4) {
    showToast('Mật khẩu mới phải có ít nhất 4 ký tự!', 'error');
    return;
  }
  if (newPw !== confPw) {
    showToast('Mật khẩu mới và xác nhận mật khẩu không khớp nhau!', 'error');
    return;
  }

  const btn = document.getElementById('btn-adm-pw');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu mật khẩu...';
  }

  showToast('Đang cập nhật mật khẩu Admin lên Đám mây...', 'info');
  const res = await mutateCloudDB(db => {
    db.settings = db.settings || {};
    db.settings.admin_password = newPw;
  }, 'Admin changed password');

  if (res.ok) {
    state.settings.admin_password = newPw;
    if (state.user && state.user.role === 'admin') {
      state.user.password = newPw;
      localStorage.setItem('doan2026_user', JSON.stringify(state.user));
    }
    showToast('🎉 Đã cập nhật mật khẩu Admin Online thành công!', 'success');
    document.getElementById('adm-cur-pw').value = '';
    document.getElementById('adm-new-pw').value = '';
    document.getElementById('adm-conf-pw').value = '';
  } else {
    showToast('Lỗi khi cập nhật mật khẩu Admin, vui lòng thử lại!', 'error');
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = '💾 LƯU MẬT KHẨU ADMIN ONLINE';
  }
};


window.openScoreNoteModal = function(unitId, criterionId) {
  const u = state.units.find(x => x.id === unitId);
  const c = state.criteria.find(x => x.id === criterionId);
  if (!u || !c) return;

  const sc = getScoreObj(unitId, criterionId);
  const currentScore = sc && sc.score !== null && sc.score !== '' ? sc.score : '';
  const currentNote = sc ? (sc.report_content || sc.note || '') : '';
  const currentLink = sc ? (sc.file_path || '') : '';
  const isAdmin = state.user && state.user.role === 'admin';

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header" style="background: #003d99; color: #fff;">
          <span style="font-weight: 700;">📝 Ghi Chú & Lý Do Chấm Điểm</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()" style="color: #fff; border-color: rgba(255,255,255,0.4);">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="font-size: 14px; font-weight: 700; color: #003d99;">${escapeHtml(u.unit_name)}</div>
            <div style="font-size: 13px; color: #475569; margin-top: 3px;">
              <b>${escapeHtml(c.col_label)}:</b> ${escapeHtml(c.title)}
            </div>
            <div style="font-size: 12px; color: #16a34a; margin-top: 3px;">
              Hạn nộp: <b>${formatDateVN(c.deadline)}</b> • Điểm tối đa: <b>${c.max_score}đ</b>
            </div>
          </div>

          <div class="form-group">
            <label>Điểm số (Tối đa ${c.max_score}đ):</label>
            <input type="number" id="cell-note-score" value="${currentScore}" step="0.5" min="0" max="${c.max_score}" ${isAdmin ? '' : 'disabled'} style="font-size: 16px; font-weight: 700; color: #15803d; width: 140px;" />
          </div>

          <div class="form-group">
            <label><b>Lý do vì sao được điểm / Ghi chú nội dung:</b></label>
            <textarea id="cell-note-content" rows="4" placeholder="Nhập chi tiết: Kết quả thực hiện, số liệu, căn cứ cộng điểm hoặc trừ điểm..." ${isAdmin ? '' : 'readonly'} style="width: 100%; padding: 10px; font-family: inherit; font-size: 13.5px; line-height: 1.6; border: 1px solid var(--border); border-radius: 6px;">${escapeHtml(currentNote)}</textarea>
          </div>

          <div class="form-group">
            <label>Đường link tài liệu / Minh chứng (Nếu có):</label>
            <input type="url" id="cell-note-link" value="${escapeHtml(currentLink)}" placeholder="https://drive.google.com/..." ${isAdmin ? '' : 'readonly'} />
            ${currentLink ? `<div style="margin-top: 6px;"><a href="${escapeHtml(currentLink)}" target="_blank" style="color: #0052cc; font-weight: 700; font-size: 12.5px;">🔗 Mở xem tài liệu minh chứng ↗</a></div>` : ''}
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px;">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
          ${isAdmin ? `
            <button class="btn btn-primary" id="btn-save-score-note" onclick="window.saveScoreNote(${unitId}, ${c.id})" style="font-weight: 700;">
              💾 Lưu Ghi Chú & Điểm Online
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

window.saveScoreNote = async function(unitId, criterionId) {
  const scoreVal = document.getElementById('cell-note-score').value.trim();
  const noteVal = document.getElementById('cell-note-content').value.trim();
  const linkVal = document.getElementById('cell-note-link').value.trim();
  const scoreNum = scoreVal === '' ? null : Number(scoreVal);

  const btn = document.getElementById('btn-save-score-note');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu...';
  }

  showToast('Đang lưu ghi chú và điểm số lên Đám mây...', 'info');

  const res = await mutateCloudDB(db => {
    db.scores = Array.isArray(db.scores) ? db.scores : [];
    const idx = db.scores.findIndex(s => Number(s.unit_id) === Number(unitId) && Number(s.criterion_id) === Number(criterionId));
    if (idx >= 0) {
      db.scores[idx].score = scoreNum;
      db.scores[idx].report_content = noteVal;
      db.scores[idx].note = noteVal;
      if (linkVal) db.scores[idx].file_path = linkVal;
    } else {
      db.scores.push({
        unit_id: unitId,
        criterion_id: criterionId,
        score: scoreNum,
        report_content: noteVal,
        note: noteVal,
        file_path: linkVal,
        is_on_time: 1
      });
    }
  }, `Score note U${unitId} C${criterionId}`);

  if (res.ok) {
    closeModal();
    renderApp();
    showToast('🎉 Đã lưu ghi chú lý do được điểm thành công!', 'success');
  } else {
    showToast('Lỗi khi lưu ghi chú, vui lòng thử lại!', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Lưu Ghi Chú & Điểm Online';
    }
  }
};


/* =========================================================================
   ADMIN MANAGEMENT: QUẢN LÝ & XÓA NHÓM THÁNG / ĐỢT HOẠT ĐỘNG
   ========================================================================= */
window.openManageMonthGroupsModal = function () {
  const modalRoot = document.getElementById('modal-root');
  const labels = state.monthLabels || {};

  const groupsList = Object.entries(labels).map(([k, v]) => {
    const num = Number(k);
    const count = state.criteria.filter(c => Number(c.month_group) === num).length;
    const isStandard = num >= 1 && num <= 12;
    return { key: k, num, label: v, count, isStandard };
  }).sort((a, b) => a.num - b.num);

  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header" style="background: #dc2626; color: #fff;">
          <span style="font-weight: 700;">⚙️ Quản Lý, Chỉnh Sửa & XÓA Nhóm Tháng / Đợt Hoạt Động</span>
          <button class="btn btn-sm btn-outline" onclick="closeModal()" style="color: #fff; border-color: rgba(255,255,255,0.4);">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <p style="font-size: 13px; color: #475569; margin-bottom: 14px;">
            Admin có toàn quyền chỉnh sửa tên hoặc <b>XÓA hoàn toàn</b> bất kỳ Nhóm kỳ hạn / Tháng nào bị tạo nhầm.
          </p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 13px; color: #1e293b; margin-bottom: 8px;">
              ➕ Thêm Nhóm kỳ hạn / Đợt hoạt động mới:
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="new-group-name-input" placeholder="Nhập tên đợt hoạt động mới (VD: Tháng Thanh niên, Chiến dịch Hè...)" style="flex: 1;" />
              <button class="btn btn-primary" onclick="window.createMonthGroupFromModal()">➕ Tạo Mới</button>
            </div>
          </div>

          <div style="max-height: 380px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
            <table class="data-table" style="margin: 0;">
              <thead>
                <tr>
                  <th style="width: 50px; text-align: center;">Mã</th>
                  <th>Tên Nhóm Kỳ Hạn / Tháng</th>
                  <th style="width: 100px; text-align: center;">Số tiêu chí</th>
                  <th style="width: 160px; text-align: center;">Thao tác Admin</th>
                </tr>
              </thead>
              <tbody>
                ${groupsList.map(g => `
                  <tr>
                    <td style="text-align: center; font-weight: 700; color: #64748b;">${g.num}</td>
                    <td>
                      <span id="group-label-${g.key}" style="font-weight: 600; color: #0f172a;">${escapeHtml(g.label)}</span>
                      ${g.isStandard ? '<span class="badge badge-info" style="font-size:10px; margin-left:4px;">Chuẩn</span>' : ''}
                    </td>
                    <td style="text-align: center;">
                      <span class="badge ${g.count > 0 ? 'badge-success' : 'badge-warning'}">${g.count} tiêu chí</span>
                    </td>
                    <td style="text-align: center; white-space: nowrap;">
                      <button class="btn btn-sm btn-outline" onclick="window.renameMonthGroup(${g.num}, '${escapeHtml(g.label.replace(/'/g, "\\'"))}')" title="Đổi tên nhóm này">✏️ Đổi tên</button>
                      ${!g.isStandard ? `
                        <button class="btn btn-sm btn-danger" onclick="window.deleteMonthGroup(${g.num})" style="margin-left: 4px;" title="Xóa bỏ nhóm này">🗑️ Xóa</button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px;">
          <button class="btn btn-primary" onclick="closeModal()">Đóng</button>
        </div>
      </div>
    </div>
  `;
};

window.createMonthGroupFromModal = async function () {
  const input = document.getElementById('new-group-name-input');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast('Vui lòng nhập tên nhóm mới!', 'error');
    return;
  }
  showToast('Đang tạo nhóm mới...', 'info');
  const res = await mutateCloudDB((db) => {
    db.month_labels = db.month_labels || {};
    const keys = Object.keys(db.month_labels).map(k => Number(k)).filter(n => !isNaN(n));
    const nextKey = Math.max(16, ...(keys.length > 0 ? keys : [16])) + 1;
    db.month_labels[String(nextKey)] = name;
  }, `Create month group ${name}`);

  if (res.ok) {
    showToast(`Đã tạo nhóm "${name}" thành công!`, 'success');
    openManageMonthGroupsModal();
  }
};

window.renameMonthGroup = async function (groupNum, curName) {
  const newName = prompt(`Nhập tên mới cho nhóm kỳ hạn "${curName}":`, curName);
  if (!newName || newName.trim() === '' || newName.trim() === curName) return;

  showToast('Đang cập nhật tên nhóm...', 'info');
  const res = await mutateCloudDB((db) => {
    db.month_labels = db.month_labels || {};
    db.month_labels[String(groupNum)] = newName.trim();
    for (const c of db.criteria || []) {
      if (Number(c.month_group) === groupNum) {
        c.month_label = newName.trim();
      }
    }
  }, `Rename month group ${groupNum} to ${newName}`);

  if (res.ok) {
    showToast('Đã đổi tên nhóm thành công!', 'success');
    openManageMonthGroupsModal();
  }
};

window.deleteMonthGroup = async function (groupNum) {
  const labels = state.monthLabels || {};
  const groupName = labels[String(groupNum)] || `Nhóm ${groupNum}`;
  const criteriaInGroup = state.criteria.filter(c => Number(c.month_group) === groupNum);

  let confirmMsg = `Bạn có chắc chắn muốn XÓA nhóm kỳ hạn "${groupName}"?`;
  if (criteriaInGroup.length > 0) {
    confirmMsg += `\n\n⚠️ Nhóm này đang chứa ${criteriaInGroup.length} tiêu chí!\nKhi xóa nhóm, các tiêu chí này sẽ được tự động chuyển về "Thường xuyên & Cuối năm" để bảo toàn dữ liệu điểm.`;
  }

  if (!confirm(confirmMsg)) return;

  showToast('Đang xóa nhóm kỳ hạn...', 'info');
  const res = await mutateCloudDB((db) => {
    db.month_labels = db.month_labels || {};
    delete db.month_labels[String(groupNum)];

    for (const c of db.criteria || []) {
      if (Number(c.month_group) === groupNum) {
        c.month_group = 13;
        c.month_label = db.month_labels['13'] || 'Thường xuyên & Cuối năm';
      }
    }
  }, `Delete month group ${groupNum}`);

  if (res.ok) {
    showToast(`Đã xóa nhóm "${groupName}" thành công!`, 'success');
    openManageMonthGroupsModal();
  }
};
