#!/usr/bin/env bash
# Generate one permanent Android signing key, stored OUTSIDE the repo.
set -euo pipefail
command -v keytool >/dev/null || { echo 'Can cai Java JDK 17 (keytool)'; exit 1; }
command -v python3 >/dev/null || { echo 'Can cai Python 3'; exit 1; }
command -v openssl >/dev/null || { echo 'Can cai OpenSSL'; exit 1; }
DIR="$HOME/NHAC-KHOA-KY"
mkdir -p "$DIR"
chmod 700 "$DIR"
if [[ -e "$DIR/nhac-release.p12" || -e "$DIR/NHAC_SIGNING_BUNDLE.txt" ]]; then
  echo "Da co khoa ky $DIR. KHONG tao lai: can giu khoa cu de cap nhat APK."; exit 1
fi
PASS="$(openssl rand -base64 36 | tr -d '\n')"
keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$DIR/nhac-release.p12" \
  -alias nhac -keyalg RSA -keysize 3072 -validity 10000 \
  -dname 'CN=Nhac Offline, OU=Personal, O=Nhac, C=VN' -storepass "$PASS" -keypass "$PASS"
NHAC_PASS="$PASS" NHAC_DIR="$DIR" python3 - <<'PY'
import base64, json, os
from pathlib import Path
p=Path(os.environ['NHAC_DIR'])
bundle={'keystoreBase64':base64.b64encode((p/'nhac-release.p12').read_bytes()).decode(),
        'storePassword':os.environ['NHAC_PASS'],'keyAlias':'nhac','keyPassword':os.environ['NHAC_PASS']}
secret=base64.b64encode(json.dumps(bundle,separators=(',',':')).encode()).decode()
(p/'NHAC_SIGNING_BUNDLE.txt').write_text(secret,encoding='utf-8')
(p/'NHAC_SIGNING_BUNDLE.txt').chmod(0o600)
PY
printf '\nDA TAO KHOA KY trong: %s\n' "$DIR"
echo 'GitHub > Settings > Secrets and variables > Actions > New repository secret'
echo 'Name: NHAC_SIGNING_BUNDLE'
echo 'Value: copy toan bo noi dung NHAC_SIGNING_BUNDLE.txt vao GitHub va Save.'
echo 'GIU BI MAT, KHONG upload file khoa ky vao repository.'
