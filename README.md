# @tedbir/graphql-query-kit

Reusable GraphQL filtering, sorting, and pagination helpers for NestJS + MongoDB.

## Install

```bash
npm i @tedbir/graphql-query-kit
```

## Quick start

```ts
import {
  CursorPaginationInput,
  FilterInput,
  SearchInput,
  SortInput,
  applyQuery,
} from '@tedbir/graphql-query-kit';

const fieldMap = {
  name: { type: 'string' },
  createdAt: { type: 'date' },
};

// Example resolver/service usage
return applyQuery(model, {}, fieldMap, filter, sort, pagination, search, {
  cursorField: 'createdAt',
  searchFields: ['name'],
  select: ['name', 'createdAt'],
});
```

Full guide: [USAGE.md](./USAGE.md)

## Build (package)

```bash
npm run build
```

## Usage

```ts
import {
  CursorPaginationInput,
  FilterInput,
  SearchInput,
  SortInput,
  applyQuery,
  applyQueryWithPageInfo,
  PageInfo,
  FilterOperator,
  FilterLogic,
  SortDirection,
} from '@tedbir/graphql-query-kit';
```

`applyQueryWithPageInfo` returns `{ items, pageInfo }` where `pageInfo` includes
`hasNextPage`, `hasPreviousPage`, `nextCursor`, and `prevCursor`.

Full guide: [USAGE.md](./USAGE.md)

## Notes

- The package keeps `@/` aliases in source and rewrites them to relative paths on build via `tsc-alias`.
- Enums register themselves with GraphQL on import.
