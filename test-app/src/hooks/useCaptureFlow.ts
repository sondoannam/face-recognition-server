import { useCallback, useEffect, useRef, useState } from "react";
import { useCountdown } from "./useCountdown";

export type CaptureStep =
  | "idle"
  | "countdown"
  | "waiting_face"
  | "capturing"
  | "done";

interface UseCaptureFlowOptions {
  requiredCount: number;
  onCapture: () => Promise<void>;
  onComplete: () => void;
}

export function useCaptureFlow({
  requiredCount,
  onCapture,
  onComplete,
}: UseCaptureFlowOptions) {
  const [step, setStep] = useState<CaptureStep>("idle");
  const [progress, setProgress] = useState(0);
  const {
    count: countdown,
    start: startCountdown,
    stop: stopCountdown,
    reset: resetCountdown,
  } = useCountdown(3);
  const progressRef = useRef(0);
  const stepRef = useRef(step);

  // Keep progressRef and stepRef in sync
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Start the flow
  const startFlow = () => {
    setProgress(0);
    setStep("countdown");
    startCountdown();
  };

  // Cancel the flow
  const cancelFlow = () => {
    setStep("idle");
    setProgress(0);
    stopCountdown();
  };

  // When countdown reaches 0, move to waiting_face
  useEffect(() => {
    if (step === "countdown" && countdown === 0) {
      setStep("waiting_face");
    }
  }, [step, countdown]);

  // Call this from WebSocket handler when a face is detected
  const onFaceDetected = useCallback(async () => {
    if (
      stepRef.current === "waiting_face" &&
      progressRef.current < requiredCount
    ) {
      setStep("capturing");
      await onCapture();
      setProgress((prev) => prev + 1);
    }
  }, [requiredCount, onCapture]);

  // After capturing, advance the flow
  useEffect(() => {
    if (step === "capturing") {
      if (progressRef.current < requiredCount) {
        setStep("countdown");
        startCountdown();
      } else {
        setStep("done");
      }
    }
  }, [step, requiredCount]);

  // When all images are captured, trigger onComplete
  useEffect(() => {
    if (step === "done" && progress >= requiredCount) {
      onComplete();
    }
  }, [step, progress, requiredCount]);

  // Reset on cancel or idle
  useEffect(() => {
    if (step === "idle") {
      stopCountdown();
      setProgress(0);
    }
  }, [step]);

  return {
    step,
    countdown,
    progress,
    startFlow,
    cancelFlow,
    onFaceDetected,
  };
}
