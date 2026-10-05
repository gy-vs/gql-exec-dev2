import { describe, it } from 'mocha';

import { expectJSON } from '../../__testUtils__/expectJSON';

import { parse } from '../../language/parser';

import { buildSchema } from '../../utilities/buildASTSchema';

import { KnownDirectivesRule } from '../rules/KnownDirectivesRule';
import { PossibleTypeExtensionsRule } from '../rules/PossibleTypeExtensionsRule';
import { UniqueDirectivesPerLocationRule } from '../rules/UniqueDirectivesPerLocationRule';
import { validateSDL } from '../validate';

const experimentalOptions = {
  experimentalDirectivesOnDirectiveDefinitions: true,
} as const;

function expectExperimentalSDLErrors(
  sdl: string,
  rules?: Parameters<typeof validateSDL>[2],
) {
  return expectJSON(
    validateSDL(parse(sdl, experimentalOptions), undefined, rules),
  );
}

describe('Experimental: directives on directive definitions', () => {
  it('accepts known directives on directive definitions', () => {
    expectExperimentalSDLErrors(`
      directive @onDirective on DIRECTIVE_DEFINITION

      directive @foo @onDirective on FIELD_DEFINITION
    `).toDeepEqual([]);

    expectExperimentalSDLErrors(`
      directive @onDirective repeatable on DIRECTIVE_DEFINITION
      directive @foo on FIELD_DEFINITION

      extend directive @foo @onDirective @onDirective
    `).toDeepEqual([]);
  });

  it('reports unknown directives used on directive definitions', () => {
    expectExperimentalSDLErrors(
      `
      directive @foo @unknown on FIELD_DEFINITION
    `,
      [KnownDirectivesRule],
    ).toDeepEqual([
      {
        message: 'Unknown directive "@unknown".',
        locations: [{ line: 2, column: 22 }],
      },
    ]);

    expectExperimentalSDLErrors(
      `
      extend directive @foo @unknown
    `,
      [KnownDirectivesRule],
    ).toDeepEqual([
      {
        message: 'Unknown directive "@unknown".',
        locations: [{ line: 2, column: 29 }],
      },
    ]);
  });

  it('reports directives used on an invalid location', () => {
    expectExperimentalSDLErrors(
      `
      directive @onField on FIELD

      directive @foo @onField on FIELD_DEFINITION
    `,
      [KnownDirectivesRule],
    ).toDeepEqual([
      {
        message:
          'Directive "@onField" may not be used on DIRECTIVE_DEFINITION.',
        locations: [{ line: 4, column: 22 }],
      },
    ]);

    expectExperimentalSDLErrors(
      `
      directive @onField on FIELD

      extend directive @foo @onField
    `,
      [KnownDirectivesRule],
    ).toDeepEqual([
      {
        message:
          'Directive "@onField" may not be used on DIRECTIVE_DEFINITION.',
        locations: [{ line: 4, column: 29 }],
      },
    ]);
  });

  it('reports duplicate non-repeatable directives on directive definitions', () => {
    expectExperimentalSDLErrors(
      `
      directive @nonRepeatable on DIRECTIVE_DEFINITION

      directive @foo @nonRepeatable @nonRepeatable on FIELD_DEFINITION
    `,
      [UniqueDirectivesPerLocationRule],
    ).toDeepEqual([
      {
        message:
          'The directive "@nonRepeatable" can only be used once at this location.',
        locations: [
          { line: 4, column: 22 },
          { line: 4, column: 37 },
        ],
      },
    ]);
  });

  it('reports duplicate directives within a directive extension', () => {
    expectExperimentalSDLErrors(
      `
      directive @nonRepeatable on DIRECTIVE_DEFINITION

      extend directive @foo @nonRepeatable @nonRepeatable
    `,
      [UniqueDirectivesPerLocationRule],
    ).toDeepEqual([
      {
        message:
          'The directive "@nonRepeatable" can only be used once at this location.',
        locations: [
          { line: 4, column: 29 },
          { line: 4, column: 44 },
        ],
      },
    ]);
  });

  it('reports duplicate directives between a definition and an extension', () => {
    expectExperimentalSDLErrors(
      `
      directive @nonRepeatable on DIRECTIVE_DEFINITION

      directive @foo @nonRepeatable on FIELD_DEFINITION
      extend directive @foo @nonRepeatable
    `,
      [UniqueDirectivesPerLocationRule],
    ).toDeepEqual([
      {
        message:
          'The directive "@nonRepeatable" can only be used once at this location.',
        locations: [
          { line: 4, column: 22 },
          { line: 5, column: 29 },
        ],
      },
    ]);
  });

  it('reports duplicate directives across directive extensions', () => {
    expectExperimentalSDLErrors(
      `
      directive @nonRepeatable on DIRECTIVE_DEFINITION

      extend directive @foo @nonRepeatable
      extend directive @foo @nonRepeatable
    `,
      [UniqueDirectivesPerLocationRule],
    ).toDeepEqual([
      {
        message:
          'The directive "@nonRepeatable" can only be used once at this location.',
        locations: [
          { line: 4, column: 29 },
          { line: 5, column: 29 },
        ],
      },
    ]);
  });

  it('does not count directives on different directives against each other', () => {
    expectExperimentalSDLErrors(
      `
      directive @nonRepeatable on DIRECTIVE_DEFINITION

      directive @foo @nonRepeatable on FIELD_DEFINITION
      directive @bar @nonRepeatable on FIELD_DEFINITION
    `,
      [UniqueDirectivesPerLocationRule],
    ).toDeepEqual([]);
  });

  it('reports extending an undefined directive', () => {
    expectExperimentalSDLErrors(
      `
      extend directive @missing @foo
    `,
      [PossibleTypeExtensionsRule],
    ).toDeepEqual([
      {
        message:
          'Cannot extend directive "@missing" because it is not defined.',
        locations: [{ line: 2, column: 25 }],
      },
    ]);
  });

  it('accepts extending a directive defined in the schema', () => {
    const schema = buildSchema(`
      directive @onDirective on DIRECTIVE_DEFINITION
      directive @foo on FIELD_DEFINITION
    `);
    const doc = parse(
      'extend directive @foo @onDirective',
      experimentalOptions,
    );
    expectJSON(
      validateSDL(doc, schema, [PossibleTypeExtensionsRule]),
    ).toDeepEqual([]);
  });
});
