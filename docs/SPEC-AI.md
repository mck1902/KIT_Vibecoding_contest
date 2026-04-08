# AI 연동 구현 지시서 (SPEC-AI)

## 개요
- **온디바이스 AI (프론트엔드)**: 웹캠 얼굴 분석 — TensorFlow.js로 브라우저에서 실행
- **서버 AI (백엔드)**: 강좌 콘텐츠 분석 + RAG 리포트 — Claude API로 서버에서 실행
- 핵심 패키지: @tensorflow/tfjs, @tensorflow-models/face-landmarks-detection, @anthropic-ai/sdk
- 온디바이스 AI는 2단계로 구현: Phase 1 (시뮬레이션) → Phase 2 (실제 모델 연동)
- 강좌 분석 + RAG 리포트는 Phase 1부터 바로 구현

---

## Phase 1: 시뮬레이션 기반 구현 (우선 구현)

AI Hub 모델을 실제로 변환/연동하기 전에, 웹캠 + 시뮬레이션으로 전체 흐름을 먼저 완성한다.

### 1-1. 프론트엔드 패키지 설치

```bash
cd frontend
npm install @tensorflow/tfjs @tensorflow-models/face-landmarks-detection
```

### 1-2. useWebcam.js 구현

```javascript
// 웹캠 접근 및 프레임 캡처
// navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
// <video> 요소에 srcObject 연결
// captureFrame(): canvas에 비디오 프레임 그린 후 ImageData 반환
//
// 에러 처리:
// - 카메라 권한 거부: "카메라 권한이 필요합니다" 메시지
// - 카메라 없음: "카메라를 찾을 수 없습니다" 메시지
// - HTTPS 필요: localhost는 OK, 배포 시 HTTPS 필수
```

### 1-3. useAttentionAnalysis.js — Phase 1 (시뮬레이션 모드)

```javascript
// Phase 1에서는 실제 모델 추론 대신 시뮬레이션 결과를 생성한다.
// 단, 웹캠은 실제로 활성화하여 카메라 권한 요청 + 프레임 캡처까지는 진행.
// 얼굴이 감지되는지 여부는 face-landmarks-detection으로 확인 가능.

// 시뮬레이션 로직:
// 1. 얼굴 감지 여부 확인 (face-landmarks-detection 사용)
//    - 얼굴 감지됨 → 집중 상태(1~3) 위주로 랜덤 생성
//    - 얼굴 감지 안됨 → 비집중/졸음(4~5) 생성
// 2. 시간 경과에 따른 자연스러운 패턴:
//    - 0~10분: 높은 확률로 1~2
//    - 10~20분: 2~3 위주
//    - 20분 이후: 3~4 빈도 증가
//    - 30분 이후: 4~5도 가끔 발생
// 3. 이전 상태와 급격한 변화 방지 (연속성 유지)

// 반환값:
// {
//   currentStatus: 1~5,
//   confidence: 0.7~0.99 (랜덤),
//   records: [{ timestamp, status, confidence }],
//   isModelLoaded: true (시뮬레이션이므로 항상 true),
//   isAnalyzing: boolean,
//   faceDetected: boolean  // 실제 얼굴 감지 여부
// }
```

### 1-4. 얼굴 감지만 실제로 구현

```javascript
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import '@tensorflow/tfjs';

// 모델 로딩 (앱 시작 시 1회)
const model = await faceLandmarksDetection.createDetector(
  faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
  {
    runtime: 'tfjs',
    refineLandmarks: false,  // 성능을 위해 false
    maxFaces: 1              // 1명만 감지
  }
);

// 프레임 분석 (3초 간격)
const faces = await model.estimateFaces(videoElement);
const faceDetected = faces.length > 0;

// faceDetected를 기반으로 시뮬레이션 결과 조절
// → 이것만으로도 "얼굴이 화면에서 벗어나면 비집중 판정"이라는
//   유의미한 AI 기능이 작동함
```

---

## Phase 2: AI Hub 모델 실제 연동 (시간 여유 시)

### 2-1. 모델 변환 (Python 환경 필요, 1회 실행)

```bash
# Python 환경 (로컬 또는 Colab)
pip install tensorflowjs tensorflow

# AI Hub에서 다운받은 best.h5 변환
python -c "
import tensorflow as tf
import tensorflowjs as tfjs

model = tf.keras.models.load_model('best.h5')
tfjs.converters.save_keras_model(model, './tfjs_model/')
"
```

- 변환 결과: model.json + group1-shard*.bin 파일들
- 이 파일들을 frontend/public/model/ 폴더에 배치

### 2-2. 모델 로딩 및 추론

```javascript
import * as tf from '@tensorflow/tfjs';

// 모델 로딩
const model = await tf.loadLayersModel('/model/model.json');

// 추론
// 1. 웹캠 프레임에서 얼굴 영역 크롭 (face-landmarks-detection 결과 사용)
// 2. 얼굴 이미지를 모델 입력 크기로 리사이즈 (640x640 또는 모델 요구 크기)
// 3. 텐서 변환 및 정규화
// 4. model.predict() 실행
// 5. 결과에서 argmax로 5클래스 중 하나 선택

async function classifyAttention(faceImageData) {
  const tensor = tf.browser.fromPixels(faceImageData)
    .resizeBilinear([640, 640])  // 모델 입력 크기 (PLANNING.md의 imgsz: 640 참고)
    .expandDims(0)
    .toFloat()
    .div(255.0);

  const prediction = model.predict(tensor);
  const probabilities = await prediction.data();
  const status = probabilities.indexOf(Math.max(...probabilities)) + 1;
  const confidence = Math.max(...probabilities);

  tensor.dispose();
  prediction.dispose();

  return { status, confidence };
}
```

### 2-3. Phase 2 전환 시 변경점
- useAttentionAnalysis.js에서 시뮬레이션 로직을 실제 추론으로 교체
- 나머지 코드(UI, API, 리포트)는 변경 불필요 (인터페이스 동일)

---

## 3. 얼굴 감지 UX 처리

### 카메라 상태별 UI

| 상태 | AttentionWidget 표시 |
|------|---------------------|
| 카메라 로딩 중 | "카메라 준비 중..." + 스피너 |
| 모델 로딩 중 | "AI 모델 로딩 중..." + 프로그레스 |
| 얼굴 감지됨 + 분석 중 | 현재 상태 아이콘 + 집중률 % |
| 얼굴 감지 안됨 | "얼굴이 감지되지 않습니다" + 경고 아이콘 |
| 카메라 권한 거부 | "카메라 권한이 필요합니다" + 설정 안내 |

### 얼굴 미감지 시 처리
- 3초 간격 분석에서 얼굴이 감지되지 않으면 status=4 (비집중+지루)로 기록
- 연속 5회(15초) 미감지 시 status=5 (졸음)으로 기록
- AttentionWidget에 "화면을 바라봐주세요" 안내 메시지

---

## 4. 성능 고려사항

### TensorFlow.js 최적화
- 모델 로딩: 앱 시작 시 1회만 (React의 useEffect + useRef로 관리)
- 추론 간격: 3초 (3000ms) — 더 줄이면 저사양 기기에서 버벅일 수 있음
- 텐서 메모리 관리: predict 후 반드시 tensor.dispose() 호출
- WebGL 백엔드 우선, 불가 시 WASM 자동 폴백

### 번들 크기
- @tensorflow/tfjs: ~1.5MB (gzip)
- @tensorflow-models/face-landmarks-detection: ~500KB
- 모델 파일 (Phase 2): ~20-30MB (별도 로딩, 번들 미포함)
- 초기 로딩 시간을 고려하여 모델 로딩 중 UI 표시 필수

---

## 5. 파일 위치 정리

```
frontend/src/
├── hooks/
│   ├── useWebcam.js              # 웹캠 훅 (Phase 1부터 실제 구현)
│   └── useAttentionAnalysis.js   # AI 분석 훅 (Phase 1: 시뮬레이션, Phase 2: 실제 모델)
└── public/
    └── model/                    # Phase 2에서 TF.js 모델 파일 배치
        ├── model.json
        └── group1-shard*.bin
```

---

---

## 서버 AI: 강좌 콘텐츠 분석 & RAG 리포트

### 7. 강좌 자막 분석 (사전 처리)

강의 자막 파일(SRT/VTT)을 Claude API로 분석하여 구간별 주제를 추출한다.
데모 강좌 2~3개에 대해 서버 시작 시 또는 수동 트리거로 1회 실행.

```
[자막 파일] → subtitleParser.js (파싱)
  → 타임스탬프 + 텍스트 추출
  → Claude API (claudeService.analyzeLectureContent)
  → 구간별 주제/키워드 JSON
  → lectures.json에 segments 필드로 저장
```

자막 파일은 SRT 포맷 기준:
```
1
00:00:00,000 --> 00:00:03,500
안녕하세요, 오늘은 삼차방정식에 대해 알아보겠습니다.

2
00:00:03,500 --> 00:00:07,000
먼저 지난 시간에 배운 이차방정식을 복습해볼까요?
```

Claude API에 보낼 때는 전체 자막 텍스트를 타임스탬프와 함께 전달.
자막이 없는 강좌는 분석 불가 → 규칙 기반 리포트만 제공.

### 8. RAG 기반 맞춤형 리포트 생성

세션 종료 시 학생의 집중도 데이터와 강좌 콘텐츠 분석 결과를 결합하여
Claude API로 맞춤형 분석 리포트를 생성한다.

```
[세션 종료 시]
  집중도 타임라인 (5분 단위 요약)
  + 탭 이탈 기록
  + 해당 강좌의 segments JSON
  → Claude API (claudeService.generateRagReport)
  → 맞춤형 분석 텍스트 (마크다운)
  → sessions.json에 ragAnalysis 필드로 저장 (캐싱)
```

#### 입력 데이터 예시 (Claude API에 전달)
```json
{
  "lecture": {
    "title": "미적분 기초",
    "segments": [
      { "start": "00:00", "end": "05:30", "topic": "이차방정식 복습" },
      { "start": "05:30", "end": "12:00", "topic": "삼차방정식 개념 도입" },
      { "start": "12:00", "end": "18:00", "topic": "삼차방정식 풀이법" }
    ]
  },
  "attention": {
    "timeline": [
      { "timeSlot": "00:00-05:00", "avgStatus": 1.3 },
      { "timeSlot": "05:00-10:00", "avgStatus": 2.1 },
      { "timeSlot": "10:00-15:00", "avgStatus": 3.5 },
      { "timeSlot": "15:00-20:00", "avgStatus": 4.2 }
    ],
    "avgAttention": 72,
    "sleepCount": 1
  },
  "departures": [
    { "leaveTime": "00:13:20", "returnTime": "00:14:05", "duration": 45 }
  ]
}
```

#### 출력 예시 (Claude API 응답)
```
## 학습 분석 리포트

### 집중도 하락 구간
삼차방정식 풀이법을 설명하는 12:00~18:00 구간에서 집중도가 크게 하락했습니다
(평균 상태 4.2, 비집중+지루). 이전 구간인 삼차방정식 개념 도입(05:30~12:00)에서는
비교적 양호한 집중도(2.1)를 보였으므로, 개념은 이해했으나 풀이 과정에서 어려움을
느낀 것으로 보입니다.

### 탭 이탈 분석
13:20에 약 45초간 다른 화면으로 전환했습니다. 이 시점은 삼차방정식 풀이법
설명 중이며, 내용이 어려워 다른 자료를 찾아본 것일 수 있습니다.

### 학습 조언
1. 조립제법 관련 보충 영상을 추천합니다.
2. 풀이법 구간을 다시 시청하되, 10분 단위로 나누어 학습해보세요.
3. 이차방정식 복습 구간에서의 집중도가 높았으므로, 기초 개념은 잘 잡혀있습니다.
```

### 9. 에러 처리 및 폴백
- Claude API 호출 실패 시 → 규칙 기반 리포트만 제공 (기존 reportGenerator.js)
- API 키 미설정 시 → 서버 시작은 정상, RAG 관련 엔드포인트만 에러 반환
- 응답 시간 초과 (30초) → 타임아웃 후 규칙 기반 폴백
- 이미 생성된 RAG 분석은 캐싱하여 재사용 (동일 세션 재요청 시 API 미호출)

---

## 10. 구현 순서 (권장)

1. @tensorflow/tfjs, @tensorflow-models/face-landmarks-detection 설치 (프론트)
2. useWebcam.js (웹캠 접근 + 프레임 캡처)
3. useAttentionAnalysis.js Phase 1 (얼굴 감지 + 시뮬레이션 분류)
4. useTabVisibility.js (탭 이탈 감지)
5. LecturePage에서 훅 연동 + AttentionWidget 실시간 업데이트
6. 전체 흐름 테스트 (학습 시작 → 분석 → 종료 → 리포트)
7. @anthropic-ai/sdk 설치 (백엔드) + claudeService.js 구현
8. subtitleParser.js + 데모 자막 파일 준비
9. 강좌 사전 분석 실행 + RAG 리포트 생성 연동
10. (시간 여유 시) Phase 2 모델 변환 및 실제 추론 연동
