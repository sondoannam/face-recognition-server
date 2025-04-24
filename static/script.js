// DOM Elements
const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const startButton = document.getElementById("startCamera");
const stopButton = document.getElementById("stopCamera");
const statusMessage = document.getElementById("status-message");
const personNameInput = document.getElementById("personName");
const startRegistrationButton = document.getElementById("startRegistration");
const cancelRegistrationButton = document.getElementById("cancelRegistration");
const imagesContainer = document.getElementById("imagesContainer");
const imageCountElement = document.getElementById("imageCount");

// Global variables
let stream = null;
let detectInterval = null;
let registrationActive = false;
let captureInterval = null;
let capturedImages = [];
let countdownValue = 0;
let storedImageUrls = [];
const SERVER_URL = window.location.origin;
const DETECTION_API = `${SERVER_URL}/detect`;
const REGISTRATION_API = `${SERVER_URL}/api/v1/register`;
const CONFIG_API = `${SERVER_URL}/config`;
let API_KEY = ""; // Will be fetched from server
let REQUIRED_IMAGE_COUNT = 5; // Default, may be updated from config
const CAPTURE_INTERVAL_MS = 3000; // 3 seconds between captures

// Fetch configuration from server
async function loadConfig() {
  try {
    startRegistrationButton.disabled = true;
    statusMessage.textContent = "Loading configuration...";

    const response = await fetch(CONFIG_API);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }

    const config = await response.json();

    // Update global variables with config values
    API_KEY = config.apiKey;
    if (config.requiredImageCount) {
      REQUIRED_IMAGE_COUNT = config.requiredImageCount;
    }

    console.log("Configuration loaded successfully");
    statusMessage.textContent =
      "Configuration loaded. Click 'Start Camera' to begin.";
  } catch (error) {
    console.error("Error loading configuration:", error);
    statusMessage.textContent = `Configuration error: ${error.message}`;
  }
}

// Load configuration on page load
document.addEventListener("DOMContentLoaded", loadConfig);

// Start webcam
startButton.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;

    // Wait for video metadata to load
    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Update UI
    startButton.disabled = true;
    stopButton.disabled = false;
    statusMessage.textContent = "Camera active. Detecting faces...";

    // Enable registration button
    startRegistrationButton.disabled = false;

    // Start face detection
    startFaceDetection();
  } catch (error) {
    console.error("Error accessing camera:", error);
    statusMessage.textContent = `Error: ${
      error.message || "Could not access camera"
    }`;
  }
});

// Stop webcam
stopButton.addEventListener("click", () => {
  stopFaceDetection();
  stopRegistration();

  // Stop all video tracks
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  // Clear video source
  video.srcObject = null;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update UI
  startButton.disabled = false;
  stopButton.disabled = true;
  startRegistrationButton.disabled = true;
  statusMessage.textContent = "Camera stopped.";
});

// Start Registration Process
startRegistrationButton.addEventListener("click", () => {
  const personName = personNameInput.value.trim();
  if (!personName) {
    statusMessage.textContent =
      "Error: Please enter a name before starting registration.";
    return;
  }

  if (!stream) {
    statusMessage.textContent = "Error: Please start the camera first.";
    return;
  }

  registrationActive = true;
  capturedImages = [];
  updateImageCount();
  clearImagesContainer();

  // Initialize countdown
  countdownValue = 3;

  // Update UI
  startRegistrationButton.disabled = true;
  cancelRegistrationButton.disabled = false;
  personNameInput.disabled = true;
  statusMessage.textContent = `Registration started. Next capture in ${countdownValue}s...`;

  startCaptureInterval();
});

// Cancel Registration Process
cancelRegistrationButton.addEventListener("click", () => {
  stopRegistration();
  statusMessage.textContent = "Registration canceled.";
});

// Start face detection loop
function startFaceDetection() {
  // Stop any existing interval
  if (detectInterval) {
    clearInterval(detectInterval);
  }

  // Run detection every 100ms for consistent behavior
  detectInterval = setInterval(detectFaces, 100);
}

// Stop face detection loop
function stopFaceDetection() {
  if (detectInterval) {
    clearInterval(detectInterval);
    detectInterval = null;
  }
}

// Start auto-capture interval
function startCaptureInterval() {
  if (captureInterval) {
    clearInterval(captureInterval);
  }

  // Start a 1-second countdown timer
  const countdownInterval = setInterval(() => {
    countdownValue--;

    if (countdownValue > 0) {
      statusMessage.textContent = `Preparing to capture. Next image in ${countdownValue}s...`;
    } else {
      clearInterval(countdownInterval);
    }
  }, 1000);

  captureInterval = setInterval(async () => {
    // First check if we already have enough images - if so, stop the interval
    if (capturedImages.length >= REQUIRED_IMAGE_COUNT) {
      clearInterval(captureInterval);
      captureInterval = null;
      statusMessage.textContent = "Registering new person...";
      await registerPerson();
      return; // Exit early to prevent further captures
    }

    if (registrationActive) {
      try {
        // Check if there's currently a face detected before capturing
        const faceData = await detectFacesForCapture();

        if (faceData && faceData.faces && faceData.faces.length > 0) {
          await captureImage();

          // Check if we've reached the required count after this capture
          if (capturedImages.length >= REQUIRED_IMAGE_COUNT) {
            clearInterval(captureInterval);
            captureInterval = null;
            statusMessage.textContent = "Registering new person...";
            await registerPerson();
            return; // Exit early to prevent starting new countdown
          }

          // Reset countdown after capture (only if we need more images)
          countdownValue = 3;

          // Start a new countdown display
          const newCountdownInterval = setInterval(() => {
            countdownValue--;

            if (countdownValue > 0 && registrationActive) {
              statusMessage.textContent = `Next capture in ${countdownValue}s...`;
            } else {
              clearInterval(newCountdownInterval);
            }
          }, 1000);
        } else {
          statusMessage.textContent =
            "Please position your face properly for capture...";
        }
      } catch (error) {
        console.error("Error during auto-capture:", error);
        statusMessage.textContent = `Error: ${
          error.message || "Failed to capture image"
        }`;
      }
    }
  }, CAPTURE_INTERVAL_MS);
}

// Stop registration process
function stopRegistration() {
  registrationActive = false;

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  // Free up memory by releasing object URLs
  storedImageUrls.forEach((url) => URL.revokeObjectURL(url));
  storedImageUrls = [];

  capturedImages = [];
  updateImageCount();
  clearImagesContainer();

  // Reset UI
  startRegistrationButton.disabled = false;
  cancelRegistrationButton.disabled = true;
  personNameInput.disabled = false;
}

// Detect faces in current video frame
async function detectFaces() {
  if (!video.srcObject || !canvas.width) return;

  try {
    // Draw current video frame to an offscreen canvas for processing
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = video.videoWidth;
    offscreenCanvas.height = video.videoHeight;
    const offscreenCtx = offscreenCanvas.getContext("2d");
    offscreenCtx.drawImage(video, 0, 0);

    // Convert canvas to blob
    const blob = await new Promise((resolve) => {
      offscreenCanvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    // Create FormData and append the blob
    const formData = new FormData();
    formData.append("file", blob, "webcam.jpg");

    // Send to server for detection
    const response = await fetch(DETECTION_API, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw detected faces
    if (data.faces && data.faces.length > 0) {
      drawFaces(data.faces);

      if (!registrationActive) {
        statusMessage.textContent = `Found ${data.faces.length} face(s)`;
      }
    } else {
      if (!registrationActive) {
        statusMessage.textContent = "No faces detected";
      }
    }
  } catch (error) {
    console.error("Face detection error:", error);
    statusMessage.textContent = `Error: ${error.message}`;
  }
}

// Detect faces specifically for capturing images (returns the data)
async function detectFacesForCapture() {
  if (!video.srcObject || !canvas.width) return null;

  try {
    // Draw current video frame to an offscreen canvas for processing
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = video.videoWidth;
    offscreenCanvas.height = video.videoHeight;
    const offscreenCtx = offscreenCanvas.getContext("2d");
    offscreenCtx.drawImage(video, 0, 0);

    // Convert canvas to blob
    const blob = await new Promise((resolve) => {
      offscreenCanvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    // Create FormData and append the blob
    const formData = new FormData();
    formData.append("file", blob, "webcam.jpg");

    // Send to server for detection
    const response = await fetch(DETECTION_API, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Face detection error during capture:", error);
    return null;
  }
}

// Capture a frame from the video stream
async function captureImage() {
  try {
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = video.videoWidth;
    offscreenCanvas.height = video.videoHeight;
    const offscreenCtx = offscreenCanvas.getContext("2d");
    offscreenCtx.drawImage(video, 0, 0);

    // Convert canvas to blob
    const blob = await new Promise((resolve) => {
      offscreenCanvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    // Store the blob in memory
    capturedImages.push(blob);

    // Create image URL for display
    const imageUrl = URL.createObjectURL(blob);
    storedImageUrls.push(imageUrl); // Store for later cleanup
    addImageToContainer(imageUrl);

    // Update the counter
    updateImageCount();

    statusMessage.textContent = `Image ${capturedImages.length} of ${REQUIRED_IMAGE_COUNT} captured`;
  } catch (error) {
    console.error("Error capturing image:", error);
    statusMessage.textContent = `Error capturing image: ${error.message}`;
  }
}

// Add image to the images container
function addImageToContainer(imageUrl) {
  const imageItem = document.createElement("div");
  imageItem.className = "image-item";

  const img = document.createElement("img");
  img.src = imageUrl;

  imageItem.appendChild(img);
  imagesContainer.appendChild(imageItem);
}

// Update the image count display
function updateImageCount() {
  imageCountElement.textContent = capturedImages.length;
}

// Clear all images from container
function clearImagesContainer() {
  imagesContainer.innerHTML = "";
}

// Register person with captured images
async function registerPerson() {
  const personName = personNameInput.value.trim();
  if (!personName || capturedImages.length < REQUIRED_IMAGE_COUNT) {
    statusMessage.textContent = "Error: Registration requirements not met.";
    return;
  }

  try {
    statusMessage.textContent = "Uploading images for registration...";

    // Track successful registrations
    let successCount = 0;

    // Register each captured image separately
    const registrationPromises = capturedImages.map(
      async (imageBlob, index) => {
        const formData = new FormData();
        formData.append("name", personName);
        formData.append("file", imageBlob, `face_${index + 1}.jpg`);

        try {
          const response = await fetch(REGISTRATION_API, {
            method: "POST",
            body: formData,
            headers: {
              // Assuming your API requires an API key as mentioned in api.py
              "X-API-Key": API_KEY,
            },
          });

          const result = await response.json();

          if (response.ok) {
            successCount++;
            return { success: true, data: result };
          } else {
            return {
              success: false,
              error:
                result.error ||
                result.detail ||
                `Server error (${response.status})`,
            };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // Wait for all registration attempts to complete
    const results = await Promise.all(registrationPromises);

    // Check results
    if (successCount === REQUIRED_IMAGE_COUNT) {
      statusMessage.textContent = `${personName} registered successfully with all ${REQUIRED_IMAGE_COUNT} images!`;
    } else if (successCount > 0) {
      statusMessage.textContent = `Partial success: ${successCount} of ${REQUIRED_IMAGE_COUNT} images registered for ${personName}.`;
    } else {
      statusMessage.textContent = `Registration failed: ${results[0].error}`;
    }
  } catch (error) {
    console.error("Registration error:", error);
    statusMessage.textContent = `Registration error: ${error.message}`;
  } finally {
    // Reset registration state
    stopRegistration();
  }
}

// Draw rectangles around detected faces
function drawFaces(faces) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "lime";
  ctx.font = "16px Arial";
  ctx.fillStyle = "lime";

  faces.forEach((face, index) => {
    const { x, y, width, height } = face;

    // Scale coordinates to match canvas
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledWidth = width * scaleX;
    const scaledHeight = height * scaleY;

    // Draw rectangle around face
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    // Draw label
    ctx.fillText(`Face ${index + 1}`, scaledX, scaledY - 5);
  });
}

// Handle page unload
window.addEventListener("beforeunload", () => {
  stopFaceDetection();
  stopRegistration();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
});
