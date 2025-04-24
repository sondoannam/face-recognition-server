import { useEffect, useState } from "react";

const MOBILE_WIDTH = 500;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_WIDTH : false
  );
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_WIDTH);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

export default useIsMobile;
