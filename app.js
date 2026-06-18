/**
 * CloudDrive — Client-Side File Storage using IndexedDB
 * Handles upload, download, delete, search, and UI updates
 */

const DB_NAME = 'CloudDriveDB';
const STORE_NAME = 'files';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
let db;

// DOM Elements
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

let fileToDelete = null;

// =============================================
// Initialize App
// =============================================
async function initApp() {
  try {
    await initDB();
    dbStatus.innerHTML = '<span class="status-dot"></span> Connected';
    await refreshFileList();
    setupEventListeners();
    showToast('Cloud storage ready', 'info');
  } catch (error) {
    dbStatus.innerHTML = '<span class="status-dot" style="background:var(--danger-color);box-shadow:0 0 8px var(--danger-color)"></span> DB Error';
    showToast('Failed to initialize storage: ' + error, 'error');
  }
}

// =============================================
// IndexedDB Setup
// =============================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject('IndexedDB error: ' + request.error);

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// =============================================
// Database Operations (Cloud Storage Simulation)
// =============================================
function saveFileToDB(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(fileRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject('Failed to save file');
  });
}

function getAllFiles() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('Failed to retrieve files');
  });
}

function getFileById(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('File not found');
  });
}

function deleteFileFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject('Failed to delete file');
  });
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
        }, 400);
      }
    }, 150);
  });
}

// =============================================
// File Upload Handler
// =============================================
async function handleFiles(fileList) {
  const files = Array.from(fileList);

  if (files.length === 0) return;

  for (const file of files) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showToast(file.name + ' exceeds the 100 MB limit', 'error');
      continue;
    }

    try {
      // Show upload progress
      await simulateUploadProgress();

      // Create file record with blob data
      const fileRecord = {
        id: Date.now() + '-' + Math.random().toString(36).substring(2, 11),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        date: new Date().toISOString(),
        blob: file
      };

      // Save to IndexedDB (simulated cloud storage)
      await saveFileToDB(fileRecord);
      showToast(file.name + ' uploaded successfully', 'success');
    } catch (err) {
      showToast('Failed to upload ' + file.name, 'error');
    }
  }

  // Reset file input so same file can be re-uploaded
  fileInput.value = '';

  // Refresh the file list
  await refreshFileList();
}

// =============================================
// File List & UI Updates
// =============================================
async function refreshFileList() {
  try {
    const allFiles = await getAllFiles();
    const query = searchInput.value.toLowerCase().trim();

    const filteredFiles = query
      ? allFiles.filter(f => f.name.toLowerCase().includes(query))
      : allFiles;

    updateStats(allFiles);
    renderTable(filteredFiles);
  } catch (err) {
    showToast('Error loading files', 'error');
  }
}

function updateStats(files) {
  // Total files
  statTotalFiles.textContent = files.length;

  // Total size
  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
  statTotalSize.textContent = formatBytes(totalSize);

  // Unique file type categories
  const types = new Set(files.map(f => getFileCategory(f.type)));
  statFileTypes.textContent = files.length > 0 ? types.size : 0;

  // Last upload date
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

  // Sort newest first
  files.sort((a, b) => new Date(b.date) - new Date(a.date));

  files.forEach((file, index) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-file-id', file.id);
    tr.style.animationDelay = (index * 0.05) + 's';
    tr.classList.add('file-row-enter');

    const category = getFileCategory(file.type);
    const badgeClass = 'file-type-badge--' + category;
    const ext = getFileExtension(file.name);

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
    if (!fileRecord || !fileRecord.blob) {
      showToast('File not found in storage', 'error');
      return;
    }

    const url = URL.createObjectURL(fileRecord.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileRecord.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up the object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Downloading ' + fileRecord.name, 'success');
  } catch (err) {
    showToast('Download failed', 'error');
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
    await deleteFileFromDB(fileToDelete);
    showToast('File deleted from cloud storage', 'success');

    // Animate the row out
    const row = document.querySelector('tr[data-file-id="' + fileToDelete + '"]');
    if (row) {
      row.classList.remove('file-row-enter');
      row.classList.add('file-row-exit');
      row.addEventListener('animationend', () => refreshFileList());
    } else {
      await refreshFileList();
    }
  } catch (err) {
    showToast('Failed to delete file', 'error');
  }

  confirmModal.style.display = 'none';
  fileToDelete = null;
}

function closeModal() {
  confirmModal.style.display = 'none';
  fileToDelete = null;
}

// =============================================
// Event Listeners
// =============================================
function setupEventListeners() {
  // Click to upload
  uploadZone.addEventListener('click', () => fileInput.click());

  // Keyboard accessibility
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Drag & Drop
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

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  });

  // Search
  searchInput.addEventListener('input', () => {
    refreshFileList();
  });

  // Modal buttons
  modalCancel.addEventListener('click', closeModal);
  modalConfirm.addEventListener('click', executeDelete);

  // Close modal on overlay click
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeModal();
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal.style.display !== 'none') {
      closeModal();
    }
  });

  // Delegated event listeners for table action buttons
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

function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase() : '?';
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

  // Auto-dismiss after 3.5 seconds
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

// Start the application
document.addEventListener('DOMContentLoaded', initApp);
