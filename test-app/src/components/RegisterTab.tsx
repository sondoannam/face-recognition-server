import { useEffect, useRef, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";
import { useCaptureFlow } from "../hooks/useCaptureFlow";

const REQUIRED_IMAGE_COUNT = 5;
const API_KEY = import.meta.env.VITE_API_KEY ?? "myvery-secretkey"; // Get API key from env
const SERVER_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function RegisterTab() {
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [capturedImages, setCapturedImages] = useState<Blob[]>([]);
  const [message, setMessage] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<
    "idle" | "capturing" | "registering" | "success" | "error" | "cancelled"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const capturedImagesRef = useRef<Blob[]>([]);

  const isMobile = useIsMobile();
  const REGISTRATION_API = `${SERVER_URL}/api/v1/register`;

  // WebSocket for real-time detection
  const wsRef = useRef<WebSocket | null>(null);
  const wsSendIntervalRef = useRef<number | null>(null);

  const {
    step: captureStep,
    countdown,
    progress,
    startFlow: startCaptureFlow,
    cancelFlow: cancelCaptureFlow,
    onFaceDetected,
  } = useCaptureFlow({
    requiredCount: REQUIRED_IMAGE_COUNT,
    onCapture: async () => {
      console.log("[DEBUG] onCapture called: about to call captureImage()");
      await captureImage();
    },
    onComplete: () => {
      setRegistrationStatus("registering");
      setMessage("Registering new person...");
      setRegistering(false);
      registerPerson();
    },
  });

  const registeringRef = useRef(registering);
  const registrationStatusRef = useRef(registrationStatus);
  const captureStepRef = useRef(captureStep);

  // Component mounted
  useEffect(() => {
    setMessage("Ready to start registration.");
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    registeringRef.current = registering;
  }, [registering]);
  useEffect(() => {
    registrationStatusRef.current = registrationStatus;
  }, [registrationStatus]);
  useEffect(() => {
    captureStepRef.current = captureStep;
  }, [captureStep]);

  // Remove camera/WebSocket setup from useEffect (mount)

  // Camera/WebSocket setup and cleanup logic
  async function setupCameraAndDetection() {
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (canvasRef.current && overlayCanvasRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          overlayCanvasRef.current.width = videoRef.current.videoWidth;
          overlayCanvasRef.current.height = videoRef.current.videoHeight;
        }
      }
    } catch (error) {
      setErrorMessage(
        `Camera access error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return;
    }

    // Setup WebSocket for detection
    const wsUrl = SERVER_URL.replace(/^http/, "ws") + "/ws/detect";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setMessage("WebSocket connected for real-time detection.");
      wsSendIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || ws.readyState !== 1) return;
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];
        ws.send(JSON.stringify({ image: base64 }));
      }, 120); // ~8 fps
    };
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "faces" && overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(
            0,
            0,
            overlayCanvasRef.current.width,
            overlayCanvasRef.current.height
          );
          if (data.faces && data.faces.length > 0) {
            drawFaces(data.faces, ctx);
            setMessage(`Found ${data.faces.length} face(s)`);

            if (
              registeringRef.current &&
              registrationStatusRef.current === "capturing"
            ) {
              await onFaceDetected();
            }
          } else {
            setMessage("No faces detected");
          }
        } else if (data.type === "error") {
          setErrorMessage(data.message);
        }
      } catch (e) {
        console.error("WebSocket message parse error:", e);
      }
    };
    ws.onerror = () => {
      setErrorMessage("WebSocket error for detection");
    };
    ws.onclose = () => {
      setMessage("WebSocket closed for detection");
    };
  }

  function cleanupCameraAndDetection() {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (wsSendIntervalRef.current) {
      clearInterval(wsSendIntervalRef.current);
      wsSendIntervalRef.current = null;
    }
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      if (ctx)
        ctx.clearRect(
          0,
          0,
          overlayCanvasRef.current.width,
          overlayCanvasRef.current.height
        );
    }
  }

  // Only start camera/detection and capture flow when registration starts
  async function startRegistration() {
    if (!name.trim()) {
      setErrorMessage("Please enter a name before starting registration.");
      return;
    }
    setRegistering(true);
    setRegistrationStatus("capturing");
    setCapturedImages([]);
    setErrorMessage("");
    setMessage("Starting registration process...");
    await setupCameraAndDetection();
    startCaptureFlow();
  }

  // Stop registration process and cleanup camera/detection
  function stopRegistration() {
    setRegistering(false);
    setRegistrationStatus("cancelled");
    setCapturedImages([]);
    cleanupCameraAndDetection();
    cancelCaptureFlow();
  }

  // Cleanup camera/detection on unmount
  useEffect(() => {
    return () => {
      cleanupCameraAndDetection();
    };
  }, []);

  // Monitor captured images and progress to registration when complete
  useEffect(() => {
    if (
      capturedImages.length >= REQUIRED_IMAGE_COUNT &&
      registrationStatus === "capturing"
    ) {
      setRegistrationStatus("registering");
      setMessage("Registering new person...");
      setRegistering(false);
      registerPerson();
    }
  }, [capturedImages, registrationStatus]);

  // Update capturedImagesRef whenever capturedImages changes
  useEffect(() => {
    capturedImagesRef.current = capturedImages;
  }, [capturedImages]);

  // Capture current frame from video
  async function captureImage() {
    console.log("[DEBUG] captureImage called");
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);

      const blob = await new Promise<Blob>((resolve) => {
        canvasRef.current!.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(new Blob([]));
          },
          "image/jpeg",
          0.8
        );
      });

      setCapturedImages((prev) => [...prev, blob]);

      setMessage(
        `Image ${capturedImages.length + 1} of ${REQUIRED_IMAGE_COUNT} captured`
      );
    } catch (error) {
      console.error("Error capturing image:", error);
      setErrorMessage(
        `Capture error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Draw rectangles around detected faces
  function drawFaces(
    faces: Array<{ x: number; y: number; width: number; height: number }>,
    ctx: CanvasRenderingContext2D
  ) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "lime";
    ctx.font = "16px Arial";
    ctx.fillStyle = "lime";

    faces.forEach((face, index) => {
      const { x, y, width, height } = face;

      // Draw rectangle around face
      ctx.strokeRect(x, y, width, height);

      // Draw label
      ctx.fillText(`Face ${index + 1}`, x, y - 5);
    });
  }

  // Register person with server
  async function registerPerson() {
    if (!name.trim() || capturedImages.length < REQUIRED_IMAGE_COUNT) {
      setErrorMessage("Registration requirements not met.");
      setRegistrationStatus("error");
      return;
    }

    try {
      setMessage("Uploading images for registration...");

      // Track successful registrations
      let successCount = 0;

      // Register each captured image separately
      const registrationPromises = capturedImages.map(
        async (imageBlob, index) => {
          const formData = new FormData();
          formData.append("name", name);
          formData.append("file", imageBlob, `face_${index + 1}.jpg`);

          try {
            const response = await fetch(REGISTRATION_API, {
              method: "POST",
              body: formData,
              headers: {
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
                  result.error ??
                  result.detail ??
                  `Server error (${response.status})`,
              };
            }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        }
      );

      // Wait for all registration attempts to complete
      const results = await Promise.all(registrationPromises);

      // Check results
      if (successCount === REQUIRED_IMAGE_COUNT) {
        setMessage(
          `${name} registered successfully with all ${REQUIRED_IMAGE_COUNT} images!`
        );
        setRegistrationStatus("success");
      } else if (successCount > 0) {
        setMessage(
          `Partial success: ${successCount} of ${REQUIRED_IMAGE_COUNT} images registered for ${name}.`
        );
        setRegistrationStatus("error");
      } else {
        setErrorMessage(`Registration failed: ${results[0].error}`);
        setRegistrationStatus("error");
      }
    } catch (error) {
      console.error("Registration error:", error);
      setErrorMessage(
        `Registration error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setRegistrationStatus("error");
    } finally {
      setRegistering(false);
    }
  }

  // UI for displaying captured images
  function renderCapturedImages() {
    return capturedImages.map((img, index) => (
      <div
        key={img.size + "-" + img.type + "-" + index}
        className="image-item border-2 border-purple-300 rounded-md overflow-hidden"
        /* TODO: Move inline styles to CSS */
        style={{ aspectRatio: "1", position: "relative" }}
      >
        <img
          src={URL.createObjectURL(img)}
          alt={`Captured ${index + 1}`}
          className="w-full h-full object-cover"
          onLoad={(e) =>
            URL.revokeObjectURL((e.target as HTMLImageElement).src)
          }
        />
        <div className="absolute bottom-0 right-0 bg-purple-900 text-white text-xs px-2 py-1">
          {index + 1}/{REQUIRED_IMAGE_COUNT}
        </div>
      </div>
    ));
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div
          className={
            isMobile
              ? "flex w-full flex-row gap-2 order-2 md:order-1 mb-4"
              : "flex-1 w-full flex flex-col gap-3 order-2 md:order-1"
          }
        >
          <h2 className="text-2xl font-bold text-dark-purple mb-6">
            Register a New Person
          </h2>
          <label
            htmlFor="register-name-input"
            className={isMobile ? "hidden" : "block font-medium text-purple"}
          >
            Name
          </label>
          <input
            id="register-name-input"
            className={
              isMobile
                ? "w-[240px]"
                : "w-full p-2 border border-gray-300 rounded"
            }
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={registering}
            placeholder="Enter person's name..."
            style={isMobile ? { minWidth: 0 } : {}}
          />

          {!registering && (
            <button
              className={`mt-2 ${
                isMobile ? "w-full flex-1" : ""
              } bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:bg-gray-400`}
              disabled={!name.trim() || registering}
              onClick={startRegistration}
            >
              Start Registration
            </button>
          )}

          {registering && (
            <button
              className="mt-2 w-full bg-gradient-to-r from-pink-400 via-red-500 to-purple-500 text-white font-semibold py-2 rounded shadow hover:from-red-500 hover:to-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-60"
              onClick={stopRegistration}
            >
              Cancel Registration
            </button>
          )}
        </div>

        <div className="flex-1 flex-center flex-col order-1 md:order-2 w-full relative">
          <video
            ref={videoRef}
            width={isMobile ? Math.floor(window.innerWidth * 0.9 - 12) : 480}
            height={
              isMobile ? Math.floor((window.innerWidth * 0.9 * 4) / 3) : 320
            }
            className={
              isMobile
                ? "rounded-xl shadow bg-black object-cover w-full"
                : "rounded-xl shadow bg-black object-cover md:w-[480px] md:h-[320px]"
            }
            style={
              isMobile
                ? { width: "90vw", maxWidth: 480, aspectRatio: "3/4" }
                : {}
            }
            autoPlay
            muted
            playsInline
          />

          {/* Face detection overlay */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 w-full h-full"
            style={{
              pointerEvents: "none",
              //   transform: "scaleX(-1)",
            }}
          />

          {/* Hidden canvas for image capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {/* Status messages */}
      <div className="mt-4 text-center">
        {message && <p className="text-purple-700">{message}</p>}
        {errorMessage && <p className="text-red-600">{errorMessage}</p>}

        {registering && registrationStatus === "capturing" && (
          <div className="mt-2 text-center">
            {captureStep === "countdown" && countdown > 0 && (
              <div className="text-3xl font-bold text-purple-600 my-2">
                {countdown}
              </div>
            )}
            <div className="mb-2 text-purple-700">
              Progress: {progress}/{REQUIRED_IMAGE_COUNT} images
            </div>
          </div>
        )}
      </div>

      {/* Captured images grid */}
      {capturedImages.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-dark-purple mb-3">
            Captured Images ({capturedImages.length}/{REQUIRED_IMAGE_COUNT})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {renderCapturedImages()}
          </div>
        </div>
      )}

      {/* Registration result message */}
      {registrationStatus === "success" && (
        <div className="text-green-600 font-bold mt-6 text-center">
          Registration successful!
        </div>
      )}

      {registrationStatus === "cancelled" && !registering && (
        <div className="text-red-600 font-bold mt-6 text-center">
          Registration cancelled.
        </div>
      )}
    </div>
  );
}

export default RegisterTab;
