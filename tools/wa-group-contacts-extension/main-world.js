// WhatsApp Group Contact Extractor - v1.4.0 (Real Phone Number & LID Resolution Engine)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    setTimeout(() => toast.remove(), 5000);
  }, 5000);
}

// Extract string representation from any WhatsApp Wid object or primitive
function extractWid(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (val._serialized) return String(val._serialized);
    if (val.user && val.server) return `${val.user}@${val.server}`;
    if (val.user) return String(val.user);
  }
  return String(val);
}

// Extract real phone digits (10 to 13 digits). Reject LIDs (@lid or >=14 digits)
function getPhoneDigits(val) {
  const str = extractWid(val);
  if (!str) return null;
  if (str.includes('@lid') || str.endsWith('@lid')) return null;
  const digits = str.replace(/@.*$/, '').replace(/[^0-9]/g, '');
  if (digits.length >= 10 && digits.length <= 13) {
    return digits;
  }
  return null;
}

// Extract LID digits (@lid or >=14 digits)
function getLidDigits(val) {
  const str = extractWid(val);
  if (!str) return null;
  if (str.includes('@lid') || str.endsWith('@lid')) {
    return str.replace(/@.*$/, '').replace(/[^0-9]/g, '');
  }
  const digits = str.replace(/[^0-9]/g, '');
  if (digits.length >= 14) {
    return digits;
  }
  return null;
}

// Format digits to standard WhatsApp format (+91XXXXXXXXXX for India)
function normalizePhone(digits) {
  if (!digits) return '';
  const d = String(digits).replace(/[^0-9]/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith('91') && d.length === 12) return `+${d}`;
  return d.startsWith('+') ? d : `+${d}`;
}

// Safely extract attributes from raw objects or Backbone models
function getContactAttrs(c) {
  if (!c) return {};
  const a = c.attributes || c._data || c.__x_attributes || c;
  return {
    id: a.id || c.id,
    lid: a.lid || c.lid,
    phoneNumber: a.phoneNumber || c.phoneNumber || a.phone || c.phone || a.number || a.pn,
    name: a.name || c.name,
    displayName: a.displayName || c.displayName,
    formattedTitle: a.formattedTitle || c.formattedTitle,
    pushname: a.pushname || c.pushname || a.notifyName || c.notifyName,
    verifiedName: a.verifiedName || c.verifiedName,
  };
}

// Build global phone directory from WhatsApp Web IndexedDB & Webpack
async function buildPhoneDirectory() {
  const lidToPhone = new Map();
  const nameToPhone = new Map();

  const recordMapping = (c) => {
    if (!c) return;
    const attrs = getContactAttrs(c);

    const phone = getPhoneDigits(attrs.phoneNumber) ||
                  getPhoneDigits(attrs.id);

    const lid = getLidDigits(attrs.lid) ||
                (attrs.id && extractWid(attrs.id).includes('@lid') ? getLidDigits(attrs.id) : null);

    const names = [
      attrs.name,
      attrs.displayName,
      attrs.formattedTitle,
      attrs.verifiedName,
      attrs.pushname,
    ].filter(Boolean);

    if (phone) {
      if (lid) {
        lidToPhone.set(lid, phone);
      }
      for (const n of names) {
        if (typeof n === 'string') {
          const trimmed = n.trim().replace(/^~/, '').toLowerCase();
          if (trimmed && !/^\+?[0-9\s-]{10,}$/.test(trimmed)) {
            nameToPhone.set(trimmed, phone);
          }
        }
      }
    }
  };

  // 1. Query IndexedDB for contacts and LID mappings
  try {
    let dbNames = ['model-storage', 'wawc', 'whatsapp', 'wawc_db'];
    try {
      if (typeof indexedDB.databases === 'function') {
        const found = await indexedDB.databases();
        const names = found.map((d) => d.name).filter(Boolean);
        if (names.length > 0) {
          dbNames = Array.from(new Set([...names, ...dbNames]));
        }
      }
    } catch (_) {}

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1500); // Max 1.5s timeout safety
      let pendingDbs = dbNames.length;

      if (pendingDbs === 0) {
        clearTimeout(timeout);
        return resolve();
      }

      const doneDb = () => {
        pendingDbs--;
        if (pendingDbs <= 0) {
          clearTimeout(timeout);
          resolve();
        }
      };

      for (const dbName of dbNames) {
        try {
          const req = indexedDB.open(dbName);
          req.onerror = () => doneDb();
          req.onblocked = () => doneDb();
          req.onsuccess = () => {
            const db = req.result;
            const storeNames = Array.from(db.objectStoreNames || []);
            const targetStores = storeNames.filter((s) =>
              /contact|chat|lid|participant|user/i.test(s)
            );

            if (targetStores.length === 0) {
              db.close();
              return doneDb();
            }

            let pendingStores = targetStores.length;
            for (const sName of targetStores) {
              try {
                const tx = db.transaction(sName, 'readonly');
                const store = tx.objectStore(sName);
                const getAll = store.getAll();

                getAll.onsuccess = () => {
                  const records = getAll.result || [];
                  for (const r of records) {
                    recordMapping(r);
                  }
                  pendingStores--;
                  if (pendingStores <= 0) {
                    db.close();
                    doneDb();
                  }
                };

                getAll.onerror = () => {
                  pendingStores--;
                  if (pendingStores <= 0) {
                    db.close();
                    doneDb();
                  }
                };
              } catch (_) {
                pendingStores--;
                if (pendingStores <= 0) {
                  db.close();
                  doneDb();
                }
              }
            }
          };
        } catch (_) {
          doneDb();
        }
      }
    });
  } catch (_) {}

  // 2. Query Webpack Chunk Cache if available
  try {
    if (window.webpackChunkwhatsapp_web_client) {
      window.webpackChunkwhatsapp_web_client.push([
        ['extractor_' + Date.now()],
        {},
        (req) => {
          for (const k in req.c) {
            const exp = req.c[k]?.exports;
            if (!exp) continue;

            const targets = [
              exp.Contact,
              exp.default?.Contact,
              exp.ContactCollection,
              exp.default?.ContactCollection,
              exp.Chat,
              exp.default?.Chat,
            ];

            for (const item of targets) {
              if (!item) continue;
              const models = item.models || item._models || (Array.isArray(item) ? item : null);
              if (models && (Array.isArray(models) || typeof models.forEach === 'function')) {
                const arr = Array.isArray(models) ? models : Array.from(models.values ? models.values() : []);
                for (const c of arr) {
                  recordMapping(c);
                }
              }
            }
          }
        },
      ]);
    }
  } catch (_) {}

  console.log(`[WA-Extractor] Directory ready: ${lidToPhone.size} LIDs and ${nameToPhone.size} names resolved.`);
  return { lidToPhone, nameToPhone };
}

// React Fiber helper
function getReactData(el) {
  if (!el) return null;
  const key = Object.keys(el).find((k) =>
    k.startsWith('__reactFiber$') ||
    k.startsWith('__reactInternalInstance$') ||
    k.startsWith('__reactProps$')
  );
  return key ? el[key] : null;
}

function findScrollable(startEl) {
  let curr = startEl;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    try {
      const s = window.getComputedStyle(curr);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
        return curr;
      }
    } catch (_) {}
    curr = curr.parentElement;
  }
  return null;
}

function toPlainArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw.models && Array.isArray(raw.models)) return raw.models;
  if (raw._models && Array.isArray(raw._models)) return raw._models;
  if (typeof raw.forEach === 'function') {
    const arr = [];
    raw.forEach((item) => arr.push(item));
    return arr;
  }
  if (typeof raw.values === 'function') {
    return Array.from(raw.values());
  }
  return [];
}

// Parse participant model and resolve to REAL phone number
function parseParticipant(p, contactObj, directory) {
  if (!p && !contactObj) return null;

  const { lidToPhone, nameToPhone } = directory || { lidToPhone: new Map(), nameToPhone: new Map() };

  const pAttrs = getContactAttrs(p);
  const cAttrs = getContactAttrs(contactObj);

  // 1. Resolve Name
  let name = '';
  const possibleNames = [
    cAttrs.name,
    cAttrs.displayName,
    cAttrs.formattedTitle,
    cAttrs.verifiedName,
    cAttrs.pushname,
    pAttrs.name,
    pAttrs.displayName,
    pAttrs.pushname,
  ];

  for (const cand of possibleNames) {
    if (cand && typeof cand === 'string') {
      const trimmed = cand.trim().replace(/^~/, '');
      if (trimmed && !/^\+?[0-9\s-]{10,}$/.test(trimmed)) {
        name = trimmed;
        break;
      }
    }
  }

  // 2. Resolve Real Phone Number
  let realDigits = null;

  // Check A: Direct phone number on contact object
  realDigits = getPhoneDigits(cAttrs.phoneNumber) ||
               getPhoneDigits(cAttrs.id) ||
               getPhoneDigits(pAttrs.phoneNumber);

  // Check B: p.id if it's a real @c.us phone number
  if (!realDigits) {
    realDigits = getPhoneDigits(pAttrs.id);
  }

  // Check C: If pAttrs.id or cAttrs.id is a LID, resolve via directory
  if (!realDigits) {
    const lid = getLidDigits(pAttrs.id) || getLidDigits(cAttrs.lid) || getLidDigits(pAttrs.lid);
    if (lid && lidToPhone.has(lid)) {
      realDigits = lidToPhone.get(lid);
    }
  }

  // Check D: Resolve via saved Name
  if (!realDigits && name) {
    const lower = name.trim().toLowerCase();
    if (nameToPhone.has(lower)) {
      realDigits = nameToPhone.get(lower);
    }
  }

  // If still no real phone number found, DO NOT output fake LID!
  if (!realDigits) {
    return null;
  }

  const phone = normalizePhone(realDigits);
  return {
    phone,
    clean: phone,
    name: name || '',
  };
}

// Get active group info strictly from #main
function getActiveGroupFromMain(currentTitle) {
  const mainEl = document.querySelector('#main');
  if (!mainEl) return null;

  const headerEl = mainEl.querySelector('header');
  const candidates = [headerEl, mainEl].filter(Boolean);

  for (const el of candidates) {
    let fiber = getReactData(el);
    let depth = 0;

    while (fiber && depth < 50) {
      const props = fiber.memoizedProps;
      if (props) {
        const chat = props.chat || props.activeChat;
        if (chat) {
          const isGroup = chat.isGroup || (chat.id && extractWid(chat.id).endsWith('@g.us'));
          const chatName = chat.name || chat.formattedTitle || '';

          if (isGroup) {
            const gm = chat.groupMetadata || chat.__x_groupMetadata;
            if (gm) {
              const list = toPlainArray(gm.participants || gm.__x_participants);
              if (list.length > 0) {
                return {
                  groupTitle: chatName || currentTitle,
                  groupId: extractWid(chat.id),
                  participants: list,
                };
              }
            }
          }
        }
      }
      fiber = fiber.return;
      depth++;
    }
  }

  return null;
}

// Main Extractor Engine
async function runExtraction() {
  const mainEl = document.querySelector('#main');
  const header = mainEl ? mainEl.querySelector('header') : document.querySelector('header');

  if (!header) {
    showToast('Please open WhatsApp Web and click on a group first!', 'error');
    return { success: false, error: 'No group open' };
  }

  let currentGroupTitle = '';
  const titleSpans = header.querySelectorAll('span[title]');
  for (const s of titleSpans) {
    const t = s.getAttribute('title') || s.innerText || '';
    if (t.trim() && !t.includes('+') && !t.includes('click here') && !t.includes('online')) {
      currentGroupTitle = t.trim();
      break;
    }
  }

  if (!currentGroupTitle) {
    currentGroupTitle = (header.querySelector('div[role="button"]')?.innerText || 'WhatsApp_Group').split('\n')[0].trim();
  }

  showToast(`Resolving real phone numbers for "${currentGroupTitle}"...`, 'info');

  // 1. BUILD PHONE DIRECTORY (LIDs & Saved Names -> Real Phone Numbers)
  const directory = await buildPhoneDirectory();

  const contactsMap = new Map(); // cleanPhone -> { name, phone }

  // 2. EXTRACT FROM ACTIVE GROUP REACT MEMORY
  const activeChatData = getActiveGroupFromMain(currentGroupTitle);
  if (activeChatData && activeChatData.participants && activeChatData.participants.length > 0) {
    for (const p of activeChatData.participants) {
      const parsed = parseParticipant(p, p.contact || p.__x_contact, directory);
      if (parsed) {
        contactsMap.set(parsed.clean, parsed);
      }
    }
    console.log(`[WA-Extractor] Memory extracted ${contactsMap.size} valid phone numbers.`);
  }

  // 3. OPEN DRAWER & DEEP-SCROLL TO CAPTURE & RESOLVE EVERY MEMBER
  let drawer = document.querySelector('[data-testid="group-info-drawer"]') ||
               document.querySelector('[data-testid="group-info-participants-section"]') ||
               document.querySelector('div[role="dialog"]');

  if (!drawer) {
    const headerBtn = header.querySelector('div[role="button"]');
    if (headerBtn) {
      headerBtn.click();
      await sleep(900);
      drawer = document.querySelector('[data-testid="group-info-drawer"]') ||
               document.querySelector('[data-testid="group-info-participants-section"]') ||
               document.querySelector('div[role="dialog"]');
    }
  }

  if (drawer) {
    const allButtons = Array.from(drawer.querySelectorAll('div[role="button"], span, div[tabindex="0"]'));
    const viewAllBtn = allButtons.find((el) =>
      /view all|more participants|\d+\s+more|और|\d+\s+अन्य/i.test(el.innerText || '')
    );

    if (viewAllBtn) {
      try {
        viewAllBtn.click();
        await sleep(900);
        drawer = document.querySelector('div[role="dialog"]') ||
                 document.querySelector('[data-testid="group-info-drawer"]') ||
                 drawer;
      } catch (_) {}
    }

    const scanRows = () => {
      const rows = drawer.querySelectorAll('div[role="listitem"], div[class*="x13mwh8y"], div[data-testid*="cell-frame"]');

      for (const row of rows) {
        const rowFiber = getReactData(row);
        let captured = false;

        if (rowFiber) {
          let curr = rowFiber;
          let d = 0;
          while (curr && d < 20) {
            const props = curr.memoizedProps;
            if (props) {
              const participant = props.participant || props.item?.participant;
              const contact = props.contact || props.item?.contact || props.user;

              if (participant || contact) {
                const parsed = parseParticipant(participant, contact, directory);
                if (parsed) {
                  if (!contactsMap.has(parsed.clean) || (parsed.name && !contactsMap.get(parsed.clean).name)) {
                    contactsMap.set(parsed.clean, parsed);
                  }
                  captured = true;
                  break;
                }
              }
            }
            curr = curr.return;
            d++;
          }
        }

        if (captured) continue;

        // Fallback: Text in DOM row
        const text = row.innerText || '';
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

        let rowPhone = null;
        let rowName = null;

        for (const line of lines) {
          if (/Group Admin|You|Community/i.test(line)) continue;

          // Check for phone number in text (unsaved contacts appear as phone numbers)
          const phoneMatch = line.match(/\+?[0-9][0-9\s-]{8,14}[0-9]/);
          if (phoneMatch) {
            const digits = phoneMatch[0].replace(/[\s-]/g, '');
            if (digits.length >= 10 && digits.length <= 13) {
              rowPhone = normalizePhone(digits);
              continue;
            }
          }

          if (line.startsWith('~')) {
            rowName = line.replace('~', '').trim();
            continue;
          }

          // Saved contact names
          if (!rowName && /[a-zA-Z\u0900-\u097F]/.test(line) && line.length < 50) {
            rowName = line;
          }
        }

        // If saved name found but no phone in row text, resolve via directory
        if (rowName && !rowPhone && directory.nameToPhone.has(rowName.toLowerCase())) {
          rowPhone = normalizePhone(directory.nameToPhone.get(rowName.toLowerCase()));
        }

        if (rowPhone) {
          if (!contactsMap.has(rowPhone) || (rowName && !contactsMap.get(rowPhone).name)) {
            contactsMap.set(rowPhone, {
              phone: rowPhone,
              clean: rowPhone,
              name: rowName || '',
            });
          }
        }
      }
    };

    scanRows();

    const firstRow = drawer.querySelector('div[role="listitem"], div[class*="x13mwh8y"], div[data-testid*="cell-frame"]');
    const scroller = findScrollable(firstRow) ||
                     drawer.querySelector('div[style*="overflow"], div[tabindex="-1"]') ||
                     drawer;

    for (let s = 0; s < 35; s++) {
      if (scroller) {
        scroller.scrollTop += 600;
        scroller.scrollBy?.(0, 600);
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(100);
        scanRows();
      }
    }
  }

  // 4. SCAN HEADER SUBTITLE (unsaved numbers shown directly in group description/subtitle)
  const headerSubtitle = header.innerText || '';
  const headerMatches = headerSubtitle.match(/\+?[0-9][0-9\s-]{8,14}[0-9]/g) || [];

  for (const raw of headerMatches) {
    const cleanDigits = raw.replace(/[\s\-\(\)]/g, '');
    if (cleanDigits.length >= 10 && cleanDigits.length <= 13) {
      const standardPhone = normalizePhone(cleanDigits);
      if (!contactsMap.has(standardPhone)) {
        contactsMap.set(standardPhone, {
          phone: standardPhone,
          clean: standardPhone,
          name: '',
        });
      }
    }
  }

  const contacts = Array.from(contactsMap.values());

  if (contacts.length === 0) {
    showToast(`No numbers found for "${currentGroupTitle}". Please open the group drawer and try again.`, 'error');
    return { success: false, error: 'No numbers found' };
  }

  // BUILD CSV
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = currentGroupTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'Group';

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'Sr No,Name,Phone Number,Standard WhatsApp Format,Group Name,Exported Date\n';

  contacts.forEach((contact, idx) => {
    const escapedName = `"${(contact.name || '').replace(/"/g, '""')}"`;
    const escapedGroup = `"${currentGroupTitle.replace(/"/g, '""')}"`;
    csvContent += `${idx + 1},${escapedName},"${contact.phone}","${contact.clean}",${escapedGroup},"${dateStr}"\n`;
  });

  // DOWNLOAD CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${safeTitle}_${contacts.length}_Real_Numbers_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);

  const namedCount = contacts.filter((c) => c.name).length;
  showToast(`🎉 Exported ${contacts.length} REAL phone numbers (${namedCount} with names) from "${currentGroupTitle}"!`, 'success');

  return {
    success: true,
    count: contacts.length,
    namedCount,
    groupTitle: currentGroupTitle,
  };
}

// Injects the 1-click button into WhatsApp header
function injectHeaderButton() {
  const mainEl = document.querySelector('#main');
  const header = mainEl ? mainEl.querySelector('header') : document.querySelector('header');
  if (!header) return;

  if (document.querySelector('.wa-extractor-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'wa-extractor-floating-container';

  const btn = document.createElement('button');
  btn.className = 'wa-extractor-btn';
  btn.title = 'Extract all real phone numbers from this group to CSV';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
    </svg>
    <span>Export Group CSV</span>
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    runExtraction();
  });

  btnContainer.appendChild(btn);
  header.appendChild(btnContainer);
}

const observer = new MutationObserver(() => {
  injectHeaderButton();
});

observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectHeaderButton, 1500);

// Listen to message from bridge (for popup button)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WA_EXTRACTOR_START') {
    runExtraction().then((res) => {
      window.postMessage({ type: 'WA_EXTRACTOR_RESULT', result: res }, '*');
    });
  }
});
