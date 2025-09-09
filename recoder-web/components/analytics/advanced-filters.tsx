// Advanced filtering component for analytics data
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus,
  X,
  Filter,
  Save,
  Download,
  RefreshCw,
  Calendar as CalendarIcon,
  Search,
  Sliders,
  Target,
  Zap,
  Database,
  BarChart3,
  Users,
  Activity,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterCondition {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'exists' | 'not_exists';
  value: any;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'array';
}

interface FilterGroup {
  id: string;
  name: string;
  conditions: FilterCondition[];
  logic: 'AND' | 'OR';
  active: boolean;
}

interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  groups: FilterGroup[];
  dataSource: string;
  createdAt: string;
  shared: boolean;
}

interface AdvancedFiltersProps {
  dataSource: 'projects' | 'users' | 'deployments' | 'usage' | 'performance' | 'errors';
  onFiltersChange?: (filters: FilterGroup[]) => void;
  onApplyFilters?: (filters: FilterGroup[]) => void;
  className?: string;
}

const fieldOptions = {
  projects: [
    { value: 'name', label: 'Project Name', type: 'string' },
    { value: 'status', label: 'Status', type: 'string' },
    { value: 'framework', label: 'Framework', type: 'string' },
    { value: 'language', label: 'Language', type: 'string' },
    { value: 'visibility', label: 'Visibility', type: 'string' },
    { value: 'createdAt', label: 'Created Date', type: 'date' },
    { value: 'updatedAt', label: 'Updated Date', type: 'date' },
    { value: 'deploymentCount', label: 'Deployment Count', type: 'number' },
  ],
  users: [
    { value: 'name', label: 'User Name', type: 'string' },
    { value: 'email', label: 'Email', type: 'string' },
    { value: 'createdAt', label: 'Registration Date', type: 'date' },
    { value: 'lastLoginAt', label: 'Last Login', type: 'date' },
    { value: 'projectCount', label: 'Project Count', type: 'number' },
    { value: 'mfaEnabled', label: 'MFA Enabled', type: 'boolean' },
  ],
  deployments: [
    { value: 'platform', label: 'Platform', type: 'string' },
    { value: 'status', label: 'Status', type: 'string' },
    { value: 'timestamp', label: 'Deployment Date', type: 'date' },
    { value: 'successfulDeployments', label: 'Success Count', type: 'number' },
    { value: 'totalDeployments', label: 'Total Count', type: 'number' },
  ],
  usage: [
    { value: 'date', label: 'Date', type: 'date' },
    { value: 'generationsUsed', label: 'Generations Used', type: 'number' },
    { value: 'tokensUsed', label: 'Tokens Used', type: 'number' },
    { value: 'costAccrued', label: 'Cost Accrued', type: 'number' },
  ],
  performance: [
    { value: 'timestamp', label: 'Timestamp', type: 'date' },
    { value: 'responseTime', label: 'Response Time', type: 'number' },
    { value: 'endpoint', label: 'Endpoint', type: 'string' },
    { value: 'statusCode', label: 'Status Code', type: 'number' },
  ],
  errors: [
    { value: 'timestamp', label: 'Timestamp', type: 'date' },
    { value: 'level', label: 'Error Level', type: 'string' },
    { value: 'source', label: 'Source', type: 'string' },
    { value: 'message', label: 'Message', type: 'string' },
  ],
};

const operatorOptions = {
  string: [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'exists', label: 'Exists' },
    { value: 'not_exists', label: 'Does Not Exist' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'gt', label: 'Greater Than' },
    { value: 'gte', label: 'Greater Than or Equal' },
    { value: 'lt', label: 'Less Than' },
    { value: 'lte', label: 'Less Than or Equal' },
    { value: 'between', label: 'Between' },
  ],
  date: [
    { value: 'equals', label: 'On Date' },
    { value: 'gt', label: 'After' },
    { value: 'lt', label: 'Before' },
    { value: 'between', label: 'Between' },
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
  ],
};

export default function AdvancedFilters({
  dataSource,
  onFiltersChange,
  onApplyFilters,
  className
}: AdvancedFiltersProps) {
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterDescription, setNewFilterDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize with one empty filter group
  useEffect(() => {
    if (filterGroups.length === 0) {
      addFilterGroup();
    }
  }, []);

  // Load saved filters
  useEffect(() => {
    loadSavedFilters();
  }, [dataSource]);

  const loadSavedFilters = async () => {
    try {
      const response = await fetch(`/api/analytics/advanced-filters?dataSource=${dataSource}`);
      if (response.ok) {
        const data = await response.json();
        setSavedFilters(data.filters || []);
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    }
  };

  const addFilterGroup = useCallback(() => {
    const newGroup: FilterGroup = {
      id: `group_${Date.now()}`,
      name: `Filter Group ${filterGroups.length + 1}`,
      conditions: [],
      logic: 'AND',
      active: true,
    };
    setFilterGroups(prev => [...prev, newGroup]);
  }, [filterGroups.length]);

  const removeFilterGroup = useCallback((groupId: string) => {
    setFilterGroups(prev => prev.filter(group => group.id !== groupId));
  }, []);

  const updateFilterGroup = useCallback((groupId: string, updates: Partial<FilterGroup>) => {
    setFilterGroups(prev => prev.map(group =>
      group.id === groupId ? { ...group, ...updates } : group
    ));
  }, []);

  const addCondition = useCallback((groupId: string) => {
    const newCondition: FilterCondition = {
      id: `condition_${Date.now()}`,
      field: '',
      operator: 'equals',
      value: '',
      dataType: 'string',
    };

    setFilterGroups(prev => prev.map(group =>
      group.id === groupId
        ? { ...group, conditions: [...group.conditions, newCondition] }
        : group
    ));
  }, []);

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setFilterGroups(prev => prev.map(group =>
      group.id === groupId
        ? { ...group, conditions: group.conditions.filter(c => c.id !== conditionId) }
        : group
    ));
  }, []);

  const updateCondition = useCallback((
    groupId: string,
    conditionId: string,
    updates: Partial<FilterCondition>
  ) => {
    setFilterGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            conditions: group.conditions.map(condition =>
              condition.id === conditionId ? { ...condition, ...updates } : condition
            )
          }
        : group
    ));
  }, []);

  const handleFieldChange = useCallback((
    groupId: string,
    conditionId: string,
    field: string
  ) => {
    const fieldConfig = fieldOptions[dataSource]?.find(f => f.value === field);
    if (fieldConfig) {
      updateCondition(groupId, conditionId, {
        field,
        dataType: fieldConfig.type as any,
        operator: operatorOptions[fieldConfig.type as keyof typeof operatorOptions][0].value as any,
        value: fieldConfig.type === 'boolean' ? false : '',
      });
    }
  }, [dataSource, updateCondition]);

  const applyFilters = useCallback(() => {
    const activeGroups = filterGroups.filter(group => group.active && group.conditions.length > 0);
    onFiltersChange?.(activeGroups);
    onApplyFilters?.(activeGroups);
  }, [filterGroups, onFiltersChange, onApplyFilters]);

  const clearAllFilters = useCallback(() => {
    setFilterGroups([]);
    addFilterGroup();
    onFiltersChange?.([]);
  }, [addFilterGroup, onFiltersChange]);

  const loadSavedFilter = useCallback((filterId: string) => {
    const savedFilter = savedFilters.find(f => f.id === filterId);
    if (savedFilter) {
      setFilterGroups(savedFilter.groups);
      onFiltersChange?.(savedFilter.groups.filter(g => g.active));
    }
  }, [savedFilters, onFiltersChange]);

  const saveCurrentFilter = async () => {
    if (!newFilterName.trim()) return;

    setLoading(true);
    try {
      const filterData = {
        name: newFilterName,
        description: newFilterDescription,
        groups: filterGroups,
        dataSource,
      };

      const response = await fetch('/api/analytics/advanced-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterData),
      });

      if (response.ok) {
        await loadSavedFilters();
        setSaveDialogOpen(false);
        setNewFilterName('');
        setNewFilterDescription('');
      }
    } catch (error) {
      console.error('Failed to save filter:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderConditionValue = (
    groupId: string,
    condition: FilterCondition
  ) => {
    const { dataType, operator, value } = condition;

    if (dataType === 'boolean') {
      return (
        <Switch
          checked={value}
          onCheckedChange={(checked) =>
            updateCondition(groupId, condition.id, { value: checked })
          }
        />
      );
    }

    if (dataType === 'date') {
      if (operator === 'between') {
        return (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value?.from ? value.from.toLocaleDateString() : 'From date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={value?.from}
                  onSelect={(date) =>
                    updateCondition(groupId, condition.id, {
                      value: { ...value, from: date }
                    })
                  }
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value?.to ? value.to.toLocaleDateString() : 'To date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={value?.to}
                  onSelect={(date) =>
                    updateCondition(groupId, condition.id, {
                      value: { ...value, to: date }
                    })
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
        );
      }

      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? value.toLocaleDateString() : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={value}
              onSelect={(date) =>
                updateCondition(groupId, condition.id, { value: date })
              }
            />
          </PopoverContent>
        </Popover>
      );
    }

    if (dataType === 'number' && operator === 'between') {
      return (
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="From"
            value={value?.from || ''}
            onChange={(e) =>
              updateCondition(groupId, condition.id, {
                value: { ...value, from: parseFloat(e.target.value) || '' }
              })
            }
          />
          <Input
            type="number"
            placeholder="To"
            value={value?.to || ''}
            onChange={(e) =>
              updateCondition(groupId, condition.id, {
                value: { ...value, to: parseFloat(e.target.value) || '' }
              })
            }
          />
        </div>
      );
    }

    return (
      <Input
        type={dataType === 'number' ? 'number' : 'text'}
        placeholder={`Enter ${dataType} value`}
        value={value}
        onChange={(e) =>
          updateCondition(groupId, condition.id, {
            value: dataType === 'number' ? parseFloat(e.target.value) || '' : e.target.value
          })
        }
      />
    );
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Advanced Filters
            </CardTitle>
            <CardDescription>
              Create complex filter conditions for {dataSource} data
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedFilter} onValueChange={loadSavedFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Load saved filter" />
              </SelectTrigger>
              <SelectContent>
                {savedFilters.map((filter) => (
                  <SelectItem key={filter.id} value={filter.id}>
                    {filter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Filter Configuration</DialogTitle>
                  <DialogDescription>
                    Save your current filter setup for future use
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="filter-name">Filter Name</Label>
                    <Input
                      id="filter-name"
                      value={newFilterName}
                      onChange={(e) => setNewFilterName(e.target.value)}
                      placeholder="Enter filter name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="filter-description">Description (Optional)</Label>
                    <Input
                      id="filter-description"
                      value={newFilterDescription}
                      onChange={(e) => setNewFilterDescription(e.target.value)}
                      placeholder="Describe this filter"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSaveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={saveCurrentFilter} disabled={loading}>
                      {loading ? 'Saving...' : 'Save Filter'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ScrollArea className="h-96">
          {filterGroups.map((group, groupIndex) => (
            <Card key={group.id} className="mb-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={group.active}
                      onCheckedChange={(active) =>
                        updateFilterGroup(group.id, { active })
                      }
                    />
                    <Input
                      value={group.name}
                      onChange={(e) =>
                        updateFilterGroup(group.id, { name: e.target.value })
                      }
                      className="font-medium"
                    />
                    <Select
                      value={group.logic}
                      onValueChange={(logic: 'AND' | 'OR') =>
                        updateFilterGroup(group.id, { logic })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addCondition(group.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Condition
                    </Button>
                    {filterGroups.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFilterGroup(group.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.conditions.map((condition, conditionIndex) => (
                  <div key={condition.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Select
                      value={condition.field}
                      onValueChange={(value) => handleFieldChange(group.id, condition.id, value)}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions[dataSource]?.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={condition.operator}
                      onValueChange={(operator) =>
                        updateCondition(group.id, condition.id, { operator: operator as any })
                      }
                      disabled={!condition.field}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {operatorOptions[condition.dataType]?.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex-1">
                      {renderConditionValue(group.id, condition)}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeCondition(group.id, condition.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {group.conditions.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No conditions defined. Click "Add Condition" to start filtering.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addFilterGroup}>
              <Plus className="h-4 w-4 mr-1" />
              Add Filter Group
            </Button>
            <Button variant="outline" onClick={clearAllFilters}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {filterGroups.filter(g => g.active).length} active groups
            </Badge>
            <Button onClick={applyFilters}>
              <Filter className="h-4 w-4 mr-1" />
              Apply Filters
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
