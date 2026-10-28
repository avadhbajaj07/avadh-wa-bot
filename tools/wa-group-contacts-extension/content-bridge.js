// Bridge script running in ISOLATED world to relay messages between popup and main-world.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    const handleResult = (event) => {
      if (event.data && event.data.type === 'WA_EXTRACTOR_RESULT') {
        window.removeEventListener('message', handleResult);
        sendResponse(event.data.result);
      }
    };

    window.addEventListener('message', handleResult);
    window.postMessage({ type: 'WA_EXTRACTOR_START' }, '*');
    return true; // Keep channel open for async response
  }
  return true;
});
