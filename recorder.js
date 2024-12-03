let mediaRecorder;
let mediaStream;
let socket;

// Function to convert WebM to WAV format
function convertToWav(audioBuffer) {
  const wavHeader = createWavHeader(audioBuffer.length);
  return new Blob([wavHeader, audioBuffer], { type: "audio/wav" });
}

function createWavHeader(length) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, "RIFF");
  /* file length */
  view.setUint32(4, 36 + length, true);
  /* RIFF type */
  writeString(view, 8, "WAVE");
  /* format chunk identifier */
  writeString(view, 12, "fmt ");
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true); // Mono
  /* sample rate */
  view.setUint32(24, 16000, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, 16000 * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, "data");
  /* data chunk length */
  view.setUint32(40, length, true);

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Custom handler to start recording
Shiny.addCustomMessageHandler("startRecording", function () {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({ audio: true }) // Prompt for microphone access
      .then((stream) => {
        mediaStream = stream;
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
          audioBitsPerSecond: 128000,
        });

        // Initialize SocketIO connection
        socket = io.connect("https://evanozmat.com", {
          path: "/socket.io/",
          transports: ["websocket"],
        });

        socket.on("connect", () => console.log("Socket.IO connection established."));
        socket.on("transcription", (data) => Shiny.setInputValue("transcription", data.text));
        socket.on("connect_error", (error) => alert("Unable to connect to the server. Please try again later."));
        socket.on("disconnect", () => console.log("Socket.IO connection disconnected."));

        mediaRecorder.ondataavailable = (event) => {
          if (socket && socket.connected && event.data.size > 0) {
            const reader = new FileReader();
            reader.readAsArrayBuffer(event.data);
            reader.onloadend = () => {
              const wavBlob = convertToWav(new Uint8Array(reader.result));
              socket.emit("audio_chunk", wavBlob);
            };
          }
        };

        mediaRecorder.onstop = () => {
          // Stop tracks to release the stream
          if (mediaStream) {
            mediaStream.getTracks().forEach((track) => track.stop());
          }
          if (socket) {
            socket.disconnect();
          }
        };

        mediaRecorder.start(5000); // Sending chunks every 5 seconds
      })
      .catch((error) => {
        console.error("Error accessing microphone: ", error);
        alert("Error accessing microphone. Please check your browser settings.");
      });
  }
});

// Custom handler to stop recording
Shiny.addCustomMessageHandler("stopRecording", function () {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    if (socket && socket.connected) {
      socket.disconnect();
    }
  }
});
