// Enhanced Recorder.js for Robust Audio Recording and Conversion
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
        const arrayBuffer = e.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
        resolve(wavBlob);
      } catch (error) {
        console.error("Error converting WebM to WAV:", error);
        reject(error);
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
  let sample, offset = 0, pos = 0;

  writeUTFBytes(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeUTFBytes(view, pos, 'WAVE'); pos += 4;
  writeUTFBytes(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;
  view.setUint16(pos, numOfChan, true); pos += 2;
  view.setUint32(pos, abuffer.sampleRate, true); pos += 4;
  view.setUint32(pos, abuffer.sampleRate * 2 * numOfChan, true); pos += 4;
  view.setUint16(pos, numOfChan * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;
  writeUTFBytes(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = channels[i][offset];
      sample = Math.max(-1, Math.min(1, sample));
      sample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(pos, sample | 0, true);
      pos += 2;
    }
    offset++;
  }

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
  audioChunks = []; // Reset audioChunks
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
      .then((stream) => {
        mediaStream = stream;
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm; codecs=opus",
          audioBitsPerSecond: 128000,
        });

        socket = io.connect("https://evanozmat.com", {
          path: "/socket.io/",
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socket.on("connect", () => console.log("Socket.IO connected."));
        socket.on("transcription", (data) => Shiny.setInputValue("transcription", data.text));
        socket.on("connect_error", (error) => alert("Connection error."));
        socket.on("disconnect", (reason) => console.log("Socket.IO disconnected:", reason));

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            try {
              const wavBlob = await convertWebMToWAV(event.data);
              if (wavBlob) socket.emit("audio_chunk", wavBlob);
            } catch (error) {
              console.error("Error processing audio chunk:", error);
            }
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          audioChunks = [];
          try {
            const wavBlob = await convertWebMToWAV(audioBlob);
            const audioUrl = URL.createObjectURL(wavBlob);
            const audio = document.getElementById("audioPlayback");
            if (audio) {
              audio.src = audioUrl;
              audio.onloadedmetadata = () => URL.revokeObjectURL(audioUrl);
            }
          } catch (error) {
            console.error("Error finalizing audio:", error);
          }
          mediaStream.getTracks().forEach((track) => track.stop());
          socket.disconnect();
        };

        mediaRecorder.start(5000);
      })
      .catch((error) => alert("Microphone access failed."));
  }
});

// Custom handler to stop recording
Shiny.addCustomMessageHandler("stopRecording", function (message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
});
