// NEW socketio path
let mediaRecorder;
let audioChunks = [];
let socket;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize WebSocket
  socket = new WebSocket("https://evanozmat.com/socket.io");

  // WebSocket event listeners
  socket.onopen = () => console.log("WebSocket connected.");
  socket.onclose = () => console.log("WebSocket disconnected.");
  socket.onerror = (error) => console.error("WebSocket error:", error);
});

// Start recording handler
Shiny.addCustomMessageHandler("startRecording", function (message) {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        audioChunks = []; // Reset chunks for the next recording
        sendAudioToFlask(audioBlob);
      };

      mediaRecorder.start();
      console.log("Recording started.");
    })
    .catch((error) => console.error("Error accessing microphone:", error));
});

// Stop recording handler
Shiny.addCustomMessageHandler("stopRecording", function (message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    console.log("Recording stopped.");
  }
});

// Send audio file to Flask app
function sendAudioToFlask(audioBlob) {
  const reader = new FileReader();
  reader.onload = () => {
    const audioBuffer = reader.result;

    // Send the .wav file to the Flask app via WebSocket
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(audioBuffer);
      console.log("Audio sent to Flask app.");
    } else {
      console.error("WebSocket not connected.");
    }
  };

  // Convert Blob to ArrayBuffer for WebSocket transmission
  reader.readAsArrayBuffer(audioBlob);
}
