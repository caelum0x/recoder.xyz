#!/bin/bash

# Fix Express route handler return types
find src -name "*.ts" -type f | while read -r file; do
  # Fix async route handlers
  if grep -q "], async (req: Request, res: Response) => {" "$file"; then
    echo "Fixing return types in $file"
    sed -i 's/], async (req: Request, res: Response) => {/], async (req: Request, res: Response): Promise<void> => {/g' "$file"
  fi
  
  # Fix sync route handlers  
  if grep -q "], (req: Request, res: Response) => {" "$file"; then
    echo "Fixing sync return types in $file"
    sed -i 's/], (req: Request, res: Response) => {/], (req: Request, res: Response): void => {/g' "$file"
  fi
done

echo "Return type fixing completed!"