import React from 'react';

interface SearchAndFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: 'updated' | 'created' | 'name';
  onSortChange: (sort: 'updated' | 'created' | 'name') => void;
  showArchived: boolean;
  onArchivedToggle: (show: boolean) => void;
}

export function SearchAndFilter({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  showArchived,
  onArchivedToggle,
}: SearchAndFilterProps) {
  return (
    <div className="mb-8 space-y-4">
      {/* Search bar */}
      <div className="relative max-w-md">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          <div className="i-ph:magnifying-glass text-recoder-elements-textSecondary" />
        </div>
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder-recoder-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-recoder-elements-focus focus:border-transparent"
        />
      </div>

      {/* Filter and sort controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-recoder-elements-textSecondary">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as any)}
            className="px-3 py-2 bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-recoder-elements-focus focus:border-transparent"
          >
            <option value="updated">Last Updated</option>
            <option value="created">Date Created</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {/* Archive toggle */}
        <label className="flex items-center gap-2 text-sm text-recoder-elements-textSecondary cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => onArchivedToggle(e.target.checked)}
            className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 text-recoder-elements-button-primary-background focus:ring-recoder-elements-focus"
          />
          Show archived
        </label>

        {/* Results count */}
        <div className="ml-auto text-sm text-recoder-elements-textSecondary">
          {/* This will be handled by the parent component */}
        </div>
      </div>
    </div>
  );
}
