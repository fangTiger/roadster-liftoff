#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || -z "$1" || "$1" == -* ]]; then
 echo "用法：deploy/rooms/deploy.sh <ssh目标> [ssh参数...]" >&2
 exit 2
fi
target=$1
shift
ssh_args=("$@")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/../.." && pwd)
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT

for source in "$repo_dir"/server/rooms/*.js; do
 [[ "$source" == *.test.mjs || "$source" == *.test.js ]] && continue
 cp -- "$source" "$staging/"
done
cp -- "$script_dir/package.json" "$staging/package.json"
if [[ -f "$script_dir/package-lock.json" ]]; then
 cp -- "$script_dir/package-lock.json" "$staging/package-lock.json"
else
 (cd -- "$staging" && npm install --package-lock-only --ignore-scripts --omit=dev --no-audit --no-fund)
fi

# SSH 身份由调用者的配置或附加参数提供；临时包不含本地配置与测试。
remote_dir=$(ssh "${ssh_args[@]}" -- "$target" 'mktemp -d /tmp/mars-roadster-rooms.XXXXXXXXXX')
if [[ ! "$remote_dir" =~ ^/tmp/mars-roadster-rooms\.[a-zA-Z0-9]+$ ]]; then
 echo '远端临时目录无效' >&2
 exit 1
fi
printf -v remote_shell '%q ' ssh "${ssh_args[@]}"
rsync -az --delete -e "$remote_shell" -- "$staging/" "$target:$remote_dir/"
ssh "${ssh_args[@]}" -- "$target" bash -s -- "$remote_dir" <<'REMOTE'
set -euo pipefail
staging=$1
trap 'rm -rf -- "$staging"' EXIT
sudo rsync -a --delete --exclude=node_modules --chown=roadster:roadster "$staging/" /opt/mars-roadster-rooms/
sudo -u roadster bash -c 'cd /opt/mars-roadster-rooms && npm ci --omit=dev --cache /opt/mars-roadster-rooms/.npm-cache --no-audit --no-fund'
sudo systemctl restart mars-roadster-rooms
# systemd 启动与监听就绪之间可能存在短暂间隔。
for attempt in {1..10}; do
 if curl -fsS http://127.0.0.1:8933/healthz; then
  printf '\n房间服务部署完成\n'
  exit 0
 fi
 sleep 1
done
echo '房间服务健康检查失败' >&2
exit 1
REMOTE
