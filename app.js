// ===== 全局变量与初始化 =====
const stepsContainer = document.getElementById('stepsContainer');
const emptyState = document.getElementById('emptyState');
const addStepBtn = document.getElementById('addStep');
const previewBtn = document.getElementById('previewBtn');
const exportHtmlBtn = document.getElementById('exportHtml');
const exportWordBtn = document.getElementById('exportWord');
const exportMarkdownBtn = document.getElementById('exportMarkdown');
const printBtn = document.getElementById('printBtn');
const expandAllBtn = document.getElementById('expandAll');
const previewModal = document.getElementById('previewModal');
const closePreviewBtn = document.getElementById('closePreview');
const manualPreview = document.getElementById('manualPreview');
const stepCountEl = document.getElementById('stepCount');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');

let stepIdCounter = 0;
let draggedCard = null;
let history = [];
let historyIndex = -1;

// ===== 工具函数 =====

// Toast 提示
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 加载动画
function showLoading(text = '处理中...') {
  loadingOverlay.querySelector('.loading-text').textContent = text;
  loadingOverlay.classList.add('show');
}

function hideLoading() {
  loadingOverlay.classList.remove('show');
}

// HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 防抖
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 图片压缩
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== 数据操作 =====

// 自动保存
const autoSave = debounce(() => {
  try {
    const data = {
      meta: getManualMeta(),
      steps: collectStepsData()
    };
    localStorage.setItem('manualDraft', JSON.stringify(data));
    console.log('✅ 自动保存成功');
  } catch (e) {
    console.error('自动保存失败:', e);
  }
}, 1000);

// 加载草稿
function loadDraft() {
  try {
    const draft = localStorage.getItem('manualDraft');
    if (draft) {
      const data = JSON.parse(draft);
      if (confirm('检测到未保存的草稿，是否恢复？')) {
        loadManualData(data);
        showToast('✅ 草稿已恢复', 'success');
        return true;
      }
    }
  } catch (e) {
    console.error('加载草稿失败:', e);
  }
  return false;
}

// 加载手册数据
function loadManualData(data) {
  if (data.meta) {
    document.getElementById('manualTitle').value = data.meta.title || '';
    document.getElementById('manualDesc').value = data.meta.desc || '';
    document.getElementById('manualAuthor').value = data.meta.author || '';
    document.getElementById('manualVersion').value = data.meta.version || '';
    document.getElementById('manualDate').value = data.meta.date || '';
  }
  
  stepsContainer.innerHTML = '';
  stepIdCounter = 0;
  
  if (data.steps && data.steps.length > 0) {
    data.steps.forEach(stepData => addStep(stepData));
  } else {
    updateEmptyState();
  }
}

// 收集步骤数据
function collectStepsData() {
  return Array.from(stepsContainer.querySelectorAll('.step-card')).map(card => {
    const img = card.querySelector('.image-upload img');
    return {
      title: card.querySelector('.step-title').value.trim(),
      desc: card.querySelector('.step-desc').value.trim(),
      tips: card.querySelector('.step-tips').value.trim(),
      image: img ? img.src : null
    };
  });
}

// 获取手册元信息
function getManualMeta() {
  return {
    title: document.getElementById('manualTitle').value.trim() || '操作流程手册',
    desc: document.getElementById('manualDesc').value.trim(),
    author: document.getElementById('manualAuthor').value.trim(),
    version: document.getElementById('manualVersion').value.trim(),
    date: document.getElementById('manualDate').value.trim()
  };
}

// 验证数据
function validateManual() {
  const meta = getManualMeta();
  const steps = collectStepsData();
  
  if (!meta.title) {
    showToast('⚠️ 请填写手册标题', 'error');
    return false;
  }
  
  if (steps.length === 0) {
    showToast('⚠️ 请至少添加一个步骤', 'error');
    return false;
  }
  
  return true;
}

// ===== 步骤卡片操作 =====

// 创建步骤卡片
function createStepCard(id, data = {}) {
  const stepNum = stepsContainer.querySelectorAll('.step-card').length + 1;
  const card = document.createElement('div');
  card.className = 'step-card';
  card.dataset.stepId = id;
  card.draggable = true;

  card.innerHTML = `
    <div class="step-card-header">
      <span class="drag-handle" title="拖拽排序">⋮⋮</span>
      <span class="step-number">步骤 ${stepNum}</span>
      <span class="collapse-toggle" title="展开/收起">▼</span>
      <div class="step-actions">
        <button type="button" class="btn btn-sm btn-ghost duplicate-step" title="复制步骤">📋</button>
        <button type="button" class="btn btn-sm btn-danger remove-step" title="删除">删除</button>
      </div>
    </div>
    <div class="step-card-body">
      <div class="form-row">
        <label>步骤标题</label>
        <input type="text" class="step-title" placeholder="例如:打开系统登录页面" value="${escapeHtml(data.title || '')}">
      </div>
      <div class="form-row">
        <label>操作说明</label>
        <textarea class="step-desc" placeholder="详细描述该步骤需要做什么..." rows="3">${escapeHtml(data.desc || '')}</textarea>
      </div>
      <div class="form-row">
        <label>注意事项 / 提示 <span class="tips-label">(可选,会以黄色提示框展示)</span></label>
        <input type="text" class="step-tips" placeholder="例如:请确保网络连接正常" value="${escapeHtml(data.tips || '')}">
      </div>
      <div class="form-row">
        <label>配图(可选)</label>
        <div class="image-upload ${data.image ? 'has-image' : ''}" data-step-id="${id}">
          <input type="file" accept="image/*" class="img-input">
          ${data.image
            ? `<img src="${data.image}" alt="步骤配图"><span class="remove-img">移除图片</span>`
            : '<span class="upload-text">点击上传 或 拖拽图片到此处<br><small style="color: var(--gray-400);">图片会自动压缩</small></span>'
          }
        </div>
      </div>
    </div>
  `;

  setupStepCardEvents(card);
  setupDragDrop(card);
  
  return card;
}

// 设置步骤卡片事件
function setupStepCardEvents(card) {
  // 删除
  card.querySelector('.remove-step').addEventListener('click', () => {
    if (confirm('确认删除这个步骤吗？')) {
      card.remove();
      updateStepNumbers();
      updateStepCount();
      updateEmptyState();
      autoSave();
      showToast('✅ 步骤已删除', 'success');
    }
  });

  // 复制
  card.querySelector('.duplicate-step').addEventListener('click', () => {
    const stepData = getStepDataFromCard(card);
    const newCard = createStepCard(++stepIdCounter, stepData);
    card.after(newCard);
    updateStepNumbers();
    updateStepCount();
    autoSave();
    showToast('✅ 步骤已复制', 'success');
  });

  // 展开/收起
  const toggle = card.querySelector('.collapse-toggle');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('collapsed');
    toggle.textContent = card.classList.contains('collapsed') ? '▶' : '▼';
  });

  // 图片上传
  setupImageUpload(card);
  
  // 输入变化时自动保存
  card.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', autoSave);
  });
}

function getStepDataFromCard(card) {
  const img = card.querySelector('.image-upload img');
  return {
    title: card.querySelector('.step-title').value,
    desc: card.querySelector('.step-desc').value,
    tips: card.querySelector('.step-tips').value,
    image: img ? img.src : null
  };
}

// 图片上传处理
function setupImageUpload(card) {
  const uploadArea = card.querySelector('.image-upload');
  const imgInput = card.querySelector('.img-input');

  uploadArea.addEventListener('click', (e) => {
    if (!e.target.classList.contains('remove-img')) {
      imgInput.click();
    }
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '';
  });

  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await handleImageUpload(file, uploadArea);
    }
  });

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files[0];
    if (file) {
      await handleImageUpload(file, uploadArea);
    }
  });

  const removeBtn = uploadArea.querySelector('.remove-img');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(uploadArea);
    });
  }
}

async function handleImageUpload(file, uploadArea) {
  // 检查文件大小
  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ 图片大小不能超过 5MB', 'error');
    return;
  }
  
  showLoading('压缩图片中...');
  
  try {
    const base64 = await compressImage(file);
    uploadArea.classList.add('has-image');
    uploadArea.innerHTML = `
      <input type="file" accept="image/*" class="img-input">
      <img src="${base64}" alt="步骤配图">
      <span class="remove-img">移除图片</span>
    `;
    
    // 重新绑定事件
    const newInput = uploadArea.querySelector('.img-input');
    newInput.addEventListener('change', async () => {
      const f = newInput.files[0];
      if (f) await handleImageUpload(f, uploadArea);
    });
    
    uploadArea.querySelector('.remove-img').addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(uploadArea);
    });
    
    autoSave();
    showToast('✅ 图片上传成功', 'success');
  } catch (e) {
    showToast('❌ 图片上传失败', 'error');
    console.error(e);
  } finally {
    hideLoading();
  }
}

function removeImage(uploadArea) {
  uploadArea.classList.remove('has-image');
  uploadArea.innerHTML = `
    <input type="file" accept="image/*" class="img-input">
    <span class="upload-text">点击上传 或 拖拽图片到此处<br><small style="color: var(--gray-400);">图片会自动压缩</small></span>
  `;
  
  const newInput = uploadArea.querySelector('.img-input');
  newInput.addEventListener('change', async () => {
    const f = newInput.files[0];
    if (f) await handleImageUpload(f, uploadArea);
  });
  
  autoSave();
  showToast('✅ 图片已移除', 'success');
}

// 拖拽排序
function setupDragDrop(card) {
  card.addEventListener('dragstart', (e) => {
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    stepsContainer.querySelectorAll('.step-card').forEach(c => c.classList.remove('drag-over'));
    draggedCard = null;
    updateStepNumbers();
    autoSave();
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedCard || draggedCard === card) return;
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    if (draggedCard && draggedCard !== card) {
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        stepsContainer.insertBefore(draggedCard, card);
      } else {
        stepsContainer.insertBefore(draggedCard, card.nextSibling);
      }
      updateStepNumbers();
    }
  });
}

// 更新步骤编号
function updateStepNumbers() {
  stepsContainer.querySelectorAll('.step-card').forEach((card, i) => {
    card.querySelector('.step-number').textContent = `步骤 ${i + 1}`;
  });
}

// 更新步骤计数
function updateStepCount() {
  const count = stepsContainer.querySelectorAll('.step-card').length;
  stepCountEl.textContent = `(${count})`;
}

// 更新空状态
function updateEmptyState() {
  const hasSteps = stepsContainer.querySelectorAll('.step-card').length > 0;
  emptyState.style.display = hasSteps ? 'none' : 'block';
}

// 添加步骤
function addStep(data = {}) {
  const id = ++stepIdCounter;
  const card = createStepCard(id, data);
  stepsContainer.appendChild(card);
  updateStepCount();
  updateEmptyState();
  autoSave();
}

// ===== 手册生成 =====

// 生成手册内容 HTML
function buildManualContentHtml(meta, steps) {
  const metaHtml = (meta.author || meta.version || meta.date)
    ? `<div class="manual-meta">
        ${meta.author ? `<span>👤 作者: ${meta.author}</span>` : ''}
        ${meta.version ? `<span>📌 版本: ${meta.version}</span>` : ''}
        ${meta.date ? `<span>📅 日期: ${meta.date}</span>` : ''}
      </div>`
    : '';

  const stepsHtml = steps.map((step, i) => {
    const imgHtml = step.image
      ? `<div class="step-img"><img src="${step.image}" alt="步骤${i + 1}配图"></div>`
      : '';
    const tipsHtml = step.tips
      ? `<div class="step-tips">💡 ${step.tips}</div>`
      : '';
    return `
      <div class="step-item">
        <div class="step-head">
          <span class="step-num">${i + 1}</span>
          <span class="step-title">${step.title || `步骤 ${i + 1}`}</span>
        </div>
        ${step.desc ? `<div class="step-desc">${step.desc.replace(/\n/g, '<br>')}</div>` : ''}
        ${tipsHtml}
        ${imgHtml}
      </div>
    `;
  }).join('');

  return `
    <h1 class="manual-title">${meta.title}</h1>
    ${metaHtml}
    ${meta.desc ? `<p class="manual-desc">${meta.desc.replace(/\n/g, '<br>')}</p>` : ''}
    ${stepsHtml}
  `;
}

// 生成完整 HTML
function generateManualHtml() {
  const meta = getManualMeta();
  const steps = collectStepsData();
  const content = buildManualContentHtml(meta, steps);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title}</title>
  <style>
    body { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #374151; line-height: 1.6; }
    .manual-title { font-size: 1.75rem; font-weight: 700; color: #111827; margin-bottom: 0.5rem; }
    .manual-meta { display: flex; gap: 2rem; flex-wrap: wrap; font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem; }
    .manual-desc { color: #6b7280; margin-bottom: 2rem; }
    .step-item { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb; }
    .step-item:last-child { border-bottom: none; }
    .step-head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; }
    .step-num { flex-shrink: 0; width: 32px; height: 32px; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
    .step-title { font-weight: 600; font-size: 1.125rem; color: #1f2937; }
    .step-desc { margin-left: 40px; margin-bottom: 0.75rem; color: #4b5563; line-height: 1.7; }
    .step-tips { margin-left: 40px; padding: 0.75rem 1rem; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0; font-size: 0.875rem; color: #92400e; margin-top: 0.5rem; }
    .step-img { margin-left: 40px; margin-top: 0.75rem; }
    .step-img img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <div class="manual-output">${content}</div>
</body>
</html>`;
}

// 生成 Word HTML
function generateWordHtml() {
  const meta = getManualMeta();
  const steps = collectStepsData();
  const content = buildManualContentHtml(meta, steps);

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <title>${meta.title}</title>
  <style>
    body { font-family: "Microsoft YaHei", "SimSun", sans-serif; font-size: 11pt; line-height: 1.6; margin: 2cm; }
    .manual-title { font-size: 18pt; font-weight: bold; color: #1f2937; margin-bottom: 12pt; }
    .manual-meta { font-size: 10pt; color: #6b7280; margin-bottom: 12pt; }
    .manual-desc { color: #4b5563; margin-bottom: 20pt; }
    .step-item { margin-bottom: 20pt; padding-bottom: 15pt; border-bottom: 1pt solid #e5e7eb; page-break-inside: avoid; }
    .step-head { margin-bottom: 8pt; }
    .step-num { display: inline-block; width: 28pt; height: 28pt; background: #4f46e5; color: white; border-radius: 50%; text-align: center; line-height: 28pt; font-weight: bold; margin-right: 8pt; vertical-align: middle; }
    .step-title { font-weight: 600; font-size: 12pt; color: #1f2937; }
    .step-desc { margin: 8pt 0 0 36pt; color: #4b5563; }
    .step-tips { margin: 8pt 0 0 36pt; padding: 8pt 12pt; background: #fef3c7; border-left: 3pt solid #f59e0b; font-size: 10pt; color: #92400e; }
    .step-img { margin: 10pt 0 0 36pt; }
    .step-img img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="manual-output">${content}</div>
</body>
</html>`;
}

// 生成 Markdown
function generateMarkdown() {
  const meta = getManualMeta();
  const steps = collectStepsData();
  
  let md = `# ${meta.title}\n\n`;
  
  if (meta.author || meta.version || meta.date) {
    md += `---\n`;
    if (meta.author) md += `**作者:** ${meta.author}  \n`;
    if (meta.version) md += `**版本:** ${meta.version}  \n`;
    if (meta.date) md += `**日期:** ${meta.date}  \n`;
    md += `---\n\n`;
  }
  
  if (meta.desc) md += `${meta.desc}\n\n`;
  
  steps.forEach((step, i) => {
    md += `## ${i + 1}. ${step.title || `步骤 ${i + 1}`}\n\n`;
    if (step.desc) md += `${step.desc}\n\n`;
    if (step.tips) md += `> 💡 **提示:** ${step.tips}\n\n`;
    if (step.image) md += `![步骤${i + 1}](${step.image})\n\n`;
  });
  
  return md;
}

// ===== 导出功能 =====

// 预览
function showPreview() {
  if (!validateManual()) return;
  
  const meta = getManualMeta();
  const steps = collectStepsData();
  manualPreview.innerHTML = `<div class="manual-output">${buildManualContentHtml(meta, steps)}</div>`;
  previewModal.classList.add('show');
}

function closePreview() {
  previewModal.classList.remove('show');
}

// 导出 HTML
function exportHtml() {
  if (!validateManual()) return;
  
  showLoading('生成 HTML 中...');
  
  setTimeout(() => {
    const html = generateManualHtml();
    const blob = new Blob(['\ufeff' + html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (getManualMeta().title || '操作手册') + '.html';
    a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    showToast('✅ HTML 文件导出成功！', 'success');
  }, 300);
}

// 导出 Word
function exportWord() {
  if (!validateManual()) return;
  
  showLoading('生成 Word 中...');
  
  setTimeout(() => {
    const html = generateWordHtml();
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (getManualMeta().title || '操作手册') + '.doc';
    a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    showToast('✅ Word 文件导出成功！', 'success');
  }, 300);
}

// 导出 Markdown
function exportMarkdown() {
  if (!validateManual()) return;
  
  showLoading('生成 Markdown 中...');
  
  setTimeout(() => {
    const md = generateMarkdown();
    const blob = new Blob(['\ufeff' + md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (getManualMeta().title || '操作手册') + '.md';
    a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    showToast('✅ Markdown 文件导出成功！', 'success');
  }, 300);
}

// 打印
function printManual() {
  if (!validateManual()) return;
  
  showPreview();
  setTimeout(() => {
    const meta = getManualMeta();
    const steps = collectStepsData();
    const content = buildManualContentHtml(meta, steps);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${meta.title}</title>
        <style>
          body { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #374151; line-height: 1.6; }
          .manual-title { font-size: 1.75rem; font-weight: 700; color: #111827; margin-bottom: 0.5rem; }
          .manual-meta { display: flex; gap: 2rem; flex-wrap: wrap; font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem; }
          .manual-desc { color: #6b7280; margin-bottom: 2rem; }
          .step-item { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid; }
          .step-item:last-child { border-bottom: none; }
          .step-head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; }
          .step-num { flex-shrink: 0; width: 32px; height: 32px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
          .step-title { font-weight: 600; font-size: 1.125rem; color: #1f2937; }
          .step-desc { margin-left: 40px; margin-bottom: 0.75rem; color: #4b5563; }
          .step-tips { margin-left: 40px; padding: 0.75rem 1rem; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0; font-size: 0.875rem; color: #92400e; margin-top: 0.5rem; }
          .step-img { margin-left: 40px; margin-top: 0.75rem; }
          .step-img img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; }
        </style>
      </head>
      <body><div class="manual-output">${content}</div></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }, 100);
}

// 导出 JSON
function exportJson() {
  const data = {
    meta: getManualMeta(),
    steps: collectStepsData()
  };
  
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (getManualMeta().title || '操作手册') + '_配置.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ JSON 配置导出成功！', 'success');
}

// 导入 JSON
function importJson() {
  document.getElementById('jsonFileInput').click();
}

document.getElementById('jsonFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      loadManualData(data);
      showToast('✅ 配置导入成功！', 'success');
    } catch (err) {
      showToast('❌ JSON 格式错误', 'error');
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // 清空，允许重复导入同一文件
});

// ===== 其他功能 =====

// 展开/收起全部
expandAllBtn.addEventListener('click', () => {
  const cards = stepsContainer.querySelectorAll('.step-card');
  const allCollapsed = Array.from(cards).every(c => c.classList.contains('collapsed'));
  
  cards.forEach(card => {
    const toggle = card.querySelector('.collapse-toggle');
    if (allCollapsed) {
      card.classList.remove('collapsed');
      toggle.textContent = '▼';
    } else {
      card.classList.add('collapsed');
      toggle.textContent = '▶';
    }
  });
  
  expandAllBtn.textContent = allCollapsed ? '收起全部' : '展开全部';
});

// 加载示例手册
function loadSample() {
  if (stepsContainer.querySelectorAll('.step-card').length > 0) {
    if (!confirm('加载示例会覆盖当前内容，确认继续吗？')) return;
  }
  
  document.getElementById('manualTitle').value = '办公室打印机使用说明';
  document.getElementById('manualDesc').value = '适用于新员工快速上手使用公共打印机,完成打印、复印及扫描操作。';
  document.getElementById('manualAuthor').value = '行政部';
  document.getElementById('manualVersion').value = 'v1.0';
  document.getElementById('manualDate').value = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  stepsContainer.innerHTML = '';
  stepIdCounter = 0;
  
  const sampleSteps = [
    {
      title: '确认打印机已开机并连接',
      desc: '查看打印机面板指示灯,确保为就绪状态。若使用网络打印机,请确认本机与打印机在同一网络。',
      tips: '若指示灯闪烁或报错,请联系 IT 支持。'
    },
    {
      title: '在电脑中选择打印',
      desc: '打开要打印的文档,按 Ctrl+P(或菜单:文件 → 打印),在打印机列表中选择对应的打印机名称,设置份数、黑白/彩色等选项后点击「打印」。',
      tips: '双面打印可在打印对话框中勾选「双面打印」以节省纸张。'
    },
    {
      title: '到打印机处取件',
      desc: '打印任务会发送到打印机队列。走到打印机前,在出纸口取走打印好的纸张;若设置了多份,请按份整理好。',
      tips: '长时间未取件可能导致后续任务混在一起,请及时取走。'
    }
  ];
  
  sampleSteps.forEach(data => addStep(data));
  updateEmptyState();
  showToast('✅ 示例已加载', 'success');
}

// ===== 快捷键 =====
document.addEventListener('keydown', (e) => {
  // Ctrl+S 保存
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    autoSave();
    showToast('✅ 已保存', 'info');
  }
  
  // Ctrl+P 预览
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    showPreview();
  }
  
  // ESC 关闭预览
  if (e.key === 'Escape' && previewModal.classList.contains('show')) {
    closePreview();
  }
});

// ===== 事件绑定 =====
addStepBtn.addEventListener('click', () => addStep());
document.getElementById('loadSample').addEventListener('click', loadSample);
previewBtn.addEventListener('click', showPreview);
closePreviewBtn.addEventListener('click', closePreview);
exportHtmlBtn.addEventListener('click', exportHtml);
exportWordBtn.addEventListener('click', exportWord);
exportMarkdownBtn.addEventListener('click', exportMarkdown);
printBtn.addEventListener('click', printManual);
document.getElementById('exportJson').addEventListener('click', exportJson);
document.getElementById('importJson').addEventListener('click', importJson);

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreview();
});

// 监听输入变化
document.querySelectorAll('#manualTitle, #manualDesc, #manualAuthor, #manualVersion, #manualDate').forEach(input => {
  input.addEventListener('input', autoSave);
});

// ===== 初始化 =====
document.getElementById('manualDate').value = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// 页面加载时尝试恢复草稿
window.addEventListener('load', () => {
  if (!loadDraft()) {
    addStep();
  }
  updateEmptyState();
});

// 页面卸载前提示
window.addEventListener('beforeunload', (e) => {
  const steps = collectStepsData();
  if (steps.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

console.log('✅ 操作手册生成器已加载');