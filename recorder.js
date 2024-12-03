// NEW RECORDER.JS
let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;

// Function to convert WebM to WAV
async function convertWebMToWAV(webmBlob) {
  return new Promise((resolve, reject) => {
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create file reader
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Decode the audio data
        const arrayBuffer = e.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create a WAV blob
        const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
        resolve(wavBlob);
      } catch (error) {
        console.error("Error converting WebM to WAV:", error);
        reject(error);
      }
    };
    reader.readAsArrayBuffer(webmBlob);
  });
}

// Helper function to convert AudioBuffer to WAV Blob
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
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

  // write interleaved data
  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  // create Blob
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
    navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 } })
      .then((stream) => {
        mediaStream = stream;
        // Configure MediaRecorder to capture audio only (audio/webm)
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
          audioBitsPerSecond: 128000,
        });
        // Initialize SocketIO connection
        socket = io.connect("https://evanozmat.com", {
          path: "/socket.io/",
          transports: ["websocket"],
        });
        socket.on("connect", () => {
          console.log("Socket.IO connection established.");
        });
        socket.on("transcription", (data) => {
          console.log("Transcription received: ", data.text);
          Shiny.setInputValue("transcription", data.text);
        });
        socket.on("connect_error", (error) => {
          console.error("Socket.IO connection error: ", error);
          alert("Unable to connect to the server. Please try again later.");
        });
        socket.on("disconnect", () => {
          console.log("Socket.IO connection disconnected.");
        });
        // Handle audio data availability (only audio chunks)
        mediaRecorder.ondataavailable = async (event) => {
          if (socket && socket.connected) {
            if (event.data.size > 0) {
              try {
                // Convert WebM chunk to WAV
                const wavBlob = await convertWebMToWAV(event.data);
                
                console.log("Sending WAV audio chunk, MIME type:", wavBlob.type);
                console.log("Sending WAV audio chunk, size:", wavBlob.size);
                
                socket.emit("audio_chunk", wavBlob);
              } catch (error) {
                console.error("Error converting audio chunk:", error);
              }
            } else {
              console.warn("Empty audio chunk received.");
            }
          }
        };
        // Stop recording and finalize the audio when recording stops
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          audioChunks = []; // Reset chunks for the next recording
          
          try {
            // Convert final blob to WAV
            const wavBlob = await convertWebMToWAV(audioBlob);
            const audioUrl = URL.createObjectURL(wavBlob);
            const audio = document.getElementById("audioPlayback");
            if (audio) {
              audio.src = audioUrl;
            }
            
            const reader = new FileReader();
            reader.readAsDataURL(wavBlob);
            reader.onloadend = () => {
              const base64data = reader.result.split(",")[1];
              Shiny.setInputValue("audioData", base64data);
            };
          } catch (error) {
            console.error("Error converting final audio blob:", error);
          }
          
          // Stop tracks to release the stream
          if (mediaStream) {
            mediaStream.getTracks().forEach((track) => {
              if (track.readyState === "live") {
                track.stop();
              }
            });
          }
          // Disconnect from the socket
          if (socket) {
            socket.disconnect();
          }
        };
        // Start recording, sending chunks every 10 seconds
        mediaRecorder.start(10000);
      })
      .catch((error) => {
        console.error("Error accessing microphone: ", error);
        alert("Error accessing microphone. Please check your browser settings.");
      });
  }
});

// Custom handler to stop recording
Shiny.addCustomMessageHandler("stopRecording", function (message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    if (socket && socket.connected) {
      socket.disconnect();
    }
  }
});
