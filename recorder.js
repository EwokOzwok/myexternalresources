let mediaRecorder;
let audioChunks = [];
let mediaStream;
let websocket;

Shiny.addCustomMessageHandler("startRecording", function(message) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        mediaStream = stream;
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data); // Ensure audio data is pushed to the array
          websocket.send(event.data); // Ensure audio data is sent via WebSocket
          console.log("MediaRecorder data available: ", event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          audioChunks = [];

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
        };

        websocket = new WebSocket('wss://evanozmat.com/socket.io/');
        // websocket = new WebSocket('ws://localhost:8765');
        websocket.onopen = () => {
          console.log("WebSocket connection opened.");
          mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
            console.log("Sending audio data to WebSocket.");
            websocket.send(event.data);
          };
        };

        websocket.onclose = () => {
          console.log("WebSocket connection closed.");
        };

        websocket.onerror = error => {
          console.error('WebSocket error: ', error);
        };

        mediaRecorder.start();
      })
      .catch(error => {
        console.error('Error accessing microphone: ', error);
        alert('Error accessing microphone. Please check your browser settings.');
      });
  }
});

Shiny.addCustomMessageHandler("stopRecording", function(message) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    // Close WebSocket connection
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close();
    }
  }
});
