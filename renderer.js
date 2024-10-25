const { promises: fsPromises } = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const tesseract = require('node-tesseract-ocr');
const fs = require('fs');

ffmpeg.setFfmpegPath('C:/ffmpeg/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe');

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const video = document.querySelector('video');

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingSessionActive = false;
let checkAllowed = true;
const detectionTimeout = 7000; 
const bufferDurationMs = 5000; // Maintain a 5-second buffer
let videoExported = false;

const tempFileListPath = path.join(__dirname, 'temp_frame_list.txt');

const createTempFileList = async () => {
  await fsPromises.writeFile(tempFileListPath, '', { flag: 'w' });
  console.log('Temporary file list created at:', tempFileListPath);
};

createTempFileList();

startButton.addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: 30,
      },
    });

    video.srcObject = mediaStream;
    video.onloadedmetadata = () => video.play();
    console.log('Media stream successfully captured:', mediaStream);

    startNewRecordingSession();
  } catch (e) {
    console.error('Error accessing media devices:', e);
    alert('Unable to capture media. Please check your permissions or try again.');
  }
});

stopButton.addEventListener('click', async () => {
  if (!recordingSessionActive) {
    console.warn('No active recording session to stop.');
    return;
  }

  await finalizeCurrentRecording();
  await concatenateSegments(); // Concatenate all saved clips to create the final highlight montage

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  startButton.disabled = false;
  stopButton.disabled = true;

  console.log('Recording session has been stopped and highlight montage created.');
});

async function startNewRecordingSession() {
  if (recordingSessionActive) return;

  startButton.disabled = true;
  stopButton.disabled = false;

  recordedChunks = [];

  const mimeType = 'video/webm; codecs=vp8';
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
      pruneBuffer(); // Limit buffer to last 5 seconds
    }
  };

  mediaRecorder.onstop = () => {
    recordingSessionActive = false;
  };

  mediaRecorder.start();
  recordingSessionActive = true;
  processOcrEverySecond();
}

function pruneBuffer() {
  const maxChunks = Math.ceil((bufferDurationMs / 1000) * 30); // Assuming 30fps
  if (recordedChunks.length > maxChunks) {
    recordedChunks = recordedChunks.slice(-maxChunks);
  }
}

let intervalId = null;

function processOcrEverySecond() {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(async () => {
    if (!recordingSessionActive) {
      clearInterval(intervalId);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);

    await runOcrOnFrame(canvas);
  }, 1000);
}

async function runOcrOnFrame(canvas) {
  if (!checkAllowed) return;

  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const options = {
      lang: 'eng',
      oem: 1,
      psm: 3,
      executablePath: "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    };

    const rawText = await tesseract.recognize(buffer, options);
    const text = rawText.toLowerCase().replace(/\s+/g, ' ').trim();

    const phrasesToDetect = [
      "you knocked out",
      "you knocked",
      "knocked out",
      "ouknock",
      "knock",
      "you",
      "out",
      "kill",
    ];

    for (const phrase of phrasesToDetect) {
      if (text.includes(phrase)) {
        console.log(`Trigger detected for phrase: "${phrase}"`);
        checkAllowed = false;
        await saveLastFiveSeconds();
        startNewRecordingSession();

        setTimeout(() => {
          checkAllowed = true;
        }, detectionTimeout);

        break;
      }
    }
  } catch (error) {
    console.error('Error in OCR processing:', error);
  }
}

async function saveLastFiveSeconds() {
  console.log("Saving last 5 seconds of footage...");
  const uniqueTimestamp = Date.now();
  const tempWebmPath = path.join(__dirname, `temp_export_${uniqueTimestamp}.webm`);
  const tempMp4Path = path.join(__dirname, `temp_export_${uniqueTimestamp}.mp4`);

  // Create a temporary MediaRecorder to finalize properly
  const tempRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm; codecs=vp8' });
  let tempChunks = [];

  tempRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      tempChunks.push(event.data);
    }
  };

  tempRecorder.onstop = async () => {
    const combinedBlob = new Blob(tempChunks, { type: 'video/webm' });
    const reader = new FileReader();

    reader.onload = async function () {
      try {
        const buffer = Buffer.from(new Uint8Array(reader.result));
        await fsPromises.writeFile(tempWebmPath, buffer);

        if (fs.existsSync(tempMp4Path)) {
          await fsPromises.unlink(tempMp4Path);
        }

        ffmpeg(tempWebmPath)
          .output(tempMp4Path)
          .outputOptions('-preset', 'veryfast', '-movflags', 'faststart', '-y')
          .on('end', async () => {
            await fsPromises.appendFile(tempFileListPath, `file '${tempMp4Path}'\n`);
            console.log('Exported video segment created successfully at:', tempMp4Path);
          })
          .on('error', (err) => {
            console.error('FFmpeg conversion error:', err.message);
          })
          .run();
      } catch (error) {
        console.error('Error saving footage:', error);
      }
    };

    reader.onerror = (err) => console.error('Error reading Blob:', err);
    reader.readAsArrayBuffer(combinedBlob);
  };

  tempRecorder.start();
  setTimeout(() => {
    tempRecorder.stop();
  }, 5000); // Record for 5 seconds
}

async function concatenateSegments() {
  const outputFilePath = path.join(__dirname, `final_output_${Date.now()}.mp4`);
  console.log('Running FFmpeg to concatenate exported clips...');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempFileListPath)
      .inputOptions('-f', 'concat', '-safe', '0')
      .outputOptions('-c', 'copy')
      .output(outputFilePath)
      .on('end', () => {
        console.log('Final highlight montage created successfully:', outputFilePath);
        resolve();
      })
      .on('error', (err) => {
        console.error('Error during final video processing:', err.message);
        reject(err);
      })
      .run();
  });
}

async function finalizeCurrentRecording() {
  if (recordingSessionActive && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

console.log('Script loaded successfully.');