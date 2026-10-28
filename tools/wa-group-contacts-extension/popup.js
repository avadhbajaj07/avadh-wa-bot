document.getElementById('downloadBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.className = 'status-msg';
  statusEl.innerText = 'Extracting all group numbers...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('web.whatsapp.com')) {
    statusEl.className = 'status-msg error';
    statusEl.innerText = '⚠️ Please open WhatsApp Web first!';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'extract' }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.className = 'status-msg error';
      statusEl.innerText = 'Please refresh the WhatsApp Web tab once.';
      return;
    }

    if (response && response.success) {
      statusEl.className = 'status-msg success';
      statusEl.innerText = `🎉 Exported ${response.count} numbers (${response.namedCount} with names)!`;
    } else {
      statusEl.className = 'status-msg error';
      statusEl.innerText = (response && response.error) || 'Please click on a group first!';
    }
  });
});
