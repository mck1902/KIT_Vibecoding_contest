"""
EduWatch 모델 검증 스크립트
- 학습된 모델인지 확인 (optimizer 상태, 가중치 분포)
- 모델 구조 출력 (입력/출력 shape, 레이어 수)
- 가중치 통계 분석 (초기화 vs 학습된 가중치 판별)
"""

import os
import numpy as np
import h5py

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

models = {
    'Mobilenet': os.path.join(ROOT, 'pretrained_model', '2.AI학습모델파일', 'Mobilenet_model', 'Mobilenet_model.h5'),
    'Multimodal': os.path.join(ROOT, 'pretrained_model', '2.AI학습모델파일', 'Multimodal_model', 'Multimodal_model.h5'),
}

def print_separator(title):
    print(f'\n{"="*60}')
    print(f'  {title}')
    print(f'{"="*60}')

def check_model(name, path):
    print_separator(name)

    if not os.path.exists(path):
        print(f'  [ERROR] 파일 없음: {path}')
        return

    size_mb = os.path.getsize(path) / 1024 / 1024
    print(f'\n  파일 크기: {size_mb:.1f} MB')

    f = h5py.File(path, 'r')

    # 1. 최상위 구조
    print(f'\n[1] 최상위 구조')
    print(f'  키: {list(f.keys())}')

    # 2. Optimizer 존재 여부 (학습 증거)
    print(f'\n[2] 학습 증거')
    has_optimizer = 'optimizer_weights' in f
    print(f'  optimizer_weights 존재: {"YES (학습됨)" if has_optimizer else "NO (미학습 가능성)"}')

    # 3. Training config
    if 'training_config' in f.attrs:
        import json
        config = json.loads(f.attrs['training_config'])
        print(f'\n[3] 학습 설정')
        print(f'  Loss: {config["loss"][0]["class_name"]}')
        opt = config['optimizer_config']
        print(f'  Optimizer: {opt["class_name"]} (lr={opt["config"]["learning_rate"]:.6f})')
        metrics = [m['class_name'] for m in config['metrics'][0]]
        print(f'  Metrics: {", ".join(metrics)}')
    else:
        print(f'\n[3] 학습 설정: 없음')

    # 4. 모델 구조 (input/output shape)
    print(f'\n[4] 모델 구조')
    if 'model_weights' in f:
        attrs = f['model_weights'].attrs
        if 'layer_names' in attrs:
            layer_names = [n.decode('utf-8') if isinstance(n, bytes) else n for n in attrs['layer_names']]
            print(f'  총 레이어 수: {len(layer_names)}')
            print(f'  첫 5개 레이어: {layer_names[:5]}')
            print(f'  마지막 3개 레이어: {layer_names[-3:]}')

    # 5. 가중치 통계 (레이어별)
    print(f'\n[5] 가중치 분포 분석')
    print(f'  {"레이어":<45} {"Shape":<25} {"Mean":>10} {"Std":>10} {"Min":>10} {"Max":>10}')
    print(f'  {"-"*110}')

    weight_stats = []

    def collect_weights(group, path=''):
        for key in group.keys():
            full = f'{path}/{key}'
            item = group[key]
            if isinstance(item, h5py.Dataset) and item.shape and len(item.shape) >= 1:
                data = np.array(item)
                if 'kernel' in key or 'bias' in key:
                    weight_stats.append({
                        'name': full,
                        'shape': data.shape,
                        'mean': data.mean(),
                        'std': data.std(),
                        'min': data.min(),
                        'max': data.max(),
                        'size': data.size,
                    })
            elif isinstance(item, h5py.Group):
                collect_weights(item, full)

    if 'model_weights' in f:
        collect_weights(f['model_weights'])

    # Dense 레이어와 주요 Conv 레이어만 출력 (너무 많으면 잘라냄)
    important = [w for w in weight_stats if 'dense' in w['name'].lower() or 'Conv/' in w['name'] or 'Conv_1/' in w['name']]
    others = [w for w in weight_stats if w not in important]

    for w in important:
        short_name = w['name'].split('model_weights/')[-1]
        print(f'  {short_name:<45} {str(w["shape"]):<25} {w["mean"]:>10.6f} {w["std"]:>10.6f} {w["min"]:>10.4f} {w["max"]:>10.4f}')

    if others:
        print(f'\n  ... 외 {len(others)}개 레이어 (요약)')
        all_stds = [w['std'] for w in weight_stats]
        print(f'  전체 Std 범위: [{min(all_stds):.6f} ~ {max(all_stds):.6f}]')
        print(f'  전체 가중치 개수: {sum(w["size"] for w in weight_stats):,}개')

    # 6. 학습 판정
    print(f'\n[6] 판정')
    reasons = []
    if has_optimizer:
        reasons.append('optimizer 상태 저장됨')
    if 'training_config' in f.attrs:
        reasons.append('학습 설정 존재')
    std_values = [w['std'] for w in weight_stats]
    if std_values and (max(std_values) / (min(std_values) + 1e-10)) > 10:
        reasons.append(f'레이어별 std 편차 큼 (비율: {max(std_values)/(min(std_values)+1e-10):.1f}x) → 학습된 가중치 패턴')

    if len(reasons) >= 2:
        print(f'  결과: PRETRAINED (학습 완료된 모델)')
    elif len(reasons) == 1:
        print(f'  결과: 학습되었을 가능성 높음')
    else:
        print(f'  결과: 학습 여부 불확실')

    for r in reasons:
        print(f'    - {r}')

    f.close()

if __name__ == '__main__':
    for name, path in models.items():
        check_model(name, path)
    print(f'\n{"="*60}')
    print('  검증 완료')
    print(f'{"="*60}')
