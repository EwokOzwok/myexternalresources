 // JavaScript to capture microphone audio and send it to Flask server
  async function startAudioStreaming() {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const socket = new WebSocket("wss://mywebsite.com/audiostream");

    socket.onopen = () => {
      console.log("WebSocket connection established.");
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm; codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data); // Send audio blob to the Flask server
        }
      };

      mediaRecorder.start(500); // Capture audio in chunks of 500ms

      socket.onclose = () => {
        console.log("WebSocket connection closed.");
        mediaRecorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        mediaRecorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      };
    };

    socket.onmessage = (event) => {
      console.log("Server message:", event.data); // Display server feedback (optional)
    };

    socket.onerror = (error) => console.error("Socket error:", error);
  }

  // Trigger function when button is clicked
  document.getElementById("startRecording").addEventListener("click", startAudioStreaming);
