import { useState, useRef, useCallback, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

const MODEL_URL = '/models/mobilenet/model.json';
const INFERENCE_INTERVAL = 1000; // 1초
const NO_FACE_THRESHOLD = 5;    // 연속 5회(5초) 미감지 → 졸음

/**
 * TF.js 기반 실시간 집중도 분석 훅
 * - 얼굴 감지 (BlazeFace) → 얼굴 영역 크롭
 * - MobileNetV3 Large 모델로 5클래스 분류 (Graph model)
 * - 3초 간격 추론
 */
export default function useAttentionAnalysis(captureFrame, isWebcamActive) {
  const [currentStatus, setCurrentStatus] = useState(1);
  const [confidence, setConfidence] = useState(0);
  const [focusLevel, setFocusLevel] = useState(85);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [modelLoadingProgress, setModelLoadingProgress] = useState('');

  const classifierRef = useRef(null);
  const detectorRef = useRef(null);
  const noFaceCountRef = useRef(0);
  const intervalRef = useRef(null);
  const analysisActiveRef = useRef(false);

  // 모델 로딩 (1회)
  const loadModels = useCallback(async () => {
    try {
      setModelLoadingProgress('TF.js 백엔드 초기화 중...');
      await tf.ready();

      setModelLoadingProgress('얼굴 감지 모델 로딩 중...');
      detectorRef.current = await blazeface.load();

      setModelLoadingProgress('집중도 분류 모델 로딩 중...');
      classifierRef.current = await tf.loadGraphModel(MODEL_URL);

      setIsModelLoaded(true);
      setModelLoadingProgress('');
    } catch (err) {
      console.error('모델 로딩 실패:', err);
      setModelLoadingProgress('모델 로딩 실패');
    }
  }, []);

  // 단일 프레임 추론
  const analyzeFrame = useCallback(async () => {
    if (!classifierRef.current || !detectorRef.current || !captureFrame) return;

    const imageData = captureFrame();
    if (!imageData) return;

    try {
      // 1. 얼굴 감지 (BlazeFace)
      const imageTensor = tf.browser.fromPixels(imageData);
      const faces = await detectorRef.current.estimateFaces(imageTensor, false);
      imageTensor.dispose();

      if (faces.length === 0) {
        noFaceCountRef.current += 1;
        setFaceDetected(false);

        const status = noFaceCountRef.current >= NO_FACE_THRESHOLD ? 5 : 4;
        setCurrentStatus(status);
        setConfidence(0.5);
        setFocusLevel(status === 5 ? 15 : 35);
        return;
      }

      // 얼굴 감지됨
      noFaceCountRef.current = 0;
      setFaceDetected(true);

      // 2. 얼굴 영역 크롭 → 224x224 리사이즈 → 정규화
      const face = faces[0];
      const topLeft = face.topLeft;
      const bottomRight = face.bottomRight;

      const { status, conf, focusProb } = tf.tidy(() => {
        const full = tf.browser.fromPixels(imageData);
        const [imgH, imgW] = full.shape;

        const faceX = Math.floor(topLeft[0]);
        const faceY = Math.floor(topLeft[1]);
        const faceW = Math.floor(bottomRight[0] - topLeft[0]);
        const faceH = Math.floor(bottomRight[1] - topLeft[1]);

        // 바운딩 박스를 약간 확장 (20% 마진)
        const margin = 0.2;
        const x = Math.max(0, Math.floor(faceX - faceW * margin));
        const y = Math.max(0, Math.floor(faceY - faceH * margin));
        const w = Math.min(imgW - x, Math.floor(faceW * (1 + margin * 2)));
        const h = Math.min(imgH - y, Math.floor(faceH * (1 + margin * 2)));

        // 크롭 → 리사이즈 (graph model 내부에 Rescaling 레이어 포함, 별도 정규화 불필요)
        const cropped = full.slice([y, x, 0], [h, w, 3]);
        const resized = tf.image.resizeBilinear(cropped, [224, 224]);
        const input = resized.expandDims(0).toFloat();

        // 3. 모델 추론
        const prediction = classifierRef.current.predict(input);
        const probs = prediction.dataSync();

        let maxIdx = 0;
        let maxVal = probs[0];
        for (let i = 1; i < probs.length; i++) {
          if (probs[i] > maxVal) {
            maxVal = probs[i];
            maxIdx = i;
          }
        }

        // 집중 클래스(status 1, 2) 확률 합산 → 집중도 (0~100)
        const fp = Math.round((probs[0] + probs[1]) * 100);

        return { status: maxIdx + 1, conf: maxVal, focusProb: fp };
      });

      setCurrentStatus(status);
      setConfidence(conf);
      setFocusLevel(Math.min(100, Math.max(0, focusProb)));
    } catch (err) {
      console.error('추론 오류:', err);
    }
  }, [captureFrame]);

  // 분석 시작/중지
  const startAnalysis = useCallback(() => {
    if (!isModelLoaded) return;
    // 기존 인터벌 먼저 정리 (중복 실행 방지)
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    analysisActiveRef.current = true;
    setIsAnalyzing(true);
    noFaceCountRef.current = 0;

    analyzeFrame();
    intervalRef.current = setInterval(() => {
      if (analysisActiveRef.current) analyzeFrame();
    }, INFERENCE_INTERVAL);
  }, [isModelLoaded, analyzeFrame]);

  const stopAnalysis = useCallback(() => {
    analysisActiveRef.current = false;
    setIsAnalyzing(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    currentStatus,
    confidence,
    focusLevel,
    isModelLoaded,
    isAnalyzing,
    faceDetected,
    modelLoadingProgress,
    loadModels,
    startAnalysis,
    stopAnalysis,
  };
}
