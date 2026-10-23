#!/usr/bin/env python3
"""Native macOS production worker installer. Planning never mutates the machine."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import uuid

LABEL = 'com.cak.studio-production'
HERE = Path(__file__).resolve().parent


def host_id():
    if platform.system() == 'Darwin':
        identity = subprocess.check_output(['/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'], text=True)
        match = re.search(r'"IOPlatformUUID"\s*=\s*"([^"]+)"', identity)
        if not match:
            raise ValueError('Mac 식별을 확인할 수 없어 설치하지 않았습니다.')
        return hashlib.sha256(match[1].encode()).hexdigest()
    return hashlib.sha256(f'{platform.node()}:{uuid.getnode()}'.encode()).hexdigest()


def verify_bundle(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('format') != 1 or not manifest.get('files'):
        raise ValueError('패키지 형식이 올바르지 않습니다.')
    if not re.fullmatch('[0-9a-f]{40}', manifest.get('revision', '')):
        raise ValueError('패키지 소스 버전이 올바르지 않습니다.')
    for name, digest in manifest['files'].items():
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts:
            raise ValueError('패키지 경로가 올바르지 않습니다.')
        target = root / name
        if target.is_symlink() or not target.resolve().is_relative_to(root):
            raise ValueError('패키지에 링크를 사용할 수 없습니다.')
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('패키지가 변경됐습니다: ' + name)
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p != root / 'manifest.json' and '__pycache__' not in p.parts and p.name != '.DS_Store'}
    if actual != set(manifest['files']):
        raise ValueError('패키지에 미등록 파일이 있습니다.')
    return manifest


def prepare_check(root=HERE, home=None):
    if platform.system() != 'Darwin':
        raise ValueError('Mac 전용 설치입니다.')
    manifest = verify_bundle(root)
    if manifest.get('sourceHost') == host_id():
        raise ValueError('이 패키지를 만든 회사 Mac에는 설치하지 않습니다. 새 개인 Mac으로 옮겨 실행하세요.')
    if int(platform.mac_ver()[0].split('.')[0]) < 14:
        raise ValueError('자동 설치 지원 범위는 macOS 14 이상입니다.')
    home = Path(home or Path.home())
    if (home / 'Library/LaunchAgents' / (LABEL + '.plist')).exists():
        raise ValueError('기존 제작 워커가 있습니다. 덮어쓰지 않았습니다. 기존 작업·설정부터 확인하세요.')
    if shutil.disk_usage(home).free < 20 * 1024**3:
        raise ValueError('설치·렌더에 사용할 여유 공간을 20GiB 이상 확보하세요.')
    return manifest


def validate_key(path):
    p = Path(path)
    if p.is_symlink() or not p.is_file():
        raise ValueError('일반 파일 형태의 워커 인증키가 필요합니다.')
    value = json.loads(p.read_text())
    if value.get('kty') != 'OKP' or value.get('crv') != 'Ed25519':
        raise ValueError('워커 인증키 형식이 다릅니다.')
    for field in ('d', 'x'):
        text = value.get(field, '')
        if not isinstance(text, str) or len(base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))) != 32:
            raise ValueError('워커 인증키 형식이 다릅니다.')
    return p.read_bytes()


def config_path(home):
    return home / 'Library/Application Support/Shopshorts/mac-worker.json'


def service_config(source, node, python, work, home, brew_bin):
    private = home / 'Library/Application Support/Shopshorts/private-tmp'
    # OAuth caches must never be written into iCloud. Bulk render files use workDir.
    env = {'HOME': str(home), 'PATH': f'{Path(node).parent}:{brew_bin}:/usr/bin:/bin:/usr/sbin:/sbin',
           'CAK_RUNNER_KEY_FILE': str(home / 'Library/Application Support/Shopshorts/credential-runner.jwk'),
           'SHOPSHORTS_WORK_DIR': str(work), 'SHOPSHORTS_MOTION_NODE': str(node),
           'SHOPSHORTS_ALIGNMENT_PYTHON': str(python), 'SHOPSHORTS_WHISPER_MODEL': 'small',
           'SHOPSHORTS_WHISPER_CACHE': str(work / 'whisper-models'),
           'SHOPSHORTS_BLENDER_BIN': '/Applications/Blender.app/Contents/MacOS/Blender',
           'TMPDIR': str(private), 'TMP': str(private), 'TEMP': str(private)}
    return {'Label': LABEL, 'ProgramArguments': [str(node), str(source / 'apps/shopshorts/studio-service.mjs')],
            'WorkingDirectory': str(source), 'RunAtLoad': True, 'KeepAlive': True, 'ExitTimeOut': 3600,
            'ThrottleInterval': 15, 'StandardOutPath': str(work / 'logs/production.log'),
            'StandardErrorPath': str(work / 'logs/production.log'), 'EnvironmentVariables': env}


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, **kwargs)


def doctor(config, home, command=run):
    env = {**os.environ, **config['EnvironmentVariables']}
    command([config['ProgramArguments'][0], '-e', "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"], env=env)
    for binary in ('ffmpeg', 'ffprobe'):
        command([binary, '-version'], env=env, stdout=subprocess.DEVNULL)
    command([env['SHOPSHORTS_ALIGNMENT_PYTHON'], '-c', 'import whisper, torch'], env=env)
    command([env['SHOPSHORTS_BLENDER_BIN'], '-b', '--factory-startup', '--python-exit-code', '1', '--python-expr',
             "import bpy; assert bpy.app.version >= (4,2,0); assert bpy.app.build_options.cycles"], env=env, stdout=subprocess.DEVNULL)
    command([config['ProgramArguments'][0], str(HERE / 'check-connection.mjs'), config['WorkingDirectory'], env['CAK_RUNNER_KEY_FILE']], env=env)
    print('제작 환경 점검 완료. 워커는 시작하지 않았습니다.')


def install(args):
    home = Path.home()
    manifest = prepare_check()
    if not args.apply:
        print('설치 계획: Node 22 · FFmpeg · Blender/Cycles · Whisper → 인증 점검. 적용하지 않았습니다.')
        return
    if not args.node or not args.python:
        raise ValueError('Install.command로 실행하거나 Node·Python 경로를 지정하세요.')
    node, python = Path(args.node).resolve(), Path(args.python).resolve()
    if not node.is_file() or not python.is_file():
        raise ValueError('Node와 Python 경로를 확인하세요.')
    key_target = home / 'Library/Application Support/Shopshorts/credential-runner.jwk'
    if not key_target.exists():
        selected = subprocess.check_output(['/usr/bin/osascript', '-e', 'POSIX path of (choose file with prompt "안전하게 옮긴 Shopshorts 워커 인증키 파일을 선택하세요. 키를 채팅에 붙여넣지 마세요.")'], text=True).strip()
        key_bytes = validate_key(selected)
        key_target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with key_target.open('xb') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(key_bytes)
    validate_key(key_target)
    if stat.S_IMODE(key_target.stat().st_mode) & 0o077:
        raise ValueError('기존 인증키 권한은 0600이어야 합니다. 자동 변경하지 않았습니다.')
    source = home / 'workSpace/shopshorts-worker' / manifest['revision']
    if source.exists():
        # Resume only our exact source, never overwrite modified files.
        for name, digest in manifest['files'].items():
            if name.startswith('source/'):
                p = source / name[7:]
                if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
                    raise ValueError('설치 폴더의 변경 파일을 보존했습니다. 다른 설치 폴더가 필요합니다.')
    else:
        source.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(HERE / 'source', source, symlinks=False)
    work = home / 'Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/mac-worker'
    for p in (work / 'logs', key_target.parent / 'private-tmp'):
        p.mkdir(parents=True, exist_ok=True, mode=0o700)
    venv = key_target.parent / 'worker-venv'
    if not venv.exists():
        run([python, '-m', 'venv', venv])
    align = venv / 'bin/python'
    run([align, '-m', 'pip', 'install', 'openai-whisper==20250625', 'numpy<2'])
    run([align, '-c', "import sys, whisper; whisper.load_model('small', device='cpu', download_root=sys.argv[1])", work / 'whisper-models'])
    run([node.parent / 'npm', 'ci', '--include-workspace-root',
         '--workspace=@cak/app-shopshorts', '--workspace=@cak/tts-narration',
         '--workspace=@cak/shopping-shorts', '--workspace=@cak/youtube-upload', '--workspace=@cak/shorts-publish'], cwd=source)
    config = service_config(source, node, align, work, home, str(Path(shutil.which('ffmpeg')).parent))
    config_path(home).write_text(json.dumps(config, indent=2) + '\n')
    config_path(home).chmod(0o600)
    doctor(config, home)
    print('설치·연결 점검 완료. 기존 Mac 워커를 중지한 뒤 Start.command를 실행하세요. 자동 시작하지 않았습니다.')


def manage(action):
    home = Path.home()
    config = json.loads(config_path(home).read_text())
    target = f'gui/{os.getuid()}/{LABEL}'
    if action == 'doctor':
        doctor(config, home)
    elif action == 'start':
        run(['/usr/bin/osascript', '-e', 'display dialog "기존 Mac 제작 워커를 중지했고 실행 중인 작업이 없나요? 이 Mac이 운영 제작 요청을 처리하기 시작합니다." buttons {"취소", "시작"} default button "취소" cancel button "취소"'])
        existing = subprocess.run(['launchctl', 'print', target], capture_output=True)
        if existing.returncode == 0:
            raise ValueError('이미 실행 중입니다. 중복 실행하지 않았습니다.')
        doctor(config, home)
        dest = home / 'Library/LaunchAgents' / (LABEL + '.plist')
        if dest.exists():
            if plistlib.loads(dest.read_bytes()) != config:
                raise ValueError('기존 자동 실행 설정을 보존했습니다. 수동 검토가 필요합니다.')
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('xb') as f:
                os.fchmod(f.fileno(), 0o600)
                f.write(plistlib.dumps(config))
        run(['plutil', '-lint', dest])
        run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', dest])
        run(['launchctl', 'print', target])
        print('워커를 시작했습니다. Shopshorts 화면의 연결 상태와 시험 제작 결과를 확인하세요.')
    elif action == 'stop':
        run(['/usr/bin/osascript', '-e', 'display dialog "실행 중인 제작이 끝난 뒤 중지하세요. 중간에 중지하면 작업 상태 확인이 필요합니다." buttons {"취소", "중지"} default button "취소" cancel button "취소"'])
        run(['launchctl', 'bootout', target])
        print('이 Mac 워커 중지. 인증·미디어·중간 파일은 보존했습니다.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare-check', 'install', 'doctor', 'start', 'stop'])
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--node')
    parser.add_argument('--python')
    args = parser.parse_args()
    try:
        if args.action == 'prepare-check':
            prepare_check()
        elif args.action == 'install':
            install(args)
        else:
            manage(args.action)
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError) as error:
        # Never echo credential contents or subprocess commands containing user selections.
        print(str(error) if isinstance(error, ValueError) else '작업에 실패했습니다. 설치 단계와 연결 환경을 확인하세요. 기존 파일은 보존했습니다.', file=sys.stderr)
        sys.exit(1)
