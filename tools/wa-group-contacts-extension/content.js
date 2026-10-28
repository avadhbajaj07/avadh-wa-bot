// WhatsApp Group Contact Extractor Content Script (With Names & Phone Numbers)

function showToast(message, type = 'success') {
  const existing = document.querySelector('.wa-extractor-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'wa-extractor-toast';
  const icon = type === 'success' ? '✅' : (type === 'info' ? 'ℹ️' : '⚠️');
  toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

// Helper to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function extractGroupContactsWithNames() {
  const header = document.querySelector('header');
  if (!header) {
    showToast('Please open WhatsApp Web and click on a group first!', 'error');
    return { success: false, error: 'No chat open' };
  }

  // 1. Get Group Title
  let groupTitle = 'WhatsApp_Group';
  const titleEl = header.querySelector('span[title]') || header.querySelector('div[role="button"]');
  if (titleEl) {
    const rawTitle = titleEl.getAttribute('title') || titleEl.innerText || '';
    if (rawTitle.trim()) {
      groupTitle = rawTitle.trim();
    }
  }

  // 2. Ensure Group Info Drawer is Open to see full names & participants
  let participantsSec = document.querySelector('[data-testid="group-info-participants-section"]') ||
                        document.querySelector('[data-testid="group-info-drawer"]');

  if (!participantsSec) {
    // Automatically click header to open drawer
    const headerBtn = header.querySelector('div[role="button"]');
    if (headerBtn) {
      headerBtn.click();
      showToast('Opening group details to load names...', 'info');
      await sleep(1000);
      participantsSec = document.querySelector('[data-testid="group-info-participants-section"]') ||
                        document.querySelector('[data-testid="group-info-drawer"]');
    }
  }

  showToast('Scanning group participants & names...', 'info');

  const contactsMap = new Map(); // phoneClean -> { name, phoneRaw, clean, pushname }

  // Function to inspect a DOM element (row or span) for name & phone
  const inspectElement = (el) => {
    if (!el) return;
    const text = el.innerText || '';
    if (!text) return;

    // Check lines in row
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    let foundPhone = null;
    let foundName = null;
    let foundPushname = null;

    for (const line of lines) {
      if (/Group Admin|You|Community|creator/i.test(line)) continue;

      // Pushname (~Name)
      if (line.startsWith('~')) {
        foundPushname = line.replace('~', '').trim();
        continue;
      }

      // Phone Number match
      const phoneMatch = line.match(/\+?[0-9][0-9\s-]{8,16}[0-9]/);
      if (phoneMatch) {
        const cleanDigits = phoneMatch[0].replace(/[\s-]/g, '');
        if (cleanDigits.length >= 10 && cleanDigits.length <= 15) {
          foundPhone = phoneMatch[0].trim();
          continue;
        }
      }

      // If it contains alphabets and is not a phone number or time, it's a contact name
      if (!foundName && /[a-zA-Z\u0900-\u097F]/.test(line) && line.length < 50) {
        foundName = line;
      }
    }

    // Also inspect span[title] attributes (often has the full saved name)
    const titledSpans = el.querySelectorAll ? el.querySelectorAll('span[title]') : [];
    for (const span of titledSpans) {
      const title = (span.getAttribute('title') || '').trim();
      if (!title || /Group Admin|You/i.test(title)) continue;

      if (title.startsWith('~')) {
        if (!foundPushname) foundPushname = title.replace('~', '').trim();
      } else if (/\+?[0-9][0-9\s-]{8,16}[0-9]/.test(title)) {
        if (!foundPhone) foundPhone = title;
      } else if (!foundName && /[a-zA-Z\u0900-\u097F]/.test(title)) {
        foundName = title;
      }
    }

    if (foundPhone) {
      const clean = foundPhone.replace(/[\s\-\(\)]/g, '');
      const standardPhone = clean.startsWith('+') ? clean : (clean.length === 10 ? `+91${clean}` : `+${clean}`);
      const finalName = foundName || foundPushname || '';

      if (!contactsMap.has(clean) || (finalName && !contactsMap.get(clean).name)) {
        contactsMap.set(clean, {
          name: finalName,
          phoneRaw: foundPhone,
          clean: standardPhone,
          pushname: foundPushname || '',
        });
      }
    }
  };

  // 3. Scan Participant Section rows
  if (participantsSec) {
    // If there is a scrollable container, scroll slightly to load virtualized items
    const scrollContainer = participantsSec.closest('div[tabindex="-1"]') ||
                            participantsSec.querySelector('div[style*="overflow"]') ||
                            participantsSec;

    // Scan initially visible items
    const rows = participantsSec.querySelectorAll('div[role="listitem"], div[class*="x13mwh8y"], div[data-testid*="cell-frame"]');
    rows.forEach(inspectElement);

    // Scroll through to load more participants if list is long
    for (let scrollStep = 0; scrollStep < 5; scrollStep++) {
      if (scrollContainer && scrollContainer.scrollBy) {
        scrollContainer.scrollBy(0, 500);
        await sleep(200);
        const moreRows = participantsSec.querySelectorAll('div[role="listitem"], div[class*="x13mwh8y"], div[data-testid*="cell-frame"]');
        moreRows.forEach(inspectElement);
      }
    }
  }

  // 4. Fallback / Augment: Scan Header Subtitle & Full Page Text
  const headerSubtitle = header.innerText || '';
  const rawHeaderMatches = (headerSubtitle + '\n' + document.body.innerText).match(/\+?[0-9][0-9\s-]{8,16}[0-9]/g) || [];

  for (const raw of rawHeaderMatches) {
    const clean = raw.replace(/[\s\-\(\)]/g, '');
    if (clean.length >= 10 && clean.length <= 15) {
      if (!contactsMap.has(clean)) {
        const standardPhone = clean.startsWith('+') ? clean : (clean.length === 10 ? `+91${clean}` : `+${clean}`);
        contactsMap.set(clean, {
          name: '',
          phoneRaw: raw.trim(),
          clean: standardPhone,
          pushname: '',
        });
      }
    }
  }

  const contacts = Array.from(contactsMap.values());

  if (contacts.length === 0) {
    showToast('No contact numbers found. Please click the group name at top to open the member list and try again.', 'error');
    return { success: false, error: 'No numbers found' };
  }

  // 5. Generate CSV with Name, Phone, and Pushname
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = groupTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'Group';

  let csvContent = '\uFEFF'; // UTF-8 BOM for Excel / Hindi characters support
  csvContent += 'Sr No,Name,Phone Number,Standard WhatsApp Format,Profile Pushname,Group Name,Exported Date\n';

  contacts.forEach((contact, idx) => {
    const escapedName = `"${(contact.name || '').replace(/"/g, '""')}"`;
    const escapedPushname = `"${(contact.pushname || '').replace(/"/g, '""')}"`;
    const escapedGroup = `"${groupTitle.replace(/"/g, '""')}"`;
    csvContent += `${idx + 1},${escapedName},"${contact.phoneRaw}","${contact.clean}",${escapedPushname},${escapedGroup},"${dateStr}"\n`;
  });

  // 6. Instant Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${safeTitle}_Contacts_With_Names_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);

  const namedCount = contacts.filter((c) => c.name).length;
  showToast(`🎉 Exported ${contacts.length} contacts (${namedCount} with names) from "${groupTitle}"!`, 'success');

  return {
    success: true,
    count: contacts.length,
    namedCount,
    groupTitle,
    contacts,
  };
}

// Injects the 1-click button into WhatsApp header
function injectHeaderButton() {
  const header = document.querySelector('header');
  if (!header) return;

  // Don't inject twice
  if (document.querySelector('.wa-extractor-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'wa-extractor-floating-container';

  const btn = document.createElement('button');
  btn.className = 'wa-extractor-btn';
  btn.title = 'Extract all contacts with names from this group to CSV';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
    </svg>
    <span>Export Group CSV</span>
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    extractGroupContactsWithNames();
  });

  btnContainer.appendChild(btn);
  header.appendChild(btnContainer);
}

// Watch for DOM changes (switching between chats)
const observer = new MutationObserver(() => {
  injectHeaderButton();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

setTimeout(injectHeaderButton, 2000);

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    extractGroupContactsWithNames().then(sendResponse);
    return true;
  }
  return true;
});
