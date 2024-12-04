// enhanced debugging...
Shiny.addCustomMessageHandler("startTranscription", function(message) {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];

            mediaRecorder.ondataavailable = async event => {
                audioChunks.push(event.data);
                console.log("Audio chunk captured:", event.data);

                // Send audio chunks every 10 seconds (after collecting 10 chunks)
                if (audioChunks.length === 10) {
                    console.log("10 audio chunks collected. Preparing to send...");

                    // Check if audioChunks is populated correctly
                    console.log("audioChunks length:", audioChunks.length);

                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                    try {
                        console.log("Converting webm to wav...");
                        const wavBlob = await convertWebmToWav(audioBlob);
                        console.log("Converted to wav, sending to Flask app...");

                        const formData = new FormData();
                        formData.append('file', wavBlob, 'audio.wav');

                        fetch('http://localhost:5000/transcribe', {
                            method: 'POST',
                            body: formData
                        })
                            .then(response => {
                                console.log("Flask response:", response);
                                return response.json();
                            })
                            .then(data => {
                                console.log("Transcription received:", data.text);
                                Shiny.setInputValue("transcribedText", data.text, { priority: "event" });
                            })
                            .catch(error => console.error("Error sending audio to Flask app:", error));

                        // Clear the audio chunks after sending
                        audioChunks.length = 0;
                    } catch (error) {
                        console.error("Error converting webm to wav:", error);
                    }
                }
            };

            mediaRecorder.start();

            Shiny.addCustomMessageHandler("stopTranscription", function(message) {
                console.log("Stop button clicked. Stopping recording...");
                mediaRecorder.stop();
                stream.getTracks().forEach(track => track.stop());
            });
        })
        .catch(error => console.error("Error accessing microphone:", error));
});

// Convert the audio from webm to wav format
function convertWebmToWav(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function () {
            const audioContext = new AudioContext();
            audioContext.decodeAudioData(reader.result)
                .then(audioBuffer => {
                    const wavBlob = audioBufferToWav(audioBuffer);
                    resolve(wavBlob);
                })
                .catch(error => reject(error));
        };
        reader.onerror = function (error) {
            reject(error);
        };
        reader.readAsArrayBuffer(blob);
    });
}

// Helper function to create a WAV blob from an AudioBuffer
function audioBufferToWav(buffer) {
    const numOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;

    let blockAlign = numOfChannels * bitsPerSample / 8;
    let byteRate = sampleRate * blockAlign;
    let dataLength = buffer.length * blockAlign;
    let bufferLength = 44 + dataLength;

    const wavBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(wavBuffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    const channelData = [];
    for (let channel = 0; channel < numOfChannels; channel++) {
        channelData.push(buffer.getChannelData(channel));
    }
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
}

// Helper function to write strings to DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
