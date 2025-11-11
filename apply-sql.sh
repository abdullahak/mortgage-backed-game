#!/bin/bash

# Script to apply SQL fixes using Supabase CLI
# Usage: ./apply-sql.sh <sql-file>

set -e

SQL_FILE=$1

if [ -z "$SQL_FILE" ]; then
    echo "Usage: ./apply-sql.sh <sql-file>"
    exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
    echo "Error: File $SQL_FILE not found"
    exit 1
fi

# You need to get this from Supabase Dashboard > Project Settings > Database > Connection String
# Format: postgresql://postgres:[YOUR-PASSWORD]@db.scpkafqiooxfvycwzqla.supabase.co:5432/postgres
DB_URL="postgresql://postgres:[YOUR-PASSWORD]@db.scpkafqiooxfvycwzqla.supabase.co:5432/postgres"

echo "Applying SQL from $SQL_FILE..."
echo "To database: scpkafqiooxfvycwzqla"
echo ""

# Use psql if available, otherwise instructions for manual application
if command -v psql &> /dev/null; then
    psql "$DB_URL" -f "$SQL_FILE"
    echo "✓ SQL applied successfully!"
else
    echo "psql not found. Please apply manually or install PostgreSQL client."
    echo ""
    echo "SQL to apply:"
    echo "===================="
    cat "$SQL_FILE"
    echo "===================="
fi
