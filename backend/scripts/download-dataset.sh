#!/bin/sh
set -eu

: "${DATASET_URL:?DATASET_URL is required}"
: "${DATASET_STORAGE_DIR:=/app/data/datasets}"
: "${WGET_PROGRESS:=dot:mega}"

complete_marker="$DATASET_STORAGE_DIR/.download-complete"
lock_dir="$DATASET_STORAGE_DIR/.download.lock"
dataset_id="$(printf '%s' "$DATASET_URL" | sed 's/[?#].*$//; s:/*$::; s:.*/::')"

[ -n "$dataset_id" ] || {
    echo "Could not derive dataset id from DATASET_URL=$DATASET_URL" >&2
    exit 1
}

work_dir=""
marker_tmp=""
lock_acquired=false

cleanup() {
    [ -z "$work_dir" ] || rm -rf "$work_dir"
    [ -z "$marker_tmp" ] || rm -f "$marker_tmp"
    [ "$lock_acquired" != "true" ] || rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

dataset_count() {
    find "$DATASET_STORAGE_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.download.*' | wc -l | tr -d ' '
}

dataset_ready() {
    [ -f "$complete_marker" ] \
        && tr -d '\r' < "$complete_marker" | grep -Fxq "$dataset_id" \
        && find "$DATASET_STORAGE_DIR" -mindepth 2 -maxdepth 2 -type f -name dataset_description.json | grep -q .
}

skip_if_ready() {
    if dataset_ready; then
        echo "Dataset $dataset_id already present ($(dataset_count) BIDS dataset(s)); skipping download."
        exit 0
    fi
}

write_complete_marker() {
    marker_tmp="$complete_marker.tmp.$$"
    {
        [ ! -f "$complete_marker" ] || tr -d '\r' < "$complete_marker" | awk 'NF && $0 !~ /\// { print }'
        printf '%s\n' "$dataset_id"
    } | awk '!seen[$0]++' > "$marker_tmp"
    mv "$marker_tmp" "$complete_marker"
    marker_tmp=""
}

acquire_lock() {
    if ! mkdir "$lock_dir" 2>/dev/null; then
        echo "Removing stale dataset download lock from a previous interrupted run."
        rm -rf "$lock_dir"
        mkdir "$lock_dir"
    fi
    lock_acquired=true
}

download_zip() {
    wget --progress="$WGET_PROGRESS" -O "$1" "${DATASET_URL}/download" \
        || wget --progress="$WGET_PROGRESS" -O "$1" "$DATASET_URL" \
        || {
            echo "Failed to download dataset from $DATASET_URL" >&2
            return 1
        }
}

mkdir -p "$DATASET_STORAGE_DIR"

skip_if_ready
acquire_lock
skip_if_ready

for stale_dir in "$DATASET_STORAGE_DIR"/.download.*; do
    [ -d "$stale_dir" ] || continue
    [ "$stale_dir" = "$lock_dir" ] || rm -rf "$stale_dir"
done

work_dir="$(mktemp -d "$DATASET_STORAGE_DIR/.download.XXXXXX")"
reason=""
[ ! -f "$complete_marker" ] || reason=" (dataset id not present in complete marker)"
echo "Downloading dataset $dataset_id$reason from $DATASET_URL ..."

download_zip "$work_dir/data.zip"
echo "Download complete."

mkdir "$work_dir/dataset"
unzip -q "$work_dir/data.zip" -d "$work_dir/dataset"

if ! find "$work_dir/dataset" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
    echo "Dataset zip must contain a top-level dataset folder." >&2
    exit 1
fi

cp -a "$work_dir/dataset/." "$DATASET_STORAGE_DIR/"
write_complete_marker

echo "Dataset extracted into $DATASET_STORAGE_DIR ($(dataset_count) folder(s))."
