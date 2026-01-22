import { registerEnumType } from '@nestjs/graphql';

export enum FilterLogic {
  AND = 'and',
  OR = 'or',
}

registerEnumType(FilterLogic, {
  name: 'FilterLogic',
  description: 'Filter logic (and, or).',
});
