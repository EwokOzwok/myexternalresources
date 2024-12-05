let mediaRecorder;
let audioStream;
let socket;

 // Start recording handler
 Shiny.addCustomMessageHandler("startRecording", async function (message) {
   try {
     // Request microphone access
     audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

     // Establish WebSocket connection
     socket = new WebSocket("wss://mywebsite.com/audiostream");

     socket.onopen = () => {
       console.log("WebSocket connection established.");

       // Initialize MediaRecorder
       mediaRecorder = new MediaRecorder(audioStream, {
         mimeType: "audio/webm; codecs=opus",
       });

       // Send audio chunks to the server
       mediaRecorder.ondataavailable = (event) => {
         if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
           socket.send(event.data);
         }
       };

       // Start recording audio in 10s chunks
       mediaRecorder.start(10000);

       socket.onmessage = (event) => {
         console.log("Server message:", event.data); // Optionally handle server messages
       };

       socket.onerror = (error) => {
         console.error("WebSocket error:", error);
       };

       socket.onclose = () => {
         console.log("WebSocket connection closed.");
         stopAudioStream();
       };
     };
   } catch (error) {
     console.error("Error starting recording:", error);
   }
 });

 // Stop recording handler
 Shiny.addCustomMessageHandler("stopRecording", function (message) {
   try {
     if (mediaRecorder && mediaRecorder.state !== "inactive") {
       mediaRecorder.stop();
     }
     if (socket && socket.readyState === WebSocket.OPEN) {
       socket.close();
     }
     stopAudioStream();
     console.log("Recording stopped.");
   } catch (error) {
     console.error("Error stopping recording:", error);
   }
 });

 // Helper function to stop the audio stream
 function stopAudioStream() {
   if (audioStream) {
     audioStream.getTracks().forEach((track) => track.stop());
     audioStream = null;
   }
 }
