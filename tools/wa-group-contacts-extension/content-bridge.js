// Bridge script running in ISOLATED world to relay messages between popup and main-world.js - v1.5.0

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleResult = (event) => {
    if (event.data && event.data.type === 'WA_EXTRACTOR_RESULT') {
      window.removeEventListener('message', handleResult);
      sendResponse(event.data.result);
    }
  };

  window.addEventListener('message', handleResult);

  if (request.action === 'extract_all') {
    window.postMessage({ type: 'WA_EXTRACTOR_START_ALL', mode: request.mode || 'master' }, '*');
  } else if (request.action === 'extract_active') {
    window.postMessage({ type: 'WA_EXTRACTOR_START_ACTIVE' }, '*');
  } else {
    // Backward compatibility
    window.postMessage({ type: 'WA_EXTRACTOR_START_ACTIVE' }, '*');
  }

  return true; // Keep message channel open for async response
});
