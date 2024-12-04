// ClaudeAI - Enhanced Recorder.js for Robust Audio Recording and Conversion
let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;
let audioContext;
let audioContextCreatedAt;

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Improved function to convert WebM to WAV
async function convertWebMToWAV(webmBlob) {
  // Consolidate AudioContext management
  if (!audioContext || (audioContextCreatedAt && Date.now() - audioContextCreatedAt > 5 * 60 * 1000)) {
    if (audioContext) {
      audioContext.close();
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextCreatedAt = Date.now();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Decode the audio data
        const arrayBuffer = e.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create a WAV blob with full audio buffer length
        const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
        resolve(wavBlob);
      } catch (error) {
        console.error("Detailed WebM to WAV conversion error:", {
          message: error.message,
          name: error.name,
          stack: error.stack,
          blobType: webmBlob.type,
          blobSize: webmBlob.size
        });
        
        // Attempt alternative conversion method
        try {
          // Try direct blob to ArrayBuffer conversion
          const arrayBuffer = await webmBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
          resolve(wavBlob);
        } catch (secondaryError) {
          console.error("Secondary conversion attempt failed:", secondaryError);
          reject(error);
        }
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };

    reader.readAsArrayBuffer(webmBlob);
  });
}

// Enhanced helper function to convert AudioBuffer to WAV Blob
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  // Comprehensive WAV header creation
  // RIFF chunk descriptor
  writeUTFBytes(view, pos, 'RIFF');
  pos += 4;
  view.setUint32(pos, length - 8, true);
  pos += 4;
  writeUTFBytes(view, pos, 'WAVE');
  pos += 4;

  // FMT sub-chunk
  writeUTFBytes(view, pos, 'fmt ');
  pos += 4;
  view.setUint32(pos, 16, true); // chunkSize
  pos += 4;
  view.setUint16(pos, 1, true); // wFormatTag (1 = PCM)
  pos += 2;
  view.setUint16(pos, numOfChan, true); // wChannels
  pos += 2;
  view.setUint32(pos, abuffer.sampleRate, true); // dwSamplesPerSec
  pos += 4;
  view.setUint32(pos, abuffer.sampleRate * 2 * numOfChan, true); // dwAvgBytesPerSec
  pos += 4;
  view.setUint16(pos, numOfChan * 2, true); // wBlockAlign
  pos += 2;
  view.setUint16(pos, 16, true); // wBitsPerSample
  pos += 2;

  // data sub-chunk
  writeUTFBytes(view, pos, 'data');
  pos += 4;
  view.setUint32(pos, length - pos - 4, true);
  pos += 4;

  // Interleave and write audio data
  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      // Improved sample conversion with more robust clamping
      sample = channels[i][offset];
      sample = Math.max(-1, Math.min(1, sample));
      sample = (sample < 0) ? sample * 32768 : sample * 32767;
      view.setInt16(pos, sample | 0, true);
      pos += 2;
    }
    offset++;
  }

  // Create Blob with proper MIME type
  return new Blob([buffer], { type: 'audio/wav' });
}

// Helper function to write UTF8 bytes
function writeUTFBytes(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Custom handler to start recording
Shiny.addCustomMessageHandler("startRecording", function (message) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({ 
      audio: { 
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    })
    .then((stream) => {
      mediaStream = stream;
      // Configure MediaRecorder with more robust settings
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm; codecs=opus",
        audioBitsPerSecond: 128000,
      });

      // Initialize SocketIO connection with enhanced error handling
      socket = io.connect("https://evanozmat.com", {
        path: "/socket.io/",
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      // Enhanced socket event handlers
      socket.on("connect", () => {
        console.log("Socket.IO connection established successfully.");
      });

      socket.on("transcription", (data) => {
        console.log("Transcription received:", data.text);
        Shiny.setInputValue("transcription", data.text);
      });

      socket.on("connect_error", (error) => {
        console.error("Socket.IO connection error details:", {
          message: error.message,
          name: error.name
        });
        alert("Connection error. Please check your network and try again.");
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket.IO disconnected:", reason);
      });

      // Enhanced audio data handling
      mediaRecorder.ondataavailable = async (event) => {
        if (socket && socket.connected) {
          if (event.data.size > 0) {
            // Accumulate audio chunks
            audioChunks.push(event.data);

            try {
              // Convert WebM chunk to WAV
              const wavBlob = await convertWebMToWAV(event.data);
              
              // Additional type and size validation
              if (wavBlob && wavBlob.type === 'audio/wav' && wavBlob.size > 0) {
                console.log("Sending WAV audio chunk", {
                  mimeType: wavBlob.type,
                  size: wavBlob.size,
                  timestamp: new Date().toISOString()
                });
                
                socket.emit("audio_chunk", wavBlob);
              } else {
                console.warn("Invalid WAV blob generated");
              }
            } catch (error) {
              console.error("Chunk conversion error:", {
                message: error.message,
                name: error.name,
                stack: error.stack
              });
            }
          } else {
            console.warn("Empty audio chunk received.");
          }
        }
      };

      // Stop recording and finalize the audio
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = []; // Reset chunks
        
        try {
          // Convert final blob to WAV
          const wavBlob = await convertWebMToWAV(audioBlob);
          const audioUrl = URL.createObjectURL(wavBlob);
          const audio = document.getElementById("audioPlayback");
          if (audio) {
            audio.src = audioUrl;
            // Revoke URL after metadata is loaded to prevent memory leak
            audio.onloadedmetadata = () => {
              URL.revokeObjectURL(audioUrl);
            };
          }
          
          const reader = new FileReader();
          reader.readAsDataURL(wavBlob);
          reader.onloadend = () => {
            const base64data = reader.result.split(",")[1];
            Shiny.setInputValue("audioData", base64data);
          };
        } catch (error) {
          console.error("Final audio conversion error:", {
            message: error.message,
            name: error.name,
            stack: error.stack
          });
        }
        
        // Cleanup resources
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => {
            if (track.readyState === "live") {
              track.stop();
            }
          });
        }
        
        if (socket) {
          socket.disconnect();
        }
      };

      // Start recording, sending chunks every 10 seconds
      mediaRecorder.start(10000);
    })
    .catch((error) => {
      console.error("Microphone access error:", {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      alert("Microphone access failed. Check permissions and try again.");
    });
  }
});

// Custom handler to stop recording
Shiny.addCustomMessageHandler("stopRecording", function (message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    if (socket) {
      socket.disconnect();
    }
  }
});
