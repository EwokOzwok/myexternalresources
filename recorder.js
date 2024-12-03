let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;

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
        mediaRecorder.ondataavailable = (event) => {
          if (socket && socket.connected) {
            if (event.data.size > 0) {
              console.log("Sending audio chunk, MIME type:", event.data.type);
              console.log("Sending audio chunk, size:", event.data.size);
              socket.emit("audio_chunk", event.data);
            } else {
              console.warn("Empty audio chunk received.");
            }
          }
        };

        // Stop recording and finalize the audio when recording stops
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          audioChunks = []; // Reset chunks for the next recording

          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = document.getElementById("audioPlayback");
          if (audio) {
            audio.src = audioUrl;
          }

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64data = reader.result.split(",")[1];
            Shiny.setInputValue("audioData", base64data);
          };

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

        // Start recording, sending chunks every 5 seconds
        mediaRecorder.start(10000); // Adjusted to send chunks every 5 seconds
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
