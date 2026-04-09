import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 웹캠 접근 및 프레임 캡처 훅
 * - getUserMedia로 카메라 스트림 획득
 * - videoRef를 <video> 요소에 연결
 * - captureFrame()으로 현재 프레임의 ImageData 반환
 */
export default function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      // 먼저 isActive를 설정해서 <video> 요소가 렌더링되게 함
      setIsActive(true);
      setError(null);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('카메라 권한이 필요합니다');
      } else if (err.name === 'NotFoundError') {
        setError('카메라를 찾을 수 없습니다');
      } else {
        setError('카메라를 시작할 수 없습니다');
      }
      setIsActive(false);
    }
  }, []);

  // isActive가 true가 되어 <video>가 렌더링된 후 스트림 연결
  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isActive]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  // 컴포넌트 언마운트 시 스트림 정리
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return { videoRef, isActive, error, start, stop, captureFrame };
}
