import { registerEnumType } from '@nestjs/graphql';

export enum FilterOperator {
  EQ = 'eq',
  NE = 'ne',
  IN = 'in',
  NIN = 'nin',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  BETWEEN = 'between',
  CONTAINS = 'contains',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
}

registerEnumType(FilterOperator, {
  name: 'FilterOperator',
  description:
    'Filter operators (eq, ne, in, nin, gt, gte, lt, lte, between, contains, startsWith, endsWith).',
});
