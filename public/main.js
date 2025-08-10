// Check authentication on page load
const token = localStorage.getItem('authToken');
if (!token || token === 'demo-token') {
  // Allow demo mode to continue
  if (token !== 'demo-token') {
    window.location.href = '/auth.html';
  }
} else {
  // Verify token with server
  fetch('/api/verify-token', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(response => {
    if (!response.ok) {
      localStorage.removeItem('authToken');
      window.location.href = '/auth.html';
    }
  }).catch(() => {
    localStorage.removeItem('authToken');
    window.location.href = '/auth.html';
  });
}

// Logout function
function logout() {
  localStorage.removeItem('authToken');
  window.location.href = '/auth.html';
}

// Multi-tenant transcription app
let ws = null;
let audioCtx, processor, source, mediaStream;
let isRecording = false;
let isPaused = false;
let stopTimeout = null;

// DOM elements
const statusEl = document.getElementById('status');
const warnEl = document.getElementById('warnings');
const classTitleEl = document.getElementById('classTitle');
const googleStatusEl = document.getElementById('googleStatus');
const googleIndicatorEl = document.getElementById('googleIndicator');
const googleConnectBtn = document.getElementById('googleConnectBtn');
const googleDisconnectBtn = document.getElementById('googleDisconnectBtn');
const transcriptEl = document.getElementById('transcript');
const notesEl = document.getElementById('notes');
const notesContentEl = document.getElementById('notes-content');
const btnRecord = document.getElementById('btnRecord');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');

// Recording state management
function updateButtonStates() {
  if (isRecording && !isPaused) {
    btnRecord.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    classTitleEl.disabled = true; // Disable class name input during recording
  } else if (isRecording && isPaused) {
    btnRecord.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = false;
    classTitleEl.disabled = true; // Keep disabled during pause
  } else {
    btnRecord.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    classTitleEl.disabled = false; // Enable class name input when not recording
  }
}

// Start or resume recording
async function startRecording() {
  try {
    if (isPaused) {
      // Resume recording
      isPaused = false;
      statusEl.textContent = 'Recording resumed...';
      setupAudioProcessing(); // Reconnect audio processing
      updateButtonStates();
      return;
    }

    // Clear previous transcript and notes
    transcriptEl.innerHTML = '';
    notesEl.style.display = 'none';
    notesContentEl.innerHTML = '';
    warnEl.textContent = '';
    statusEl.textContent = 'Requesting microphone access...';

    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true, 
        noiseSuppression: true,
        sampleRate: 16000
      } 
    });

    statusEl.textContent = 'Connecting to transcription service...';

    // Create WebSocket connection
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/audio');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('WebSocket connected');
      statusEl.textContent = 'Connected. Starting transcription...';
      
      // Send initialization message with auth token
      const classTitle = classTitleEl.value.trim() || 'Untitled Class';
      const authToken = localStorage.getItem('authToken') || 'demo-token';
      const initMessage = { 
        type: 'init', 
        token: authToken,
        classTitle: classTitle,
        dateISO: new Date().toISOString().slice(0,10)
      };
      console.log('Sending init message:', initMessage);
      
      // Add a small delay to ensure connection is fully established
      setTimeout(() => {
        console.log('Actually sending init message now...');
        ws.send(JSON.stringify(initMessage));
      }, 100);
    };

    ws.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
      console.log('Received message:', msg);
      
      if (msg?.type === 'transcript') {
        appendTranscript(msg);
        if (!msg.partial) {
          statusEl.textContent = '🎙️ Recording and transcribing...';
        }
      } else if (msg?.type === 'warning') {
        warnEl.textContent = msg.message;
        console.warn('Warning:', msg.message);
      } else if (msg?.type === 'error') {
        warnEl.textContent = 'Error: ' + msg.message;
        statusEl.textContent = 'Transcription failed. Check warnings.';
        console.error('Server error:', msg.message);
      } else if (msg?.type === 'generating_notes') {
        console.log('Received generating_notes message');
        statusEl.textContent = msg.message;
        notesEl.style.display = 'block';
        notesContentEl.innerHTML = '<div class="generating">Generating comprehensive class notes...</div>';
      } else if (msg?.type === 'notes') {
        console.log('Received notes message:', msg.notes);
        if (msg.notes) {
          displayNotes(msg.notes);
        }
      } else if (msg?.type === 'final') {
        console.log('Received final message');
        statusEl.textContent = '✅ Notes generated and saved successfully!';
        // Clear the stop timeout
        if (stopTimeout) {
          clearTimeout(stopTimeout);
          stopTimeout = null;
        }
        // Update UI state without triggering another stop message
        isRecording = false;
        isPaused = false;
        updateButtonStates();
        cleanupAudio();
        cleanupWebSocket();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      statusEl.textContent = 'Connection failed.';
      warnEl.textContent = 'WebSocket connection error. Check server.';
      cleanupWebSocket();
      isRecording = false;
      isPaused = false;
      updateButtonStates();
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      if (isRecording) {
        statusEl.textContent = 'Connection closed.';
      }
      cleanupAudio();
      ws = null;
    };

    // Set up audio processing
    setupAudioProcessing();
    
    isRecording = true;
    isPaused = false;
    updateButtonStates();

  } catch (error) {
    console.error('Failed to start recording:', error);
    statusEl.textContent = 'Microphone permission denied.';
    warnEl.textContent = 'Please allow microphone access and try again.';
  }
}

// Pause recording
function pauseRecording() {
  if (isRecording && !isPaused) {
    isPaused = true;
    statusEl.textContent = 'Recording paused. Click Record to resume.';
    updateButtonStates();
    
    // Pause audio processing but keep connection
    if (processor) {
      processor.disconnect();
    }
  }
}

// Stop recording
function stopRecording() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('Sending stop message to server');
    ws.send(JSON.stringify({ type: 'stop' }));
    statusEl.textContent = '🛑 Recording stopped. Generating notes...';
    
    // Set a timeout in case server doesn't respond
    stopTimeout = setTimeout(() => {
      console.log('Stop timeout - cleaning up');
      forceStopCleanup();
    }, 30000); // 30 second timeout
    
    // Don't cleanup yet - wait for server response
  } else {
    // Manual cleanup if WebSocket is already closed
    forceStopCleanup();
  }
}

// Force cleanup for stop
function forceStopCleanup() {
  if (stopTimeout) {
    clearTimeout(stopTimeout);
    stopTimeout = null;
  }
  isRecording = false;
  isPaused = false;
  statusEl.textContent = 'Click Record to start transcription';
  updateButtonStates();
  cleanupAudio();
  cleanupWebSocket();
}

// Clean up WebSocket connection
function cleanupWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// Display generated class notes
function displayNotes(notes) {
  console.log('displayNotes called with:', notes);
  
  const sections = [
    { key: 'introduction', title: '📋 Introduction', items: notes.introduction || [] },
    { key: 'keyConcepts', title: '🔑 Key Concepts', items: notes.keyConcepts || [] },
    { key: 'explanations', title: '💡 Explanations', items: notes.explanations || [] },
    { key: 'definitions', title: '📖 Definitions', items: notes.definitions || [] },
    { key: 'summary', title: '📝 Summary', items: notes.summary || [] },
    { key: 'examQuestions', title: '❓ Potential Exam Questions', items: notes.examQuestions || [] }
  ];

  console.log('Sections processed:', sections);

  let html = '';
  sections.forEach(section => {
    console.log(`Processing section ${section.key}:`, section.items);
    if (section.items && section.items.length > 0) {
      html += `<h3>${section.title}</h3><ul>`;
      section.items.forEach(item => {
        html += `<li>${item}</li>`;
      });
      html += '</ul>';
    }
  });

  console.log('Generated HTML:', html);

  if (html) {
    notesContentEl.innerHTML = html;
    notesEl.style.display = 'block';
    console.log('Notes displayed successfully');
  } else {
    notesContentEl.innerHTML = '<div class="generating">No notes could be generated from the transcript.</div>';
    console.log('No notes content to display');
  }
}

// Set up audio processing pipeline
function setupAudioProcessing() {
  if (!mediaStream) return;
  
  // Create audio context with 16kHz sample rate
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  source = audioCtx.createMediaStreamSource(mediaStream);
  
  // Use ScriptProcessorNode (will upgrade to AudioWorklet later)
  const processorSize = 4096;
  processor = audioCtx.createScriptProcessor(processorSize, 1, 1);
  
  source.connect(processor);
  processor.connect(audioCtx.destination);
  
  processor.onaudioprocess = (e) => {
    if (!isPaused && ws && ws.readyState === WebSocket.OPEN) {
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(input);
      ws.send(pcm16);
    }
  };
}

// Convert float32 audio to 16-bit PCM
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Uint8Array(buffer);
}

// Append transcript to display
function appendTranscript(msg) {
  // Remove empty state if present
  const emptyEl = transcriptEl.querySelector('.transcript-empty');
  if (emptyEl) {
    emptyEl.remove();
  }

  const speaker = msg.speaker || 'Speaker';
  
  // For partial transcripts, try to update existing partial entry
  if (msg.partial) {
    // Find the last partial text element
    const lastPartial = transcriptEl.querySelector('.text.partial:last-of-type');
    if (lastPartial) {
      // Check if the previous speaker element matches current speaker
      const prevSpeaker = lastPartial.previousElementSibling;
      if (prevSpeaker && prevSpeaker.classList.contains('speaker') && 
          prevSpeaker.textContent === speaker + ':') {
        // Update existing partial transcript
        lastPartial.textContent = msg.text;
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        return;
      }
    }
  } else {
    // For final transcripts, convert any existing partial to final
    const lastPartial = transcriptEl.querySelector('.text.partial:last-of-type');
    if (lastPartial) {
      const prevSpeaker = lastPartial.previousElementSibling;
      if (prevSpeaker && prevSpeaker.classList.contains('speaker') && 
          prevSpeaker.textContent === speaker + ':') {
        // Convert partial to final
        lastPartial.classList.remove('partial');
        lastPartial.classList.add('final');
        lastPartial.textContent = msg.text;
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        return;
      }
    }
  }

  // Add new transcript entry
  const speakerDiv = document.createElement('div');
  speakerDiv.className = 'speaker';
  speakerDiv.textContent = speaker + ':';
  
  const textDiv = document.createElement('div');
  textDiv.className = `text ${msg.partial ? 'partial' : 'final'}`;
  textDiv.textContent = msg.text;
  
  transcriptEl.appendChild(speakerDiv);
  transcriptEl.appendChild(textDiv);
  
  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// Clean up audio resources
function cleanupAudio() {
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (source) {
    source.disconnect();
    source = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

// Event listeners
btnRecord.addEventListener('click', startRecording);
btnPause.addEventListener('click', pauseRecording);
btnStop.addEventListener('click', stopRecording);

// Google Authentication Functions
async function checkGoogleAuthStatus() {
  try {
    const token = localStorage.getItem('authToken');
    const headers = token && token !== 'demo-token' ? 
      { 'Authorization': 'Bearer ' + token } : {};
    
    const response = await fetch('/api/google-status', { headers });
    const data = await response.json();
    updateGoogleAuthUI(data.connected);
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    updateGoogleAuthUI(false);
  }
}

function updateGoogleAuthUI(isConnected) {
  if (isConnected) {
    googleStatusEl.textContent = 'Connected to Google Drive';
    googleIndicatorEl.className = 'status-indicator connected';
    googleConnectBtn.style.display = 'none';
    googleDisconnectBtn.style.display = 'inline-block';
  } else {
    googleStatusEl.textContent = 'Not connected to Google Drive';
    googleIndicatorEl.className = 'status-indicator disconnected';
    googleConnectBtn.style.display = 'inline-block';
    googleDisconnectBtn.style.display = 'none';
  }
}

function connectGoogle() {
  // Get the auth token to pass to Google OAuth
  const authToken = localStorage.getItem('authToken') || 'demo-token';
  
  // Open Google OAuth in new window with token as query parameter
  const authWindow = window.open(`/auth/google?token=${encodeURIComponent(authToken)}`, 'googleAuth', 'width=500,height=600');
  
  // Poll for window closure to refresh status
  const pollTimer = setInterval(() => {
    if (authWindow.closed) {
      clearInterval(pollTimer);
      // Wait a moment for tokens to be saved, then check status
      setTimeout(() => {
        checkGoogleAuthStatus();
      }, 1000);
    }
  }, 1000);
}

async function disconnectGoogle() {
  try {
    const token = localStorage.getItem('authToken');
    const headers = token && token !== 'demo-token' ? 
      { 'Authorization': 'Bearer ' + token } : {};
    
    const response = await fetch('/api/google-disconnect', { 
      method: 'POST',
      headers
    });
    if (response.ok) {
      updateGoogleAuthUI(false);
    } else {
      console.error('Failed to disconnect Google');
    }
  } catch (error) {
    console.error('Error disconnecting Google:', error);
  }
}

// Update user info display
async function updateUserInfo() {
  const token = localStorage.getItem('authToken');
  const userInfoEl = document.getElementById('userInfo');
  
  if (token === 'demo-token') {
    userInfoEl.textContent = 'Demo User';
  } else if (token) {
    try {
      const userResponse = await fetch('/api/user-info', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        userInfoEl.textContent = userData.email;
      } else {
        userInfoEl.textContent = 'User';
      }
    } catch {
      userInfoEl.textContent = 'User';
    }
  } else {
    userInfoEl.textContent = 'Not signed in';
  }
}

// Initialize button states
updateButtonStates();
checkGoogleAuthStatus();
updateUserInfo();

// Handle floating label for class title input
const classTitleInput = document.getElementById('classTitle');
if (classTitleInput) {
  // Check initial value
  if (classTitleInput.value.trim()) {
    classTitleInput.classList.add('has-value');
  }
  
  // Handle input changes
  classTitleInput.addEventListener('input', function() {
    if (this.value.trim()) {
      this.classList.add('has-value');
    } else {
      this.classList.remove('has-value');
    }
  });
  
  // Handle blur event to ensure proper state
  classTitleInput.addEventListener('blur', function() {
    if (this.value.trim()) {
      this.classList.add('has-value');
    } else {
      this.classList.remove('has-value');
    }
  });
}

// Disable service worker for now to avoid cache issues
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/service-worker.js');
//   });
// }