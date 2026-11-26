"""Build the receiver hook without a C runtime or Windows SDK dependency."""

import argparse
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


def find_tool(name):
    for candidate in (name, *(f"{name}-{version}" for version in range(22, 16, -1))):
        found = shutil.which(candidate)
        if found:
            return found
    if os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "LLVM" / "bin" / f"{name}.exe"
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError(f"{name} is required to build the Windows input acknowledgement helper")


def verify_machine(path, architecture):
    with path.open("rb") as stream:
        if stream.read(2) != b"MZ":
            raise RuntimeError("The input acknowledgement helper is not a PE image")
        stream.seek(0x3C)
        offset = struct.unpack("<I", stream.read(4))[0]
        stream.seek(offset)
        if stream.read(4) != b"PE\0\0":
            raise RuntimeError("The input acknowledgement helper has no PE signature")
        machine = struct.unpack("<H", stream.read(2))[0]
    expected = 0xAA64 if architecture == "arm64" else 0x8664
    if machine != expected:
        raise RuntimeError(f"Helper machine {machine:#x} does not match {architecture}")


def build(architecture, output):
    source = Path(__file__).resolve().parent
    target = "aarch64-pc-windows-msvc" if architecture == "arm64" else "x86_64-pc-windows-msvc"
    machine = "arm64" if architecture == "arm64" else "i386:x86-64"
    clang, dlltool, linker = (find_tool(name) for name in ("clang", "llvm-dlltool", "lld-link"))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hcu-input-ack-") as directory:
        work = Path(directory)
        libraries = []
        for name in ("kernel32", "user32"):
            library = work / f"{name}.lib"
            subprocess.run([dlltool, "-m", machine, "-d", str(source / f"{name}.def"),
                            "-l", str(library)], check=True)
            libraries.append(str(library))
        object_path = work / "input_ack.obj"
        subprocess.run([clang, f"--target={target}", "-O2", "-ffreestanding",
                        "-fno-builtin", "-fno-stack-protector", "-Wall", "-Wextra", "-Werror",
                        "-c", str(source / "input_ack.c"), "-o", str(object_path)], check=True)
        subprocess.run([linker, "/dll", "/entry:DllMain", "/nodefaultlib", "/timestamp:0",
                        "/machine:" + ("arm64" if architecture == "arm64" else "x64"),
                        "/section:.hcu,RWS", "/out:" + str(output),
                        "/implib:" + str(work / "input_ack.lib"), str(object_path), *libraries],
                       check=True)
    verify_machine(output, architecture)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--architecture", choices=("amd64", "arm64"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.architecture, args.output.resolve())


if __name__ == "__main__":
    main()
