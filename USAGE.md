# @tedbir/graphql-query-kit - Agent Guide

This guide is written for automated agents to integrate the package into a new NestJS + GraphQL + MongoDB project.

## 1) Install

```bash
yarn add @tedbir/graphql-query-kit
```

Peer dependencies expected in the host project:

- @nestjs/common
- @nestjs/graphql
- class-validator
- mongoose

## 2) Import in your GraphQL inputs

```ts
import {
  CursorPaginationInput,
  FilterInput,
  SearchInput,
  SortInput,
} from '@tedbir/graphql-query-kit';
```

Use them in your query args:

```ts
@Args('filter', { type: () => FilterInput, nullable: true }) filter?: FilterInput,
@Args('sort', { type: () => SortInput, nullable: true }) sort?: SortInput,
@Args('pagination', { type: () => CursorPaginationInput, nullable: true })
pagination?: CursorPaginationInput,
@Args('search', { type: () => SearchInput, nullable: true }) search?: SearchInput,
```

## 3) Build the field map

Provide a whitelist of fields and their types. Optional `path` allows mapping to nested fields.

```ts
import { FieldMap } from '@tedbir/graphql-query-kit';

const accountFieldMap: FieldMap = {
  name: { type: 'string' },
  email: { type: 'string' },
  status: { type: 'string' },
  age: { type: 'number' },
  isActive: { type: 'boolean' },
  createdAt: { type: 'date' },
  companyId: { type: 'objectId', path: 'company._id' },
};
```

## 4) Apply the query (Mongoose)

```ts
import { applyQuery } from '@tedbir/graphql-query-kit';

return applyQuery(
  this.accountModel,
  { isDeleted: false },
  accountFieldMap,
  filter,
  sort,
  pagination,
  search,
  {
    cursorField: 'createdAt',
    defaultSort: { createdAt: -1 },
    maxLimit: 200,
    searchFields: ['name', 'email'],
    searchMode: 'contains',
    select: ['name', 'email', 'createdAt'],
  },
);
```

To return `pageInfo` with cursors:

```ts
import { applyQueryWithPageInfo } from '@tedbir/graphql-query-kit';

const { items, pageInfo } = await applyQueryWithPageInfo(
  this.accountModel,
  { isDeleted: false },
  accountFieldMap,
  filter,
  sort,
  pagination,
  search,
  {
    cursorField: 'createdAt',
    defaultSort: { createdAt: -1 },
    maxLimit: 200,
    searchFields: ['name', 'email'],
    searchMode: 'contains',
  },
);
```

You can reuse the shared `PageInfo` output type:

```ts
import { Field, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '@tedbir/graphql-query-kit';

@ObjectType()
export class AccountConnection {
  @Field(() => [Account])
  items: Account[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
```

`PageInfo` fields include `hasNextPage`, `hasPreviousPage`, `nextCursor`, and `prevCursor`.

## 5) Resolver example (NestJS)

```ts
import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  applyQuery,
  FieldMap,
  FilterInput,
  SearchInput,
  SortInput,
  CursorPaginationInput,
} from '@tedbir/graphql-query-kit';
import { Account } from './account.schema';

const accountFieldMap: FieldMap = {
  name: { type: 'string' },
  email: { type: 'string' },
  status: { type: 'string' },
  age: { type: 'number' },
  isActive: { type: 'boolean' },
  createdAt: { type: 'date' },
  companyId: { type: 'objectId', path: 'company._id' },
};

@Resolver(() => Account)
export class AccountsResolver {
  constructor(@InjectModel(Account.name) private readonly accountModel: Model<Account>) {}

  @Query(() => [Account])
  accounts(
    @Args('filter', { type: () => FilterInput, nullable: true }) filter?: FilterInput,
    @Args('sort', { type: () => SortInput, nullable: true }) sort?: SortInput,
    @Args('pagination', { type: () => CursorPaginationInput, nullable: true })
    pagination?: CursorPaginationInput,
    @Args('search', { type: () => SearchInput, nullable: true }) search?: SearchInput,
  ) {
    return applyQuery(
      this.accountModel,
      { isDeleted: false },
      accountFieldMap,
      filter,
      sort,
      pagination,
      search,
      {
        cursorField: 'createdAt',
        defaultSort: { createdAt: -1 },
        maxLimit: 200,
        searchFields: ['name', 'email'],
        searchMode: 'contains',
      },
    );
  }
}
```

## 6) Example GraphQL query

```graphql
query Accounts($filter: FilterInput, $sort: SortInput, $pagination: CursorPaginationInput, $search: SearchInput) {
  accounts(filter: $filter, sort: $sort, pagination: $pagination, search: $search) {
    id
    name
  }
}
```

Example variables:

```json
{
  "filter": {
    "logic": "and",
    "items": [
      { "field": "status", "operator": "eq", "value": "active" },
      { "field": "age", "operator": "gte", "value": "18" }
    ]
  },
  "sort": { "field": "createdAt", "direction": "desc" },
  "pagination": { "cursor": "2025-01-01T00:00:00.000Z", "limit": 20, "direction": "next" },
  "search": { "query": "ali", "fields": ["name", "email"] }
}
```

## 7) Notes

- String operators use case-insensitive regex.
- `between` supports `values: ["min", "max"]` or `value: "min,max"`.
- Cursor pagination requires the sort field to match `cursorField`.
- If `pagination.limit` is missing, it defaults to 100 and is capped by `maxLimit`.
- `search.fields` overrides the server-side `searchFields` whitelist.

## 8) Service layer example (NestJS)

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  applyQuery,
  FieldMap,
  FilterInput,
  SearchInput,
  SortInput,
  CursorPaginationInput,
} from '@tedbir/graphql-query-kit';
import { Account } from './account.schema';

const accountFieldMap: FieldMap = {
  name: { type: 'string' },
  email: { type: 'string' },
  status: { type: 'string' },
  age: { type: 'number' },
  isActive: { type: 'boolean' },
  createdAt: { type: 'date' },
  companyId: { type: 'objectId', path: 'company._id' },
};

@Injectable()
export class AccountsService {
  constructor(@InjectModel(Account.name) private readonly accountModel: Model<Account>) {}

  findAll(
    filter?: FilterInput,
    sort?: SortInput,
    pagination?: CursorPaginationInput,
    search?: SearchInput,
  ) {
    return applyQuery(
      this.accountModel,
      { isDeleted: false },
      accountFieldMap,
      filter,
      sort,
      pagination,
      search,
      {
        cursorField: 'createdAt',
        defaultSort: { createdAt: -1 },
        maxLimit: 200,
        searchFields: ['name', 'email'],
        searchMode: 'contains',
      },
    );
  }
}
```

## 9) Minimal schema + input example

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
@ObjectType()
export class Account extends Document {
  @Field(() => ID)
  _id: string;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field()
  @Prop({ required: true })
  email: string;

  @Field({ nullable: true })
  @Prop()
  status?: string;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
```

## 10) Client usage patterns (GraphQL)

### Next page (cursor-based)

```graphql
query Accounts($filter: FilterInput, $sort: SortInput, $pagination: CursorPaginationInput, $search: SearchInput) {
  accounts(filter: $filter, sort: $sort, pagination: $pagination, search: $search) {
    id
    name
    createdAt
  }
}
```

First request variables:

```json
{
  "sort": { "field": "createdAt", "direction": "desc" },
  "pagination": { "limit": 20, "direction": "next" }
}
```

Next page variables (use the last record's cursor field value):

```json
{
  "sort": { "field": "createdAt", "direction": "desc" },
  "pagination": {
    "limit": 20,
    "direction": "next",
    "cursor": "2025-01-01T10:00:00.000Z"
  }
}
```

### Previous page (cursor-based)

```json
{
  "sort": { "field": "createdAt", "direction": "desc" },
  "pagination": {
    "limit": 20,
    "direction": "prev",
    "cursor": "2025-01-01T12:00:00.000Z"
  }
}
```

### Search + filter together

```json
{
  "filter": {
    "logic": "and",
    "items": [{ "field": "status", "operator": "eq", "value": "active" }]
  },
  "search": { "query": "ali" },
  "sort": { "field": "createdAt", "direction": "desc" },
  "pagination": { "limit": 20, "direction": "next" }
}
```

### React + Apollo Client example

```tsx
import { gql, useQuery } from '@apollo/client';
import { useMemo, useState } from 'react';

const ACCOUNTS_QUERY = gql`
  query Accounts($filter: FilterInput, $sort: SortInput, $pagination: CursorPaginationInput, $search: SearchInput) {
    accounts(filter: $filter, sort: $sort, pagination: $pagination, search: $search) {
      id
      name
      createdAt
    }
  }
`;

export function AccountsList() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const variables = useMemo(
    () => ({
      sort: { field: 'createdAt', direction: 'desc' },
      pagination: { limit: 20, direction, cursor },
    }),
    [cursor, direction],
  );

  const { data, loading } = useQuery(ACCOUNTS_QUERY, { variables });
  const items = data?.accounts ?? [];
  const lastCursor = items.length ? items[items.length - 1].createdAt : undefined;
  const firstCursor = items.length ? items[0].createdAt : undefined;

  return (
    <div>
      {loading ? <div>Loading...</div> : null}
      <ul>
        {items.map((item: any) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <div>
        <button
          disabled={!firstCursor}
          onClick={() => {
            setDirection('prev');
            setCursor(firstCursor);
          }}
        >
          Prev
        </button>
        <button
          disabled={!lastCursor}
          onClick={() => {
            setDirection('next');
            setCursor(lastCursor);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```
