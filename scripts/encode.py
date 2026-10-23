"""把逐帧截图合成为 H.264 MP4（macOS AVFoundation 编码）

用法：python3 scripts/encode.py <帧目录> <输出.mp4> [fps]
"""
import glob, os, sys
import cv2

frames, out = sys.argv[1], sys.argv[2]
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 30
files = sorted(glob.glob(os.path.join(frames, '*.jpg')))
h, w = cv2.imread(files[0]).shape[:2]
if os.path.exists(out):
    os.remove(out)  # AVFoundation 无法覆盖已存在的文件
vw = cv2.VideoWriter(out, cv2.CAP_AVFOUNDATION, cv2.VideoWriter_fourcc(*'avc1'), fps, (w, h))
for f in files:
    vw.write(cv2.imread(f))
vw.release()
print(f'已写出 {out}：{len(files)} 帧，{len(files) / fps:.1f} 秒')
