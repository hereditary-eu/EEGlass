#!/bin/sh
set -eu

: "${DATASET_URL:?DATASET_URL is required}"
: "${DATASET_STORAGE_DIR:=/app/data/datasets}"

complete_marker="$DATASET_STORAGE_DIR/.download-complete"

list_dataset_dirs() {
    find "$DATASET_STORAGE_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.download.*'
}

download_zip() {
    output_path="$1"

    wget --progress=bar:force:noscroll -O "$output_path" "${DATASET_URL}/download" \
        || wget --progress=bar:force:noscroll -O "$output_path" "$DATASET_URL"
}

mkdir -p "$DATASET_STORAGE_DIR"

if [ -f "$complete_marker" ] && [ -n "$(list_dataset_dirs | head -n 1)" ]; then
    echo "Dataset volume already contains a completed dataset download; skipping download."
    list_dataset_dirs
    exit 0
fi

rm -rf "$DATASET_STORAGE_DIR"/.download.*

work_dir="$(mktemp -d "$DATASET_STORAGE_DIR/.download.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

echo "Downloading dataset zip from $DATASET_URL"
download_zip "$work_dir/data.zip"

mkdir "$work_dir/dataset"
unzip -q "$work_dir/data.zip" -d "$work_dir/dataset"

if [ -z "$(find "$work_dir/dataset" -mindepth 1 -maxdepth 1 -type d | head -n 1)" ]; then
    echo "Dataset zip must contain a top-level dataset folder." >&2
    exit 1
fi

cp -a "$work_dir/dataset/." "$DATASET_STORAGE_DIR/"
touch "$complete_marker"

echo "Dataset extracted into $DATASET_STORAGE_DIR:"
list_dataset_dirs
