import os
import json

import numpy as np
import pandas as pd
import tensorflow as tf

from tqdm import tqdm
from keras.layers import Input, Dropout, Dense, GlobalAveragePooling2D, BatchNormalization, Activation
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, TensorBoard
from tensorflow.keras.models import Model
from tensorflow.keras.applications import MobileNetV3Large
from tensorflow.keras.applications.mobilenet_v3 import preprocess_input
from keras.losses import CategoricalCrossentropy
from keras.metrics import Recall, Precision


class Mobilenet:
    def __init__(self):
        self.config = {
            'IMG_SIZE': (224, 224, 3),
            'EPOCHS':300,
            'LEARNING_RATE':1e-4,
            'BATCH_SIZE':256,
            'SEED':41,
            'N_CLASS': 5
        }
        

    def load_data(self, root_dir):
        data_format = {'.jpg':[], '.json':[]}
        for root, _, files in os.walk(root_dir):
            for file in files:
                if 'ipynb' in root: continue
                path = os.path.join(root, file)
                cls_cd = int(root.split('/')[-1][-1])-1
                user_id = root.split('/')[-2]
                first, last = os.path.splitext(file)
                idx = int(first.split('_')[-1])
                data_format[last].append((user_id, cls_cd, idx, path))
        
        df_image = pd.DataFrame(data_format['.jpg'], columns=['USER_ID', 'CLS_CD', 'idx', 'path'])
        df_json = pd.DataFrame(data_format['.json'], columns=['USER_ID', 'CLS_CD', 'idx', 'path'])
        df = pd.merge(df_image, df_json, on=["USER_ID", 'CLS_CD', "idx"], how="inner")
        df.columns = ['USER_ID', 'CLS_CD', 'idx', 'image_path', 'json_path']
        return df



    def json_parsing(self, df):
        def get_bBox(json_path):
            with open(json_path, 'r') as f:
                jsonData = json.load(f)
            try:
                bBox = jsonData['bounding_box']
            except:
                bBox = jsonData['이미지']['face_box']
            return bBox
        
        bBox = []
        for jsonPath in tqdm(df['json_path'].values, total=len(df)):
            bBox.append(get_bBox(jsonPath))
        df['bBox'] = bBox
        df = df.drop('idx', axis=1)

        df['begin'] = df['bBox'].apply(lambda x: [x[0][1], x[0][0], 0])
        df['size'] = df['bBox'].apply(lambda x: [x[1][1]-x[0][1], x[1][0]-x[0][0], 3])
        df = df.drop(columns=['json_path', 'bBox'])
        return df

    
    def data_split(self, df):
        # 벨텍에서 train, valid, test 유저 정보 전달
        # 전달 받은 유저ID 기준으로 데이터셋 분할 예정
        tot = df['USER_ID'].nunique()
        valid_ratio = int(tot*0.1)
        test_ratio = int(tot*0.1)
        train_ratio = tot-valid_ratio-test_ratio

        np.random.seed(self.config['SEED'])
        src_idx = np.array(range(tot))
        valid_idx = np.random.choice(src_idx, valid_ratio, replace=False)

        remain = np.setdiff1d(src_idx, valid_idx)
        test_idx = np.random.choice(remain, test_ratio, replace=False)

        train_idx = np.setdiff1d(src_idx, np.concatenate([valid_idx, test_idx]))

        userList = df['USER_ID'].unique()
        train = [userList[i] for i in train_idx]
        valid = [userList[i] for i in valid_idx]
        test = [userList[i] for i in test_idx]

        self.df_train = df[df['USER_ID'].isin(train)].sample(frac=1, random_state=self.config['SEED']).reset_index(drop=True)
        self.df_valid = df[df['USER_ID'].isin(valid)].sample(frac=1, random_state=self.config['SEED']).reset_index(drop=True)


    def preprocessing(self, path, begin, size, label, isTrain=False):
        label = tf.one_hot(label, 5)
        
        bin = tf.io.read_file(path)
        image = tf.io.decode_jpeg(bin, channels=3)
        
        # 슬라이싱 실행
        image = tf.slice(image, 
                        begin, 
                        size)
        image = tf.image.resize(image, (224, 224))
        
        if isTrain:
            image = tf.image.random_flip_left_right(image)
            image = tf.image.random_brightness(image, max_delta=0.05)
            image = tf.image.random_contrast(image, lower=0.9, upper=1.1)
            image = tf.image.random_saturation(image, lower=0.9, upper=1.1)
            image = tf.image.random_hue(image, max_delta=0.05)

        image = tf.squeeze(image)
        return image, label


    def generator_train(self):
        for item in self.df_train.values:
            # image_path, begin, size, label
            yield item[2], item[3], item[4], item[1]


    def generator_valid(self):
        for item in self.df_valid.values:
            # image_path, begin, size, label
            yield item[2], item[3], item[4], item[1]


    def generate_dataset(self):
        dataset_train = tf.data.Dataset.from_generator(
            self.generator_train,
            (tf.string, tf.int32, tf.int32, tf.int32),
            ((), (3,), (3,), ())
            )

        dataset_valid = tf.data.Dataset.from_generator(
            self.generator_valid,
            (tf.string, tf.int32, tf.int32, tf.int32),
            ((), (3,), (3,), ())
            )
        dt = dataset_train.map(lambda *x:self.preprocessing(*x, True), 
                            num_parallel_calls=tf.data.experimental.AUTOTUNE)
        dt = dt.batch(self.config['BATCH_SIZE']).prefetch(10)
        dv = dataset_valid.map(self.preprocessing, 
                            num_parallel_calls=tf.data.experimental.AUTOTUNE)
        dv = dv.batch(self.config['BATCH_SIZE']).prefetch(10)
        return dt, dv


    def get_model(self):
        def fc_blocks(x, channels):
            x = Dense(channels)(x)
            x = BatchNormalization()(x)
            x = Activation('relu')(x)
            x = Dropout(0.2)(x)
            return x
        backbone = MobileNetV3Large(include_top=False, 
                        input_shape=self.config['IMG_SIZE'],
                        weights='imagenet')
        
        input = Input(shape=self.config['IMG_SIZE'], dtype=tf.float32)
        
        x = preprocess_input(input)
        x = backbone(x)
        x = GlobalAveragePooling2D()(x)
        
        x = fc_blocks(x, 128)
        x = fc_blocks(x, 32)
        
        output = Dense(5, activation='softmax')(x)
        model = Model(inputs=input, outputs=output)        
        return backbone, model


    def train(self, backbone, model, dt, dv):
        backbone.trainable = False
        es = EarlyStopping(monitor='val_loss', 
                        patience=10)
        mc = ModelCheckpoint('/app/train/Mobilenet/pre_best.h5', 
                            monitor='val_loss', 
                            mode='min', 
                            verbose=1, 
                            save_best_only=True)
        
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=self.config['LEARNING_RATE']), 
                    loss=[CategoricalCrossentropy(from_logits=False)], 
                    metrics=[Recall(), Precision()])
        model.fit(dt, epochs=self.config['EPOCHS']//3, validation_data=dv, callbacks=[es, mc])
        model.save(f'/app/train/Mobilenet/pre_last.h5')
        pre_result = model.evaluate(dtest)

        backbone.trainable = True
        es = EarlyStopping(monitor='val_loss', 
                        patience=10)
        mc = ModelCheckpoint(f'/app/train/Mobilenet/best.h5', 
                            monitor='val_loss', 
                            mode='min', 
                            verbose=1, 
                            save_best_only=True)
        
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=self.config['LEARNING_RATE']), 
                    loss=[CategoricalCrossentropy(from_logits=False)], 
                    metrics=[Recall(), Precision()])
        model.fit(dt, epochs=self.config['EPOCHS'], validation_data=dv, callbacks=[es, mc])
        model.save(f'/app/train/Mobilenet/last.h5')



if __name__=="__main__":
    print('\n\n\n')
    print('동영상 데이터 학습 태도 및 감정 판별 성능 모델 학습')
    pred = Mobilenet()

    # 데이터 로드
    print('전체 데이터 로드')
    df = pred.load_data('/app/data/Mobilenet_data')
    print('전체 데이터 수:', len(df), '\n')

    # json 파싱
    print('학습, 검증 데이터 추출')
    df = pred.json_parsing(df)
    pred.data_split(df)
    print(f'학습 데이터 수: {len(pred.df_train)}, 검증 데이터 수: {len(pred.df_valid)}', '\n')
    dt, dv = pred.generate_dataset()
    
    print('학습 시작')
    backbone, model = pred.get_model()
    pred.train(backbone, model, dt, dv)