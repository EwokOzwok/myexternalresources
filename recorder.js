let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let intervalId;

  const startButton = document.getElementById('start_recording');
  // const restartButton = document.getElementById('restart_recording');
  const stopButton = document.getElementById('stop_recording');

  const sendAudio = () => {
    if (audioChunks.length > 0) {
      console.log('Audio chunks length:', audioChunks.length);
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      console.log('Audio Blob created:', audioBlob);

      // Don't clear chunks here, let them accumulate until stop

      const reader = new FileReader();
      reader.onload = () => {
        console.log('Base64 audio data (first 100 chars):', reader.result.slice(0, 100));
        // Shiny.setInputValue('audio_data', reader.result);
        Shiny.setInputValue('audio_data', reader.result + `|${Date.now()}`);

      };
      reader.readAsDataURL(audioBlob);
    } else {
      console.log('No audio chunks to send.');
    }
  };

  startButton.addEventListener('click', () => {
    audioChunks = []; // Reset chunks before recording
    if (isRecording) return; // Prevent multiple starts
    isRecording = true;
    console.log('Starting recording...');

    // Disable the start and enable the stop button
    startButton.disabled = true;
    // restartButton.disabled = true;
    stopButton.disabled = false;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      console.log('Microphone access granted:', stream);

      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      console.log('MediaRecorder initialized:', mediaRecorder);

      // Important change: Collect data every timeslice
      mediaRecorder.start(1000); // Collect data every 1 second
      console.log('MediaRecorder started.');

      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          console.log('Data available event triggered, chunk size:', event.data.size);
          audioChunks.push(event.data);
        } else {
          console.log('Data available event triggered, but chunk is empty.');
        }
      });

      // Clear any existing interval before starting a new one
      if (intervalId) clearInterval(intervalId);

      // Send audio every 8 seconds
      intervalId = setInterval(() => {
        if (isRecording) {
          console.log('Sending audio to R...');
          sendAudio();
        }
      }, 8000);
      console.log('Interval ID set:', intervalId);
    }).catch(err => {
      console.error('Error accessing microphone:', err);
    });
  });

  stopButton.addEventListener('click', () => {
    if (isRecording) {
      console.log('Stopping recording...');
      // Stop the media recorder
      mediaRecorder.stop();
      mediaRecorder = null; // Reset MediaRecorder
      isRecording = false;

      // Clear the interval so no more audio is sent
      if (intervalId) {
        clearInterval(intervalId);
        console.log('Cleared interval ID:', intervalId);
      }

      // Clear all audio chunks so they are not sent anymore
      audioChunks = [];
      console.log('Audio chunks cleared.');

      // Send remaining chunks one last time (if any)
      sendAudio();

      // Disable the stop button and re-enable the start button
      startButton.disabled = false;
      // restartButton.disabled = false;
      stopButton.disabled = true;

      console.log('Recording stopped, all activity halted.');
    } else {
      console.log('MediaRecorder not initialized.');
    }
  });
