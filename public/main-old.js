let token = null;
let ws = null;
let audioCtx, processor, source, mediaStream;
const liveEl = document.getElementById('live');
const statusEl = document.getElementById('status');
const warnEl = document.getElementById('warnings');
const sessionsEl = document.getElementById('sessions');
const authStatusEl = document.getElementById('authStatus');

async function register() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const r = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
  if (r.ok) authStatusEl.textContent = 'Registered. Now login.';
  else authStatusEl.textContent = 'Registration failed';
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (r.ok) {
    token = j.token;
    localStorage.setItem('token', token);
    authStatusEl.textContent = 'Logged in.';
    loadSessions();
  } else {
    authStatusEl.textContent = 'Login failed: ' + (j.error || 'Unknown error');
  }
}

async function connectGoogle() {
  if (!token) return alert('Login first');
  // This will redirect; in production maintain state; demo: open in new tab
  window.location.href = '/auth/google';
}

async function loadSessions() {
  if (!token) return;
  const r = await fetch('/api/sessions', { headers: { 'Authorization': 'Bearer ' + token } });
  const list = await r.json();
  window.__SESSIONS = list;
  renderSessions(list);
}

function renderSessions(list) {
  const term = document.getElementById('search').value?.toLowerCase() || '';
  const f = list.filter(s => s.classTitle.toLowerCase().includes(term) || s.dateISO.includes(term));
  sessionsEl.innerHTML = f.map(s => `
    <div class="session-item">
      <div>
        <div><strong>${s.classTitle}</strong> • ${s.dateISO}</div>
        <div class="muted">${s.docUrl ? `<a href="${s.docUrl}" target="_blank">Open Google Doc</a>` : 'No Doc (connect Google)'}</div>
      </div>
      <div class="muted">${new Date(s.createdAt).toLocaleString()}</div>
    </div>
  `).join('');
}

document.getElementById('search').addEventListener('input', () => renderSessions(window.__SESSIONS || []));
document.getElementById('btnRegister').addEventListener('click', register);
document.getElementById('btnLogin').addEventListener('click', login);
document.getElementById('btnGoogle').addEventListener('click', connectGoogle);

async function startRecording() {
  if (!token) return alert('Login first');
  const classTitle = document.getElementById('classTitle').value || 'Untitled Class';
  const dateISO = new Date().toISOString().slice(0,10);
  liveEl.textContent = '';
  warnEl.textContent = '';

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    statusEl.textContent = 'Microphone permission denied.';
    return;
  }

  statusEl.textContent = 'Recording... Make sure to use an external mic if possible.';

  // Create WebSocket
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/audio');
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'init', token, classTitle, dateISO }));
  };
  ws.onmessage = (ev) => {
    const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
    if (msg?.type === 'transcript') {
      appendLive(msg);
    } else if (msg?.type === 'warning') {
      warnEl.textContent = msg.message;
    } else if (msg?.type === 'error') {
      warnEl.textContent = msg.message;
    } else if (msg?.type === 'final') {
      statusEl.textContent = 'Saved. ' + (msg.docUrl ? 'Document created.' : 'Document not created.');
      loadSessions();
    }
  };
  ws.onclose = () => {
    statusEl.textContent = 'Stopped.';
    cleanupAudio();
  };

  // Audio context pipeline -> 16k mono PCM
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  source = audioCtx.createMediaStreamSource(mediaStream);
  const processorSize = 4096;
  processor = audioCtx.createScriptProcessor(processorSize, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm16 = floatTo16BitPCM(input);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(pcm16);
  };
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i=0; i<float32Array.length; i++, offset+=2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

function appendLive(msg) {
  const label = msg.speaker ? msg.speaker : 'Speaker';
  liveEl.textContent += `\n${label}: ${msg.text}`;
  liveEl.scrollTop = liveEl.scrollHeight;
}

function cleanupAudio() {
  if (processor) { processor.disconnect(); processor = null; }
  if (source) { source.disconnect(); source = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

async function stopRecording() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type:'stop' }));
  }
}

document.getElementById('btnStart').addEventListener('click', startRecording);
document.getElementById('btnStop').addEventListener('click', stopRecording);

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
