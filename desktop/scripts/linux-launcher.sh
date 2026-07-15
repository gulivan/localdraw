#!/bin/sh
set -eu

bin_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export LD_LIBRARY_PATH="$bin_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$bin_dir/launcher-bin" "$@"
