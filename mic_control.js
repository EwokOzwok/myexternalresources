let mediaRecorder;
let audioStream;
let socket;

Shiny.addCustomMessageHandler("startRecording", function (message) {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    startRecording();
  }
});

Shiny.addCustomMessageHandler("stopRecording", function (message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
});

function startRecording() {
  // Access the user's microphone
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      audioStream = stream;

      // Create a WebSocket connection to Flask
      socket = new WebSocket("ws://127.0.0.1:5006/socket.io/?EIO=4&transport=websocket");

      socket.onopen = () => {
        console.log("WebSocket connection established");
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        stopStream();
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        stopStream();
      };

      // Initialize MediaRecorder with the audio stream
      mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm",
      });

      // Handle chunks of audio data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data); // Stream audio chunk to Flask app
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
      };

      mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped");
        stopStream();
      };

      // Start recording
      mediaRecorder.start(250); // Collect audio in 250ms chunks
      console.log("Recording started");
    })
    .catch((error) => {
      console.error("Error accessing microphone:", error);
    });
}

function stopStream() {
  // Stop the audio stream and WebSocket connection
  if (audioStream) {
    const tracks = audioStream.getTracks();
    tracks.forEach((track) => track.stop());
    audioStream = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  console.log("Audio stream stopped");
}
