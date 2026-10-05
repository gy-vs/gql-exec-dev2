import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { ASTNode } from '../../language/ast';
import { Kind } from '../../language/kinds';
import { parse } from '../../language/parser';
import { print } from '../../language/printer';

import { buildASTSchema, buildSchema } from '../buildASTSchema';
import { extendSchema } from '../extendSchema';
import { printSchema } from '../printSchema';

const experimentalOptions = {
  experimentalDirectivesOnDirectiveDefinitions: true,
} as const;

const experimentalSDL = `
  directive @owner(team: String!) repeatable on DIRECTIVE_DEFINITION

  directive @cacheControl(maxAge: Int) @owner(team: "infra") repeatable on FIELD_DEFINITION

  type Query {
    x: Int
  }
`;

describe('Experimental: directives on directive definitions', () => {
  it('builds directives with applications on their definitions', () => {
    const schema = buildASTSchema(parse(experimentalSDL, experimentalOptions));
    const directive = schema.getDirective('cacheControl');

    const appliedDirectives = directive?.astNode?.directives;
    expect(appliedDirectives).to.have.lengthOf(1);
    expect(print(appliedDirectives?.[0] as ASTNode)).to.equal(
      '@owner(team: "infra")',
    );
    expect(directive?.extensionASTNodes).to.deep.equal([]);
  });

  it('supports `extend directive` via extendSchema', () => {
    const schema = buildASTSchema(parse(experimentalSDL, experimentalOptions));

    const extension = parse(
      'extend directive @cacheControl @owner(team: "gateway")',
      experimentalOptions,
    );
    const extendedSchema = extendSchema(schema, extension);
    const directive = extendedSchema.getDirective('cacheControl');

    expect(directive?.extensionASTNodes).to.have.lengthOf(1);
    const extensionNode = directive?.extensionASTNodes[0];
    expect(extensionNode?.kind).to.equal(Kind.DIRECTIVE_DEFINITION_EXTENSION);
    expect(print(extensionNode as ASTNode)).to.equal(
      'extend directive @cacheControl @owner(team: "gateway")',
    );
    // The definition node itself is preserved.
    expect(directive?.astNode?.directives).to.have.lengthOf(1);

    // The original schema is not modified.
    expect(
      schema.getDirective('cacheControl')?.extensionASTNodes,
    ).to.have.lengthOf(0);
  });

  it('supports `extend directive` in the initial SDL document', () => {
    const sdl =
      experimentalSDL +
      '\nextend directive @cacheControl @owner(team: "gateway")\n';
    const schema = buildASTSchema(parse(sdl, experimentalOptions));
    const directive = schema.getDirective('cacheControl');

    expect(directive?.astNode?.directives).to.have.lengthOf(1);
    expect(directive?.extensionASTNodes).to.have.lengthOf(1);
  });

  it('supports the experimental parse option through buildSchema', () => {
    const schema = buildSchema(
      experimentalSDL +
        'extend directive @cacheControl @owner(team: "gateway")',
      experimentalOptions,
    );
    const directive = schema.getDirective('cacheControl');

    expect(directive?.astNode?.directives).to.have.lengthOf(1);
    expect(directive?.extensionASTNodes).to.have.lengthOf(1);
  });

  it('prints and rebuilds a schema with the same directive metadata', () => {
    const sdl =
      experimentalSDL +
      'extend directive @cacheControl @owner(team: "gateway")';
    const schema = buildASTSchema(parse(sdl, experimentalOptions));

    const printed = printSchema(schema);
    const rebuiltSchema = buildASTSchema(parse(printed, experimentalOptions));
    const rebuiltDirective = rebuiltSchema.getDirective('cacheControl');

    expect(rebuiltDirective?.astNode?.directives?.map(print)).to.deep.equal([
      '@owner(team: "infra")',
      '@owner(team: "gateway")',
    ]);
    expect(rebuiltDirective?.extensionASTNodes).to.have.lengthOf(0);
    expect(rebuiltDirective?.isRepeatable).to.equal(true);
    expect(rebuiltDirective?.locations).to.contain('FIELD_DEFINITION');
  });

  it('rejects SDL validation errors on directive definitions', () => {
    const invalidCases: ReadonlyArray<{
      sdl: string;
      message: string;
    }> = [
      {
        sdl: 'directive @x @y on FIELD_DEFINITION',
        message: 'Unknown directive "@y".',
      },
      {
        sdl: `
          directive @onField on FIELD_DEFINITION
          directive @x @onField on FIELD_DEFINITION
        `,
        message:
          'Directive "@onField" may not be used on DIRECTIVE_DEFINITION.',
      },
      {
        sdl: `
          directive @a on DIRECTIVE_DEFINITION
          directive @x @a @a on FIELD_DEFINITION
        `,
        message: 'The directive "@a" can only be used once at this location.',
      },
      {
        sdl: `
          directive @a on DIRECTIVE_DEFINITION
          directive @x @a on FIELD_DEFINITION
          extend directive @x @a
        `,
        message: 'The directive "@a" can only be used once at this location.',
      },
      {
        sdl: 'extend directive @missing @a',
        message:
          'Cannot extend directive "@missing" because it is not defined.',
      },
    ];

    for (const { sdl, message } of invalidCases) {
      expect(() => buildASTSchema(parse(sdl, experimentalOptions))).to.throw(
        message,
      );
    }
  });
});
