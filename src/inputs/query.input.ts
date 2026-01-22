import { InputType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsIn, IsOptional, IsString, Min } from 'class-validator';
import { FilterOperator } from '@/enums/filter-operator.enum';
import { FilterLogic } from '@/enums/filter-logic.enum';
import { SortDirection } from '@/enums/sort-direction.enum';

@InputType()
export class FieldFilterInput {
  @Field()
  @IsString()
  field: string;

  @Field(() => FilterOperator)
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  value?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  values?: string[];
}

@InputType()
export class FilterInput {
  @Field(() => [FieldFilterInput], { nullable: true })
  @IsOptional()
  items?: FieldFilterInput[];

  @Field(() => FilterLogic, { nullable: true })
  @IsEnum(FilterLogic)
  @IsOptional()
  logic?: FilterLogic;
}

@InputType()
export class SortInput {
  @Field()
  @IsString()
  field: string;

  @Field(() => SortDirection, { nullable: true })
  @IsEnum(SortDirection)
  @IsOptional()
  direction?: SortDirection;
}

@InputType()
export class CursorPaginationInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cursor?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Min(1)
  limit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['next', 'prev'])
  direction?: 'next' | 'prev';
}

@InputType()
export class SearchInput {
  @Field()
  @IsString()
  query: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  fields?: string[];
}
