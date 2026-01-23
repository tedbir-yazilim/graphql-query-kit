import { BadRequestException } from '@nestjs/common';
import { Model, Query, QueryFilter, SortOrder, Types } from 'mongoose';
import {
  CursorPaginationInput,
  FilterInput,
  FieldFilterInput,
  SearchInput,
  SortInput,
} from '@/inputs/query.input';
import { FilterLogic } from '@/enums/filter-logic.enum';
import { FilterOperator } from '@/enums/filter-operator.enum';
import { SortDirection } from '@/enums/sort-direction.enum';
import type { PageInfo } from '@/types/page-info.type';

type FieldType = 'string' | 'number' | 'boolean' | 'objectId' | 'date';
type FieldSpec = { path?: string; type: FieldType };
type FieldMapLookup = Record<string, FieldSpec>;
export type SearchMode = 'contains' | 'startsWith' | 'endsWith';

export type FieldMap<T = any> = Partial<Record<keyof T & string, FieldSpec>>;

export function buildFilterConditions(
  filter: FilterInput | undefined,
  fieldMap: FieldMap,
) {
  if (!filter?.items?.length) {
    return [];
  }

  const conditions = filter.items.map((item) => buildCondition(item, fieldMap));
  if ((filter.logic || FilterLogic.AND) === FilterLogic.OR) {
    return [{ $or: conditions }];
  }
  return conditions;
}

export function buildSort(
  sort: SortInput | undefined,
  fieldMap: FieldMap,
): Record<string, SortOrder> | undefined {
  if (!sort) {
    return undefined;
  }
  const field = fieldMap[sort.field];
  if (!field) {
    throw new BadRequestException(`Unsupported sort field: ${sort.field}`);
  }
  const path = field.path || sort.field;
  const direction = sort.direction || SortDirection.ASC;
  return { [path]: direction === SortDirection.ASC ? 1 : -1 };
}

export function applyQuery<T>(
  model: Model<T>,
  baseFilter: QueryFilter<T>,
  fieldMap: FieldMap<T>,
  filter?: FilterInput,
  sort?: SortInput,
  pagination?: CursorPaginationInput,
  search?: SearchInput,
  options?: {
    defaultSort?: Record<string, SortOrder>;
    maxLimit?: number;
    cursorField?: string;
    searchFields?: string[];
    searchMode?: SearchMode;
    select?: string[] | string;
  },
): Query<T[], T> {
  const filterConditions = buildFilterConditions(filter, fieldMap);
  const searchCondition = buildSearchCondition(search, fieldMap, options);
  const combinedConditions = [
    ...filterConditions,
    ...(searchCondition ? [searchCondition] : []),
  ];

  const queryFilter = (combinedConditions.length > 0
    ? { $and: [baseFilter, ...combinedConditions] }
    : baseFilter) as QueryFilter<T>;

  const {
    sortClause,
    primaryPath,
    primaryFieldDef,
    primaryDirection,
    cursorPath,
    cursorFieldDef,
    cursorDirection,
    useCompositeCursor,
  } = resolveSortInfo(sort, fieldMap, options);

  const limit = Math.min(pagination?.limit ?? 100, options?.maxLimit ?? 200);
  const direction = pagination?.direction || 'next';

  let finalFilter = queryFilter as QueryFilter<T>;
  if (pagination?.cursor) {
    const decoded = decodeCursor(pagination.cursor);
    if (useCompositeCursor && (!decoded.sort || !decoded.cursor)) {
      throw new BadRequestException(
        `Cursor pagination requires a composite cursor when sorting by ${primaryPath}`,
      );
    }
    const sortValueRaw = useCompositeCursor ? decoded.sort : decoded.cursor;
    const cursorValueRaw = decoded.cursor;
    if (!sortValueRaw || !cursorValueRaw) {
      throw new BadRequestException('Invalid cursor value');
    }

    const sortValue = parseValue(sortValueRaw, primaryFieldDef.type);
    const cursorValue = parseValue(cursorValueRaw, cursorFieldDef.type);
    const operator = getCursorOperator(primaryDirection, direction);
    const tieOperator = getCursorOperator(cursorDirection, direction);

    const cursorCondition = useCompositeCursor
      ? {
          $or: [
            { [primaryPath]: { [operator]: sortValue } },
            {
              [primaryPath]: sortValue,
              [cursorPath]: { [tieOperator]: cursorValue },
            },
          ],
        }
      : { [cursorPath]: { [tieOperator]: cursorValue } };

    finalFilter = { $and: [queryFilter, cursorCondition] } as QueryFilter<T>;
  }

  const query = model.find(finalFilter).sort(sortClause).limit(limit);
  if (options?.select) {
    query.select(options.select);
  }
  return query;
}

function buildCondition(item: FieldFilterInput, fieldMap: FieldMap) {
  const field = (fieldMap as FieldMapLookup)[item.field];
  if (!field) {
    throw new BadRequestException(`Unsupported filter field: ${item.field}`);
  }
  const path = field.path || item.field;

  switch (item.operator) {
    case FilterOperator.EQ:
      return { [path]: parseValue(item.value, field.type) };
    case FilterOperator.NE:
      return { [path]: { $ne: parseValue(item.value, field.type) } };
    case FilterOperator.IN:
      return { [path]: { $in: parseValues(item.values, field.type) } };
    case FilterOperator.NIN:
      return { [path]: { $nin: parseValues(item.values, field.type) } };
    case FilterOperator.GT:
      return { [path]: { $gt: parseValue(item.value, field.type) } };
    case FilterOperator.GTE:
      return { [path]: { $gte: parseValue(item.value, field.type) } };
    case FilterOperator.LT:
      return { [path]: { $lt: parseValue(item.value, field.type) } };
    case FilterOperator.LTE:
      return { [path]: { $lte: parseValue(item.value, field.type) } };
    case FilterOperator.BETWEEN:
      return buildBetweenCondition(path, item, field.type);
    case FilterOperator.CONTAINS:
      return { [path]: { $regex: buildRegex(item.value, 'contains') } };
    case FilterOperator.STARTS_WITH:
      return { [path]: { $regex: buildRegex(item.value, 'startsWith') } };
    case FilterOperator.ENDS_WITH:
      return { [path]: { $regex: buildRegex(item.value, 'endsWith') } };
    default:
      throw new BadRequestException(
        `Unsupported filter operator: ${item.operator}`,
      );
  }
}

function parseValue(value: string | undefined, type: FieldType) {
  if (value === undefined || value === null) {
    throw new BadRequestException('Filter value is required');
  }
  switch (type) {
    case 'number': {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException('Invalid number filter value');
      }
      return parsed;
    }
    case 'boolean':
      return value === 'true';
    case 'objectId':
      if (!Types.ObjectId.isValid(value)) {
        throw new BadRequestException('Invalid objectId filter value');
      }
      return new Types.ObjectId(value);
    case 'date': {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid date filter value');
      }
      return parsed;
    }
    default:
      return value;
  }
}

function parseValues(values: string[] | undefined, type: FieldType) {
  if (!values?.length) {
    throw new BadRequestException('Filter values are required');
  }
  return values.map((value) => parseValue(value, type));
}

function buildBetweenCondition(
  path: string,
  item: FieldFilterInput,
  type: FieldType,
) {
  if (item.values?.length === 2) {
    const [minValue, maxValue] = parseValues(item.values, type);
    return { [path]: { $gte: minValue, $lte: maxValue } };
  }
  if (item.value) {
    const parts = item.value.split(',').map((part) => part.trim());
    if (parts.length !== 2) {
      throw new BadRequestException('Between filter requires two values');
    }
    const [minValue, maxValue] = parts.map((part) => parseValue(part, type));
    return { [path]: { $gte: minValue, $lte: maxValue } };
  }
  throw new BadRequestException('Between filter requires two values');
}

function buildRegex(
  value: string | undefined,
  mode: 'contains' | 'startsWith' | 'endsWith',
) {
  if (!value) {
    throw new BadRequestException('Filter value is required');
  }
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (mode === 'startsWith') {
    return new RegExp(`^${escaped}`, 'i');
  }
  if (mode === 'endsWith') {
    return new RegExp(`${escaped}$`, 'i');
  }
  return new RegExp(escaped, 'i');
}

function buildSearchCondition(
  search: SearchInput | undefined,
  fieldMap: FieldMap,
  options?: {
    searchFields?: string[];
    searchMode?: SearchMode;
  },
) {
  if (!search?.query) {
    return undefined;
  }
  const searchFields = search.fields?.length ? search.fields : options?.searchFields;
  if (!searchFields?.length) {
    throw new BadRequestException('Search fields are required');
  }

  const mode = options?.searchMode || 'contains';
  const regex = buildRegex(search.query, mode);
  const conditions = searchFields.map((fieldName) => {
    const field = (fieldMap as FieldMapLookup)[fieldName];
    if (!field) {
      throw new BadRequestException(`Unsupported search field: ${fieldName}`);
    }
    if (field.type !== 'string') {
      throw new BadRequestException(
        `Search field must be a string: ${fieldName}`,
      );
    }
    const path = field.path || fieldName;
    return { [path]: { $regex: regex } };
  });

  return { $or: conditions };
}

function getCursorOperator(
  sortDirection: 1 | -1,
  pageDirection: 'next' | 'prev',
) {
  if (pageDirection === 'prev') {
    return sortDirection === 1 ? '$lt' : '$gt';
  }
  return sortDirection === 1 ? '$gt' : '$lt';
}

export async function applyQueryWithPageInfo<T>(
  model: Model<T>,
  baseFilter: QueryFilter<T>,
  fieldMap: FieldMap<T>,
  filter?: FilterInput,
  sort?: SortInput,
  pagination?: CursorPaginationInput,
  search?: SearchInput,
  options?: {
    defaultSort?: Record<string, SortOrder>;
    maxLimit?: number;
    cursorField?: string;
    searchFields?: string[];
    searchMode?: SearchMode;
    select?: string[] | string;
  },
): Promise<{ items: T[]; pageInfo: PageInfo }> {
  const limit = Math.min(pagination?.limit ?? 100, options?.maxLimit ?? 200);
  const paginationWithExtra: CursorPaginationInput = {
    ...pagination,
    limit: limit + 1,
  };

  const { primaryPath, cursorPath, useCompositeCursor } = resolveSortInfo(
    sort,
    fieldMap,
    options,
  );

  const results = await applyQuery(
    model,
    baseFilter,
    fieldMap,
    filter,
    sort,
    paginationWithExtra,
    search,
    options,
  ).exec();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const direction = pagination?.direction || 'next';

  const firstItem = items[0];
  const lastItem = items[items.length - 1];

  const pageInfo: PageInfo = {
    hasNextPage: direction === 'next' ? hasMore : Boolean(pagination?.cursor),
    hasPreviousPage: direction === 'prev' ? hasMore : Boolean(pagination?.cursor),
    nextCursor: items.length
      ? buildCursor(
          useCompositeCursor,
          getValueByPath(lastItem, primaryPath),
          getValueByPath(lastItem, cursorPath),
        )
      : undefined,
    prevCursor: items.length
      ? buildCursor(
          useCompositeCursor,
          getValueByPath(firstItem, primaryPath),
          getValueByPath(firstItem, cursorPath),
        )
      : undefined,
  };

  return { items, pageInfo };
}

function getValueByPath(item: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), item);
}

function buildCursor(
  useComposite: boolean,
  sortValue: any,
  cursorValue: any,
): string {
  const cursorStr = String(cursorValue);
  if (!useComposite) {
    return cursorStr;
  }
  const payload = {
    s: String(sortValue),
    c: cursorStr,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function decodeCursor(cursor: string): { sort?: string; cursor?: string } {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.s === 'string' &&
      typeof parsed.c === 'string'
    ) {
      return { sort: parsed.s, cursor: parsed.c };
    }
  } catch {
    // fall through to legacy format
  }
  return { cursor };
}

function resolveSortInfo(
  sort: SortInput | undefined,
  fieldMap: FieldMap,
  options?: {
    defaultSort?: Record<string, SortOrder>;
    cursorField?: string;
  },
) {
  const cursorField = options?.cursorField || 'createdAt';
  const cursorFieldDef = (fieldMap as FieldMapLookup)[cursorField];
  if (!cursorFieldDef) {
    throw new BadRequestException(`Unsupported cursor field: ${cursorField}`);
  }
  const cursorPath = cursorFieldDef.path || cursorField;

  const sortClause: Record<string, SortOrder> =
    buildSort(sort, fieldMap) || options?.defaultSort || { [cursorPath]: -1 };

  const primaryPath = sort
    ? ((fieldMap as FieldMapLookup)[sort.field]?.path || sort.field)
    : Object.keys(sortClause)[0];

  const primaryFieldDef =
    (fieldMap as FieldMapLookup)[primaryPath] ||
    findFieldSpecByPath(fieldMap, primaryPath);
  if (!primaryFieldDef) {
    throw new BadRequestException(`Unsupported sort field: ${primaryPath}`);
  }

  const primaryDirection = (sortClause[primaryPath] as 1 | -1 | undefined) ?? -1;

  if (!sortClause[cursorPath]) {
    sortClause[cursorPath] = primaryDirection;
  }
  const cursorDirection = sortClause[cursorPath] as 1 | -1;

  return {
    sortClause,
    primaryPath,
    primaryFieldDef,
    primaryDirection,
    cursorPath,
    cursorFieldDef,
    cursorDirection,
    useCompositeCursor: primaryPath !== cursorPath,
  };
}

function findFieldSpecByPath(fieldMap: FieldMap, path: string) {
  const entries = Object.entries(fieldMap as FieldMapLookup);
  for (const [key, spec] of entries) {
    if ((spec.path || key) === path) {
      return spec;
    }
  }
  return undefined;
}
