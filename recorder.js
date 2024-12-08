document.addEventListener('DOMContentLoaded', () => {
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let intervalId;
    let stream;

    const checkButtonsExist = setInterval(() => {
      const startButton = document.getElementById('start_recording');
      const stopButton = document.getElementById('stop_recording');

      if (startButton && stopButton) {
        clearInterval(checkButtonsExist);

        const sendAudio = () => {
          if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const reader = new FileReader();
            reader.onload = () => {
              Shiny.setInputValue('audio_data', reader.result + `|${Date.now()}`);
            };
            reader.readAsDataURL(audioBlob);
          }
        };

        startButton.addEventListener('click', () => {
          if (isRecording) return;

          audioChunks = [];
          isRecording = true;
          startButton.disabled = true;
          stopButton.disabled = false;

          navigator.mediaDevices.getUserMedia({ audio: true }).then(userStream => {
            stream = userStream;
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.addEventListener('dataavailable', event => {
              if (event.data.size > 0 && isRecording) {
                audioChunks.push(event.data);
              }
            });

            mediaRecorder.start(1000);

            // Clear any existing interval before starting a new one
            if (intervalId) clearInterval(intervalId);

            intervalId = setInterval(() => {
              if (isRecording) {
                sendAudio();
              }
            }, 8000);
          }).catch(err => {
            console.error('Error accessing microphone:', err);
          });
        });

        stopButton.addEventListener('click', () => {
          if (!isRecording) return;

          // Stop the media recorder
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }

          // Stop all stream tracks
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }

          // Clear interval
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }

          // Send final audio chunks
          sendAudio();

          // Reset state
          isRecording = false;
          audioChunks = [];
          stream = null;

          // Toggle button states
          startButton.disabled = false;
          stopButton.disabled = true;
        });
      }
    }, 100);
  });
