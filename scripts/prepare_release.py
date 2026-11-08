#!/usr/bin/env python3
"""GitHub Actions only: prepare a versioned Android build and one signing secret."""
import base64
import json
import os
from pathlib import Path
import re

version = os.environ.get('NHAC_RELEASE_VERSION', '').strip()
repo_slug = os.environ.get('GITHUB_REPOSITORY', '').strip()
encoded_bundle = os.environ.get('NHAC_SIGNING_BUNDLE', '').strip()
if not re.fullmatch(r'(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})', version):
    raise SystemExit('Phiên bản phải có dạng 1.0.1, 1.0.2, 1.1.0 (mỗi phần < 1000).')
if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo_slug):
    raise SystemExit('Không xác định được GitHub repository.')
if not encoded_bundle:
    raise SystemExit('Chưa có GitHub Secret NHAC_SIGNING_BUNDLE. Xem README mục Thiết lập một lần.')
try:
    bundle = json.loads(base64.b64decode(encoded_bundle, validate=True).decode('utf-8'))
    key_bytes = base64.b64decode(bundle['keystoreBase64'], validate=True)
    password = bundle['storePassword']
    alias = bundle['keyAlias']
    key_password = bundle['keyPassword']
    if (not 256 < len(key_bytes) < 1_000_000
        or any(not isinstance(v, str) or not 8 <= len(v) <= 200 or '\n' in v for v in (password, key_password))
        or not isinstance(alias, str) or not 1 <= len(alias) <= 100 or '\n' in alias):
        raise ValueError('Signing bundle invalid')
except (ValueError, KeyError, TypeError, UnicodeError) as error:
    raise SystemExit('NHAC_SIGNING_BUNDLE không đúng định dạng. Hãy tạo lại bằng script trong repo.') from error

major, minor, patch = map(int, version.split('.'))
version_code = major * 1_000_000 + minor * 1_000 + patch
build_file = Path('app/build.gradle')
gradle = build_file.read_text(encoding='utf-8')
gradle, code_count = re.subn(r'\bversionCode\s+\d+', 'versionCode ' + str(version_code), gradle)
gradle, name_count = re.subn(r"\bversionName\s+'[^']+'", "versionName '" + version + "'", gradle)
if code_count != 1 or name_count != 1:
    raise SystemExit('Không thể cập nhật số phiên bản trong app/build.gradle.')
build_file.write_text(gradle, encoding='utf-8')

config_file = Path('app/src/main/assets/www/app-config.json')
config = json.loads(config_file.read_text(encoding='utf-8'))
config.update(version=version, githubOwner=repo_slug.split('/')[0], githubRepo=repo_slug.split('/')[1])
config_file.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

runner_temp = Path(os.environ.get('RUNNER_TEMP', '/tmp'))
key_path = runner_temp / 'nhac-app-signing.p12'
key_path.write_bytes(key_bytes)
key_path.chmod(0o600)
github_env = os.environ.get('GITHUB_ENV')
if not github_env:
    raise SystemExit('Script này chỉ chạy trong GitHub Actions.')
for secret in (password, alias, key_password):
    print('::add-mask::' + secret)
with open(github_env, 'a', encoding='utf-8') as env:
    env.write(f'NHAC_KEYSTORE_FILE={key_path}\n')
    env.write(f'NHAC_KEYSTORE_PASSWORD={password}\n')
    env.write(f'NHAC_KEY_ALIAS={alias}\n')
    env.write(f'NHAC_KEY_PASSWORD={key_password}\n')
    env.write(f'RELEASE_VERSION={version}\n')
print(f'Đã cấu hình build Nhac {version} — GitHub Releases: {repo_slug} (không in khóa).')
