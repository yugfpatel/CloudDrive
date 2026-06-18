/**
 * CloudDrive - Supabase-backed cloud file storage
 * Handles auth, upload, download, delete, search, and UI updates.
 */

const SUPABASE_URL = 'https://fstckfzimtmmgnlqshfq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tDJldIw6f4YA59c-mYHlIA_okqRK4cm';
const STORAGE_BUCKET = 'user-files';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

let supabaseClient = null;
let currentUser = null;
let fileToDelete = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const dashboard = document.getElementById('dashboard');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const signupName = document.getElementById('signup-name');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const userMenu = document.getElementById('user-menu');
const userPill = document.getElementById('user-pill');
const logoutBtn = document.getElementById('logout-btn');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const progressBar = document.getElementById('upload-progress-bar');
const fileTableBody = document.getElementById('file-table-body');
const emptyState = document.getElementById('empty-state');
const tableWrapper = document.getElementById('table-wrapper');
const searchInput = document.getElementById('search-input');
const toastContainer = document.getElementById('toast-container');
const confirmModal = document.getElementById('confirm-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const modalText = document.getElementById('modal-text');

// Stats Elements
const statTotalFiles = document.getElementById('stat-total-files');
const statTotalSize = document.getElementById('stat-total-size');
const statFileTypes = document.getElementById('stat-file-types');
const statLastUpload = document.getElementById('stat-last-upload');
const dbStatus = document.getElementById('db-status');

// =============================================
// Initialize App
// =============================================
async function initApp() {
  setupEventListeners();

  if (!initSupabase()) {
    setStatus('Setup needed', 'warning');
    updateAuthView();
    showToast('Add your Supabase URL and anon key in app.js', 'warning');
    return;
  }

  try {
    setStatus('Connected', 'success');
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    currentUser = data.session ? data.session.user : null;
    updateAuthView();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      updateAuthView();
    });
  } catch (error) {
    setStatus('Backend Error', 'error');
    showToast('Failed to connect to Supabase', 'error');
  }
}

function initSupabase() {
  const hasConfig =
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('YOUR-PROJECT') &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

  if (!hasConfig || !window.supabase) return false;

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

function setStatus(label, type) {
  const color = type === 'error'
    ? 'var(--danger-color)'
    : type === 'warning'
      ? 'var(--amber-color)'
      : 'var(--success-color)';

  dbStatus.innerHTML =
    '<span class="status-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + '"></span>' +
    escapeHTML(label);
}

// =============================================
// Authentication
// =============================================
async function handleSignup(e) {
  e.preventDefault();

  if (!ensureBackendReady()) return;

  const name = signupName.value.trim();
  const email = normalizeEmail(signupEmail.value);
  const password = signupPassword.value;

  if (!name) {
    showToast('Please enter your name', 'warning');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'warning');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { name: name }
      }
    });

    if (error) throw error;

    signupForm.reset();

    if (data.session) {
      currentUser = data.user;
      updateAuthView();
      showToast('Account created successfully', 'success');
    } else {
      showAuthMode('login');
      showToast('Account created. Check your email if confirmation is enabled.', 'success');
    }
  } catch (err) {
    showToast(err.message || 'Could not create account', 'error');
  }
}

async function handleLogin(e) {
  e.preventDefault();

  if (!ensureBackendReady()) return;

  const email = normalizeEmail(loginEmail.value);
  const password = loginPassword.value;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    currentUser = data.user;
    loginForm.reset();
    updateAuthView();
    showToast('Welcome back, ' + getUserName(currentUser), 'success');
  } catch (err) {
    showToast(err.message || 'Invalid email or password', 'error');
  }
}

async function logout() {
  if (!ensureBackendReady()) return;

  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    showToast('Logout failed', 'error');
    return;
  }

  currentUser = null;
  searchInput.value = '';
  updateStats([]);
  renderTable([]);
  updateAuthView();
  showToast('Logged out successfully', 'info');
}

function updateAuthView() {
  const isLoggedIn = Boolean(currentUser);

  authView.hidden = isLoggedIn;
  dashboard.hidden = !isLoggedIn;
  userMenu.hidden = !isLoggedIn;

  if (isLoggedIn) {
    userPill.textContent = getUserName(currentUser);
    refreshFileList();
  } else {
    userPill.textContent = '';
    showAuthMode('login');
  }
}

function showAuthMode(mode) {
  const isLogin = mode === 'login';
  loginTab.classList.toggle('active', isLogin);
  signupTab.classList.toggle('active', !isLogin);
  loginForm.classList.toggle('active', isLogin);
  signupForm.classList.toggle('active', !isLogin);
}

function ensureBackendReady() {
  if (supabaseClient) return true;
  showToast('Connect Supabase first: update app.js with your project URL and anon key', 'warning');
  return false;
}

function getUserName(user) {
  if (!user) return '';
  return user.user_metadata && user.user_metadata.name
    ? user.user_metadata.name
    : user.email;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

// =============================================
// Supabase File Operations
// =============================================
async function saveFileMetadata(fileRecord) {
  const { error } = await supabaseClient
    .from('files')
    .insert({
      id: fileRecord.id,
      owner_id: currentUser.id,
      name: fileRecord.name,
      type: fileRecord.type,
      size: fileRecord.size,
      storage_path: fileRecord.storagePath
    });

  if (error) throw error;
}

async function getAllFiles() {
  const { data, error } = await supabaseClient
    .from('files')
    .select('id, name, type, size, storage_path, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size,
    storagePath: row.storage_path,
    date: row.created_at
  }));
}

async function getFileById(id) {
  const { data, error } = await supabaseClient
    .from('files')
    .select('id, name, type, size, storage_path, created_at')
    .eq('id', id)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    size: data.size,
    storagePath: data.storage_path,
    date: data.created_at
  };
}

async function deleteFileRecord(fileRecord) {
  const storageResult = await supabaseClient
    .storage
    .from(STORAGE_BUCKET)
    .remove([fileRecord.storagePath]);

  if (storageResult.error) throw storageResult.error;

  const { error } = await supabaseClient
    .from('files')
    .delete()
    .eq('id', fileRecord.id);

  if (error) throw error;
}

// =============================================
// Upload Progress Simulation
// =============================================
function simulateUploadProgress() {
  return new Promise((resolve) => {
    let progress = 0;
    progressBar.style.width = '0%';
    uploadZone.classList.add('uploading');

    const interval = setInterval(() => {
      progress += Math.random() * 25 + 5;
      if (progress > 100) progress = 100;
      progressBar.style.width = progress + '%';

      if (progress === 100) {
        clearInterval(interval);
        setTimeout(() => {
          progressBar.style.width = '0%';
          uploadZone.classList.remove('uploading');
          resolve();
        }, 300);
      }
    }, 140);
  });
}

// =============================================
// File Upload Handler
// =============================================
async function handleFiles(fileList) {
  if (!currentUser) {
    showToast('Please login before uploading files', 'warning');
    return;
  }

  const files = Array.from(fileList);
  if (files.length === 0) return;

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      showToast(file.name + ' exceeds the 100 MB limit', 'error');
      continue;
    }

    try {
      await simulateUploadProgress();

      const fileId = createId();
      const storagePath = currentUser.id + '/' + fileId + '-' + sanitizeFileName(file.name);

      const uploadResult = await supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        });

      if (uploadResult.error) throw uploadResult.error;

      await saveFileMetadata({
        id: fileId,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        storagePath: storagePath
      });

      showToast(file.name + ' uploaded successfully', 'success');
    } catch (err) {
      showToast('Failed to upload ' + file.name + ': ' + (err.message || 'Unknown error'), 'error');
    }
  }

  fileInput.value = '';
  await refreshFileList();
}

// =============================================
// File List & UI Updates
// =============================================
async function refreshFileList() {
  if (!currentUser || !supabaseClient) return;

  try {
    const allFiles = await getAllFiles();
    const query = searchInput.value.toLowerCase().trim();

    const filteredFiles = query
      ? allFiles.filter(f => f.name.toLowerCase().includes(query))
      : allFiles;

    updateStats(allFiles);
    renderTable(filteredFiles);
  } catch (err) {
    showToast('Error loading files: ' + (err.message || 'Unknown error'), 'error');
  }
}

function updateStats(files) {
  statTotalFiles.textContent = files.length;

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
  statTotalSize.textContent = formatBytes(totalSize);

  const types = new Set(files.map(f => getFileCategory(f.type)));
  statFileTypes.textContent = files.length > 0 ? types.size : 0;

  if (files.length > 0) {
    const sorted = [...files].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = new Date(sorted[0].date);
    const now = new Date();
    const diffMs = now - latest;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      statLastUpload.textContent = 'Just now';
    } else if (diffMins < 60) {
      statLastUpload.textContent = diffMins + 'm ago';
    } else if (diffMins < 1440) {
      statLastUpload.textContent = Math.floor(diffMins / 60) + 'h ago';
    } else {
      statLastUpload.textContent = latest.toLocaleDateString();
    }
  } else {
    statLastUpload.textContent = '\u2014';
  }
}

function renderTable(files) {
  fileTableBody.innerHTML = '';

  if (files.length === 0) {
    tableWrapper.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  tableWrapper.style.display = 'block';
  emptyState.style.display = 'none';

  files.sort((a, b) => new Date(b.date) - new Date(a.date));

  files.forEach((file, index) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-file-id', file.id);
    tr.style.animationDelay = (index * 0.05) + 's';
    tr.classList.add('file-row-enter');

    tr.innerHTML =
      '<td>' +
        '<div class="file-name-cell">' +
          '<div class="file-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>' +
          '</div>' +
          '<span class="file-name-text">' + escapeHTML(file.name) + '</span>' +
        '</div>' +
      '</td>' +
      '<td>' + escapeHTML(file.type || 'Unknown') + '</td>' +
      '<td>' + formatBytes(file.size) + '</td>' +
      '<td>' + new Date(file.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + '</td>' +
      '<td>' +
        '<div class="action-buttons">' +
          '<button class="btn-icon download" data-id="' + file.id + '" aria-label="Download ' + escapeHTML(file.name) + '" title="Download">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '</button>' +
          '<button class="btn-icon delete" data-id="' + file.id + '" data-name="' + escapeHTML(file.name) + '" aria-label="Delete ' + escapeHTML(file.name) + '" title="Delete">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</td>';

    fileTableBody.appendChild(tr);
  });
}

// =============================================
// Download File
// =============================================
async function downloadFile(id) {
  try {
    const fileRecord = await getFileById(id);
    const { data, error } = await supabaseClient
      .storage
      .from(STORAGE_BUCKET)
      .download(fileRecord.storagePath);

    if (error) throw error;

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileRecord.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Downloading ' + fileRecord.name, 'success');
  } catch (err) {
    showToast('Download failed: ' + (err.message || 'Unknown error'), 'error');
  }
}

// =============================================
// Delete File
// =============================================
function confirmDelete(id, name) {
  fileToDelete = id;
  modalText.textContent = 'Are you sure you want to delete "' + name + '"? This action cannot be undone.';
  confirmModal.style.display = 'flex';
}

async function executeDelete() {
  if (!fileToDelete) return;

  try {
    const fileRecord = await getFileById(fileToDelete);
    await deleteFileRecord(fileRecord);
    showToast('File deleted from cloud storage', 'success');

    const row = document.querySelector('tr[data-file-id="' + fileToDelete + '"]');
    if (row) {
      row.classList.remove('file-row-enter');
      row.classList.add('file-row-exit');
      row.addEventListener('animationend', () => refreshFileList());
    } else {
      await refreshFileList();
    }
  } catch (err) {
    showToast('Failed to delete file: ' + (err.message || 'Unknown error'), 'error');
  }

  closeModal();
}

function closeModal() {
  confirmModal.style.display = 'none';
  fileToDelete = null;
}

// =============================================
// Event Listeners
// =============================================
function setupEventListeners() {
  loginTab.addEventListener('click', () => showAuthMode('login'));
  signupTab.addEventListener('click', () => showAuthMode('signup'));
  loginForm.addEventListener('submit', handleLogin);
  signupForm.addEventListener('submit', handleSignup);
  logoutBtn.addEventListener('click', logout);

  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  });

  searchInput.addEventListener('input', () => {
    refreshFileList();
  });

  modalCancel.addEventListener('click', closeModal);
  modalConfirm.addEventListener('click', executeDelete);

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal.style.display !== 'none') {
      closeModal();
    }
  });

  fileTableBody.addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('.btn-icon.download');
    const deleteBtn = e.target.closest('.btn-icon.delete');

    if (downloadBtn) {
      downloadFile(downloadBtn.dataset.id);
    } else if (deleteBtn) {
      confirmDelete(deleteBtn.dataset.id, deleteBtn.dataset.name);
    }
  });
}

// =============================================
// Utility Functions
// =============================================
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileCategory(mimeType) {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/')) return 'document';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compressed')) return 'archive';
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css') || mimeType.includes('xml')) return 'code';
  return 'other';
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(char) {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

function sanitizeFileName(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type) {
  type = type || 'info';

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  var icon = '';
  if (type === 'success') {
    icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === 'warning') {
    icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = icon + '<span>' + escapeHTML(message) + '</span>';
  toastContainer.appendChild(toast);

  setTimeout(function() {
    toast.classList.add('closing');
    setTimeout(function() {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 3500);
}

// =============================================
// CSS animation class for row exit
// =============================================
(function addRowAnimations() {
  var style = document.createElement('style');
  style.textContent =
    '.file-row-enter { animation: rowFadeIn 0.35s ease forwards; opacity: 0; }' +
    '@keyframes rowFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
    '.file-row-exit { animation: rowFadeOut 0.3s ease forwards; }' +
    '@keyframes rowFadeOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(30px); } }' +
    '.uploading { pointer-events: none; border-color: var(--success-color) !important; }';
  document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', initApp);
