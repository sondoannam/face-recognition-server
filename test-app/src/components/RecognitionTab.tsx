import { useEffect, useRef, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";

const SERVER_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "myvery-secretkey";

function RecognitionTab() {
  const [recognizing, setRecognizing] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([]);
  const [match, setMatch] = useState<{
    name: string;
    confidence?: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectIntervalRef = useRef<number | null>(null);
  const recognizeTimeoutRef = useRef<number | null>(null);
  const autoClearTimeoutRef = useRef<number | null>(null);

  const isMobile = useIsMobile();
  const DETECTION_API = `${SERVER_URL}/detect`;
  const RECOGNITION_API = `${SERVER_URL}/api/v1/recognize`;

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, []);

  // Auto-clear match after 30 seconds
  useEffect(() => {
    if (match) {
      if (autoClearTimeoutRef.current) {
        clearTimeout(autoClearTimeoutRef.current);
      }
      autoClearTimeoutRef.current = window.setTimeout(() => {
        setMatch(null);
        setMessage("");
      }, 30000);
    }
    return () => {
      if (autoClearTimeoutRef.current) {
        clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }
    };
  }, [match]);

  // Start face recognition
  const startRecognition = async () => {
    setRecognizing(true);
    setMessage("Starting camera...");
    setError("");
    setMatch(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Set up canvas dimensions
        if (canvasRef.current && overlayCanvasRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;

          overlayCanvasRef.current.width = videoRef.current.videoWidth;
          overlayCanvasRef.current.height = videoRef.current.videoHeight;
        }

        setMessage("Camera started. Detecting faces...");
        startDetection();
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      setError(
        `Camera error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setRecognizing(false);
    }
  };

  // Stop face recognition
  const stopRecognition = () => {
    setRecognizing(false);
    setMessage("Recognition stopped");

    // Stop video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // Clear detections
    stopDetection();
    setDetectedFaces([]);
  };

  // Start face detection loop
  const startDetection = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
    }

    detectIntervalRef.current = window.setInterval(detectFaces, 100);
  };

  // Stop face detection loop
  const stopDetection = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }

    if (recognizeTimeoutRef.current) {
      clearTimeout(recognizeTimeoutRef.current);
      recognizeTimeoutRef.current = null;
    }
  };

  // Detect faces in video frame
  const detectFaces = async () => {
    if (!videoRef.current || !overlayCanvasRef.current || !canvasRef.current)
      return;

    try {
      // Draw video to canvas for processing
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);

      // Convert canvas to blob for API call
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

      // Create form data for API call
      const formData = new FormData();
      formData.append("file", blob, "webcam.jpg");

      // Call detection API
      const response = await fetch(DETECTION_API, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Draw detected faces on overlay canvas
      const overlayCtx = overlayCanvasRef.current.getContext("2d");
      if (!overlayCtx) return;

      overlayCtx.clearRect(
        0,
        0,
        overlayCanvasRef.current.width,
        overlayCanvasRef.current.height
      );

      if (data.faces && data.faces.length > 0) {
        drawFaces(data.faces, overlayCtx);

        const newFaceCount = data.faces.length;
        const previousFaceCount = detectedFaces.length;

        // Update detected faces
        setDetectedFaces(data.faces);

        // Only trigger recognition when we first detect a face or when face count changes
        // This prevents constant API calls while still being responsive
        if (
          newFaceCount > 0 &&
          (previousFaceCount === 0 || previousFaceCount !== newFaceCount)
        ) {
          setMessage(`Detected ${newFaceCount} face(s). Recognizing...`);

          // Slight delay before recognition to ensure we have a stable frame
          if (recognizeTimeoutRef.current) {
            clearTimeout(recognizeTimeoutRef.current);
          }

          recognizeTimeoutRef.current = setTimeout(() => {
            recognizeFace(blob);
          }, 500);
        }
      } else {
        setDetectedFaces([]);
        setMatch(null);
        setMessage("No faces detected");
      }
    } catch (error) {
      console.error("Face detection error:", error);
      setError(
        `Detection error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  // Send face to recognition API
  const recognizeFace = async (imageBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", imageBlob, "face.jpg");

      const response = await fetch(RECOGNITION_API, {
        method: "POST",
        headers: {
          "X-API-Key": API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Recognition API error: ${response.status}`);
      }

      const result = await response.json();

      if (result.matches && result.matches.length > 0) {
        setMatch(result.matches[0]);
        setMessage(
          `Recognized: ${result.matches[0].name} (${
            result.matches[0].confidence
              ? Math.round(result.matches[0].confidence * 100)
              : "?"
          }% confidence)`
        );
        stopRecognition(); // Stop after a match
      } else {
        setMatch(null);
        setMessage("No match found");
        stopRecognition(); // Stop after no match
      }
    } catch (error) {
      console.error("Recognition error:", error);
      setError(
        `Recognition error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setMatch(null);
      stopRecognition(); // Stop on error
    }
  };

  // Draw face rectangles on canvas
  const drawFaces = (
    faces: Array<{ x: number; y: number; width: number; height: number }>,
    ctx: CanvasRenderingContext2D
  ) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "lime";
    ctx.font = "16px Arial";
    ctx.fillStyle = "lime";

    faces.forEach((face, index) => {
      const { x, y, width, height } = face;

      // Draw rectangle
      ctx.strokeRect(x, y, width, height);

      // Draw label
      const label = match
        ? `${match.name} (${
            match.confidence ? Math.round(match.confidence * 100) : "?"
          }%)`
        : `Face ${index + 1}`;
      ctx.fillText(label, x, y - 5);
    });
  };

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-dark-purple mb-6">
        Face Recognition
      </h2>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 order-2 md:order-1">
          <div className="mb-4">
            {!recognizing ? (
              <button
                className="bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700"
                onClick={startRecognition}
              >
                Start Recognition
              </button>
            ) : (
              <button
                className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
                onClick={stopRecognition}
              >
                Stop Recognition
              </button>
            )}
            {/* Restart button, shown if not recognizing and match is present */}
            {!recognizing && match && (
              <button
                className="ml-2 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                onClick={startRecognition}
              >
                Restart
              </button>
            )}
          </div>

          {message && <div className="mt-4 text-purple-700">{message}</div>}

          {error && <div className="mt-4 text-red-600">{error}</div>}

          {match && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-dark-purple mb-2">
                Recognized Person:
              </h3>
              <div className="text-green-700 font-medium">
                {match.name}{" "}
                {match.confidence !== undefined &&
                  `(${Math.round(match.confidence * 100)}% confidence)`}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 order-1 md:order-2 relative">
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
            //   transform: "scaleX(-1)", // Mirror effect to match video
            }}
          />

          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

export default RecognitionTab;
