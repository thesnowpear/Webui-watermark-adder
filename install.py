import os
import sys

# 安装依赖
requirements = [
    "pillow>=9.0.0",
]

def install():
    """安装扩展所需的依赖"""
    for package in requirements:
        print(f"Installing {package}...")
        os.system(f"{sys.executable} -m pip install {package}")

    print("Watermark Adder extension dependencies installed successfully!")

if __name__ == "__main__":
    install()
