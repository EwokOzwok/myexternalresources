let mediaRecorder;
let audioChunks = [];
let mediaStream;
let socket;

// Custom handler to start recording
Shiny.addCustomMessageHandler("startRecording", function(message) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        mediaStream = stream;
        mediaRecorder = new MediaRecorder(stream);

        // Initialize SocketIO connection
        socket = io.connect("https://evanozmat.com", {
          path: "/socket.io/",
          transports: ["websocket"]
        });

        socket.on("connect", () => {
          console.log("Socket.IO connection established.");
        });

        socket.on("transcription", (data) => {
          // Handle real-time transcription updates
          console.log("Transcription received: ", data.text);
          Shiny.setInputValue("transcriptionText", data.text);
        });

        socket.on("disconnect", () => {
          console.log("Socket.IO connection disconnected.");
        });

        socket.on("error", (error) => {
          console.error("Socket.IO error: ", error);
        });

        // Send audio data to the server
        mediaRecorder.ondataavailable = event => {
          if (socket && socket.connected) {
            console.log("Sending audio chunk...");
            socket.emit("audio_chunk", event.data);
          }
        };

        // Handle stopping of the recorder
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          audioChunks = []; // Reset chunks for the next recording

          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = document.getElementById('audioPlayback');
          audio.src = audioUrl;

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            Shiny.setInputValue('audioData', base64data);
          };

          // Stop all tracks to release the microphone
          if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
          }

          // Close the SocketIO connection
          if (socket) {
            socket.disconnect();
          }
        };

        mediaRecorder.start();
      })
      .catch(error => {
        console.error("Error accessing microphone: ", error);
        alert("Error accessing microphone. Please check your browser settings.");
      });
  }
});

// Custom handler to stop recording
Shiny.addCustomMessageHandler("stopRecording", function(message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();

    // Disconnect the SocketIO connection
    if (socket && socket.connected) {
      socket.disconnect();
    }
  }
});
