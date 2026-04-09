import os
import tensorflow as tf
import tensorflowjs as tfjs

# 스크립트 위치 기준으로 프로젝트 루트 경로 계산
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

model_path = os.path.join(ROOT, 'pretrained_model', '2.AI학습모델파일', 'Mobilenet_model', 'Mobilenet_model.h5')
output_path = os.path.join(ROOT, 'frontend', 'public', 'models', 'mobilenet')

# 출력 폴더 없으면 생성
os.makedirs(output_path, exist_ok=True)

model = tf.keras.models.load_model(model_path)
model.summary()

tfjs.converters.save_keras_model(model, output_path)
print(f'\n변환 완료: {output_path}')
