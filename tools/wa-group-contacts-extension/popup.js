// Popup script for WhatsApp Group Contact Extractor - v1.5.0

function getStatusEl() {
  return document.getElementById('status');
}

function setStatus(text, type = 'info') {
  const el = getStatusEl();
  if (!el) return;
  el.className = `status-msg ${type}`;
  el.innerText = text;
}

async function triggerExtraction(action, mode = 'master') {
  setStatus('Processing request, please wait...', 'info');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('web.whatsapp.com')) {
    setStatus('⚠️ Please open WhatsApp Web (web.whatsapp.com) first!', 'error');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action, mode }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus('Please refresh your WhatsApp Web tab (Cmd+R) once.', 'error');
      return;
    }

    if (response && response.success) {
      if (response.groupsCount !== undefined) {
        setStatus(`🎉 Exported ${response.count} contacts from ${response.groupsCount} groups!`, 'success');
      } else {
        setStatus(`🎉 Exported ${response.count} numbers (${response.namedCount} with names)!`, 'success');
      }
    } else {
      setStatus((response && response.error) || 'Failed to extract. Please ensure WhatsApp Web has loaded.', 'error');
    }
  });
}

document.getElementById('downloadAllMasterBtn')?.addEventListener('click', () => {
  triggerExtraction('extract_all', 'master');
});

document.getElementById('downloadAllDetailedBtn')?.addEventListener('click', () => {
  triggerExtraction('extract_all', 'detailed');
});

document.getElementById('downloadActiveBtn')?.addEventListener('click', () => {
  triggerExtraction('extract_active');
});
