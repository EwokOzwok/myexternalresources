Shiny.addCustomMessageHandler("startTranscription", function(message) {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];
            let audioBlob;

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
                console.log("Audio chunk captured:", event.data);
            
                // Send audio chunks every 10 seconds
                if (audioChunks.length === 10) {
                    console.log("Sending 10-second audio chunk");
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'audio.wav');
            
                    fetch('http://localhost:5000/transcribe', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        console.log("Transcription received:", data.text);
                        Shiny.setInputValue("transcribedText", data.text, { priority: "event" });
                    })
                    .catch(error => console.error("Error sending audio to Flask app:", error));
            
                    // Clear the audio chunks
                    audioChunks.length = 0;
                }
            };


            mediaRecorder.start();

            Shiny.addCustomMessageHandler("stopTranscription", function(message) {
                mediaRecorder.stop();
                stream.getTracks().forEach(track => track.stop());
            });
        })
        .catch(error => console.error("Error accessing microphone:", error));
});
