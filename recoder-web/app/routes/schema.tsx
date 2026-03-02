/**
 * Database Schema Generator Page
 */

import { Link } from '@remix-run/react';
import SchemaGenerator from '~/components/database/SchemaGenerator';

export default function SchemaPage() {
  return (
    <div className="relative h-screen w-screen bg-recoder-elements-background-depth-1">
      {/* Close button */}
      <Link
        to="/"
        className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-recoder-elements-background-depth-2 hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary rounded-lg border border-recoder-elements-borderColor transition-colors"
      >
        <div className="i-ph:x text-lg" />
        <span>Close</span>
      </Link>

      <SchemaGenerator />
    </div>
  );
}
