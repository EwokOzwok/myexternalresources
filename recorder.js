// Enhanced Recorder.js for Robust Audio Recording and Conversion
let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;
let audioContext;

// Enhanced WebM to WAV Conversion Function
async function convertWebMToWAV(webmBlob) {
  return new Promise((resolve, reject) => {
    // Ensure single AudioContext
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Validate blob
    if (!(webmBlob instanceof Blob)) {
      return reject(new Error('Invalid blob provided'));
    }

    // Create file reader
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Decode the audio data with error handling
        const arrayBuffer = e.target.result;

        // Add timeout to prevent hanging
        const decodePromise = audioContext.decodeAudioData(arrayBuffer);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Decode timeout')), 5000)
        );

        const audioBuffer = await Promise.race([decodePromise, timeoutPromise]);

        // Ensure audioBuffer is valid
        if (!audioBuffer || !(audioBuffer instanceof AudioBuffer)) {
          throw new Error('Invalid audio buffer');
        }

        // Create a WAV blob with full audio buffer length
        const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);

        // Validate output
        if (!(wavBlob instanceof Blob)) {
          throw new Error('WAV conversion failed');
        }

        resolve(wavBlob);
      } catch (error) {
        console.error("Detailed WebM to WAV conversion error:", {
          message: error.message,
          name: error.name,
          details: {
            blobType: webmBlob.type,
            blobSize: webmBlob.size,
            stack: error.stack
          }
        });
        reject(error);
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };

    // Ensure reading as ArrayBuffer
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

// Modify MediaRecorder initialization to ensure compatibility
Shiny.addCustomMessageHandler("startRecording", function (message) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1, // Force mono
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
      .then((stream) => {
        mediaStream = stream;
        // Use more compatible MIME type and encoding
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: navigator.mediaDevices.getUserMedia &&
            MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
            ? 'audio/webm; codecs=opus'
            : 'audio/ogg',
          audioBitsPerSecond: 128000,
        });

        // Rest of the existing code remains the same...
        // (Including socket and MediaRecorder event handlers)
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
    if (socket && socket.connected) {
      socket.disconnect();
    }
  }
});
