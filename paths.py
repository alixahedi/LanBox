import os
import sys


def bundle_dir():
    return os.path.dirname(os.path.abspath(__file__))


def web_dir():
    return os.path.join(bundle_dir(), "web")


def files_dir():
    path = os.path.join(bundle_dir(), "files")
    os.makedirs(path, exist_ok=True)
    return path


def data_dir():
    path = os.path.join(bundle_dir(), "data")
    os.makedirs(path, exist_ok=True)
    return path
