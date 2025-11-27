#!/bin/bash
# Fix all route files to await params in Next.js 15

FILES=$(find app/api -name "route.ts" -type f -exec grep -l "props: { params: Promise" {} \;)

for FILE in $FILES; do
  echo "Fixing $FILE..."

  # Check if file already has await params
  if ! grep -q "const params = await props.params" "$FILE"; then
    # Add await params after the function signature
    awk '
      /^export async function (GET|POST|PUT|DELETE|PATCH)/ {
        print
        in_function=1
        next
      }
      in_function && /^\)/ {
        print
        print "  try {"
        print "    // In Next.js 15, params is a Promise that must be awaited"
        print "    const params = await props.params;"
        print ""
        saw_try=1
        next
      }
      in_function && /^  try {/ {
        print
        print "    // In Next.js 15, params is a Promise that must be awaited"
        print "    const params = await props.params;"
        print ""
        saw_try=1
        in_function=0
        next
      }
      in_function && /{$/ {
        print
        in_function=0
        next
      }
      { print }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  fi
done

echo "Done!"
