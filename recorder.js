let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;

// Custom handler to start recording
Shiny.addCustomMessageHandler("startRecording", function (message) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        mediaStream = stream;
        // Enhanced audio quality with higher bitrate
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
          audioBitsPerSecond: 256000, // Increase bitrate for better audio quality
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

        mediaRecorder.ondataavailable = (event) => {
          if (socket && socket.connected) {
            if (event.data.size > 0) {
              console.log("Sending audio chunk, size:", event.data.size);
              socket.emit("audio_chunk", event.data);
            } else {
              console.warn("Empty audio chunk received.");
            }
          }
        };

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

        mediaRecorder.start(5000); // Send chunks every 5 seconds to balance load
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
