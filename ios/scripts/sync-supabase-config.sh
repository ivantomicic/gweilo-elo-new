#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
SOURCE_FILE="$REPOSITORY_DIR/.env.local"
OUTPUT_FILE="$REPOSITORY_DIR/ios/Config/Secrets.xcconfig"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Missing $SOURCE_FILE"
    exit 1
fi

read_value() {
    sed -n "s/^$1=//p" "$SOURCE_FILE" | tail -n 1
}

SUPABASE_URL_VALUE=$(read_value NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY_VALUE=$(read_value NEXT_PUBLIC_SUPABASE_ANON_KEY)

if [ -z "$SUPABASE_URL_VALUE" ] || [ -z "$SUPABASE_ANON_KEY_VALUE" ]; then
    echo "Supabase public configuration is missing from .env.local"
    exit 1
fi

# xcconfig treats // as a comment, so insert an empty build-setting expansion.
XCCONFIG_URL=$(printf '%s' "$SUPABASE_URL_VALUE" | sed 's#://#:/$()/#')

{
    printf '%s\n' '// Generated locally. Do not commit.'
    printf 'SUPABASE_URL = %s\n' "$XCCONFIG_URL"
    printf 'SUPABASE_ANON_KEY = %s\n' "$SUPABASE_ANON_KEY_VALUE"
} > "$OUTPUT_FILE"

echo "Updated ios/Config/Secrets.xcconfig"
