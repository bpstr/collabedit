import * as Y from 'https://esm.sh/yjs@13.6.27';
import { IndexeddbPersistence } from 'https://esm.sh/y-indexeddb@9.0.12?deps=yjs@13.6.27';
import { joinRoom, getRelaySockets } from 'https://esm.sh/trystero@0.25.4';

const editor = document.querySelector('#editor');
const documentTitle = document.querySelector('#documentTitle');
const displayName = document.querySelector('#displayName');
const roomIdElement = document.querySelector('#roomId');
const participantsElement = document.querySelector('#participants');
const participantCount = document.querySelector('#participantCount');
const shareButton = document.querySelector('#shareButton');
const newRoomButton = document.querySelector('#newRoomButton');
const connectionStatus = document.querySelector('#connectionStatus');
const connectionLabel = document.querySelector('#connectionLabel');
const characterCount = document.querySelector('#characterCount');
const saveStatus = document.querySelector('#saveStatus');
const toast = document.querySelector('#toast');

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#0ea5e9', '#84cc16'];
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_ID_LENGTH = 6;
const BASE_PATH = '/collabedit';
const APP_ID = 'bpstr-collabedit-v1';
const REMOTE_ORIGIN = 'trystero-remote';
const RELAY_TIMEOUT_MS = 10000;
const STATUS_POLL_MS = 1000;

const roomId = getOrCreateRoomId();
roomIdElement.textContent = roomId;
document.title = `CollabEdit · ${roomId}`;

const ydoc = new Y.Doc();
const ytext = ydoc.getText('content');
const ytitle = ydoc.getText('title');
const persistence = new IndexeddbPersistence(`collabedit:${roomId}`, ydoc);

const remotePeers = new Map();
let applyingRemoteText = false;
let applyingRemoteTitle = false;
let toastTimer;
let relayTimer;
let relayTimedOut = false;
let lastJoinError = '';

const localIdentity = createIdentity();
displayName.value = localIdentity.name;

const room = joinRoom(
  {
    appId: APP_ID,
    relayConfig: {
      redundancy: 5,
    },
  },
  `collabedit:${roomId}`,
  {
    onJoinError: ({ error }) => {
      lastJoinError = error?.message || String(error || 'Peer connection failed');
      renderConnectionStatus();
    },
  },
);

const updateAction = room.makeAction('y-update');
const presenceAction = room.makeAction('presence');
const cursorAction = room.makeAction('cursor');

updateAction.onMessage = (data) => {
  const update = toUint8Array(data);
  if (update.byteLength === 0) return;
  Y.applyUpdate(ydoc, update, REMOTE_ORIGIN);
};

presenceAction.onMessage = (identity, { peerId }) => {
  const existing = remotePeers.get(peerId) || {};
  remotePeers.set(peerId, {
    ...existing,
    name: typeof identity?.name === 'string' ? identity.name : 'Anonymous',
    color: typeof identity?.color === 'string' ? identity.color : '#64748b',
  });
  renderParticipants();
};

cursorAction.onMessage = (cursor, { peerId }) => {
  const existing = remotePeers.get(peerId) || { name: 'Anonymous', color: '#64748b' };
  remotePeers.set(peerId, { ...existing, cursor });
};

room.onPeerJoin = (peerId) => {
  remotePeers.set(peerId, remotePeers.get(peerId) || { name: 'Connecting peer…', color: '#64748b' });
  relayTimedOut = false;
  lastJoinError = '';
  window.clearTimeout(relayTimer);

  updateAction.send(Y.encodeStateAsUpdate(ydoc), { target: peerId }).catch(() => {});
  presenceAction.send(localIdentity, { target: peerId }).catch(() => {});
  broadcastSelection(peerId);

  renderParticipants();
  renderConnectionStatus();
};

room.onPeerLeave = (peerId) => {
  remotePeers.delete(peerId);
  renderParticipants();
  renderConnectionStatus();
};

persistence.once('synced', () => {
  if (ytitle.length === 0) ytitle.insert(0, 'Untitled document');
  editor.value = ytext.toString();
  renderTitle();
  updateCharacterCount();
  saveStatus.textContent = 'Saved locally';
  editor.focus();
});

editor.addEventListener('input', () => {
  if (applyingRemoteText) return;

  applyMinimalTextChange(ytext.toString(), editor.value);
  updateCharacterCount();
  saveStatus.textContent = 'Saving…';
  broadcastSelection();
});

editor.addEventListener('select', () => broadcastSelection());
editor.addEventListener('keyup', () => broadcastSelection());
editor.addEventListener('click', () => broadcastSelection());

function broadcastSelection(target = null) {
  const cursor = {
    start: editor.selectionStart,
    end: editor.selectionEnd,
  };
  const options = target ? { target } : undefined;
  cursorAction.send(cursor, options).catch(() => {});
}

function applyMinimalTextChange(previousValue, nextValue) {
  if (previousValue === nextValue) return;

  let prefixLength = 0;
  const sharedLength = Math.min(previousValue.length, nextValue.length);
  while (
    prefixLength < sharedLength
    && previousValue.charCodeAt(prefixLength) === nextValue.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let previousSuffix = previousValue.length;
  let nextSuffix = nextValue.length;
  while (
    previousSuffix > prefixLength
    && nextSuffix > prefixLength
    && previousValue.charCodeAt(previousSuffix - 1) === nextValue.charCodeAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  const deleteLength = previousSuffix - prefixLength;
  const insertedText = nextValue.slice(prefixLength, nextSuffix);

  ydoc.transact(() => {
    if (deleteLength > 0) ytext.delete(prefixLength, deleteLength);
    if (insertedText) ytext.insert(prefixLength, insertedText);
  }, 'textarea');
}

ytext.observe((event) => {
  if (event.transaction.origin === 'textarea') return;
  applyRemoteDelta(event.delta);
});

function applyRemoteDelta(delta) {
  let index = 0;
  let selectionStart = editor.selectionStart;
  let selectionEnd = editor.selectionEnd;

  applyingRemoteText = true;

  for (const change of delta) {
    if (change.retain) {
      index += change.retain;
      continue;
    }

    if (change.delete) {
      editor.setRangeText('', index, index + change.delete, 'preserve');
      selectionStart = transformPosition(selectionStart, index, change.delete, 0);
      selectionEnd = transformPosition(selectionEnd, index, change.delete, 0);
      continue;
    }

    if (change.insert) {
      const insertedText = typeof change.insert === 'string' ? change.insert : '';
      editor.setRangeText(insertedText, index, index, 'preserve');
      selectionStart = transformPosition(selectionStart, index, 0, insertedText.length);
      selectionEnd = transformPosition(selectionEnd, index, 0, insertedText.length);
      index += insertedText.length;
    }
  }

  editor.setSelectionRange(
    Math.min(selectionStart, editor.value.length),
    Math.min(selectionEnd, editor.value.length),
  );
  applyingRemoteText = false;
  updateCharacterCount();
}

function transformPosition(position, changeIndex, deletedLength, insertedLength) {
  if (position <= changeIndex) return position;
  if (position <= changeIndex + deletedLength) return changeIndex + insertedLength;
  return position - deletedLength + insertedLength;
}

documentTitle.addEventListener('input', () => {
  if (applyingRemoteTitle) return;
  applyMinimalTitleChange(ytitle.toString(), documentTitle.value);
});

function applyMinimalTitleChange(previousValue, nextValue) {
  if (previousValue === nextValue) return;

  let prefixLength = 0;
  const sharedLength = Math.min(previousValue.length, nextValue.length);
  while (prefixLength < sharedLength && previousValue[prefixLength] === nextValue[prefixLength]) {
    prefixLength += 1;
  }

  let previousSuffix = previousValue.length;
  let nextSuffix = nextValue.length;
  while (
    previousSuffix > prefixLength
    && nextSuffix > prefixLength
    && previousValue[previousSuffix - 1] === nextValue[nextSuffix - 1]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  ydoc.transact(() => {
    if (previousSuffix > prefixLength) ytitle.delete(prefixLength, previousSuffix - prefixLength);
    const insertedText = nextValue.slice(prefixLength, nextSuffix);
    if (insertedText) ytitle.insert(prefixLength, insertedText);
  }, 'title-input');
}

ytitle.observe((event) => {
  if (event.transaction.origin === 'title-input') return;
  renderTitle();
});

ydoc.on('update', (update, origin) => {
  window.clearTimeout(window.__saveTimer);
  window.__saveTimer = window.setTimeout(() => {
    saveStatus.textContent = 'Saved locally';
  }, 350);

  if (origin !== REMOTE_ORIGIN && peerCount() > 0) {
    updateAction.send(update).catch(() => {});
  }
});

displayName.addEventListener('input', () => {
  const name = displayName.value.trim() || 'Anonymous';
  localStorage.setItem('collabedit:name', name);
  localIdentity.name = name;
  presenceAction.send(localIdentity).catch(() => {});
  renderParticipants();
});

window.addEventListener('online', () => {
  scheduleRelayTimeout();
  renderConnectionStatus();
});

window.addEventListener('offline', () => {
  window.clearTimeout(relayTimer);
  renderConnectionStatus();
});

window.addEventListener('pagehide', () => {
  window.clearTimeout(relayTimer);
  window.clearInterval(statusPoll);
  room.leave();
}, { once: true });

scheduleRelayTimeout();
renderConnectionStatus();
renderParticipants();

const statusPoll = window.setInterval(() => {
  renderConnectionStatus();
}, STATUS_POLL_MS);

shareButton.addEventListener('click', async () => {
  const url = roomUrl(roomId);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Invite link copied');
  } catch {
    window.prompt('Copy this invite link:', url);
  }
});

newRoomButton.addEventListener('click', () => {
  window.location.assign(roomUrl(createRoomId()));
});

function renderTitle() {
  applyingRemoteTitle = true;
  documentTitle.value = ytitle.toString() || 'Untitled document';
  applyingRemoteTitle = false;
}

function renderParticipants() {
  const peers = [
    { id: 'local', ...localIdentity, local: true },
    ...Array.from(remotePeers.entries()).map(([id, peer]) => ({ id, ...peer, local: false })),
  ];

  participantsElement.replaceChildren(...peers.map((peer) => {
    const item = document.createElement('li');
    item.className = 'participant';

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.background = peer.color || '#64748b';
    avatar.textContent = initials(peer.name || 'Anonymous');

    const name = document.createElement('span');
    name.className = 'participant-name';
    name.textContent = peer.name || 'Anonymous';

    item.append(avatar, name);
    if (peer.local) {
      const you = document.createElement('span');
      you.className = 'you';
      you.textContent = '(you)';
      item.append(you);
    }
    return item;
  }));

  participantCount.textContent = String(1 + peerCount());
}

function renderConnectionStatus() {
  if (!navigator.onLine) {
    connectionStatus.dataset.state = 'offline';
    connectionLabel.textContent = 'Offline · local editing';
    return;
  }

  const peers = peerCount();
  if (peers > 0) {
    relayTimedOut = false;
    lastJoinError = '';
    window.clearTimeout(relayTimer);
    connectionStatus.dataset.state = 'connected';
    connectionLabel.textContent = `Connected · ${peers + 1} online`;
    return;
  }

  if (lastJoinError) {
    connectionStatus.dataset.state = 'error';
    connectionLabel.textContent = 'P2P connection failed';
    return;
  }

  const relayCount = connectedRelayCount();
  if (relayCount > 0) {
    relayTimedOut = false;
    window.clearTimeout(relayTimer);
    connectionStatus.dataset.state = 'ready';
    connectionLabel.textContent = 'Waiting for peer';
    return;
  }

  if (relayTimedOut) {
    connectionStatus.dataset.state = 'error';
    connectionLabel.textContent = 'Discovery unavailable';
    return;
  }

  connectionStatus.dataset.state = 'connecting';
  connectionLabel.textContent = 'Finding peers…';
}

function peerCount() {
  return Object.keys(room.getPeers()).length;
}

function connectedRelayCount() {
  try {
    return Object.values(getRelaySockets()).filter((socket) => socket?.readyState === WebSocket.OPEN).length;
  } catch {
    return 0;
  }
}

function scheduleRelayTimeout() {
  window.clearTimeout(relayTimer);
  relayTimedOut = false;
  if (!navigator.onLine || connectedRelayCount() > 0 || peerCount() > 0) return;

  relayTimer = window.setTimeout(() => {
    if (navigator.onLine && connectedRelayCount() === 0 && peerCount() === 0) {
      relayTimedOut = true;
      renderConnectionStatus();
    }
  }, RELAY_TIMEOUT_MS);
}

function updateCharacterCount() {
  const count = editor.value.length;
  characterCount.textContent = `${count.toLocaleString()} character${count === 1 ? '' : 's'}`;
}

function createIdentity() {
  const storedName = localStorage.getItem('collabedit:name');
  const randomName = `Guest ${Math.floor(100 + Math.random() * 900)}`;
  return {
    name: storedName || randomName,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array();
}

function getOrCreateRoomId() {
  const queryRoomId = sanitizeRoomId(new URLSearchParams(window.location.search).get('room') || '');
  const pathRoomId = roomIdFromPath();
  const legacyHashRoomId = sanitizeRoomId(decodeURIComponent(window.location.hash.slice(1)));
  const id = queryRoomId || pathRoomId || legacyHashRoomId || createRoomId();
  const canonicalUrl = roomUrl(id);

  if (window.location.href !== canonicalUrl) {
    history.replaceState(null, '', canonicalUrl);
  }

  return id;
}

function roomIdFromPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const baseIndex = path.toLowerCase().lastIndexOf(BASE_PATH);
  if (baseIndex === -1) return '';

  const suffix = path.slice(baseIndex + BASE_PATH.length).replace(/^\/+/, '');
  return sanitizeRoomId(decodeURIComponent(suffix.split('/')[0] || ''));
}

function sanitizeRoomId(value) {
  const normalized = value.trim().toUpperCase();
  const valid = Array.from(normalized)
    .filter((character) => ROOM_ALPHABET.includes(character))
    .slice(0, ROOM_ID_LENGTH)
    .join('');

  return valid.length === ROOM_ID_LENGTH ? valid : '';
}

function createRoomId() {
  const bytes = new Uint8Array(ROOM_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

function roomUrl(id) {
  return `${window.location.origin}${BASE_PATH}/${encodeURIComponent(id)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1800);
}
